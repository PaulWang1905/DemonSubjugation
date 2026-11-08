// Fulu (符箓): the Longman 4988's operating system, in TypeScript.
//
// A program runs its own 6502 code on the emulated machine (src/bbk). The
// OS's part of the memory map holds nothing but the opcode $02, which the CPU
// hands to Fulu, so every way into the OS is answered by a TypeScript function:
// a call into its resident code at $D000-$FFFF (the C compiler's helpers), a
// far call through $D2F6 (the OS functions, or another segment of the
// program), and an interrupt through the vectors at $0300.
//
// Fulu keeps the OS's own state in TypeScript. What programs see is the same
// as on the device: the same registers, stack and memory after each call.

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

/** Banks D-F: where the OS keeps its resident code. */
const OS_PAGES = [0xe88, 0xe89, 0xe8a];
/** The OS's segments start here (segment n at page OS_BASE + 4n). */
const OS_BASE = 0xe80;
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
  /** The flash page of the program's segment 0. */
  base = 0;
  /** Keys pressed and not yet read, and timer ticks counted. */
  readonly keys: number[] = [];
  ticks = 0;

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
    this.keys.length = 0;
    this.base = 0x200 + (h >> 12);
    const data = this.base + ((flash[h + 0x42] | (flash[h + 0x43] << 8) | (flash[h + 0x44] << 16)) >> 12);
    const entry = flash[h + 0x40] | (flash[h + 0x41] << 8);
    const pages = [1, 2, 3, 4, this.base, this.base + 1, this.base + 2, this.base + 3, data, data + 1, data + 2, data + 3, ...OS_PAGES];
    pages.forEach((page, i) => this.map(i + 1, page));
    for (const [a, v] of [...IO, ...ZERO_PAGE]) ram[a] = v;
    ram[0x26] = (entry - 1) & 0xff;
    ram[0x27] = (entry - 1) >> 8;
    ram.set(STACK, 0x101 + STACK_TOP);
    ram.set(frame(data, this.base), SOFT_STACK);
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
    if (pc >= 0x300 && pc < 0x350) return this.run(INTERRUPTS[(pc - 0x300) >> 2], `interrupt ${(pc - 0x300) >> 2}`, pc, true);
    if (this.machine.page(pc >>> 12) < 0xe00) return false;
    if (pc === FAR_CALL) return this.farCall(pc);
    if (pc === FAR_RETURN) return this.farReturn();
    return this.run(HELPERS[pc], `the OS routine at $${hex(pc)}`, pc, false);
  }

  private run(h: Handler | undefined, name: string, pc: number, rti: boolean): boolean {
    if (!h) {
      this.stop(`Fulu has no ${name} yet`);
      return true;
    }
    const r = h(this);
    if (r === "jump") return true;
    if (r === "wait") {
      this.machine.cpu.pc = pc;
      this.machine.ram[0x200] |= 0x08; // halt until the next interrupt, as the OS does when it waits
      return true;
    }
    const cpu = this.machine.cpu;
    if (rti) cpu.p = (this.pull() | 0x20) & ~0x10;
    const lo = this.pull();
    cpu.pc = ((lo | (this.pull() << 8)) + (rti ? 0 : 1)) & 0xffff;
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
    if (seg < 0xe0) {
      const name = NAMES[ptr] ? `${NAMES[ptr]} ($${hex(ptr)})` : `OS function $${hex(ptr)}`;
      return this.run(FUNCTIONS[ptr], name, pc, false);
    }
    const target = m.read(ptr) | (m.read((ptr + 1) & 0xffff) << 8), a = cpu.a;
    this.push(this.segment());
    this.mapSegment(seg);
    this.push((FAR_RETURN - 1) >> 8);
    this.push((FAR_RETURN - 1) & 0xff);
    // as the OS's trampoline leaves it: $26/$27 = target - 1, X = Y = A, flags of the subtraction
    const t = target - 1;
    ram[0x26] = t & 0xff;
    ram[0x27] = (t >> 8) & 0xff;
    const hi = target >> 8, borrow = (target & 0xff) === 0 ? 1 : 0, r = hi - borrow;
    cpu.p = (cpu.p & ~(N | Z | C | V)) | (r >= 0 ? C : 0) | (hi & ~r & 0x80 ? V : 0) | (a & N) | (a ? 0 : Z);
    cpu.x = cpu.y = a;
    cpu.pc = target;
    return true;
  }

  /** $D313: a far call's target has returned; map the caller's segment back. A main that returns ends the program. */
  private farReturn(): boolean {
    const cpu = this.machine.cpu, seg = this.pull();
    if (seg < 0xe0) {
      this.stop("The program ended");
      return true;
    }
    this.mapSegment(seg);
    cpu.x = cpu.a;
    cpu.p = (cpu.p & ~(N | Z)) | (cpu.a & N) | (cpu.a ? 0 : Z);
    const lo = this.pull();
    cpu.pc = ((lo | (this.pull() << 8)) + 1) & 0xffff;
    return true;
  }

  // ---- banks and the stack ----

  private map(bank: number, page: number): void {
    const m = this.machine;
    m.write(0x0c, bank);
    m.write(0x0d, page & 0xff);
    m.write(0x0e, page >> 8);
  }

  /** The segment in $5000-$8FFF, as the OS numbers it: the program's from $E0, the OS's below. */
  private segment(): number {
    const page = this.machine.page(5);
    return page >= OS_BASE ? (page - OS_BASE) >> 2 : 0xe0 + ((page - this.base) >> 2);
  }

  private mapSegment(seg: number): void {
    const first = seg >= 0xe0 ? this.base + (seg - 0xe0) * 4 : OS_BASE + seg * 4;
    for (let i = 0; i < 4; i++) this.map(5 + i, first + i);
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
