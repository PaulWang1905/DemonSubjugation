// The OS's screen functions. Programs mostly draw into buffers of the
// screen's shape: 96 rows of 20 bytes, one bit a pixel, the most significant
// bit leftmost.

import { adc, asl, carry, clc, cmp, cpu, farCalled, fn, get16, nz, ram, rd, rol, sbc, sec, set16, word, wr } from "./alu";
import type { OsFunction } from "./fulu";

const STRIDE = 20;
export const WIDTH = 160, HEIGHT = 96;

/** $EAEC, the OS's 8 × 8-bit multiply (at 5:$7BD2), which some screen functions far-call. */
const MULTIPLY = 0x7bd2;

/** The OS's 8 × 8-bit multiply (5:$7BD2): $2085:$2089 = $2085 × $2087, with its flags. */
function multiply(): void {
  ram[0x2089] = 0;
  for (let y = 8; y; y--) {
    ram[0x2089] = asl(ram[0x2089]);
    ram[0x2085] = rol(ram[0x2085]);
    if (carry()) {
      clc();
      ram[0x2089] = adc(ram[0x2087], ram[0x2089]);
      if (carry()) ram[0x2085] = nz((ram[0x2085] + 1) & 0xff);
    }
    cpu.y = nz(y - 1);
  }
}

/**
 * The address of display byte b (pixels 8b to 8b + 7) of display row y, as
 * the OS computes it: the LCD controller's rows are out of order and byte 0
 * of a row sits in the neighbouring RAM row (src/bbk/lcd.ts). The boot page
 * at $03F8-$03FC redirects one address (RAM row 0's first byte, to $1000).
 */
export function lcd(b: number, y: number): number {
  if (b === 0) return y <= 64 ? 0x413 + (64 - y) * 32 : y === 65 ? 0xff3 : 0x413 + (y - 1) * 32;
  const a = 0x400 + (y <= 65 ? 65 - y : y) * 32 + b - 1;
  return ram[0x3f8] === 1 && a === word(0x3f9) ? word(0x3fb) : a;
}

/**
 * The rectangle of a drawing function: x1 in A and y1, x2, y2 on the software
 * stack, sorted. Null when the second x or y is off the screen, leaving A and
 * Y and the flags as the OS does when it gives up.
 */
function rectangle(sp: number): [number, number, number, number] | null {
  const arg = (i: number) => rd(sp + i);
  let x1 = cpu.a, x2 = arg(1);
  const y1 = arg(0);
  cpu.y = 1;
  cmp((cpu.a = x2), WIDTH);
  if (x2 >= WIDTH) return null;
  if (x2 < x1) [x1, x2] = [x2, x1];
  let y2 = arg(2), y = y1;
  cpu.y = 2;
  cmp((cpu.a = y2), HEIGHT);
  if (y2 >= HEIGHT) return null;
  if (y2 < y) [y, y2] = [y2, y];
  return [x1, y, x2, y2];
}

/**
 * One row of a packed bitmap at src into the bytes at(0..n-1) that pixels
 * x1..x2 span, keeping the pixels outside them (except that a single byte
 * takes the bitmap's padding bits too, as the OS does). Returns the bytes of
 * the row read: ⌈(x2 - x1 + 1) / 8⌉.
 */
function bitmapRow(src: number, x1: number, x2: number, at: (j: number) => number): number {
  const s = x1 & 7, e = x2 & 7, n = (x2 >> 3) - (x1 >> 3) + 1;
  const left = (0xff00 >> s) & 0xff, right = (1 << (7 - e)) - 1;
  const b = (k: number) => rd(src + k), pair = (k: number) => (b(k) << 8) | b(k + 1);
  if (n === 1) {
    wr(at(0), (rd(at(0)) & (left | right)) | (b(0) >> s));
    return 1;
  }
  wr(at(0), (rd(at(0)) & left) | (b(0) >> s));
  for (let j = 1; j < n - 1; j++) wr(at(j), (pair(j - 1) >> s) & 0xff);
  const last = (e >= s ? pair(n - 2) : b(n - 2) << 8) >> s;
  wr(at(n - 1), (rd(at(n - 1)) & right) | (last & ~right & 0xff));
  return e >= s ? n : n - 1;
}

/**
 * Change the pixels of the rectangle in A and on the software stack:
 * op(byte, the byte's pixels inside). Like SysPicture's code they are made
 * from, the OS's versions count $2F/$30 up once a row.
 */
function paint(op: (v: number, inside: number) => number): void {
  const r = rectangle(word(0x28));
  if (!r) return;
  const [x1, y1, x2, y2] = r, first = x1 >> 3, last = x2 >> 3;
  for (let y = y1; y <= y2; y++) {
    for (let b = first; b <= last; b++) {
      const inside = (b === first ? 0xff >> (x1 & 7) : 0xff) & (b === last ? (0xff00 >> ((x2 & 7) + 1)) & 0xff : 0xff);
      const a = lcd(b, y);
      wr(a, op(rd(a), inside));
    }
  }
  set16(0x2f, word(0x2f) + y2 - y1 + 1);
  cpu.a = cpu.x = cpu.y = 0;
  cmp(0, 0);
}

/** Set (or with `on` false, clear) one pixel of the screen. */
function plot(x: number, y: number, on: boolean): void {
  const a = lcd(x >> 3, y), bit = 0x80 >> (x & 7);
  wr(a, on ? rd(a) | bit : rd(a) & ~bit);
}

/**
 * The OS's line from (x0, y0) to (x1, y1), coordinates of 8 bits: endpoints
 * ordered by x (swapped when x0 ≥ x1), the line folded into one of four
 * octants, a midpoint error term of 16 bits, each point mapped back and set
 * (or, with `on` false, cleared: the colour the OS keeps at $2080).
 */
function line(x0: number, y0: number, x1: number, y1: number, on = true): void {
  if (x0 >= x1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  plot(x0, y0, on);
  const dx = (x1 - x0) & 0xff;
  let dy = (y1 - y0) & 0xff, octant: number;
  if (!(dy & 0x80)) octant = dx >= dy ? 1 : 2;
  else {
    dy = -dy & 0xff;
    octant = dx >= dy ? 4 : 3;
  }
  // the end point in the octant's frame
  if (octant === 2 || octant === 3) {
    x1 = (x0 + dy) & 0xff;
    y1 = (y0 + dx) & 0xff;
  } else if (octant === 4) y1 = (y0 + dy) & 0xff;
  const minus = (a: number, b: number) => (a - b) & 0xffff; // a 16-bit difference of two bytes
  const ey = minus(y0, y1), ex = minus(x1, x0);
  let d = (2 * ey + ex) & 0xffff;
  const flat = (2 * ey) & 0xffff, diagonal = (2 * ex + 2 * ey) & 0xffff;
  let x = x0, y = y0;
  while (x < x1) {
    x = (x + 1) & 0xff;
    if (d & 0x8000) {
      y = (y + 1) & 0xff;
      d = (d + diagonal) & 0xffff;
    } else d = (d + flat) & 0xffff;
    const along = (x - x0) & 0xff, across = (y - y0) & 0xff;
    if (octant === 1) plot(x, y, on);
    else if (octant === 2) plot((x0 + across) & 0xff, (y0 + along) & 0xff, on);
    else if (octant === 3) plot((x0 + across) & 0xff, (y0 - along) & 0xff, on);
    else plot(x, (y0 - across) & 0xff, on);
  }
  cpu.x = cpu.y = 0;
  cmp((cpu.a = x), x1);
  cpu.p &= ~0x40;
}

/**
 * 5:$8714: the addresses of the byte holding pixel (x = $2081, y = $2082),
 * as the OS computes them with the same arithmetic (so its flags): byte 0 of
 * the row at $38/$39 (for x < 8), the row's byte x / 8 at $3A/$3B.
 */
function pixelAddress(): void {
  const x = ram[0x2081], y = ram[0x2082];
  cmp((cpu.a = y), 0x41);
  if (y === 0x41) {
    ram[0x38] = 0xf3;
    ram[0x39] = 0x0f;
    ram[0x3a] = 0x00;
    ram[0x3b] = nz(0x04);
  } else {
    if (y > 0x41) {
      sec();
      ram[0x2085] = sbc(y, 0x42);
      ram[0x2087] = 0x20;
      multiply();
      clc();
      ram[0x3a] = adc(0x40, ram[0x2089]);
      ram[0x3b] = adc(0x0c, ram[0x2085]);
    } else {
      ram[0x2085] = y;
      ram[0x2087] = 0x20;
      multiply();
      sec();
      ram[0x3a] = sbc(0x20, ram[0x2089]);
      ram[0x3b] = sbc(0x0c, ram[0x2085]);
    }
    sec();
    ram[0x38] = sbc(ram[0x3a], 0x0d);
    ram[0x39] = sbc(ram[0x3b], 0);
  }
  cmp((cpu.a = x), 8);
  if (x < 8) return;
  sec();
  ram[0x20b7] = sbc(x, 8);
  for (;;) {
    sec();
    const a = (cpu.a = sbc(ram[0x20b7], 8));
    if (!carry()) return;
    ram[0x20b7] = a;
    clc();
    ram[0x3a] = adc(1, ram[0x3a]);
    ram[0x3b] = adc(0, ram[0x3b]);
  }
}

/** The OS variables the line functions use as temporaries. */
const LINE: [number, number][] = [[0x38, 0x3c], [0x2080, 0x208a], [0x20b7, 0x20ba], [0x20cf, 0x20ef]];

/** The OS variables the rectangle functions use as temporaries. */
const RECTANGLE: [number, number][] = [[0x38, 0x3c], [0x2081, 0x208a], [0x20b7, 0x20b8], [0x20cf, 0x20d1], [0x20d8, 0x20eb]];

/** What the circle functions use: the plot's ($2080 the colour, $2081/$2082 the point, $EAE6's), their centre, radius, point and error term. */
const CIRCLE: [number, number][] = [[0x38, 0x3c], [0x2080, 0x208a], [0x20b7, 0x20ba], [0x20cf, 0x20d8]];

/**
 * $E788 (x in A, y, r) and $E8BC: a circle, drawn ($E788) or cleared
 * ($E8BC), by the midpoint method (5:$7C1C): nothing unless it fits on the
 * screen (x + r and y + r without a carry and below 159 and 96, x - r and
 * y - r without a borrow), A = 0; else its four extreme points, then eight
 * points a step until x - cx passes y - cy, with the error term d = 1 - r
 * going up by 2(x - cx) + 3 (4 when it turns non-negative: the OS adds the 3
 * with the carry of the 16-bit sum before), or 2(x - cx) - 2(y - cy) + 5 as y
 * steps in. A = 1.
 */
function circle(on: boolean, filled = false): void {
  const sp = word(0x28), cx = cpu.a, cy = rd(sp), r = rd(sp + 1);
  cpu.y = 1;
  const fail = () => void ((cpu.a = 0), nz(0));
  clc();
  let v = adc(cx, r);
  if (carry() || (cmp(v, 0x9f), v >= 0x9f)) return fail();
  sec();
  sbc(cx, r);
  if (!carry()) return fail();
  clc();
  v = adc(cy, r);
  if (carry() || (cmp(v, 0x60), v >= 0x60)) return fail();
  sec();
  sbc(cy, r);
  if (!carry()) return fail();
  plot(cx, cy + r, on);
  plot(cx, cy - r, on);
  // a disc's rows: from x1 to x2 on row y, set (7:$7E5A)
  const span = (x1: number, x2: number, row: number) => {
    for (let px = Math.min(x1, x2); px <= Math.max(x1, x2); px++) plot(px, row, true);
  };
  if (filled) span(cx - r, cx + r, cy);
  else {
    plot(cx + r, cy, on);
    plot(cx - r, cy, on);
  }
  let d = 1 - r, x = cx, y = cy + r;
  for (;;) {
    const dx = x - cx, dy = y - cy;
    if (dx >= dy) break;
    if (d < 0) {
      // (5:$7D12 adds the 3 without clearing C: the second +dx's carry out of the high byte, as d turns non-negative, adds 1)
      const d1 = (d + dx) & 0xffff, carried = d1 + dx > 0xffff ? 1 : 0;
      d = (((d1 + dx + 3 + carried) & 0xffff) << 16) >> 16;
    } else {
      d += 2 * dx + 5 - 2 * dy;
      y--;
    }
    x++;
    const a = x - cx, b = y - cy;
    if (filled) {
      span(cx - a, cx + a, cy + b);
      span(cx - a, cx + a, cy - b);
      span(cx - b, cx + b, cy + a);
      span(cx - b, cx + b, cy - a);
    } else for (const [px, py] of [[cx + a, cy + b], [cx - a, cy + b], [cx + a, cy - b], [cx - a, cy - b], [cx + b, cy + a], [cx + b, cy - a], [cx - b, cy + a], [cx - b, cy - a]]) plot(px, py, on);
  }
  // the last comparison (C set), A = 1; the plot leaves X and Y 0 (a disc's span: Y as it leaves it, not compared)
  cpu.x = cpu.y = 0;
  cmp(1, 0);
  cpu.a = nz(1);
  cpu.p &= ~0x40;
}

/** Where $E8C5 keeps its work: its arguments and counters, the row pointers, $EAE6's and $EAE9's. */
const WINDOW_TEMPORARIES: [number, number][] = [[0x38, 0x3c], [0x2081, 0x208c], [0x20b7, 0x20b8], [0x20cf, 0x20ef]];

/**
 * $E8C5 (x in A, y, sx, sy, w, h, bitmap): the w × h window at (sx, sy) of a
 * bitmap {width, height, then rows of ⌈width / 8⌉ bytes} onto the screen at
 * (x, y), replacing what is there. Nothing if the window leaves the bitmap or
 * the screen (checked in that order, each as the OS's 8-bit sum: A is the sum
 * that failed). $2F/$30 is left at the bitmap's data row after the window.
 * The OS draws a byte at a time, shifting by the two offsets' difference, row
 * by row through $EAE6 (5:$8714, the first row's address) and $EAE9 (5:$65FB,
 * the next row's); Y, C and V are left from those, which compiled C never
 * reads after a call, so Fulu leaves them as they are (ownState).
 */
function bitmapWindow(): void {
  const sp = word(0x28), x = cpu.a, y = rd(sp), sx = rd(sp + 1), sy = rd(sp + 2), w = rd(sp + 3), h = rd(sp + 4), bitmap = get16(sp + 5);
  set16(0x2f, bitmap);
  const width = rd(bitmap), height = rd(bitmap + 1);
  const checks: [number, number][] = [
    [(sx + w - 1) & 0xff, width],
    [(sy + h - 1) & 0xff, height],
    [(x + w - 1) & 0xff, WIDTH],
    [(y + h - 1) & 0xff, HEIGHT],
  ];
  for (const [v, limit] of checks) {
    if (cmp((cpu.a = v), limit), v >= limit) return;
  }
  const stride = ((width - 1) >> 3) + 1, x2 = (x + w - 1) & 0xff;
  let row = (bitmap + 2 + stride * sy + (sx >> 3)) & 0xffff;
  // its last byte column left of its first (0 wide at a byte's start, or x + w wrapped past 255):
  // the OS gives up after setting up the source and the first row's address ($EAE6), A the difference
  if (x2 >> 3 < x >> 3) {
    set16(0x2f, row);
    farCalled(0x8714);
    sec();
    cpu.a = sbc(x2 >> 3, x >> 3);
    return;
  }
  if (!w) {
    // 0 wide within a byte: every pixel of the byte is kept, and the OS goes through its rows (256 if 0 high) changing
    // nothing, stepping the source a row by its own 8-bit step $20DE (one more than the stride when sx is a byte's start)
    const step = (((width - 1) >> 3) - (((sx + w - 1) & 0xff) >> 3) + (sx >> 3) + 1) & 0xff;
    set16(0x2f, (row + step * (h || 0x100)) & 0xffff);
    farCalled(0x65fb);
    cpu.a = 0;
    return void cmp(0, 0);
  }
  // (0 high, or other sums that wrapped past 255 and so passed: the OS then draws past the screen, into its own variables; not done)
  if (!h || sx + w > 0x100 || sy + h > 0x100 || x + w > 0x100 || y + h > 0x100) return;
  for (let r = 0; r < h; r++, row = (row + stride) & 0xffff) {
    for (let c = 0; c < w; c++) {
      const i = (sx & 7) + c;
      plot(x + c, y + r, ((rd(row + (i >> 3)) << (i & 7)) & 0x80) !== 0);
    }
  }
  set16(0x2f, row);
  farCalled(0x65fb); // (the last far call: $EAE9, after the last row)
  cpu.a = 0;
  cmp(0, 0);
}

/** $zp16 += k or -= k (CLC / LDA / ADC / STA, twice; SEC / SBC). */
function step16(zp: number, k: number): void {
  if (k >= 0) {
    clc();
    ram[zp] = adc(ram[zp], k);
    ram[zp + 1] = cpu.a = adc(ram[zp + 1], 0);
  } else {
    sec();
    ram[zp] = sbc(ram[zp], -k);
    ram[zp + 1] = cpu.a = sbc(ram[zp + 1], 0);
  }
}

/**
 * 5:$65FB: the next row's addresses in $3A (and $38, 13 bytes before it),
 * from row $2082: up $20 above row $40 (row $40: $38 = $0FF3), down $20
 * below row $41, and row $41's own ($0C40, $0C33), moved right by x ($2081).
 */
function nextRow(): void {
  const y = (cpu.a = ram[0x2082]);
  cmp(y, 0x40);
  if (y < 0x40) {
    step16(0x3a, -0x20);
    step16(0x38, -0x20);
  } else if (y === 0x40) {
    step16(0x3a, -0x20);
    ram[0x38] = 0xf3;
    ram[0x39] = cpu.a = nz(0x0f);
  } else if (y === 0x41) {
    cmp(y, 0x41);
    ram[0x38] = 0x33;
    ram[0x39] = 0x0c;
    ram[0x3a] = 0x40;
    ram[0x3b] = cpu.a = nz(0x0c);
    cmp((cpu.a = ram[0x2081]), 8);
    if (!carry()) return;
    sec();
    ram[0x20b7] = sbc(ram[0x2081], 8);
    for (;;) {
      sec();
      cpu.a = sbc(ram[0x20b7], 8);
      if (!carry()) return;
      ram[0x20b7] = cpu.a;
      clc();
      ram[0x3a] = adc(1, ram[0x3a]);
      ram[0x3b] = cpu.a = adc(0, ram[0x3b]);
    }
  } else {
    cmp(y, 0x41);
    step16(0x3a, 0x20);
    step16(0x38, 0x20);
  }
}

/** A byte to ($3A), or where $03F9-$03FC redirect it (as lcd() reads them). */
function toRow(v: number): void {
  if (rd(0x3f8) === 1 && ram[0x3b] === rd(0x3fa) && ram[0x3a] === rd(0x3f9)) {
    ram[0x3a] = rd(0x3fb);
    ram[0x3b] = rd(0x3fc);
    cpu.y = 0;
    wr(word(0x3a), (cpu.a = v));
    ram[0x3a] = rd(0x3f9);
    ram[0x3b] = rd(0x3fa);
  } else {
    cpu.y = 0;
    wr(word(0x3a), (cpu.a = v));
  }
}

/**
 * $E791 (p): a whole screen from p, 96 rows of 20 bytes: each row's first
 * byte to ($38) (13 bytes before the row), the next 18 to the row, the last
 * into the row's 19th byte keeping its bit 0. $2F/$30 ends after the
 * picture, $2082 at 96. (5:$66B2, its rows by $8714 and $65FB as $E8C5's.)
 */
function wholeScreen(): void {
  cpu.y = 0;
  ram[0x2f] = cpu.a = rd(word(0x28));
  cpu.y = 1;
  ram[0x30] = cpu.a = rd(word(0x28) + 1);
  ram[0x20d8] = 0x13;
  ram[0x20da] = 0x60;
  ram[0x2081] = ram[0x2082] = cpu.a = 0;
  pixelAddress();
  ram[0x20e9] = ram[0x3a];
  ram[0x20ea] = cpu.a = ram[0x3b];
  for (;;) {
    cpu.y = 0;
    wr(word(0x38), (cpu.a = rd(word(0x2f))));
    ram[0x20d8] = (ram[0x20d8] - 1) & 0xff;
    step16(0x2f, 1);
    do {
      cpu.y = 0;
      toRow(rd(word(0x2f)));
      step16(0x3a, 1);
      step16(0x2f, 1);
      ram[0x20d8] = nz((ram[0x20d8] - 1) & 0xff);
      cmp((cpu.a = ram[0x20d8]), 0);
    } while (ram[0x20d8]);
    // the row's last byte, its bit 0 kept (through $20D8, pushed and pulled)
    const kept = ram[0x20d8];
    cpu.y = 0;
    ram[0x20d8] = cpu.a = nz(rd(word(0x3a)) & 0x01);
    cpu.a = nz((rd(word(0x2f)) & 0xfe) | ram[0x20d8]);
    wr(word(0x3a), cpu.a);
    ram[0x20d8] = cpu.a = nz(kept);
    ram[0x3a] = ram[0x20e9];
    ram[0x3b] = cpu.a = ram[0x20ea];
    nextRow();
    ram[0x2082] = nz((ram[0x2082] + 1) & 0xff);
    ram[0x20e9] = ram[0x3a];
    ram[0x20ea] = cpu.a = ram[0x3b];
    step16(0x2f, 1);
    ram[0x20d8] = cpu.a = 0x13;
    ram[0x20da] = nz((ram[0x20da] - 1) & 0xff);
    cmp((cpu.a = ram[0x20da]), 0);
    if (!ram[0x20da]) return;
  }
}

export const SCREEN: Record<number, OsFunction> = {
  0xe791: fn(0x66b2, wholeScreen),
  0xe8c5: { ...fn(0x5000, bitmapWindow, WINDOW_TEMPORARIES), ownState: { registers: ["y", "p"] } },
  0xe788: fn(0x7c17, () => circle(true), CIRCLE),
  0xe8bc: fn(0x7c0f, () => circle(false), CIRCLE),
  // $E78B (x in A, y, r): a disc: the circle's steps (5:$8102), filling its rows
  0xe78b: { ...fn(0x8102, () => circle(true, true), [...CIRCLE, [0x20d8, 0x20d9], [0x20e3, 0x20f0]]), ownState: { registers: ["y"] } },
  /**
   * $E7F7 (clear the whole screen buffer): $0400-$0FF3 to 0, counting $20E5/$20E6
   * down from $0BF4 with the pointer at $3A/$3B, then the byte the boot page
   * points at ($03FB, the screen's first byte where it is redirected) to 0.
   */
  0xe7f7: fn(0x5762, () => {
    for (let a = 0x400; a < 0x400 + 0xbf4; a++) wr(a, 0);
    ram[0x20e5] = ram[0x20e6] = 0;
    const to = word(0x3fb);
    set16(0x3a, to);
    wr(to, 0);
    cpu.a = cpu.y = 0;
    cmp(0, 0); // N, Z and C as its last comparison of the count (and LDA #0) leave them
    cpu.p &= ~0x40; // V of the count's last subtraction
  }),
  // $E877 SysSaveScreen(x1 in A, y1, x2, y2, buffer): copy the screen's bytes under a rectangle, row by row, to a buffer
  0xe877: fn(0x77cd, () => {
    const sp = word(0x28), r = rectangle(sp);
    if (!r) return;
    const [x1, y1, x2, y2] = r, first = x1 >> 3, last = x2 >> 3;
    let dst = get16(sp + 3);
    for (let y = y1; y <= y2; y++) for (let b = first; b <= last; b++, dst = (dst + 1) & 0xffff) wr(dst, rd(lcd(b, y)));
    set16(0x2f, dst);
    cpu.a = cpu.x = cpu.y = 0;
    cmp(0, 0);
  }, RECTANGLE),
  // $E87A SysRestoreScreen(x1 in A, y1, x2, y2, buffer): put back what SysSaveScreen saved
  0xe87a: fn(0x6cea, () => {
    const sp = word(0x28), r = rectangle(sp);
    if (!r) return;
    const [x1, y1, x2, y2] = r, first = x1 >> 3, last = x2 >> 3;
    let src = get16(sp + 3);
    for (let y = y1; y <= y2; y++) for (let b = first; b <= last; b++, src = (src + 1) & 0xffff) wr(lcd(b, y), rd(src));
    set16(0x2f, src);
    cpu.a = cpu.x = cpu.y = 0;
    cmp(0, 0);
  }, RECTANGLE),
  // $E87D SysFillRect(x1 in A, y1, x2, y2): fill a rectangle of the screen; nothing unless x1 ≤ x2 < 160 and y1 ≤ y2 < 96
  0xe87d: fn(0x86a9, () => {
    const sp = word(0x28), x1 = cpu.a, y1 = rd(sp), x2 = rd(sp + 1), y2 = rd(sp + 2);
    cpu.y = 1;
    cmp((cpu.a = x2), WIDTH);
    if (x2 >= WIDTH || (cmp(x2, x1), x2 < x1)) return;
    cpu.y = 2;
    cmp((cpu.a = y2), HEIGHT);
    if (y2 >= HEIGHT || (cmp(y2, y1), y2 < y1)) return;
    // row by row with the OS's horizontal line (5:$7E5A), which leaves A the last byte it wrote
    let last = 0;
    for (let y = y1; y <= y2; y++) {
      for (let b = x1 >> 3; b <= x2 >> 3; b++) {
        const inside = (b === x1 >> 3 ? 0xff >> (x1 & 7) : 0xff) & (b === x2 >> 3 ? (0xff00 >> ((x2 & 7) + 1)) & 0xff : 0xff);
        const a = lcd(b, y);
        wr(a, (last = rd(a) | inside));
      }
    }
    cpu.y = 0;
    cpu.a = nz(last);
    cpu.p = (cpu.p | 0x01) & ~0x40;
  }, LINE),
  /**
   * $E874(x1 in A, y1, x2, y2, &n): n = the size of SysSaveScreen's buffer
   * for the rectangle, its byte columns × its rows (0 if it is off the screen).
   */
  0xe874: fn(0x7ac4, () => {
    const sp = word(0x28), r = rectangle(sp), out = get16(sp + 3);
    if (!r) {
      // (through $2F/$30 before it is set to the argument)
      wr(word(0x2f), (cpu.a = 0));
      cpu.y = 1;
      wr(word(0x2f) + 1, 0);
      return void nz(1);
    }
    const [x1, y1, x2, y2] = r;
    set16(0x2f, out);
    ram[0x2085] = (x2 >> 3) - (x1 >> 3) + 1;
    ram[0x2087] = (y2 - y1 + 1) & 0xff;
    multiply();
    wr(out, ram[0x2089]);
    cpu.a = ram[0x2085];
    cpu.y = 1;
    nz(1);
    wr(out + 1, cpu.a);
  }, RECTANGLE),
  // $E794 SysLine(x0 in A, y0, x1, y1): a line, unclipped
  0xe794: fn(0x8309, () => {
    const sp = word(0x28);
    line(cpu.a, rd(sp), rd(sp + 1), rd(sp + 2));
  }, LINE),
  // $E8B9 (x0 in A, y0, x1, y1): SysLine's line cleared (5:$8301: the same code with $2080 = 0)
  0xe8b9: fn(0x8301, () => {
    const sp = word(0x28);
    line(cpu.a, rd(sp), rd(sp + 1), rd(sp + 2), false);
  }, LINE),
  // $E797 SysRect(x1 in A, y1, x2, y2): a rectangle's outline; nothing unless x1 ≤ x2 < 160 and y1 ≤ y2 < 96
  0xe797: fn(0x860b, () => {
    const sp = word(0x28), x1 = cpu.a, y1 = rd(sp), x2 = rd(sp + 1);
    cpu.y = 1;
    cmp((cpu.a = x2), WIDTH);
    if (x2 >= WIDTH || (cmp(x2, x1), x2 < x1)) return;
    const y2 = rd(sp + 2);
    cpu.y = 2;
    cmp((cpu.a = y2), HEIGHT);
    if (y2 >= HEIGHT || (cmp(y2, y1), y2 < y1)) return;
    line(x1, y2, x2, y2);
    line(x1, y1, x1, y2);
    line(x1, y1, x2, y1);
    line(x2, y1, x2, y2);
  }, LINE),
  // $E8BF (clear a rectangle's outline)(x1 in A, y1, x2, y2): SysRect drawn with colour 0 (the OS's 5:$8603: the same code with $2080 = 0)
  0xe8bf: fn(0x8603, () => {
    const sp = word(0x28), x1 = cpu.a, y1 = rd(sp), x2 = rd(sp + 1);
    cpu.y = 1;
    cmp((cpu.a = x2), WIDTH);
    if (x2 >= WIDTH || (cmp(x2, x1), x2 < x1)) return;
    const y2 = rd(sp + 2);
    cpu.y = 2;
    cmp((cpu.a = y2), HEIGHT);
    if (y2 >= HEIGHT || (cmp(y2, y1), y2 < y1)) return;
    line(x1, y2, x2, y2, false);
    line(x1, y1, x1, y2, false);
    line(x1, y1, x2, y1, false);
    line(x2, y1, x2, y2, false);
  }, LINE),
  /**
   * $E7FA (a pixel)(x in A, y, colour): set the pixel (colour not 0) or clear
   * it, unclipped, through the OS's address arithmetic (5:$852A, 5:$8714),
   * with the boot page's redirect of one byte ($03F8-$03FC).
   */
  0xe7fa: fn(0x852a, () => {
    const sp = word(0x28);
    ram[0x2081] = cpu.a;
    ram[0x2082] = rd(sp);
    const colour = (ram[0x2080] = rd(sp + 1));
    pixelAddress();
    const x = ram[0x2081];
    ram[0x20b8] = 0x80 >> (x & 7);
    ram[0x20b9] = nz(ram[0x20b8] ^ 0xff);
    cpu.x = 0;
    cmp(x, 8);
    const put = (at: number) => {
      cmp(colour, 0);
      const v = rd(at) & ram[0x20b9];
      wr(at, (cpu.a = nz(colour ? v | ram[0x20b8] : v)));
    };
    cpu.y = 0;
    if (x < 8) return put(word(0x38));
    cmp(ram[0x3f8], 1);
    if (ram[0x3f8] === 1 && ram[0x3b] === ram[0x3fa] && ram[0x3a] === ram[0x3f9]) {
      ram[0x3a] = ram[0x3fb];
      ram[0x3b] = ram[0x3fc];
      put(word(0x3a));
      ram[0x3a] = ram[0x3f9];
      ram[0x3b] = (cpu.a = nz(ram[0x3fa]));
      return;
    }
    put(word(0x3a));
  }, LINE),
  // $E85D SysLcdPartClear(x1 in A, y1, x2, y2): clear a rectangle of the screen
  0xe85d: fn(0x6fde, () => paint((v, inside) => v & ~inside), RECTANGLE),
  // $E860 SysLcdReverse(x1 in A, y1, x2, y2): invert a rectangle of the screen
  0xe860: fn(0x7336, () => paint((v, inside) => v ^ inside), RECTANGLE),

  /**
   * $E78E SysPicture(x1 in A, y1, x2, y2, bitmap, mode): draw a packed bitmap
   * on the screen in the rectangle x1..x2 × y1..y2. Mode 1 copies whole bytes
   * (the rectangle taken to its byte columns, rows of that many bytes).
   */
  0xe78e: fn(
    0x67e2,
    () => {
      const sp = word(0x28), r = rectangle(sp);
      if (!r) return;
      const [x1, y1, x2, y2] = r;
      let src = get16(sp + 3);
      const first = x1 >> 3, n = (x2 >> 3) - first + 1;
      for (let y = y1; y <= y2; y++) {
        if (rd(sp + 5) === 1) {
          for (let j = 0; j < n; j++) wr(lcd(first + j, y), rd(src + j));
          src = (src + n) & 0xffff;
        } else src = (src + bitmapRow(src, x1, x2, (j) => lcd(first + j, y))) & 0xffff;
      }
      set16(0x2f, src);
      cpu.a = cpu.x = cpu.y = 0;
      cmp(0, 0);
    },
    [[0x38, 0x3c], [0x2081, 0x208a], [0x20b7, 0x20b8], [0x20cf, 0x20d1], [0x20d8, 0x20eb]],
  ),

  /**
   * $E889 SysPictureDummy(x1 in A, y1, x2, y2, bitmap, buffer): the same into
   * a screen-shaped buffer instead of the screen.
   */
  0xe889: fn(
    0x5b18,
    () => {
      const sp = word(0x28), r = rectangle(sp);
      if (!r) return;
      const [x1, y1, x2, y2] = r;
      const n = (x2 >> 3) - (x1 >> 3) + 1;
      let src = get16(sp + 3), dst = (get16(sp + 5) + y1 * STRIDE + (x1 >> 3)) & 0xffff;
      for (let rows = (y2 - y1 + 1) & 0xff; rows; rows--) {
        const row = dst;
        src = (src + bitmapRow(src, x1, x2, (j) => row + j)) & 0xffff;
        // to the next row: 20 - (n - 1) bytes on, as 19 - (x2 >> 3) + (x1 >> 3) + 1 in bytes,
        // whose last add takes the carry of the one before (one more when x2 is off the screen)
        const end = (dst + n - 1) & 0xffff;
        clc();
        const step = adc(adc((19 - (x2 >> 3)) & 0xff, x1 >> 3), 1);
        clc();
        dst = adc(step, end & 0xff) | (adc(0, end >> 8) << 8);
      }
      set16(0x2f, src);
      set16(0x31, dst);
      farCalled(MULTIPLY);
      cpu.a = cpu.x = cpu.y = 0;
      cmp(0, 0);
    },
    [[0x2081, 0x208a], [0x20cf, 0x20d1], [0x20d8, 0x20e9]],
  ),
};
