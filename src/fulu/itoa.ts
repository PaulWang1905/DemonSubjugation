// $E709 itoa(value, buffer, radix) (4:$5456): compiled C over the C
// runtime's helpers, done here through those same helpers and with the same
// zero-page traffic, so that registers, flags and the runtime's scratch are
// left as the OS leaves them.
//
//   radix 10: '-' for a negative value, then the digits by dividing by
//     10000, 1000, ... (the runtime's 16-bit division and remainder);
//   radix 16: nibbles by arithmetic shifts right of 12, 8, 4, 0 ('A'-'F' as
//     '9' + 1 + 7...); radix 2: bits 15 to 0; any other radix: base 8 (shifts
//     15, 12, ..., 0);
//   leading zeros skipped, "0" for 0; a NUL after. Returns the buffer.

import { adc, clc, cpu, fn, nz, os, ram, rd, sbc, sec, set16, word, wr } from "./alu";
import { HELPERS } from "./runtime";
import type { OsFunction } from "./fulu";

const LOCALS = 9;
// its locals and arguments, from the software stack pointer
const DIVISOR = 0, P = 2, LEADING = 4, DIGIT = 5, SHIFT = 6, AT = 7, VALUE = 9, BUFFER = 11, RADIX = 13;

export const sp = () => word(0x28);
export const L = (n: number) => rd(sp() + n);
export const helper = (at: number) => void HELPERS[at](os);

/** $zp = L16[n] (LDY #n / LDA / STA / INY / LDA / STA). */
export function load(zp: number, n: number): void {
  cpu.y = n;
  ram[zp] = rd(sp() + n);
  cpu.y = n + 1;
  ram[zp + 1] = cpu.a = nz(rd(sp() + n + 1));
}

/** L16[n] = $20. */
export function store(n: number): void {
  cpu.y = n;
  wr(sp() + n, ram[0x20]);
  cpu.y = n + 1;
  wr(sp() + n + 1, (cpu.a = nz(ram[0x21])));
}

/** $23 = a constant. */
export function constant(v: number): void {
  ram[0x23] = v & 0xff;
  ram[0x24] = cpu.a = nz(v >> 8);
}

/** $23 = $20. */
export function move(): void {
  ram[0x23] = ram[0x20];
  ram[0x24] = cpu.a = nz(ram[0x21]);
}

/** A = L[n]. */
export function get(n: number): number {
  cpu.y = n;
  return (cpu.a = nz(L(n)));
}

/** L[n] = A. */
export function set(n: number, v: number): void {
  cpu.y = n;
  wr(sp() + n, (cpu.a = v));
}

/** $20 = L16[n], then the runtime's 16-bit compare with $23 (Z: equal; N, V: as the subtraction of the high bytes). */
function compareWith(n: number): void {
  load(0x20, n);
  helper(0xd340);
}

/** *p++ = c, as the compiled code does it (through L16[7] and $23). */
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

/** The value's digit by a shift: L[5] = ((value >> L[6]) & mask) + '0' (signed shift). */
function shifted(mask: number): number {
  ram[0x23] = get(SHIFT);
  helper(0xd50c);
  load(0x20, VALUE);
  helper(0xd90b);
  clc();
  const c = adc(ram[0x20] & mask, 0x30);
  set(DIGIT, c);
  return c;
}

/** Whether a digit is a leading zero (L[4] set and the digit '0'): SEC / SBC #'0' as the OS tests it. */
function leadingZero(c: number): boolean {
  if (!get(LEADING)) return false;
  get(DIGIT);
  sec();
  return !sbc(c, 0x30);
}

/** The shift loops: from `first` down by `step` until the shift is `end`. */
function byShifts(first: number, step: number, end: number, mask: number, hex = false): void {
  set(SHIFT, first);
  for (;;) {
    sec();
    if (!sbc(get(SHIFT), end)) return;
    let c = shifted(mask);
    if (!leadingZero(c)) {
      if (hex) {
        // above '9': + 7 (SEC / SBC #'9', then signed greater)
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

export const Itoa: OsFunction = fn(0x5456, () => {
  set16(0x28, (sp() - LOCALS) & 0xffff);
  load(0x20, BUFFER);
  store(P);
  constant(0);
  compareWith(VALUE);
  if (cpu.p & 0x02) put(0x30);
  else {
    set(LEADING, 1);
    constant(10);
    compareWith(RADIX);
    if (cpu.p & 0x02) {
      constant(0);
      compareWith(VALUE);
      if (((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0)) {
        put(0x2d);
        load(0x20, VALUE);
        helper(0xd7a6);
        store(VALUE);
      }
      set(DIVISOR, 0x10);
      set(DIVISOR + 1, 0x27);
      for (;;) {
        constant(0);
        compareWith(DIVISOR);
        if (cpu.p & 0x02) break;
        load(0x23, DIVISOR);
        load(0x20, VALUE);
        helper(0xdc80);
        clc();
        const c = adc(ram[0x20], 0x30);
        set(AT, c);
        load(0x20, P);
        move();
        get(AT);
        cpu.y = 0;
        wr(word(0x23), c);
        let skip = false;
        if (get(LEADING)) {
          // the digit just written, through $26
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
          // p++ in place, and no more leading zeros
          clc();
          cpu.y = P;
          wr(sp() + P, (cpu.a = adc(L(P), 1)));
          cpu.y = P + 1;
          wr(sp() + P + 1, (cpu.a = adc(L(P + 1), 0)));
          set(LEADING, 0);
        }
        load(0x23, DIVISOR);
        load(0x20, VALUE);
        helper(0xdcb1);
        store(VALUE);
        constant(10);
        load(0x20, DIVISOR);
        helper(0xdc80);
        store(DIVISOR);
      }
    } else {
      constant(0x10);
      compareWith(RADIX);
      if (cpu.p & 0x02) byShifts(0x0c, 4, 0xfc, 0x0f, true);
      else {
        constant(2);
        compareWith(RADIX);
        if (cpu.p & 0x02) byShifts(0x0f, 1, 0xff, 0x01);
        else byShifts(0x0f, 3, 0xfd, 0x07);
      }
    }
  }
  // the NUL, and buffer returned (the epilogue keeps A in Y)
  load(0x20, P);
  move();
  cpu.a = 0;
  cpu.y = 0;
  wr(word(0x23), 0);
  load(0x20, BUFFER);
  set16(0x28, (sp() + LOCALS) & 0xffff);
  cpu.y = cpu.a;
});
