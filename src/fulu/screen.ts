// The OS's screen functions. Programs mostly draw into buffers of the
// screen's shape: 96 rows of 20 bytes, one bit a pixel, the most significant
// bit leftmost.

import { adc, clc, cmp, cpu, farCalled, fn, get16, ram, rd, set16, word, wr } from "./alu";
import type { OsFunction } from "./fulu";

const STRIDE = 20;
export const WIDTH = 160, HEIGHT = 96;

/** $EAEC, the OS's 8 × 8-bit multiply (at 5:$7BD2), which some screen functions far-call. */
const MULTIPLY = 0x7bd2;

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
 * octants, a midpoint error term of 16 bits, each point mapped back and set.
 */
function line(x0: number, y0: number, x1: number, y1: number): void {
  if (x0 >= x1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  plot(x0, y0, true);
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
    if (octant === 1) plot(x, y, true);
    else if (octant === 2) plot((x0 + across) & 0xff, (y0 + along) & 0xff, true);
    else if (octant === 3) plot((x0 + across) & 0xff, (y0 - along) & 0xff, true);
    else plot(x, (y0 - across) & 0xff, true);
  }
  cpu.x = cpu.y = 0;
  cmp((cpu.a = x), x1);
  cpu.p &= ~0x40;
}

/** The OS variables the line functions use as temporaries. */
const LINE: [number, number][] = [[0x38, 0x3c], [0x2080, 0x208a], [0x20b7, 0x20ba], [0x20cf, 0x20ef]];

/** The OS variables the rectangle functions use as temporaries. */
const RECTANGLE: [number, number][] = [[0x38, 0x3c], [0x2081, 0x208a], [0x20b7, 0x20b8], [0x20cf, 0x20d1], [0x20d8, 0x20eb]];

export const SCREEN: Record<number, OsFunction> = {
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
  // $E794 SysLine(x0 in A, y0, x1, y1): a line, unclipped
  0xe794: fn(0x8309, () => {
    const sp = word(0x28);
    line(cpu.a, rd(sp), rd(sp + 1), rd(sp + 2));
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
