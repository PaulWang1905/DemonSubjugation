// The C compiler's runtime: the helpers programs call in the OS's resident
// code at $D000-$FFFF.
//
// Arguments are in zero page: values or pointers in $20/$21 and $23/$24.
// 16-bit results go to $20/$21. 32-bit values are passed by pointer; results
// are written to the scratch area at ($2A) (+8, or +$18 for a remainder),
// and $20/$21 is pointed at them. Arguments widened to 32 bits go to
// scratch +$10 (pointed to by $20) or +$20 (pointed to by $23). The software
// stack pointer is $28/$29.
//
// Each helper leaves memory, registers and flags as the OS's own does,
// including the incidental ones (X, Y, the flags of its last operation),
// since a program could depend on any of them.

import { B, Z } from "../bbk/cpu";
import { adc, asl, carry, clc, cmp, cpu, long, lsr, m, nz, plp, ram, rd, rol, ror, sbc, sec, store, use, word, wr } from "./alu";
import type { Fulu, Handler } from "./fulu";

const scratch = () => word(0x2a);

/** $D586/$D596/$D5A6: point $20 or $23 at scratch + off; A is kept. */
function point(zp: number, off: number): void {
  const a = cpu.a;
  clc();
  ram[zp] = adc(ram[0x2a], off);
  ram[zp + 1] = adc(ram[0x2b], 0);
  nz(a);
}

/** Restore S after a helper's own pushes (TXA, CLC, ADC #n, TAX, TXS), from the S it had on entry. */
function unwind(s: number, n: number): void {
  clc();
  cpu.a = cpu.x = adc((s - n) & 0xff, n);
}

// ---- 32-bit arithmetic: (scratch+8) = ($20) op ($23) ----

function op32(f: (a: number, b: number) => number): void {
  const a = word(0x20), b = word(0x23), r = scratch() + 8;
  for (let i = 0; i < 4; i++) wr(r + i, (cpu.a = f(rd(a + i), rd(b + i))));
  cpu.y = 0x0b;
  point(0x20, 8);
}

/** Compare n bytes: the flags of the subtraction, Z only if all bytes are equal; A = the flags, X = bytes that differ. */
export function compare(a: number, b: number, n: number): void {
  let differ = 0;
  sec();
  for (let i = 0; i < n; i++) if (sbc(rd(a + i), rd(b + i))) differ++;
  cpu.x = differ;
  plp((cpu.p & ~Z) | (differ ? 0 : Z));
  cpu.a = cpu.p | B;
}

/** Widen to 32 bits at scratch + off and point zp ($20 or $23) at it. */
function widen(off: number, bytes: number[], zp: number, a: number): void {
  const s = scratch() + off;
  bytes.forEach((v, i) => wr(s + i, v));
  cpu.y = off + 3;
  cpu.a = a;
  point(zp, off);
}
const sign = (v: number) => (v & 0x80 ? 0xff : 0);

/** 32-bit shift of ($20) by the count at ($23), into scratch+8. */
function shift32(left: boolean): void {
  const s = scratch() + 8, count = word(0x23);
  for (let i = 0; i < 4; i++) wr(s + i, 0);
  cpu.a = rd(count + 3) | rd(count + 2) | rd(count + 1);
  if (nz(cpu.a)) {
    cpu.x = 0;
    cpu.y = 1;
    return point(0x20, 8);
  }
  cpu.y = 0;
  cmp((cpu.a = rd(count)), 0x20);
  if (cpu.a >= 0x20) {
    cpu.x = 0;
    return point(0x20, 8);
  }
  const n = cpu.a, src = word(0x20);
  for (let i = 0; i < 4; i++) wr(s + i, (cpu.a = rd(src + i)));
  cpu.y = 0x0b;
  cmp((cpu.x = n), 0);
  if (!n) return;
  for (let x = n; x; cpu.x = nz(--x)) {
    if (left) {
      wr(s, asl(rd(s)));
      for (let i = 1; i < 4; i++) wr(s + i, (cpu.a = rol(rd(s + i))));
    } else {
      wr(s + 3, lsr(rd(s + 3)));
      for (let i = 2; i >= 0; i--) wr(s + i, (cpu.a = ror(rd(s + i))));
    }
  }
  if (!left) cpu.y = 8;
  point(0x20, 8);
}

/** 16-bit shift of $20/$21 by $23/$24. */
function shift16(left: boolean): void {
  const clear = () => {
    cpu.a = nz(0);
    ram[0x20] = ram[0x21] = 0;
  };
  if ((cpu.x = nz(ram[0x24]))) return clear();
  if (!(cpu.x = nz(ram[0x23]))) return;
  cmp(cpu.x, 0x10);
  if (cpu.x >= 0x10) return clear();
  for (let x = cpu.x; x; cpu.x = nz(--x)) {
    if (left) {
      ram[0x20] = asl(ram[0x20]);
      ram[0x21] = rol(ram[0x21]);
    } else {
      ram[0x21] = lsr(ram[0x21]);
      ram[0x20] = ror(ram[0x20]);
    }
  }
}

/** 8-bit shift of A by $23. */
function shift8(f: (v: number) => number): void {
  if (!(cpu.x = nz(ram[0x23]))) return;
  cmp(cpu.x, 8);
  if (cpu.x >= 8) return void (cpu.a = nz(0));
  for (let x = cpu.x; x; cpu.x = nz(--x)) cpu.a = f(cpu.a);
}

// ---- multiplication and division ----

/** $D184: A = $20 × $23 (8 bits). */
function mul8(): void {
  cpu.a = 0;
  if (!nz(ram[0x20]) || !nz(ram[0x23])) return;
  const b = ram[0x23];
  let p = 0;
  for (let x = 8; x; cpu.x = nz(--x)) {
    p = asl(p);
    ram[0x23] = asl(ram[0x23]);
    if (carry()) {
      clc();
      p = adc(p, ram[0x20]);
    }
  }
  cpu.x = p;
  ram[0x23] = b;
  cpu.a = nz(p);
}

/** $D1A2: $20/$21 = $26/$27 = $20/$21 × $23/$24 (16 bits). */
function mul16(): void {
  const b = [ram[0x23], ram[0x24]];
  ram[0x26] = ram[0x27] = 0;
  if (nz(ram[0x20] | ram[0x21]) && nz(ram[0x23] | ram[0x24])) {
    for (const zp of nz(ram[0x24]) ? [0x24, 0x23] : [0x23]) {
      for (let x = 8; x; cpu.x = nz(--x)) {
        ram[0x26] = asl(ram[0x26]);
        ram[0x27] = rol(ram[0x27]);
        ram[zp] = asl(ram[zp]);
        if (carry()) {
          clc();
          ram[0x26] = adc(ram[0x20], ram[0x26]);
          ram[0x27] = adc(ram[0x21], ram[0x27]);
        }
      }
    }
  }
  ram[0x20] = ram[0x26];
  ram[0x21] = ram[0x27];
  [ram[0x23], ram[0x24]] = b;
  cpu.a = nz(b[1]);
}

/** $D000: A = $20 / $23, $21 = the remainder (8 bits). */
function div8(): void {
  if (!nz(ram[0x20])) return void (cpu.a = ram[0x21] = 0);
  if (!nz(ram[0x23])) return void (cpu.a = ram[0x21] = nz(0xff));
  ram[0x21] = ram[0x26] = 0;
  for (let x = 9; ; ram[0x20] = asl(ram[0x20]), ram[0x21] = rol(ram[0x21])) {
    cmp(ram[0x21], ram[0x23]);
    if (carry()) {
      ram[0x21] = sbc(ram[0x21], ram[0x23]);
      sec();
    }
    ram[0x26] = rol(ram[0x26]);
    if (!(cpu.x = nz(--x))) break;
  }
  cpu.a = nz(ram[0x26]);
}

/** $D032: $20/$21 = $20/$21 / $23/$24, $26/$27 = the remainder (16 bits); s is S on entry. */
function div16(s: number): void {
  if (!nz(ram[0x20] | ram[0x21])) {
    cpu.a = 0;
    wr(scratch() + 0x18, 0);
    wr(scratch() + 0x19, 0);
    cpu.y = nz(0x19);
    return;
  }
  if (!nz(ram[0x23] | ram[0x24])) return void (cpu.a = ram[0x20] = ram[0x21] = nz(0xff));
  const d0 = ram[0x23], d1 = ram[0x24];
  let n0 = ram[0x20], n1 = ram[0x21], r0 = 0, r1 = 0;
  ram[0x20] = ram[0x21] = 0;
  for (let k = 0x11; ; n0 = asl(n0), n1 = rol(n1), r0 = rol(r0), r1 = rol(r1)) {
    sec();
    sbc(r0, d0);
    sbc(r1, d1);
    if (carry()) {
      r0 = sbc(r0, d0);
      r1 = sbc(r1, d1);
      sec();
    }
    ram[0x20] = rol(ram[0x20]);
    ram[0x21] = rol(ram[0x21]);
    if (!nz(--k)) break;
  }
  ram[0x26] = r0;
  ram[0x27] = r1;
  unwind(s, 5);
}

/** $D0A8: 32-bit division; quotient to scratch+8, remainder to scratch+$18. */
function div32(dividend: number, divisor: number): void {
  const s = scratch();
  store(s + 8, 0);
  store(s + 0x18, 0);
  let k = 0x21, q = 0, r = 0;
  if (dividend && !divisor) q = 0xffffffff;
  else if (dividend) {
    for (let n = dividend; ; ) {
      const c = r >= divisor ? 1 : 0;
      if (c) r -= divisor;
      q = ((q << 1) | c) >>> 0;
      if (!--k) break;
      r = ((r << 1) | (n >>> 31)) >>> 0;
      n = (n << 1) >>> 0;
    }
  }
  store(s + 8, q);
  store(s + 0x18, r);
  cpu.y = 0x1b;
  cpu.a = r >>> 24;
  point(0x20, 8);
  cpu.a = nz(k);
}

/** $DC83: unsigned 32-bit ($20) / ($23); s is S on entry. */
function udiv32(s: number): void {
  div32(long(word(0x20)), long(word(0x23)));
  unwind(s, 0x0c);
}

const neg20 = () => {
  sec();
  ram[0x20] = sbc(0, ram[0x20]);
  cpu.a = ram[0x21] = sbc(0, ram[0x21]);
};
const neg23 = () => {
  const a = cpu.a;
  sec();
  ram[0x23] = sbc(0, ram[0x23]);
  ram[0x24] = sbc(0, ram[0x24]);
  nz(a);
};

/**
 * A signed 16-bit operation done unsigned on the magnitudes ($D3EF: divide,
 * $D6AF: multiply), the result negated if the signs differ. op gets the
 * number of bytes pushed below the return address.
 */
function signed16(op: (pushed: number) => void): void {
  const a = ram[0x21] & 0x80, b = ram[0x24] & 0x80;
  if (!b) {
    if (!a) return op(2);
    neg20();
    op(2);
    return neg20();
  }
  const saved = [ram[0x23], ram[0x24]];
  neg23();
  if (a) {
    neg20();
    op(4);
  } else {
    op(4);
    neg20();
  }
  [ram[0x23], ram[0x24]] = saved;
  cpu.a = nz(saved[1]);
}

// ---- the switch statement ----

/**
 * $DB5C (reached by JMP): compare $23/$24 with the X/Y (count) words at ($26)
 * and jump to the matching entry of the address table that follows them, or
 * to ($20) when none matches.
 */
function switchCase(): "jump" {
  const s = cpu.s, fallback = word(0x20);
  let n = cpu.x | (cpu.y << 8), lo = cpu.a;
  ram[0x20] = asl(cpu.x);
  ram[0x21] = rol(cpu.y);
  clc();
  ram[0x20] = adc(ram[0x20], ram[0x26]);
  ram[0x21] = adc(ram[0x21], ram[0x27]);
  for (;;) {
    const at = word(0x26);
    cpu.y = 1;
    sec();
    lo = sbc(rd(at), ram[0x23]);
    if (!nz(sbc(rd(at + 1), ram[0x24]) | lo)) {
      unwind(s, 5);
      const t = word(0x20);
      ram[0x26] = rd(t);
      cpu.a = ram[0x27] = nz(rd(t + 1));
      cpu.pc = word(0x26);
      return "jump";
    }
    for (const zp of [0x26, 0x20]) {
      clc();
      ram[zp] = adc(ram[zp], 2);
      ram[zp + 1] = adc(ram[zp + 1], 0);
    }
    sec();
    const l = sbc(n & 0xff, 1), h = sbc(n >> 8, 0);
    n = l | (h << 8);
    if (!n) break;
  }
  cpu.x = (s - 5) & 0xff;
  ram[0x26] = fallback & 0xff;
  ram[0x27] = fallback >> 8;
  cpu.a = nz(lo);
  cpu.pc = fallback;
  return "jump";
}

// ---- the software stack ----

/** Push n bytes onto the software stack ($28/$29); interrupts and flags as on entry. */
function push(n: number, bytes: () => number[]): void {
  const p = cpu.p;
  sec();
  ram[0x28] = sbc(ram[0x28], n);
  ram[0x29] = sbc(ram[0x29], 0);
  const sp = word(0x28);
  bytes().forEach((v, i) => wr(sp + i, (cpu.a = v)));
  cpu.y = n - 1;
  plp(p);
}

// ---- memory and banks (the OS's jump table at $E900) ----

/**
 * $E901: memmove(dst, src, n), arguments on the software stack, through
 * $2F-$32. The arguments are read again as the OS does (a copy can overwrite
 * them): n's low byte after the whole pages, the pointers before the rest of
 * a backward copy.
 */
function memmove(): void {
  const sp = word(0x28), arg = (i: number) => rd(sp + i);
  const pointers = () => { for (let i = 0; i < 4; i++) ram[0x2f + i] = arg(i); };
  pointers();
  let pages = arg(5);
  cmp(ram[0x32], ram[0x30]);
  if (ram[0x32] === ram[0x30]) cmp(ram[0x31], ram[0x2f]);
  let lo: number;
  if (carry()) {
    // forward: whole pages, then the rest
    for (; pages; pages--) {
      for (let y = 0; y < 0x100; y++) wr(word(0x2f) + y, rd(word(0x31) + y));
      for (const zp of [0x32, 0x30]) {
        clc();
        ram[zp] = adc(ram[zp], 1);
      }
    }
    cpu.a = lo = arg(4);
    for (let y = 0; y < lo; y++) wr(word(0x2f) + y, (cpu.a = rd(word(0x31) + y)));
    cpu.y = lo;
  } else {
    // backward: from the end, whole pages, then the rest
    for (const zp of [0x2f, 0x31]) {
      clc();
      ram[zp] = adc(arg(4), ram[zp]);
      ram[zp + 1] = adc(pages, ram[zp + 1]);
    }
    for (; pages; pages--) {
      for (const zp of [0x32, 0x30]) {
        sec();
        ram[zp] = sbc(ram[zp], 1);
      }
      for (let y = 0xff; y >= 0; y--) wr(word(0x2f) + y, rd(word(0x31) + y));
    }
    pointers();
    lo = arg(4);
    sec();
    cpu.a = sbc(lo, 1);
    for (let y = lo - 1; y >= 0; y--) wr(word(0x2f) + y, (cpu.a = rd(word(0x31) + y)));
    cpu.y = 0xff;
  }
  cpu.x = 0;
  cmp(0, 0);
}

/**
 * $E904: compare n bytes at a ($2F) and b ($31), arguments (a, b, n) on the
 * software stack: whole pages (n's high byte) first, then the rest. A = 0
 * if they match, else 1 if b's byte is the greater, $FF if a's; X and Y as
 * its counts leave them.
 */
function memcmp(): void {
  const sp = word(0x28);
  for (let i = 0; i < 4; i++) ram[0x2f + i] = rd(sp + i);
  // which bytes differ, if any: (CMP leaves C and Z)
  const differ = (y: number) => cmp(rd(word(0x31) + y), rd(word(0x2f) + y)) !== 0;
  let x = rd(sp + 5), y = 0, found = false;
  for (;;) {
    cmp(x, 0);
    if (!x) break;
    x--;
    for (y = 0; ; y++) {
      if (differ(y)) {
        found = true;
        break;
      }
      cmp(y, 0xff);
      if (y === 0xff) break;
    }
    if (found) break;
    for (const zp of [0x32, 0x30]) {
      clc();
      ram[zp] = adc(ram[zp], 1);
    }
  }
  if (!found) {
    x = rd(sp + 4);
    for (y = 0; ; y++, x--) {
      cmp(x, 0);
      if (!x) break;
      if (differ(y)) break;
    }
  }
  cpu.x = x;
  cpu.y = y;
  cpu.a = nz(cpu.p & Z ? 0 : carry() ? 1 : 0xff);
}

/** $E907: map ($28)[0] consecutive banks from bank A, the first to page ($28)[1..2]. */
function mapBanks(): void {
  const sp = word(0x28), p = cpu.p;
  m.write(0x0c, cpu.a);
  m.write(0x0d, rd(sp + 1));
  m.write(0x0e, (cpu.a = rd(sp + 2)));
  for (let x = (rd(sp) - 1) & 0xff; x; x--) {
    const lo = m.read(0x0d);
    m.write(0x0c, (m.read(0x0c) + 1) & 0xff);
    clc();
    m.write(0x0d, adc(lo, 1));
    m.write(0x0e, (cpu.a = adc(cpu.a, 0)));
  }
  cpu.x = cpu.y = 0;
  plp(p);
}

/** $E90A: store bank A's page at the pointer at ($28) (also left in $2F/$30). */
function savePage(): void {
  const sp = word(0x28);
  ram[0x2f] = rd(sp);
  ram[0x30] = rd(sp + 1);
  m.write(0x0c, cpu.a);
  const at = word(0x2f);
  wr(at, m.read(0x0d));
  wr(at + 1, (cpu.a = m.read(0x0e)));
  cpu.y = 1;
}

// ---- the table ----

/** Each returns "jump" if it has set the PC; anything else it returns is ignored. */
const table: Record<number, () => unknown> = {
  0xd29d: () => (clc(), op32(adc)),
  0xd2ca: () => op32((a, b) => nz(a & b)),
  0xdb2f: () => (sec(), op32(sbc)),
  0xd340: () => compare(0x20, 0x23, 2),
  0xd362: () => (compare(word(0x20), word(0x23), 4), (cpu.y = 3)),
  0xd49e: () => (ram[0x20] = cpu.a, (cpu.a = ram[0x21] = nz(sign(cpu.a)))),
  0xd50c: () => (ram[0x24] = sign(ram[0x23]), nz(cpu.a)),
  0xd4a9: () => widen(0x10, [cpu.a, sign(cpu.a), sign(cpu.a), sign(cpu.a)], 0x20, sign(cpu.a)),
  0xd4c6: () => widen(0x10, [ram[0x20], ram[0x21], sign(ram[0x21]), sign(ram[0x21])], 0x20, sign(ram[0x21])),
  0xdd1f: () => widen(0x10, [cpu.a, 0, 0, 0], 0x20, 0),
  0xdd38: () => widen(0x10, [ram[0x20], ram[0x21], 0, 0], 0x20, 0),
  0xd519: () => widen(0x20, [ram[0x23], sign(ram[0x23]), sign(ram[0x23]), sign(ram[0x23])], 0x23, cpu.a),
  0xd53a: () => widen(0x20, [ram[0x23], ram[0x24], sign(ram[0x24]), sign(ram[0x24])], 0x23, cpu.a),
  0xdd58: () => widen(0x20, [ram[0x23], 0, 0, 0], 0x23, cpu.a),
  0xdd75: () => widen(0x20, [ram[0x23], ram[0x24], 0, 0], 0x23, 0),
  0xd85a: () => ((cpu.y = 0), (cpu.a = nz(rd(word(0x20))))),
  0xd85f: () => {
    const p = word(0x20);
    cpu.x = rd(p);
    cpu.y = 1;
    cpu.a = ram[0x21] = nz(rd(p + 1));
    ram[0x20] = cpu.x;
  },
  0xdae6: () => copy4(word(0x23), word(0x20)),
  0xdb19: () => copy4(word(0x20), word(0x23)),
  0xdaaa: () => push(1, () => [(cpu.x = cpu.a)]),
  0xdaca: () => push(2, () => [ram[0x20], ram[0x21]]),
  0xdafc: () => (push(4, () => [0, 1, 2, 3].map((i) => rd(word(0x20) + i))), (cpu.y = 4), (cpu.x = 0)),
  0xdde4: () => (cpu.a = nz(cpu.a ? 0 : 1)),
  0xda09: () => shift8(asl),
  0xdbe1: () => shift8(lsr),
  0xda1a: () => shift16(true),
  0xdbf2: () => shift16(false),
  0xda3d: () => shift32(true),
  0xdc0e: () => shift32(false),
  0xdc7b: () => ((ram[0x20] = cpu.a), div8()),
  0xdcab: () => ((ram[0x20] = cpu.a), div8(), (cpu.a = nz(ram[0x21]))),
  0xdcef: () => ((ram[0x20] = cpu.a), mul8()),
  0xdc80: () => div16(cpu.s),
  0xdcb1: () => {
    if (!nz((cpu.a = ram[0x21])) && !nz((cpu.a = ram[0x20]))) return;
    div16((cpu.s - 2) & 0xff);
    ram[0x20] = ram[0x26];
    cpu.a = ram[0x21] = nz(ram[0x27]);
  },
  0xdcf4: mul16,
  0xd3ef: () => {
    const s = cpu.s;
    signed16((pushed) => div16((s - pushed) & 0xff));
  },
  0xd6af: () => signed16(mul16),
  0xdc83: () => udiv32(cpu.s),
  0xdcc8: () => {
    const s = scratch();
    udiv32((cpu.s - 2) & 0xff);
    for (let i = 0; i < 4; i++) wr(s + 8 + i, (cpu.a = rd(s + 0x18 + i)));
    cpu.y = 0x0b;
    point(0x20, 8);
  },
  0xdcf7: () => {
    const s = cpu.s, product = Math.imul(long(word(0x20)), long(word(0x23))) >>> 0;
    point(0x20, 8);
    store(word(0x20), product);
    cpu.y = 3;
    unwind(s, 8);
  },
  0xdb5c: switchCase,
  0xe901: memmove,
  0xe904: memcmp,
  0xe907: mapBanks,
  0xe90a: savePage,
};
table[0xdac1] = table[0xdae6];
table[0xdac7] = table[0xdb19];

function copy4(from: number, to: number): void {
  for (let i = 0; i < 4; i++) wr(to + i, (cpu.a = rd(from + i)));
  cpu.y = 3;
  nz(cpu.a);
}

/** The helpers by address. */
export const HELPERS: Record<number, Handler> = Object.fromEntries(
  Object.entries(table).map(([a, f]) => [
    a,
    (os: Fulu) => {
      use(os);
      return f() === "jump" ? "jump" : undefined;
    },
  ]),
);
