// $E706 atol(s) (4:$524D): compiled C over the runtime's 32-bit helpers
// (copy, multiply, widen, add, negate), done through those same helpers and
// with the same zero-page traffic, as itoa.ts and ltoa.ts. Its constants (0
// and 10, as longs) are in segment 4 at $73FA-$7401, which the OS has
// mapped in while it runs and Fulu does not: the helpers read them from here.
//
//   spaces and tabs skipped (nothing else), then an optional '-' or '+',
//   then decimal digits as result * 10 + digit in 32 bits (no overflow
//   check; it stops at the first non-digit, as signed chars: bytes from $80
//   are not digits); negated for '-'. The long is returned in the runtime's
//   scratch at ($2A), $20 pointing at it.

import { adc, clc, cpu, fn, m, nz, ram, rd, sbc, sec, word, wr } from "./alu";
import { constant, helper, L, load, move, sp } from "./itoa";
import { leave, reserve } from "./compiled";
import type { OsFunction } from "./fulu";

const LOCALS = 10;
// its locals and argument, from the software stack pointer
const RESULT = 0, MINUS = 4, PRODUCT = 6, S = 10;
/** Its constants in segment 4: 0 and 10. */
const ZERO = 0x73fa, TEN = 0x73fe;
const CONSTANTS = new Map<number, number>([
  ...[0, 1, 2, 3].map((i): [number, number] => [ZERO + i, 0]),
  ...[0, 1, 2, 3].map((i): [number, number] => [TEN + i, i ? 0 : 10]),
]);

/** A runtime helper, with the constants readable where the OS has them. */
function withConstants(at: number): void {
  const read = m.read;
  m.read = (a: number) => CONSTANTS.get(a) ?? read.call(m, a);
  try {
    helper(at);
  } finally {
    m.read = read;
  }
}

/** $zp = $28 + k (CLC / ADC). */
function local(zp: number, k: number): void {
  clc();
  ram[zp] = adc(ram[0x28], k);
  ram[zp + 1] = cpu.a = adc(ram[0x29], 0);
}

/** A = *s, through $26 (L16[10] to $26, LDY #0 / LDA). */
function peek(): number {
  load(0x26, S);
  cpu.y = 0;
  return (cpu.a = nz(rd(word(0x26))));
}

/** Whether *s - c is zero (SEC / SBC): the subtraction's flags left. */
function is(c: number): boolean {
  const a = peek();
  sec();
  return !(cpu.a = sbc(a, c));
}

/** s++ in place. */
function next(): void {
  cpu.y = S;
  clc();
  wr(sp() + S, (cpu.a = adc(L(S), 1)));
  cpu.y = S + 1;
  wr(sp() + S + 1, (cpu.a = adc(L(S + 1), 0)));
}

/** N xor V: the subtraction's signed less-than. */
const less = () => ((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0);

export const Atol: OsFunction = fn(0x524d, () => {
  reserve(LOCALS);
  // minus = 0; result = 0
  cpu.y = MINUS;
  cpu.a = 0;
  wr(sp() + MINUS, 0);
  cpu.y = MINUS + 1;
  wr(sp() + MINUS + 1, 0);
  constant(ZERO);
  local(0x20, RESULT);
  withConstants(0xdae6);
  while (is(0x20) || is(0x09)) next();
  if (is(0x2d)) {
    next();
    cpu.y = MINUS;
    cpu.a = 1;
    wr(sp() + MINUS, 1);
    cpu.a = 0;
    cpu.y = MINUS + 1;
    wr(sp() + MINUS + 1, 0);
  } else if (is(0x2b)) next();
  for (;;) {
    // '0' <= *s <= '9', signed
    is(0x30);
    if (less()) break;
    if (!is(0x39) && !less()) break;
    // product = result * 10; result = product + (*s - '0')
    ram[0x23] = cpu.x = nz(TEN & 0xff);
    ram[0x24] = cpu.x = nz(TEN >> 8);
    local(0x20, RESULT);
    withConstants(0xd6f5);
    move();
    local(0x20, PRODUCT);
    helper(0xdae6);
    peek();
    sec();
    ram[0x23] = cpu.a = sbc(cpu.a, 0x30);
    helper(0xd519);
    local(0x20, PRODUCT);
    helper(0xd29d);
    move();
    local(0x20, RESULT);
    helper(0xdae6);
    next();
  }
  constant(0);
  load(0x20, MINUS);
  helper(0xd340);
  if (!(cpu.p & 0x02)) {
    local(0x20, RESULT);
    helper(0xd7b4);
    move();
    local(0x20, RESULT);
    helper(0xdae6);
  }
  // the result to the scratch at ($2A)
  local(0x20, RESULT);
  move();
  clc();
  ram[0x20] = adc(ram[0x2a], 0);
  ram[0x21] = cpu.a = adc(ram[0x2b], 0);
  helper(0xdae6);
  leave(LOCALS);
});
