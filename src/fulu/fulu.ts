// Fulu (符箓): the Longman 4988's operating system, in TypeScript.
//
// A program runs its own 6502 code on the emulated machine (src/bbk). The
// OS's part of the memory map holds nothing but the opcode $02, which the CPU
// hands to Fulu, so every way into the OS is answered by a TypeScript function:
// a call into its resident code at $D000-$FFFF (the C compiler's helpers), a
// far call through $D2F6 (the OS functions, or another segment of the
// program), and an interrupt through the vectors at $0300.
//
// Fulu keeps the OS's state where the OS does, in its variables in RAM, so
// that what programs see is the same as on the device: the same registers,
// stack and memory after each call (docs/fulu-notes.md has the map).

import { C, N, V, Z } from "../bbk/cpu";
import { REGION_SIZE } from "../bbk/firmware";
import { FileType, installFile, type FlashFile } from "../bbk/flashfs";
import { gamInfo } from "../bbk/gam";
import { Machine } from "../bbk/machine";
import { FUNCTIONS, INTERRUPTS, NAMES } from "./os";
import { HELPERS } from "./runtime";

/**
 * What answers an entry into the OS. It returns as RTS does (RTI for an
 * interrupt), or "jump" when it has set the PC itself, or "wait" when it
 * cannot finish yet: the CPU then halts until the next interrupt and the
 * handler is asked again.
 */
export type Handler = (os: Fulu) => void | "wait" | "jump";

/**
 * An OS function: where the OS has it in its segment, what it does, and the
 * OS variables it uses only as temporaries ([from, to) ranges: always
 * written before they are read, by every entry into the OS, and never used
 * by programs), whose values it need not leave as the OS does.
 */
export interface OsFunction {
  at: number;
  run: Handler;
  temporaries?: [number, number][];
}

/** Banks D-F: where the OS keeps its resident code. */
const OS_PAGES = [0xe88, 0xe89, 0xe8a];
/** The OS's base page (its segment n is at page base + 4n), kept at $03E4/$03E5. */
const OS_BASE = 0xe80;
/**
 * What the OS reads from the data at the end of its boot page (RAM $03E4-
 * $03FC): its base page, the font ROM's bank, and an LCD address
 * redirected (RAM row 0's first byte, to $1000).
 */
const BOOT_PAGE = [OS_BASE >> 8, OS_BASE & 0xff, 0xe9, 0x80, 0xe0, 0xcc, 0x84, 0, 0, 0, 0x72, 0, 0, 0xd0, 0x7b, 0, 0, 0xd0, 0x7b, 0, 0x01, 0x00, 0x04, 0x00, 0x10];
/** The running program's base page (its segment n is at $E0 + n). */
const PROGRAM_BASE = 0x2029;
export const FAR_CALL = 0xd2f6;
/** Where a far call's target returns to (the OS's own return address). */
const FAR_RETURN = 0xd313;

// The state the OS's launcher leaves at a program's first instruction, as
// measured on the device for the 伏魔记 series, 三国霸业 and 英雄坛说: the I/O
// registers, the C runtime's zero page, the 6502 stack (the launcher's calls,
// the innermost a far call whose return ends the program) and the launcher's
// frame on the software stack.
const IO: [number, number][] = [
  [0x200, 0x05], [0x202, 0xf3], [0x203, 0x40], [0x207, 0x0f], [0x211, 0x73], [0x212, 0xb5], [0x213, 0x88],
  [0x215, 0xff], [0x216, 0xff], [0x218, 0xff], [0x219, 0x20], [0x21a, 0xdf], [0x21b, 0x3f], [0x21c, 0x14],
  [0x21d, 0xeb], [0x21f, 0x94], [0x220, 0x08], [0x221, 0x80], [0x222, 0x76], [0x223, 0x2f], [0x224, 0xeb],
  [0x227, 0xa6], [0x22b, 0xfe], [0x22e, 0x65], [0x22f, 0xf8], [0x231, 0x0c], [0x232, 0x13], [0x233, 0x01],
  [0x234, 0x1d], [0x236, 0x0c], [0x237, 0x13], [0x238, 0x01], [0x23a, 0x83], [0x23b, 0x21], [0x23e, 0xd3],
  [0x23f, 0xc0], [0x24b, 0x05], [0x24d, 0x08], [0x25b, 0xe0],
];
const ZERO_PAGE: [number, number][] = [
  [0x20, 0xc0], [0x21, 0x17], [0x23, 0x11], [0x24, 0x8c], [0x28, 0xbb], [0x29, 0x17], [0x2a, 0xd7], [0x2b, 0x17],
  [0x2f, 0xc8], [0x30, 0x17], [0x31, 0xa7], [0x32, 0x17], [0x38, 0xf2], [0x39, 0x0f], [0x3a, 0x8d], [0x3b, 0x20],
];
const STACK_TOP = 0xe7;
const STACK = [0x12, 0xd3, 0x08, 0xd6, 0x79, 0x12, 0xd3, 0x01, 0xf3, 0x55, 0xc8, 0x52, 0xd9, 0x52, 0x12, 0xd3, 0x07, 0xf3, 0x70, 0x12, 0xd3, 0xe0, 0xe1, 0x03];
const SOFT_STACK = 0x17bb;
/** The launcher's frame; d and b are the program's data and base pages. */
const frame = (d: number, b: number) => [
  0xc0, 0x17, 0xbf, 0x17, 0x50, 0xff, 0x00, 0x90, 0x80, d & 0xff, d >> 8, b & 0xff, b >> 8, 0x80, 0x0e, 0xce, 0x17, 0x46, 0x50, 0xe0,
  0xc0, 0x17, (d >> 4) & 0xff, 0x00, 0x01, 0x09, 0xd4, 0x17, 0, 0, 0, 0, 0, 0, 0, 0, d & 0xff,
];

export class Fulu {
  readonly machine: Machine;
  /** Why the program stopped, once it has (it ended, or met an OS function Fulu lacks). */
  stopped: string | null = null;

  /** Fulu with its own machine, or (for checking it) answering for the OS of another. */
  constructor(machine?: Machine) {
    if (machine) this.machine = machine;
    else {
      this.machine = new Machine({ regions: { os: new Uint8Array(REGION_SIZE).fill(0x02) } });
      this.machine.cpu.trap = (pc) => this.enter(pc);
    }
  }

  /** Put a .gam into the flash. */
  install(gam: Uint8Array): FlashFile | null {
    return installFile(this.machine.flash.data, gam, FileType.game, gamInfo(gam).rawName);
  }

  /** Start an installed program, in the state the OS's launcher leaves. */
  start(file: FlashFile): void {
    const m = this.machine, ram = m.ram, flash = m.flash.data, h = file.offset;
    m.reset();
    this.stopped = null;
    const base = 0x200 + (h >> 12);
    const data = base + ((flash[h + 0x42] | (flash[h + 0x43] << 8) | (flash[h + 0x44] << 16)) >> 12);
    const entry = flash[h + 0x40] | (flash[h + 0x41] << 8);
    ram.set(BOOT_PAGE, 0x3e4);
    ram[PROGRAM_BASE] = base & 0xff;
    ram[PROGRAM_BASE + 1] = base >> 8;
    const pages = [1, 2, 3, 4, base, base + 1, base + 2, base + 3, data, data + 1, data + 2, data + 3, ...OS_PAGES];
    pages.forEach((page, i) => this.map(i + 1, page));
    for (const [a, v] of [...IO, ...ZERO_PAGE]) ram[a] = v;
    ram[0x26] = (entry - 1) & 0xff;
    ram[0x27] = (entry - 1) >> 8;
    ram.set(STACK, 0x101 + STACK_TOP);
    ram.set(frame(data, base), SOFT_STACK);
    Object.assign(m.cpu, { pc: entry, s: STACK_TOP, a: 0x17, x: 0x17, y: 0x17, p: 0x21 });
  }

  stop(why: string): void {
    this.stopped = why;
    this.machine.cpu.stopped = true;
  }

  /**
   * The CPU met $02 at pc. In the OS's memory, answer for the OS and return
   * true; in the program's own memory it is a NOP, as on the chip.
   */
  enter(pc: number): boolean {
    if (pc >= 0x300 && pc < 0x350) return this.interrupt((pc - 0x300) >> 2);
    if (this.machine.page(pc >>> 12) < 0xe00) return false;
    if (pc === FAR_CALL) return this.farCall(pc);
    if (pc === FAR_RETURN) return this.farReturn();
    const h = HELPERS[pc];
    if (!h) return this.missing(`the OS routine at $${hex(pc)}`);
    if (h(this) !== "jump") this.rts();
    return true;
  }

  /**
   * An interrupt: on the device its vector far-calls the OS's handler, which
   * saves A, X, Y and $26/$27; the call's return maps the interrupted
   * segment back.
   */
  interrupt(vector: number): boolean {
    if (!this.service(vector)) return this.missing(`interrupt ${vector}`);
    const cpu = this.machine.cpu;
    cpu.p = (this.pull() | 0x20) & ~0x10;
    cpu.pc = this.pull() | (this.pull() << 8);
    return true;
  }

  /** What an interrupt does but return: false if Fulu has no handler for it. */
  service(vector: number): boolean {
    const h = INTERRUPTS[vector];
    if (!h) return false;
    h(this);
    this.mapSegment(this.segment());
    return true;
  }

  private missing(name: string): boolean {
    this.stop(`Fulu has no ${name} yet`);
    return true;
  }

  /**
   * $D2F6: call through the 3-byte entry at ($26): an address and a segment.
   * Below $E0 the segment is the OS's (the entry is an OS function); from $E0
   * up it is the program's own, mapped into $5000-$8FFF for the call.
   */
  private farCall(pc: number): boolean {
    const m = this.machine, ram = m.ram, cpu = m.cpu;
    const ptr = ram[0x26] | (ram[0x27] << 8);
    const seg = m.read((ptr + 2) & 0xffff);
    if (seg >= 0xe0) {
      const target = m.read(ptr) | (m.read((ptr + 1) & 0xffff) << 8);
      this.push(this.segment());
      this.mapSegment(seg);
      this.push((FAR_RETURN - 1) >> 8);
      this.push((FAR_RETURN - 1) & 0xff);
      this.arrive(target);
      cpu.pc = target;
      return true;
    }
    const f = FUNCTIONS[ptr];
    if (!f) return this.missing(NAMES[ptr] ? `${NAMES[ptr]} ($${hex(ptr)})` : `OS function $${hex(ptr)}`);
    const { a, x, y, p } = cpu;
    this.arrive(f.at);
    if (f.run(this) === "wait") {
      // as before the call, to make it again after the next interrupt
      Object.assign(cpu, { a, x, y, p, pc });
      ram[0x26] = ptr & 0xff;
      ram[0x27] = ptr >> 8;
      ram[0x200] |= 0x08; // halt, as the OS does when it waits
      return true;
    }
    this.mapSegment(this.segment());
    this.leave();
    this.rts();
    return true;
  }

  /** At a far call's target, as the OS's trampoline leaves it: $26/$27 = target - 1, X = Y = A, flags of that subtraction. */
  private arrive(target: number): void {
    const ram = this.machine.ram, cpu = this.machine.cpu, a = cpu.a, t = target - 1;
    ram[0x26] = t & 0xff;
    ram[0x27] = (t >> 8) & 0xff;
    const hi = target >> 8, borrow = (target & 0xff) === 0 ? 1 : 0, r = hi - borrow;
    cpu.p = (cpu.p & ~(N | Z | C | V)) | (r >= 0 ? C : 0) | (hi & ~r & 0x80 ? V : 0) | (a & N) | (a ? 0 : Z);
    cpu.x = cpu.y = a;
  }

  /** Back from a far call's target: X = A, N/Z from A. */
  private leave(): void {
    const cpu = this.machine.cpu;
    cpu.x = cpu.a;
    cpu.p = (cpu.p & ~(N | Z)) | (cpu.a & N) | (cpu.a ? 0 : Z);
  }

  /** $D313: a far call's target has returned; map the caller's segment back. A main that returns ends the program. */
  private farReturn(): boolean {
    const seg = this.pull();
    if (seg < 0xe0) {
      this.stop("The program ended");
      return true;
    }
    this.mapSegment(seg);
    this.leave();
    this.rts();
    return true;
  }

  // ---- banks and the stack ----

  private map(bank: number, page: number): void {
    const m = this.machine;
    m.write(0x0c, bank);
    m.write(0x0d, page & 0xff);
    m.write(0x0e, page >> 8);
  }

  private base(seg: number): number {
    const ram = this.machine.ram;
    return seg >= 0xe0 ? ram[PROGRAM_BASE] | (ram[PROGRAM_BASE + 1] << 8) : ram[0x3e5] | (ram[0x3e4] << 8);
  }

  /** The segment in $5000-$8FFF, as the OS numbers it: the program's from $E0, the OS's below. */
  private segment(): number {
    const page = this.machine.page(5), os = page >> 8 >= this.machine.ram[0x3e4];
    const n = ((page - this.base(os ? 0 : 0xe0)) & 0xffff) >> 2;
    return (os ? n : 0xe0 + n) & 0xff;
  }

  /** Map a segment into banks 5-8, leaving bank select and the OS's scratch at $2000-$2002 as the OS does. */
  private mapSegment(seg: number): void {
    const ram = this.machine.ram, base = this.base(seg), first = base + ((seg >= 0xe0 ? seg - 0xe0 : seg) << 2);
    for (let i = 0; i < 4; i++) this.map(5 + i, first + i);
    ram[0x2000] = this.machine.page(8) >> 8;
    ram[0x2001] = base & 0xff;
    ram[0x2002] = base >> 8;
  }

  private rts(): void {
    const lo = this.pull();
    this.machine.cpu.pc = ((lo | (this.pull() << 8)) + 1) & 0xffff;
  }

  private push(v: number): void {
    const cpu = this.machine.cpu;
    this.machine.ram[0x100 | cpu.s] = v & 0xff;
    cpu.s = (cpu.s - 1) & 0xff;
  }

  private pull(): number {
    const cpu = this.machine.cpu;
    cpu.s = (cpu.s + 1) & 0xff;
    return this.machine.ram[0x100 | cpu.s];
  }
}

const hex = (v: number) => v.toString(16).toUpperCase().padStart(4, "0");
