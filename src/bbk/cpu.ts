// WDC 65C02 core: every documented instruction, including the bit instructions
// (RMB/SMB/BBR/BBS) and WAI/STP. Undefined opcodes behave as the WDC NOPs of
// their size. Cycle counts follow the WDC datasheet: page crossings, taken
// branches and decimal-mode ADC/SBC each add a cycle.

export interface Bus {
  read(addr: number): number;
  write(addr: number, value: number): void;
}

export const C = 0x01, Z = 0x02, I = 0x04, D = 0x08, B = 0x10, U = 0x20, V = 0x40, N = 0x80;

// base cycles per opcode
const CYCLES = Uint8Array.from(
  [
    "7 6 2 1 5 3 5 5 3 2 2 1 6 4 6 5",
    "2 5 5 1 5 4 6 5 2 4 2 1 6 4 6 5",
    "6 6 2 1 3 3 5 5 4 2 2 1 4 4 6 5",
    "2 5 5 1 4 4 6 5 2 4 2 1 4 4 6 5",
    "6 6 2 1 3 3 5 5 3 2 2 1 3 4 6 5",
    "2 5 5 1 4 4 6 5 2 4 3 1 4 4 6 5",
    "6 6 2 1 3 3 5 5 4 2 2 1 6 4 6 5",
    "2 5 5 1 4 4 6 5 2 4 4 1 6 4 6 5",
    "3 6 2 1 3 3 3 5 2 2 2 1 4 4 4 5",
    "2 6 5 1 4 4 4 5 2 5 2 1 4 5 5 5",
    "2 6 2 1 3 3 3 5 2 2 2 1 4 4 4 5",
    "2 5 5 1 4 4 4 5 2 4 2 1 4 4 4 5",
    "2 6 2 1 3 3 5 5 2 2 2 3 4 4 6 5",
    "2 5 5 1 4 4 6 5 2 4 3 3 4 4 7 5",
    "2 6 2 1 3 3 5 5 2 2 2 1 4 4 6 5",
    "2 5 5 1 4 4 6 5 2 4 4 1 4 4 7 5",
  ]
    .join(" ")
    .split(" ")
    .map(Number),
);

export class Cpu {
  a = 0;
  x = 0;
  y = 0;
  s = 0xff;
  pc = 0;
  p = U | I;
  /** WAI: idle until an interrupt is asserted. */
  waiting = false;
  /** STP: idle until reset. */
  stopped = false;
  /** Where BRK continues; null reads the vector at $FFFE. */
  brkTarget: number | null = null;
  private extra = 0;

  constructor(private readonly bus: Bus) {}

  reset(pc: number): void {
    this.pc = pc;
    this.s = 0xff;
    this.p = U | I;
    this.waiting = this.stopped = false;
  }

  /** Take an interrupt: push PC and P, set I, clear D, continue at `target`. */
  interrupt(target: number, brk = false): void {
    this.push(this.pc >> 8);
    this.push(this.pc & 0xff);
    this.push(brk ? this.p | B | U : (this.p | U) & ~B);
    this.p = (this.p | I) & ~D;
    this.pc = target;
    this.waiting = false;
  }

  /** Execute one instruction; returns the cycles it took. */
  step(): number {
    if (this.waiting || this.stopped) return 1;
    const op = this.fetch();
    this.extra = 0;
    this.exec(op);
    return CYCLES[op] + this.extra;
  }

  // ---- memory helpers ----

  private fetch(): number {
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  private fetch16(): number {
    const lo = this.fetch();
    return lo | (this.fetch() << 8);
  }

  private read16(addr: number): number {
    return this.bus.read(addr) | (this.bus.read((addr + 1) & 0xffff) << 8);
  }

  private push(v: number): void {
    this.bus.write(0x100 | this.s, v);
    this.s = (this.s - 1) & 0xff;
  }

  private pull(): number {
    this.s = (this.s + 1) & 0xff;
    return this.bus.read(0x100 | this.s);
  }

  // ---- addressing modes (return the effective address) ----

  private zp(): number {
    return this.fetch();
  }
  private zpx(): number {
    return (this.fetch() + this.x) & 0xff;
  }
  private zpy(): number {
    return (this.fetch() + this.y) & 0xff;
  }
  private abs(): number {
    return this.fetch16();
  }
  /** abs,X / abs,Y; `cross` adds a cycle when the index crosses a page. */
  private absi(index: number, cross: boolean): number {
    const base = this.fetch16();
    const ea = (base + index) & 0xffff;
    if (cross && (base ^ ea) & 0xff00) this.extra++;
    return ea;
  }
  private zpPtr(zp: number): number {
    return this.bus.read(zp) | (this.bus.read((zp + 1) & 0xff) << 8);
  }
  private izx(): number {
    return this.zpPtr((this.fetch() + this.x) & 0xff);
  }
  private izy(cross: boolean): number {
    const base = this.zpPtr(this.fetch());
    const ea = (base + this.y) & 0xffff;
    if (cross && (base ^ ea) & 0xff00) this.extra++;
    return ea;
  }
  private izp(): number {
    return this.zpPtr(this.fetch());
  }

  // ---- ALU ----

  private nz(v: number): number {
    this.p = (this.p & ~(N | Z)) | (v & N) | (v ? 0 : Z);
    return v;
  }

  private adc(m: number): void {
    const a = this.a, c = this.p & C;
    let r: number, v: boolean;
    if (this.p & D) {
      this.extra++;
      let lo = (a & 0x0f) + (m & 0x0f) + c;
      if (lo >= 0x0a) lo = ((lo + 0x06) & 0x0f) + 0x10;
      r = (a & 0xf0) + (m & 0xf0) + lo;
      const signed = (a & 0xf0) - ((a & 0x80) << 1) + (m & 0xf0) - ((m & 0x80) << 1) + lo;
      v = signed < -128 || signed > 127;
      if (r >= 0xa0) r += 0x60;
    } else {
      r = a + m + c;
      v = (~(a ^ m) & (a ^ r) & 0x80) !== 0;
    }
    this.p = (this.p & ~(C | V)) | (r > 0xff ? C : 0) | (v ? V : 0);
    this.a = this.nz(r & 0xff);
  }

  private sbc(m: number): void {
    const a = this.a, borrow = 1 - (this.p & C);
    let r = a - m - borrow;
    const v = ((a ^ m) & (a ^ r) & 0x80) !== 0;
    this.p = (this.p & ~(C | V)) | (r >= 0 ? C : 0) | (v ? V : 0);
    if (this.p & D) {
      this.extra++;
      const lo = (a & 0x0f) - (m & 0x0f) - borrow;
      if (r < 0) r -= 0x60;
      if (lo < 0) r -= 0x06;
    }
    this.a = this.nz(r & 0xff);
  }

  private cmp(reg: number, m: number): void {
    const r = reg - m;
    this.p = (this.p & ~C) | (r >= 0 ? C : 0);
    this.nz(r & 0xff);
  }

  private bit(m: number): void {
    this.p = (this.p & ~(N | V | Z)) | (m & (N | V)) | (this.a & m ? 0 : Z);
  }

  private asl(m: number): number {
    this.p = (this.p & ~C) | (m >> 7);
    return this.nz((m << 1) & 0xff);
  }
  private lsr(m: number): number {
    this.p = (this.p & ~C) | (m & 1);
    return this.nz(m >> 1);
  }
  private rol(m: number): number {
    const r = ((m << 1) | (this.p & C)) & 0xff;
    this.p = (this.p & ~C) | (m >> 7);
    return this.nz(r);
  }
  private ror(m: number): number {
    const r = (m >> 1) | ((this.p & C) << 7);
    this.p = (this.p & ~C) | (m & 1);
    return this.nz(r);
  }

  /** Read-modify-write at `ea`. */
  private rmw(ea: number, f: (m: number) => number): void {
    this.bus.write(ea, f.call(this, this.bus.read(ea)));
  }

  private branch(taken: boolean): void {
    const off = this.fetch();
    if (!taken) return;
    const target = (this.pc + ((off << 24) >> 24)) & 0xffff;
    this.extra += (target ^ this.pc) & 0xff00 ? 2 : 1;
    this.pc = target;
  }

  /** BBRn / BBSn: test bit `bitNo` of a zero-page byte and branch. */
  private bbx(bitNo: number, set: boolean): void {
    const m = this.bus.read(this.fetch());
    this.branch(((m >> bitNo) & 1) === (set ? 1 : 0));
  }

  private exec(op: number): void {
    const bus = this.bus;
    switch (op) {
      // ---- loads and stores ----
      case 0xa9: this.a = this.nz(this.fetch()); break;
      case 0xa5: this.a = this.nz(bus.read(this.zp())); break;
      case 0xb5: this.a = this.nz(bus.read(this.zpx())); break;
      case 0xad: this.a = this.nz(bus.read(this.abs())); break;
      case 0xbd: this.a = this.nz(bus.read(this.absi(this.x, true))); break;
      case 0xb9: this.a = this.nz(bus.read(this.absi(this.y, true))); break;
      case 0xa1: this.a = this.nz(bus.read(this.izx())); break;
      case 0xb1: this.a = this.nz(bus.read(this.izy(true))); break;
      case 0xb2: this.a = this.nz(bus.read(this.izp())); break;
      case 0xa2: this.x = this.nz(this.fetch()); break;
      case 0xa6: this.x = this.nz(bus.read(this.zp())); break;
      case 0xb6: this.x = this.nz(bus.read(this.zpy())); break;
      case 0xae: this.x = this.nz(bus.read(this.abs())); break;
      case 0xbe: this.x = this.nz(bus.read(this.absi(this.y, true))); break;
      case 0xa0: this.y = this.nz(this.fetch()); break;
      case 0xa4: this.y = this.nz(bus.read(this.zp())); break;
      case 0xb4: this.y = this.nz(bus.read(this.zpx())); break;
      case 0xac: this.y = this.nz(bus.read(this.abs())); break;
      case 0xbc: this.y = this.nz(bus.read(this.absi(this.x, true))); break;
      case 0x85: bus.write(this.zp(), this.a); break;
      case 0x95: bus.write(this.zpx(), this.a); break;
      case 0x8d: bus.write(this.abs(), this.a); break;
      case 0x9d: bus.write(this.absi(this.x, false), this.a); break;
      case 0x99: bus.write(this.absi(this.y, false), this.a); break;
      case 0x81: bus.write(this.izx(), this.a); break;
      case 0x91: bus.write(this.izy(false), this.a); break;
      case 0x92: bus.write(this.izp(), this.a); break;
      case 0x86: bus.write(this.zp(), this.x); break;
      case 0x96: bus.write(this.zpy(), this.x); break;
      case 0x8e: bus.write(this.abs(), this.x); break;
      case 0x84: bus.write(this.zp(), this.y); break;
      case 0x94: bus.write(this.zpx(), this.y); break;
      case 0x8c: bus.write(this.abs(), this.y); break;
      case 0x64: bus.write(this.zp(), 0); break;
      case 0x74: bus.write(this.zpx(), 0); break;
      case 0x9c: bus.write(this.abs(), 0); break;
      case 0x9e: bus.write(this.absi(this.x, false), 0); break;

      // ---- transfers and stack ----
      case 0xaa: this.x = this.nz(this.a); break;
      case 0xa8: this.y = this.nz(this.a); break;
      case 0x8a: this.a = this.nz(this.x); break;
      case 0x98: this.a = this.nz(this.y); break;
      case 0xba: this.x = this.nz(this.s); break;
      case 0x9a: this.s = this.x; break;
      case 0x48: this.push(this.a); break;
      case 0xda: this.push(this.x); break;
      case 0x5a: this.push(this.y); break;
      case 0x08: this.push(this.p | B | U); break;
      case 0x68: this.a = this.nz(this.pull()); break;
      case 0xfa: this.x = this.nz(this.pull()); break;
      case 0x7a: this.y = this.nz(this.pull()); break;
      case 0x28: this.p = (this.pull() | U) & ~B; break;

      // ---- arithmetic and logic ----
      case 0x69: this.adc(this.fetch()); break;
      case 0x65: this.adc(bus.read(this.zp())); break;
      case 0x75: this.adc(bus.read(this.zpx())); break;
      case 0x6d: this.adc(bus.read(this.abs())); break;
      case 0x7d: this.adc(bus.read(this.absi(this.x, true))); break;
      case 0x79: this.adc(bus.read(this.absi(this.y, true))); break;
      case 0x61: this.adc(bus.read(this.izx())); break;
      case 0x71: this.adc(bus.read(this.izy(true))); break;
      case 0x72: this.adc(bus.read(this.izp())); break;
      case 0xe9: this.sbc(this.fetch()); break;
      case 0xe5: this.sbc(bus.read(this.zp())); break;
      case 0xf5: this.sbc(bus.read(this.zpx())); break;
      case 0xed: this.sbc(bus.read(this.abs())); break;
      case 0xfd: this.sbc(bus.read(this.absi(this.x, true))); break;
      case 0xf9: this.sbc(bus.read(this.absi(this.y, true))); break;
      case 0xe1: this.sbc(bus.read(this.izx())); break;
      case 0xf1: this.sbc(bus.read(this.izy(true))); break;
      case 0xf2: this.sbc(bus.read(this.izp())); break;
      case 0x29: this.a = this.nz(this.a & this.fetch()); break;
      case 0x25: this.a = this.nz(this.a & bus.read(this.zp())); break;
      case 0x35: this.a = this.nz(this.a & bus.read(this.zpx())); break;
      case 0x2d: this.a = this.nz(this.a & bus.read(this.abs())); break;
      case 0x3d: this.a = this.nz(this.a & bus.read(this.absi(this.x, true))); break;
      case 0x39: this.a = this.nz(this.a & bus.read(this.absi(this.y, true))); break;
      case 0x21: this.a = this.nz(this.a & bus.read(this.izx())); break;
      case 0x31: this.a = this.nz(this.a & bus.read(this.izy(true))); break;
      case 0x32: this.a = this.nz(this.a & bus.read(this.izp())); break;
      case 0x09: this.a = this.nz(this.a | this.fetch()); break;
      case 0x05: this.a = this.nz(this.a | bus.read(this.zp())); break;
      case 0x15: this.a = this.nz(this.a | bus.read(this.zpx())); break;
      case 0x0d: this.a = this.nz(this.a | bus.read(this.abs())); break;
      case 0x1d: this.a = this.nz(this.a | bus.read(this.absi(this.x, true))); break;
      case 0x19: this.a = this.nz(this.a | bus.read(this.absi(this.y, true))); break;
      case 0x01: this.a = this.nz(this.a | bus.read(this.izx())); break;
      case 0x11: this.a = this.nz(this.a | bus.read(this.izy(true))); break;
      case 0x12: this.a = this.nz(this.a | bus.read(this.izp())); break;
      case 0x49: this.a = this.nz(this.a ^ this.fetch()); break;
      case 0x45: this.a = this.nz(this.a ^ bus.read(this.zp())); break;
      case 0x55: this.a = this.nz(this.a ^ bus.read(this.zpx())); break;
      case 0x4d: this.a = this.nz(this.a ^ bus.read(this.abs())); break;
      case 0x5d: this.a = this.nz(this.a ^ bus.read(this.absi(this.x, true))); break;
      case 0x59: this.a = this.nz(this.a ^ bus.read(this.absi(this.y, true))); break;
      case 0x41: this.a = this.nz(this.a ^ bus.read(this.izx())); break;
      case 0x51: this.a = this.nz(this.a ^ bus.read(this.izy(true))); break;
      case 0x52: this.a = this.nz(this.a ^ bus.read(this.izp())); break;
      case 0xc9: this.cmp(this.a, this.fetch()); break;
      case 0xc5: this.cmp(this.a, bus.read(this.zp())); break;
      case 0xd5: this.cmp(this.a, bus.read(this.zpx())); break;
      case 0xcd: this.cmp(this.a, bus.read(this.abs())); break;
      case 0xdd: this.cmp(this.a, bus.read(this.absi(this.x, true))); break;
      case 0xd9: this.cmp(this.a, bus.read(this.absi(this.y, true))); break;
      case 0xc1: this.cmp(this.a, bus.read(this.izx())); break;
      case 0xd1: this.cmp(this.a, bus.read(this.izy(true))); break;
      case 0xd2: this.cmp(this.a, bus.read(this.izp())); break;
      case 0xe0: this.cmp(this.x, this.fetch()); break;
      case 0xe4: this.cmp(this.x, bus.read(this.zp())); break;
      case 0xec: this.cmp(this.x, bus.read(this.abs())); break;
      case 0xc0: this.cmp(this.y, this.fetch()); break;
      case 0xc4: this.cmp(this.y, bus.read(this.zp())); break;
      case 0xcc: this.cmp(this.y, bus.read(this.abs())); break;
      case 0x89: this.p = (this.p & ~Z) | (this.a & this.fetch() ? 0 : Z); break;
      case 0x24: this.bit(bus.read(this.zp())); break;
      case 0x34: this.bit(bus.read(this.zpx())); break;
      case 0x2c: this.bit(bus.read(this.abs())); break;
      case 0x3c: this.bit(bus.read(this.absi(this.x, true))); break;
      case 0x04: case 0x0c: case 0x14: case 0x1c: {
        // TSB / TRB
        const ea = op & 0x08 ? this.abs() : this.zp();
        const m = bus.read(ea);
        this.p = (this.p & ~Z) | (this.a & m ? 0 : Z);
        bus.write(ea, op & 0x10 ? m & ~this.a : m | this.a);
        break;
      }

      // ---- shifts, increments, decrements ----
      case 0x0a: this.a = this.asl(this.a); break;
      case 0x06: this.rmw(this.zp(), this.asl); break;
      case 0x16: this.rmw(this.zpx(), this.asl); break;
      case 0x0e: this.rmw(this.abs(), this.asl); break;
      case 0x1e: this.rmw(this.absi(this.x, true), this.asl); break;
      case 0x4a: this.a = this.lsr(this.a); break;
      case 0x46: this.rmw(this.zp(), this.lsr); break;
      case 0x56: this.rmw(this.zpx(), this.lsr); break;
      case 0x4e: this.rmw(this.abs(), this.lsr); break;
      case 0x5e: this.rmw(this.absi(this.x, true), this.lsr); break;
      case 0x2a: this.a = this.rol(this.a); break;
      case 0x26: this.rmw(this.zp(), this.rol); break;
      case 0x36: this.rmw(this.zpx(), this.rol); break;
      case 0x2e: this.rmw(this.abs(), this.rol); break;
      case 0x3e: this.rmw(this.absi(this.x, true), this.rol); break;
      case 0x6a: this.a = this.ror(this.a); break;
      case 0x66: this.rmw(this.zp(), this.ror); break;
      case 0x76: this.rmw(this.zpx(), this.ror); break;
      case 0x6e: this.rmw(this.abs(), this.ror); break;
      case 0x7e: this.rmw(this.absi(this.x, true), this.ror); break;
      case 0x1a: this.a = this.nz((this.a + 1) & 0xff); break;
      case 0x3a: this.a = this.nz((this.a - 1) & 0xff); break;
      case 0xe8: this.x = this.nz((this.x + 1) & 0xff); break;
      case 0xca: this.x = this.nz((this.x - 1) & 0xff); break;
      case 0xc8: this.y = this.nz((this.y + 1) & 0xff); break;
      case 0x88: this.y = this.nz((this.y - 1) & 0xff); break;
      case 0xe6: this.rmw(this.zp(), this.inc); break;
      case 0xf6: this.rmw(this.zpx(), this.inc); break;
      case 0xee: this.rmw(this.abs(), this.inc); break;
      case 0xfe: this.rmw(this.absi(this.x, false), this.inc); break;
      case 0xc6: this.rmw(this.zp(), this.dec); break;
      case 0xd6: this.rmw(this.zpx(), this.dec); break;
      case 0xce: this.rmw(this.abs(), this.dec); break;
      case 0xde: this.rmw(this.absi(this.x, false), this.dec); break;

      // ---- jumps, calls, returns ----
      case 0x4c: this.pc = this.fetch16(); break;
      case 0x6c: this.pc = this.read16(this.fetch16()); break;
      case 0x7c: this.pc = this.read16((this.fetch16() + this.x) & 0xffff); break;
      case 0x20: {
        const target = this.fetch16();
        const ret = (this.pc - 1) & 0xffff;
        this.push(ret >> 8);
        this.push(ret & 0xff);
        this.pc = target;
        break;
      }
      case 0x60: {
        const lo = this.pull();
        this.pc = ((lo | (this.pull() << 8)) + 1) & 0xffff;
        break;
      }
      case 0x40: {
        this.p = (this.pull() | U) & ~B;
        const lo = this.pull();
        this.pc = lo | (this.pull() << 8);
        break;
      }
      case 0x00:
        this.pc = (this.pc + 1) & 0xffff;
        this.interrupt(this.brkTarget ?? this.read16(0xfffe), true);
        break;

      // ---- branches ----
      case 0x10: this.branch(!(this.p & N)); break;
      case 0x30: this.branch(!!(this.p & N)); break;
      case 0x50: this.branch(!(this.p & V)); break;
      case 0x70: this.branch(!!(this.p & V)); break;
      case 0x90: this.branch(!(this.p & C)); break;
      case 0xb0: this.branch(!!(this.p & C)); break;
      case 0xd0: this.branch(!(this.p & Z)); break;
      case 0xf0: this.branch(!!(this.p & Z)); break;
      case 0x80: this.branch(true); this.extra--; break; // BRA: the taken cycle is in the base count

      // ---- flags ----
      case 0x18: this.p &= ~C; break;
      case 0x38: this.p |= C; break;
      case 0x58: this.p &= ~I; break;
      case 0x78: this.p |= I; break;
      case 0xb8: this.p &= ~V; break;
      case 0xd8: this.p &= ~D; break;
      case 0xf8: this.p |= D; break;

      // ---- WAI / STP ----
      case 0xcb: this.waiting = true; break;
      case 0xdb: this.stopped = true; break;

      default:
        if ((op & 0x0f) === 0x07) {
          // RMBn (0x07-0x77) / SMBn (0x87-0xf7)
          const ea = this.zp(), mask = 1 << ((op >> 4) & 7);
          const m = bus.read(ea);
          bus.write(ea, op & 0x80 ? m | mask : m & ~mask);
        } else if ((op & 0x0f) === 0x0f) {
          this.bbx((op >> 4) & 7, (op & 0x80) !== 0);
        } else {
          this.nop(op);
        }
    }
  }

  private inc(m: number): number {
    return this.nz((m + 1) & 0xff);
  }
  private dec(m: number): number {
    return this.nz((m - 1) & 0xff);
  }

  /** The undefined opcodes: NOPs that still consume their operand bytes. */
  private nop(op: number): void {
    const lo = op & 0x0f;
    if (lo === 0x02 || op === 0x44 || op === 0x54 || op === 0xd4 || op === 0xf4) this.fetch();
    else if (op === 0x5c || op === 0xdc || op === 0xfc) this.fetch16();
  }
}
