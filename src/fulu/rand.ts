// SysRand ($E959, 8:$6FAB): compiled C over the runtime's 32-bit helpers,
// done here through those same helpers so that it leaves registers, flags
// and the scratch area as the OS does.
//
//   SysRand(r): r is { long seed; int range }; seed = seed × 1103515245 + 12345
//   (the classic C library generator); returns (seed / 65536) % (range + 1)
//   (16-bit, unsigned) in $20/$21, its high byte in A.

import { adc, clc, cpu, fn, m, nz, os, ram, rd, set16, softPop, word } from "./alu";
import { HELPERS } from "./runtime";
import type { OsFunction } from "./fulu";

/** Its constants, in segment 8: the multiplier, the increment, the divisor. */
const MULTIPLIER = 0x8bcc, INCREMENT = 0x8bd0, DIVISOR = 0x8bd4;

/** The bytes there (segment 8, which the OS has mapped in at $5000-$8FFF while it runs; Fulu maps no OS code). */
const CONSTANTS = new Map<number, number>(
  [
    [MULTIPLIER, 1103515245],
    [INCREMENT, 12345],
    [DIVISOR, 0x10000],
  ].flatMap(([at, v]) => [0, 1, 2, 3].map((i): [number, number] => [at + i, (v >>> (8 * i)) & 0xff])),
);

/** Run a runtime helper, with the constants readable where the OS has them. */
function helper(at: number): void {
  const read = m.read;
  m.read = (a: number) => CONSTANTS.get(a) ?? read.call(m, a);
  try {
    HELPERS[at](os);
  } finally {
    m.read = read;
  }
}

/** $zp = the word at ($28) + n, as LDY #n / LDA ($28),y / STA / INY / LDA / STA leaves it. */
function load(zp: number, n: number): void {
  const sp = word(0x28);
  cpu.y = n;
  ram[zp] = cpu.a = rd(sp + n);
  cpu.y = n + 1;
  ram[zp + 1] = cpu.a = nz(rd(sp + n + 1));
}

/** $to = $from (a word), through A. */
function move(to: number, from: number): void {
  ram[to] = ram[from];
  ram[to + 1] = cpu.a = ram[from + 1];
  nz(cpu.a);
}

/** $20 = $28 + 0 (CLC / ADC). */
function local(): void {
  clc();
  ram[0x20] = adc(ram[0x28], 0);
  ram[0x21] = cpu.a = adc(ram[0x29], 0);
}

export const SysRand: OsFunction = fn(0x6fab, () => {
  // its 4 bytes of locals (the runtime's PHP / SEI / SBC / PLP keeps the flags)
  const sp = (word(0x28) - 4) & 0xffff;
  set16(0x28, sp);
  // seed × multiplier + increment, into the local, then back into r
  load(0x20, 4);
  cpu.x = MULTIPLIER & 0xff;
  set16(0x23, MULTIPLIER);
  cpu.x = MULTIPLIER >> 8;
  helper(0xdcf7);
  move(0x23, 0x20);
  set16(0x20, INCREMENT);
  cpu.a = INCREMENT >> 8;
  nz(cpu.a);
  helper(0xd29d);
  move(0x23, 0x20);
  local();
  helper(0xdae6);
  load(0x20, 4);
  move(0x23, 0x20);
  local();
  helper(0xdb19);
  // its top half
  load(0x20, 4);
  cpu.x = DIVISOR & 0xff;
  set16(0x23, DIVISOR);
  cpu.x = DIVISOR >> 8;
  helper(0xdc83);
  helper(0xd85f);
  // the local = it (LDY #0 ... INY), then % (range + 1)
  cpu.y = 0;
  ram[sp] = cpu.a = ram[0x20];
  cpu.y = 1;
  ram[sp + 1] = cpu.a = nz(ram[0x21]);
  load(0x26, 4);
  const r = word(0x26);
  cpu.y = 4;
  cpu.x = rd(r + 4);
  cpu.y = 5;
  ram[0x21] = cpu.a = nz(rd(r + 5));
  ram[0x20] = cpu.x;
  clc();
  ram[0x20] = adc(ram[0x20], 1);
  ram[0x21] = adc(ram[0x21], 0);
  move(0x23, 0x20);
  load(0x20, 0);
  helper(0xdcb1);
  // the epilogue keeps A (in Y)
  softPop(4);
  cpu.y = cpu.a;
});
