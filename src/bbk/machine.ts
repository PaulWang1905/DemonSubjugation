// The Longman 4988 hardware around its 65C02 core.
//
// Physical memory is 16 MB of 4 KB pages. The CPU sees sixteen 4 KB banks;
// bank 0 is fixed to physical page 0 (zero page, stack, I/O registers, the
// interrupt vectors at $0300 and the LCD memory at $0400), and banks 1-15 are
// mapped by writing BK_SEL/BK_ADRL/BK_ADRH. Physical map:
//
//   000000-007FFF  RAM (32 KB)
//   200000-3FFFFF  NOR flash (the file system: installed programs and saves)
//   400000-7FFFFF  dictionary ROMs, four channels selected by PB bits 7-6
//   800000-9FFFFF  font ROM      A00000 / C00000  data ROMs
//   E00000-FFFFFF  operating system ROM
//
// Interrupts go to $0300 + 4 × source (the OS's vector table); BRK uses vector 1.
// Timers count once every 400 CPU cycles. The firmware's own interrupt handlers
// do the rest (keyboard, clock, sound), so nothing of the OS is imitated here.

import { Cpu, I, type Bus } from "./cpu";
import type { Firmware } from "./firmware";
import { Flash, type FlashState } from "./flash";

// registers
const ISR = 0x04, TISR = 0x05, BK_SEL = 0x0c, BK_ADRL = 0x0d, BK_ADRH = 0x0e;
const SYSCON = 0x200, INCR = 0x207, ADDR1 = 0x208, PB = 0x21b;
const STCON = 0x226, ST1LD = 0x227, STCTCON = 0x22e, CTLD = 0x22f;
const ALMMIN = 0x230, RTCSEC = 0x234, IER = 0x23a, TIER = 0x23b, KEYCODE = 0x24e;
/** The OS sets this to 0xFE when its start-up has finished. */
export const MTCT = 0x22b;

export const CPU_HZ = 4_000_000;
const TICK = 400; // CPU cycles per timer count
const TICKS_PER_SECOND = CPU_HZ / TICK;
const RESET_VECTOR = 0x350, BRK_VECTOR = 0x304;

/** Everything but the flash contents, to suspend and resume the machine. */
export interface MachineState {
  ram: Uint8Array;
  cpu: { a: number; x: number; y: number; s: number; pc: number; p: number; waiting: boolean; stopped: boolean };
  bank: Uint16Array;
  bankSel: number;
  timer: Int32Array;
  ticks: { next: number; rtc: number };
  clock: number;
  flash: FlashState;
}

// what a write to a bank does
const W_NONE = 0, W_RAM = 1, W_FLASH = 2, W_IO = 3;

export class Machine implements Bus {
  readonly ram = new Uint8Array(0x8000);
  readonly flash: Flash;
  readonly cpu: Cpu;
  /** CPU cycles since power-on. */
  clock = 0;

  private readonly roms: Partial<Record<string, Uint8Array>>;
  private readonly bank = new Uint16Array(16); // physical page of each CPU bank
  private bankSel = 0;
  private readonly view: (Uint8Array | null)[] = Array(16).fill(null); // direct reads
  private readonly wkind = new Uint8Array(16);
  private readonly woff = new Int32Array(16); // offset of the bank in RAM or flash
  private readonly timer = new Int32Array(5); // ST1-ST4, CT
  private nextTick = TICK;
  private rtcTicks = 0;
  private readonly keys: number[] = [];

  constructor(fw: Firmware) {
    const r = fw.regions;
    if (!r.os) throw new Error("The firmware needs the OS ROM");
    this.roms = r;
    this.flash = new Flash(r.flash);
    this.flash.onModeChange = () => this.mapAll();
    this.cpu = new Cpu(this);
    this.cpu.brkTarget = BRK_VECTOR;
    this.reset();
  }

  /** Power on: registers to their reset values, then run from the boot code. */
  reset(): void {
    const ram = this.ram;
    ram.fill(0);
    ram.set(this.roms.os!.subarray(0x1fff00), 0x300); // the boot page, copied by the MCU
    for (const [a, v] of RESET_REGISTERS) ram[a] = v;
    this.bank.fill(0);
    this.bankSel = 0;
    this.mapAll();
    this.timer.fill(0);
    this.keys.length = 0;
    this.cpu.reset(RESET_VECTOR);
  }

  saveState(): MachineState {
    const { a, x, y, s, pc, p, waiting, stopped } = this.cpu;
    return {
      ram: this.ram.slice(),
      cpu: { a, x, y, s, pc, p, waiting, stopped },
      bank: this.bank.slice(),
      bankSel: this.bankSel,
      timer: this.timer.slice(),
      ticks: { next: this.nextTick, rtc: this.rtcTicks },
      clock: this.clock,
      flash: this.flash.saveState(),
    };
  }

  loadState(st: MachineState): void {
    this.ram.set(st.ram);
    Object.assign(this.cpu, st.cpu);
    this.bank.set(st.bank);
    this.bankSel = st.bankSel;
    this.timer.set(st.timer);
    ({ next: this.nextTick, rtc: this.rtcTicks } = st.ticks);
    this.clock = st.clock;
    this.flash.loadState(st.flash);
    this.keys.length = 0;
    this.mapAll();
  }

  /** True once the OS has finished starting up. */
  get booted(): boolean {
    return this.ram[MTCT] === 0xfe;
  }

  /** The physical page each CPU bank maps. */
  banks(): number[] {
    return Array.from(this.bank);
  }

  /** The physical page CPU bank b maps. */
  page(b: number): number {
    return this.bank[b];
  }

  /** Queue a key press (device key code, see keys.ts). */
  press(code: number): void {
    this.keys.push(code & 0x3f);
  }

  /** Run for `cycles` CPU cycles. */
  run(cycles: number): void {
    const end = this.clock + cycles, cpu = this.cpu, ram = this.ram;
    while (this.clock < end) {
      if (ram[SYSCON] & 0x08 || cpu.stopped) {
        this.clock = Math.min(end, this.nextTick); // halted until the next event
      } else if (((ram[ISR] & ram[IER]) | (ram[TISR] & ram[TIER])) !== 0 && (cpu.waiting || !(cpu.p & I))) {
        if (cpu.p & I) cpu.waiting = false; // WAI resumes without taking a masked interrupt
        else {
          cpu.interrupt(0x300 + 4 * this.source());
          this.clock += 7;
        }
      } else {
        this.clock += cpu.step();
      }
      while (this.clock >= this.nextTick) {
        this.nextTick += TICK;
        this.tick();
      }
    }
  }

  // ---- CPU bus ----

  read(addr: number): number {
    if (addr < 0x1000) return this.readIo(addr);
    const b = addr >>> 12, v = this.view[b];
    if (v) return v[addr & 0xfff];
    if (this.wkind[b] === W_IO) return this.readIo(addr & 0xfff);
    if (this.wkind[b] === W_FLASH) return this.flash.read(this.woff[b] + (addr & 0xfff));
    return 0;
  }

  write(addr: number, v: number): void {
    if (addr < 0x1000) return this.writeIo(addr, v);
    const b = addr >>> 12;
    switch (this.wkind[b]) {
      case W_RAM: this.ram[this.woff[b] + (addr & 0xfff)] = v; return;
      case W_FLASH: this.flash.write(this.woff[b] + (addr & 0xfff), v); return;
      case W_IO: this.writeIo(addr & 0xfff, v); return;
    }
  }

  /** Physical page 0: RAM with the I/O registers in it. */
  private readIo(a: number): number {
    if (a < 0x10) {
      if (a < 4) return this.physRead(this.port(a));
      if (a === BK_SEL) return this.bankSel;
      if (a === BK_ADRL) return this.bank[this.bankSel] & 0xff;
      if (a === BK_ADRH) return this.bank[this.bankSel] >> 8;
    }
    return this.ram[a];
  }

  private writeIo(a: number, v: number): void {
    const ram = this.ram;
    if (a < 0x10) {
      if (a < 4) return this.physWrite(this.port(a), v);
      switch (a) {
        case ISR:
        case TISR: ram[a] &= v; return; // writing 0 clears a flag
        case BK_SEL: this.bankSel = v & 0x0f; return;
        case BK_ADRL: return this.setBank(this.bankSel, (this.bank[this.bankSel] & 0xf00) | v);
        case BK_ADRH: return this.setBank(this.bankSel, ((v & 0x0f) << 8) | (this.bank[this.bankSel] & 0xff));
      }
    }
    const old = ram[a];
    ram[a] = v;
    if (a === PB && (old ^ v) & 0xc0) this.mapAll(); // dictionary channel changed
  }

  /** DATA1-4 read and write physical memory at ADDR1-4, stepping it when INCR says so. */
  private port(n: number): number {
    const ram = this.ram, r = ADDR1 + 3 * n;
    const p = ram[r] | (ram[r + 1] << 8) | (ram[r + 2] << 16);
    if (ram[INCR] & (1 << n)) {
      const q = (p + 1) & 0xffffff;
      ram[r] = q & 0xff;
      ram[r + 1] = (q >> 8) & 0xff;
      ram[r + 2] = q >> 16;
    }
    return p;
  }

  private physRead(p: number): number {
    if (p < 0x8000) return this.ram[p];
    if (p >= 0x200000 && p < 0x400000) return this.flash.read(p - 0x200000);
    const rom = this.rom(p >>> 12);
    return rom ? rom[p & 0x1fffff] : 0;
  }

  private physWrite(p: number, v: number): void {
    if (p < 0x8000) this.ram[p] = v;
    else if (p >= 0x200000 && p < 0x400000) this.flash.write(p - 0x200000, v);
  }

  // ---- banks ----

  private setBank(b: number, page: number): void {
    this.bank[b] = page;
    if (b !== 0) this.map(b);
  }

  private mapAll(): void {
    for (let b = 1; b < 16; b++) this.map(b);
  }

  private map(b: number): void {
    const page = this.bank[b];
    let arr: Uint8Array | null = null, off = 0, w = W_NONE;
    if (page === 0) {
      w = W_IO;
    } else if (page < 8) {
      arr = this.ram;
      off = page << 12;
      w = W_RAM;
    } else if (page >= 0x200 && page < 0x400) {
      off = (page - 0x200) << 12;
      w = W_FLASH;
      if (!this.flash.idMode) arr = this.flash.data;
    } else {
      arr = this.rom(page) ?? null;
      off = (page & 0x1ff) << 12;
    }
    this.view[b] = arr && arr.subarray(off, off + 0x1000);
    this.wkind[b] = w;
    this.woff[b] = off;
  }

  /** The ROM image holding a physical page, if it was supplied. */
  private rom(page: number): Uint8Array | undefined {
    const r = this.roms, ch = this.ram[PB] >> 6;
    switch (page >> 9) {
      case 2: return r[`ch4.${ch}`];
      case 3: return r[`ch6.${ch}`];
      case 4: return r.font;
      case 5: return r.dataA;
      case 6: return r.dataC;
      case 7: return r.os;
    }
    return undefined;
  }

  // ---- interrupts and timers ----

  /** The pending interrupt with the highest priority, as a vector number. */
  private source(): number {
    const ram = this.ram, isr = ram[ISR] & ram[IER], tisr = ram[TISR] & ram[TIER];
    if (isr & 0x80) return 0x02; // keyboard
    if (isr & 0x01) return 0x13; // clock alarm
    if (isr & 0x02) return 0x12; // CT timer
    if (tisr & 0x20) return 0x11; // MT
    if (tisr & 0x80) return 0x10; // GTH
    if (tisr & 0x40) return 0x0f; // GTL
    for (let i = 0; i < 4; i++) if (tisr & (1 << i)) return 0x03 + i; // ST1-ST4
    return 0x01;
  }

  /** Set an interrupt flag and wake the CPU from halt. */
  private raise(reg: number, bit: number): void {
    this.ram[reg] |= bit;
    this.ram[SYSCON] &= ~0x08;
  }

  private tick(): void {
    const ram = this.ram, t = this.timer;
    // ST1-ST4: 8-bit up-counters reloaded from STnLD when they overflow
    for (let i = 0; i < 4; i++) {
      if (ram[STCON] & (1 << i) && ++t[i] >= 0x100) {
        t[i] = ram[ST1LD + i];
        if (ram[TIER] & (1 << i)) this.raise(TISR, 1 << i);
      }
    }
    // CT: 12-bit counter
    if (ram[STCTCON] & 0x10 && ++t[4] >= 0x1000) {
      t[4] = ram[CTLD];
      if (ram[IER] & 0x02) this.raise(ISR, 0x02);
    }
    if (++this.rtcTicks >= TICKS_PER_SECOND) {
      this.rtcTicks = 0;
      this.rtcSecond();
    }
    this.deliverKey();
  }

  /** Real-time clock: seconds, minutes, hours and a 9-bit day count, with an alarm. */
  private rtcSecond(): void {
    const ram = this.ram;
    if (!(ram[STCTCON] & 0x40)) return;
    const R = RTCSEC; // seconds, minutes, hours, day (low), day (high bit)
    if (++ram[R] === 60) {
      ram[R] = 0;
      if (++ram[R + 1] === 60) {
        ram[R + 1] = 0;
        if (++ram[R + 2] === 24) {
          ram[R + 2] = 0;
          if (++ram[R + 3] === 256) ram[R + 4] ^= 1; // (the expression is not wrapped; the byte is)
        }
      }
    }
    const alarm = ram[STCTCON] & 0x20 && [0, 1, 2, 3].every((i) => ram[R + 1 + i] === ram[ALMMIN + i]);
    if (alarm && ram[R] === 0) {
      ram[ISR] |= 0x01;
      if (ram[IER] & 0x01) ram[SYSCON] &= ~0x08;
    }
  }

  /** Hand the next key to the keyboard controller once the firmware has taken the last one. */
  private deliverKey(): void {
    if (!this.keys.length || this.ram[ISR] & 0x80) return;
    this.ram[KEYCODE] = this.keys.shift()! | 0x80;
    this.raise(ISR, 0x80);
  }
}

/** Register values after reset (the MCU's defaults). */
const RESET_REGISTERS: [number, number][] = [
  [0x1b, 0xe0], [0x202, 0x6c], [0x203, 0x40], [INCR, 0x0f], [0x215, 0xff], [0x219, 0xff],
  [0x21c, 0xff], [0x220, 0x08], [0x222, 0x44], [STCTCON, 0x01], [0x24b, 0x05], [0x25b, 0xe0],
];
