// $E9AD (8:$7253): draw a 32-bit number on the screen, in a radix, through
// SysAscii. Compiled C over the runtime's 32-bit helpers, done here through
// those same helpers, with the same software-stack locals and zero-page
// traffic, as itoa.ts and ltoa.ts do.
//
//   void f(x, y, long value, radix, signed)    (x in A)
//
//   if signed is 1 and the value is negative: SysAscii(x, y, '-'), x += 8,
//     value = -value;
//   the digits, lowest first, into a buffer (its locals 0-19): while
//     q = value / radix (the runtime's unsigned divide) is not 0, the digit
//     is value - q * radix, and value = q; the last digit is what is left;
//   then each digit from the highest: SysAscii(x, y, "0123456789ABCDEF"[d]),
//     x += 8.
//
// Its constants (the longs 0, 0, 0, 1, 1) and the digits' characters are in
// segment 8 at $8BD8-$8BFC, which the OS has mapped in while it runs and Fulu
// does not: they are here. (Past "F" the table runs into those constants: a
// radix over 16 shows their bytes, as the OS does, up to radix 37.)

import { adc, carry, clc, cpu, fn, m, nz, os, plp, ram, rd, sbc, sec, word, wr } from "./alu";
import { get, helper, load, move, set, sp } from "./itoa";
import { SYS_ASCII_TEMPORARIES } from "./text";
import type { OsFunction } from "./fulu";

const LOCALS = 0x20;

// its locals and arguments, from the software stack pointer
const CHAR = 0x14, I = 0x16, J = 0x18, DIGIT = 0x1c, X = 0x20, VALUE = 0x22, RADIX = 0x26, SIGNED = 0x27;

/** Its table and constants in segment 8 ($8BD8: the digits; $8BE9, $8BED, $8BF1: 0; $8BF5, $8BF9: 1). */
const TABLE = 0x8bd8;
const BYTES = [..."0123456789ABCDEF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0x0c, 0, 0, 0]);
const ZERO = 0x8be9, ZERO2 = 0x8bed, ZERO3 = 0x8bf1, ONE = 0x8bf5, ONE2 = 0x8bf9;
const CONSTANTS = new Map<number, number>(BYTES.map((b, i) => [TABLE + i, b]));

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

/** $zp = $28 + k (CLC / LDA / ADC / STA). */
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

/** The software stack moved by n, its flags kept (PHP / SEI / CLC / ADC / PLP). */
function drop(n: number): void {
  const p = cpu.p;
  clc();
  ram[0x28] = adc(ram[0x28], n);
  ram[0x29] = cpu.a = adc(ram[0x29], 0);
  plp(p);
}

/** n bytes of locals (PHP / SEI / SEC / SBC / PLP). */
function reserve(n: number): void {
  const p = cpu.p;
  sec();
  ram[0x28] = sbc(ram[0x28], n);
  ram[0x29] = cpu.a = sbc(ram[0x29], 0);
  plp(p);
}

/** $20 = $28 + L16[I] (the buffer's next byte). */
function bufferAt(): void {
  load(0x20, I);
  clc();
  ram[0x20] = adc(ram[0x28], ram[0x20]);
  ram[0x21] = cpu.a = adc(ram[0x29], ram[0x21]);
}

/** L16[I] += 1 (through $20). */
function next(): void {
  load(0x20, I);
  cpu.a = ram[0x20];
  clc();
  ram[0x20] = adc(cpu.a, 1);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  cpu.y = I;
  wr(sp() + I, (cpu.a = ram[0x20]));
  cpu.y = I + 1;
  wr(sp() + I + 1, (cpu.a = ram[0x21]));
}

/** SysAscii(x, y, c) as the compiled code calls it, then x += 8. */
function draw(c: number): void {
  cpu.a = c;
  helper(0xdaaa);
  get(VALUE); // L[34] is now y (one byte pushed)
  helper(0xdaaa);
  get(VALUE); // and now x
  os.call(0xe7bb);
  drop(2);
  get(X);
  clc();
  set(X, adc(cpu.a, 8));
}

const less = () => ((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0);

export const PrintLong: OsFunction = fn(0x7253, () => {
  helper(0xdaaa); // x, pushed
  reserve(LOCALS);
  get(SIGNED);
  sec();
  if (!sbc(cpu.a, 1)) {
    local(0x20, VALUE);
    at23(ZERO);
    withConstants(0xd362);
    if (less()) {
      draw(0x2d);
      local(0x20, VALUE);
      helper(0xd7b4);
      move();
      local(0x20, VALUE);
      helper(0xdae6);
    }
  }
  // the digits, lowest first
  cpu.y = I;
  wr(sp() + I, (cpu.a = 0));
  cpu.y = I + 1;
  wr(sp() + I + 1, 0);
  for (;;) {
    get(RADIX);
    ram[0x23] = cpu.a;
    helper(0xdd58);
    local(0x20, VALUE);
    helper(0xdc83);
    move();
    local(0x20, J);
    helper(0xdae6);
    at23(ZERO2);
    local(0x20, J);
    withConstants(0xd362);
    if (!carry() || cpu.p & 0x02) break;
    get(RADIX);
    ram[0x23] = cpu.a;
    helper(0xdd58);
    local(0x20, J);
    helper(0xdcf7);
    move();
    local(0x20, VALUE);
    helper(0xdb2f);
    move();
    local(0x20, DIGIT);
    helper(0xdae6);
    bufferAt();
    move();
    local(0x20, DIGIT);
    helper(0xd85a);
    cpu.y = 0;
    wr(word(0x23), cpu.a);
    next();
    local(0x20, J);
    move();
    local(0x20, VALUE);
    helper(0xdae6);
  }
  bufferAt();
  move();
  local(0x20, VALUE);
  helper(0xd85a);
  cpu.y = 0;
  wr(word(0x23), cpu.a);
  next();
  // j = 0
  ram[0x23] = cpu.a = ZERO3 & 0xff;
  ram[0x24] = cpu.a = nz(ZERO3 >> 8);
  local(0x20, J);
  withConstants(0xdae6);
  // then each digit from the highest
  for (;;) {
    load(0x23, I);
    helper(0xdd75);
    local(0x20, J);
    helper(0xd362);
    if (carry()) break;
    at23(ONE2);
    local(0x20, J);
    withConstants(0xd29d);
    move();
    load(0x20, I);
    helper(0xdd38);
    helper(0xdb2f);
    helper(0xd85f);
    clc();
    ram[0x20] = adc(ram[0x28], ram[0x20]);
    ram[0x21] = cpu.a = adc(ram[0x29], ram[0x21]);
    cpu.y = 0;
    cpu.a = nz(rd(word(0x20)));
    helper(0xd49e);
    cpu.y = CHAR;
    wr(sp() + CHAR, (cpu.a = ram[0x20]));
    cpu.y = CHAR + 1;
    wr(sp() + CHAR + 1, (cpu.a = ram[0x21]));
    load(0x20, CHAR);
    clc();
    ram[0x20] = adc(ram[0x20], TABLE & 0xff);
    ram[0x21] = cpu.a = adc(ram[0x21], TABLE >> 8);
    cpu.y = 0;
    const at = word(0x20);
    draw(nz(CONSTANTS.get(at) ?? rd(at)));
    at23(ONE);
    local(0x20, J);
    withConstants(0xd29d);
    move();
    local(0x20, J);
    helper(0xdae6);
  }
  drop(0x21);
}, SYS_ASCII_TEMPORARIES);
