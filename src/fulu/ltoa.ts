// $E70F ltoa(value, buffer, radix) (4:$58DB): itoa's long sibling, compiled
// C over the runtime's 32-bit helpers (compare, copy, divide, remainder,
// shift), done through those same helpers. Its constants (0, 1000000000,
// 10) are in segment 4 at $7402-$7415, which the OS has mapped in while it
// runs and Fulu does not: the helpers read them from here.
//
//   radix 10: '-' for a negative value, then the digits by dividing by 10^9,
//     10^8, ...; radix 16: shifts of 28, 24, ..., 0; radix 2: 31 to 0; any
//     other: base 8 (30, 27, ..., 0). Leading zeros skipped, "0" for 0, a
//     NUL after; returns the buffer. (The runtime's 32-bit shift is logical
//     for counts under 32, so negative values show their two's complement.)

import { adc, clc, cpu, fn, m, nz, ram, rd, sbc, sec, set16, word, wr } from "./alu";
import { constant, get, helper, L, load, move, set, sp, store } from "./itoa";
import type { OsFunction } from "./fulu";

const LOCALS = 11;
// its locals and arguments, from the software stack pointer
const DIVISOR = 0, P = 4, LEADING = 6, DIGIT = 7, SHIFT = 8, AT = 9, VALUE = 11, BUFFER = 15, RADIX = 17;
/** Its constants in segment 4: 0, 0, 10^9, 0, 10. */
const ZERO = 0x7402, ZERO2 = 0x7406, BILLION = 0x740a, ZERO3 = 0x740e, TEN = 0x7412;
const CONSTANTS = new Map<number, number>(
  [
    [ZERO, 0],
    [ZERO2, 0],
    [BILLION, 1000000000],
    [ZERO3, 0],
    [TEN, 10],
  ].flatMap(([at, v]) => [0, 1, 2, 3].map((i): [number, number] => [at + i, (v >>> (8 * i)) & 0xff])),
);

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

/** $23 = a constant's address (LDX / STX). */
function at23(v: number): void {
  ram[0x23] = cpu.x = v & 0xff;
  ram[0x24] = cpu.x = nz(v >> 8);
}

/** *p++ = c (through L16[9] and $23). */
function put(c: number): void {
  load(0x20, P);
  store(AT);
  clc();
  ram[0x20] = adc(ram[0x20], 1);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  store(P);
  load(0x23, AT);
  cpu.a = c;
  cpu.y = 0;
  wr(word(0x23), c);
}

/** Whether L[6] is set and the digit is '0' (SEC / SBC #'0'). */
function leadingZero(c: number): boolean {
  if (!get(LEADING)) return false;
  get(DIGIT);
  sec();
  return !sbc(c, 0x30);
}

/** The shift loops: L[8] from `first` down by `step` until `end`, a digit = (value >> L[8]) & mask. */
function byShifts(first: number, step: number, end: number, mask: number, hex = false): void {
  set(SHIFT, first);
  for (;;) {
    sec();
    if (!sbc(get(SHIFT), end)) return;
    ram[0x23] = get(SHIFT);
    helper(0xd519);
    local(0x20, VALUE);
    helper(0xd93f);
    helper(0xd85a);
    clc();
    let c = adc(cpu.a & mask, 0x30);
    set(DIGIT, c);
    if (!leadingZero(c)) {
      if (hex) {
        get(DIGIT);
        sec();
        const d = sbc(c, 0x39);
        if (d && !(((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0))) {
          clc();
          set(DIGIT, (c = adc(get(DIGIT), 7)));
        }
      }
      put(get(DIGIT));
      set(LEADING, 0);
    }
    sec();
    set(SHIFT, sbc(get(SHIFT), step));
  }
}

const negative = () => ((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0);

export const Ltoa: OsFunction = fn(0x58db, () => {
  set16(0x28, (sp() - LOCALS) & 0xffff);
  load(0x20, BUFFER);
  store(P);
  at23(ZERO);
  local(0x20, VALUE);
  withConstants(0xd362);
  if (cpu.p & 0x02) put(0x30);
  else {
    set(LEADING, 1);
    constant(10);
    load(0x20, RADIX);
    helper(0xd340);
    if (cpu.p & 0x02) {
      at23(ZERO2);
      local(0x20, VALUE);
      withConstants(0xd362);
      if (negative()) {
        put(0x2d);
        local(0x20, VALUE);
        helper(0xd7b4);
        move();
        local(0x20, VALUE);
        helper(0xdae6);
      }
      constant(BILLION);
      local(0x20, DIVISOR);
      withConstants(0xdae6);
      for (;;) {
        at23(ZERO3);
        local(0x20, DIVISOR);
        withConstants(0xd362);
        if (cpu.p & 0x02) break;
        local(0x23, DIVISOR);
        local(0x20, VALUE);
        helper(0xdc83);
        helper(0xd85a);
        clc();
        const c = adc(cpu.a, 0x30);
        set(AT, c);
        load(0x20, P);
        move();
        get(AT);
        cpu.y = 0;
        wr(word(0x23), c);
        let skip = false;
        if (get(LEADING)) {
          cpu.x = get(P);
          cpu.y = P + 1;
          ram[0x27] = cpu.a = L(P + 1);
          ram[0x26] = cpu.x;
          cpu.y = 0;
          cpu.a = rd(word(0x26));
          sec();
          skip = !sbc(cpu.a, 0x30);
        }
        if (!skip) {
          clc();
          cpu.y = P;
          wr(sp() + P, (cpu.a = adc(L(P), 1)));
          cpu.y = P + 1;
          wr(sp() + P + 1, (cpu.a = adc(L(P + 1), 0)));
          set(LEADING, 0);
        }
        local(0x23, DIVISOR);
        local(0x20, VALUE);
        helper(0xdcc8);
        move();
        local(0x20, VALUE);
        helper(0xdae6);
        at23(TEN);
        local(0x20, DIVISOR);
        withConstants(0xdc83);
        move();
        local(0x20, DIVISOR);
        helper(0xdae6);
      }
    } else {
      constant(0x10);
      load(0x20, RADIX);
      helper(0xd340);
      if (cpu.p & 0x02) byShifts(0x1c, 4, 0xfc, 0x0f, true);
      else {
        constant(2);
        load(0x20, RADIX);
        helper(0xd340);
        if (cpu.p & 0x02) byShifts(0x1f, 1, 0xff, 0x01);
        else byShifts(0x1e, 3, 0xfd, 0x07);
      }
    }
  }
  load(0x20, P);
  move();
  cpu.a = 0;
  cpu.y = 0;
  wr(word(0x23), 0);
  load(0x20, BUFFER);
  set16(0x28, (sp() + LOCALS) & 0xffff);
  cpu.y = cpu.a;
});
