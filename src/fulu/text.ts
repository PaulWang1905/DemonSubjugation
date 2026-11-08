// The OS's text functions. Glyphs are read from the font ROM (physical
// $800000; its bank is the boot page's $03E7) through the data port DATA4
// ($03), whose address ADDR4 ($0211-$0213) steps on each read, just as the
// OS reads them. Fulu's own machine has a font ROM made from the site's
// fonts; checked against the firmware, it reads the real one.

import { adc, clc, cmp, cpu, farCalled, fn, ram, rd, set16, word, wr } from "./alu";
import type { OsFunction } from "./fulu";
import { lcd } from "./screen";

const DATA4 = 0x03, ADDR4 = 0x211;
/** The 8 × 16 ASCII glyphs in the font ROM: 16 bytes each, a row a byte. */
const ASCII = 0x08b363;
/** Where the OS reads a glyph to. */
const GLYPH = 0x208d;
/** $E749, which copies $208C bytes from DATA4 to ($2F) (at 7:$7565). */
const COPY = 0x7565;

/** Read n bytes of the font ROM at offset `at` into the glyph buffer. */
function readGlyph(at: number, n: number): void {
  const p = (at + (ram[0x3e7] << 16)) & 0xffffff;
  wr(ADDR4, p & 0xff);
  wr(ADDR4 + 1, (p >> 8) & 0xff);
  wr(ADDR4 + 2, p >> 16);
  for (let i = 0; i < n; i++) wr(GLYPH + i, rd(DATA4));
  farCalled(COPY);
}

/** As the OS's row step after a glyph's last row (y + 15) leaves A: the high byte of its pointer to the next row's byte 0. */
function rowStepA(x: number, y: number): number {
  const end = y + 15;
  return end === 0x41 ? (x < 8 ? x : ((x & 7) - 8) & 0xff) : lcd(0, end + 1) >> 8;
}

/**
 * Draw an 8 × 16 glyph (row k's byte at GLYPH + step·k) with its top left at
 * (x, y), replacing the pixels under it; at x = 152 its last column is
 * dropped, to keep the status icons.
 */
function narrow(x: number, y: number, step: number): void {
  const b = x >> 3, s = x & 7, keepLeft = (0xff00 >> s) & 0xff, keepRight = 0xff >> s;
  for (let k = 0; k < 16; k++) {
    const g = ram[GLYPH + step * k], left = lcd(b, y + k);
    if (x === 152) wr(left, (rd(left) & 1) | (g & 0xfe));
    else {
      const right = lcd(b + 1, y + k);
      wr(left, (rd(left) & keepLeft) | (g >> s));
      wr(right, (rd(right) & keepRight) | ((g << (8 - s)) & 0xff));
    }
  }
  cpu.a = rowStepA(x, y);
  cpu.x = 16 * step;
  cpu.y = x >= 8 && x !== 152 ? 1 : 0;
  cmp(cpu.x, cpu.x);
  cpu.p &= ~0x40;
}

/** Draw a 16 × 16 glyph (32 bytes at GLYPH) at (x, y), replacing the pixels under it; at x = 144, keeping the icons' column. */
function wide(x: number, y: number): void {
  const b = x >> 3, s = x & 7, keepLeft = (0xff00 >> s) & 0xff, keepRight = 0xff >> s;
  for (let k = 0; k < 16; k++) {
    const g = (ram[GLYPH + 2 * k] << 16) | (ram[GLYPH + 2 * k + 1] << 8), bits = g >> s;
    const at = (j: number) => lcd(b + j, y + k);
    wr(at(0), (rd(at(0)) & keepLeft) | (bits >> 16));
    if (x === 144) wr(at(1), (rd(at(1)) & 1) | ((bits >> 8) & 0xfe));
    else {
      wr(at(1), (bits >> 8) & 0xff);
      wr(at(2), (rd(at(2)) & keepRight) | (bits & 0xff));
    }
  }
  cpu.a = rowStepA(x, y);
  cpu.x = 32;
  cpu.y = x >= 8 && x !== 144 ? 2 : 1;
  cmp(32, 32);
  cpu.p &= ~0x40;
}

/** The OS's 16 × 16-bit multiply ($7B73): a 32-bit product, but its carry into the top byte is lost. */
function multiply(a: number, b: number): number {
  let lo = 0, hi = b;
  for (let i = 0; i < 16; i++) {
    const c = hi >> 15;
    hi = ((hi << 1) | (lo >> 15)) & 0xffff;
    lo = (lo << 1) & 0xffff;
    if (c && (lo += a) > 0xffff) {
      lo &= 0xffff;
      hi = (hi & 0xff00) | ((hi + 1) & 0xff);
    }
  }
  return hi * 0x10000 + lo;
}

/** A glyph in a table of the font ROM: rows of perRow glyphs of 32 bytes from base. */
const table = (row: number, perRow: number, column: number, base: number) =>
  (multiply((((row & 0xff) * perRow) + (column & 0xff)) & 0xffff, 0x20) + base) & 0xffffff;

/** Where the font ROM has a 16 × 16 glyph for the double-byte code hi lo (unknown codes are A1A1, a space). */
function wideGlyph(hi: number, lo: number): number {
  if (hi < 0xa1 || (hi >= 0xaa && lo < 0xa1 && hi >= 0xda)) hi = lo = 0xa1;
  if (hi < 0xaa) {
    if (lo >= 0xa1) return table(hi - 0xa1, 0x5e, lo - 0xa1, 0x034e00); // GB2312 symbols
    if (hi < 0xa8) return table(hi - 0xa1, 0x61, lo - 0x40, 0x047800);
    return table(hi - 0xa8, 0x60, lo < 0x80 ? lo - 0x40 : lo - 0x41, 0x03bd80);
  }
  if (lo < 0xa1) return table(hi - 0xaa, 0x61, lo - 0x40, 0x08d3a3);
  if (hi < 0xb0) return table(hi - 0xaa, 0x5e, lo - 0xa1, 0x03df40);
  if (hi >= 0xf8) return table(hi - 0xf8, 0x5e, lo - 0xa1, 0x0425c0);
  return table(hi - 0xb0, 0x5e, lo - 0xa1, 0); // GB2312 hanzi
}

/** The OS's ASCII character, as SysAscii draws it (in its own checks of x and y). */
function ascii(x: number, y: number, c: number): void {
  cpu.x = 0;
  cmp((cpu.a = x), 0x99);
  if (x >= 0x99) return;
  cmp((cpu.a = y), 0x51);
  if (y >= 0x51) return;
  readGlyph(ASCII + c * 16, 16);
  set16(0x2f, GLYPH);
  narrow(x, y, 1);
}

export const TEXT: Record<number, OsFunction> = {
  /**
   * $E79A SysPrintString(x in A, y, s): a string at (x, y): ASCII 8 wide,
   * double-byte codes 16 wide ($FD-$FF with a second byte ≥ $A1: 8 wide),
   * wrapping to x = 0, 16 rows down, where a character does not fit, and
   * stopping at the end or below row 80. Leaves $2F/$30 at where it stopped.
   */
  0xe79a: fn(
    0x582c,
    () => {
      const sp = word(0x28);
      let x = cpu.a, y = rd(sp);
      set16(0x2f, rd(sp + 1) | (rd(sp + 2) << 8));
      const next = () => {
        clc();
        ram[0x2f] = adc(1, ram[0x2f]);
        ram[0x30] = adc(ram[0x30], 0);
      };
      for (;;) {
        const c = rd(word(0x2f));
        cpu.y = 0;
        if (!cmp((cpu.a = c), 0)) return;
        const lo = rd(word(0x2f) + 1);
        cpu.y = 1;
        if ((cmp((cpu.a = y), 0x51), y >= 0x51)) return;
        const narrowCode = c >= 0xfd && lo >= 0xa1, width = c < 0x81 || narrowCode ? 8 : 16;
        cmp(x, width === 16 ? 0x91 : 0x99);
        if (x >= (width === 16 ? 0x91 : 0x99)) {
          x = 0;
          clc();
          y = adc(0x10, y);
          if ((cmp((cpu.a = y), 0x51), y >= 0x51)) return;
        }
        // the character (the OS keeps $2F/$30 across it, at its last byte)
        if (c >= 0x81) next();
        const at = word(0x2f), limit = width === 16 ? 0x91 : 0x99;
        if (c < 0x81) ascii(x, y, c);
        else {
          const second = rd(at);
          cpu.x = 0;
          if ((cmp(x, limit), x < limit) && (cmp(y, 0x51), y < 0x51)) {
            readGlyph(width === 16 ? wideGlyph(c, second) : table(c - 0xf8, 0x5e, second - 0xa1, 0x0425c0), 32);
            if (width === 16) wide(x, y);
            else narrow(x, y, 2);
          }
        }
        set16(0x2f, at);
        next();
        clc();
        x = adc(width, x);
      }
    },
    [[0x38, 0x3c], [0x2081, 0x208d], [0x20ad, 0x20b8], [0x20cf, 0x20d1], [0x20e5, 0x20e7], [0x20ef, 0x20f0]],
  ),

  // $E7BB SysAscii(x in A, y, c): an 8 × 16 ASCII character at (x, y), x ≤ 152 and y ≤ 80
  0xe7bb: fn(
    0x638c,
    () => {
      const sp = word(0x28);
      cpu.y = 1;
      ascii(cpu.a, rd(sp), rd(sp + 1));
    },
    [[0x38, 0x3c], [0x2081, 0x208d], [0x20ad, 0x20b8], [0x20e5, 0x20e7], [0x20ef, 0x20f0]],
  ),
};
