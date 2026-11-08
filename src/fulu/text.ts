// The OS's text functions. Glyphs are read from the font ROM (physical
// $800000; its bank is the boot page's $03E7) through the data port DATA4
// ($03), whose address ADDR4 ($0211-$0213) steps on each read, just as the
// OS reads them. Fulu's own machine has a font ROM made from the site's
// fonts; checked against the firmware, it reads the real one.

import { cmp, cpu, farCalled, fn, ram, rd, set16, word, wr } from "./alu";
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

export const TEXT: Record<number, OsFunction> = {
  /**
   * $E7BB SysAscii(x in A, y, c): an 8 × 16 ASCII character with its top left
   * at (x, y), x ≤ 152 and y ≤ 80, replacing the pixels under it (at x = 152,
   * its last column is dropped to keep the status icons).
   */
  0xe7bb: fn(
    0x638c,
    () => {
      const sp = word(0x28), x = cpu.a, y = rd(sp), c = rd(sp + 1);
      cpu.x = 0;
      cpu.y = 1;
      cmp(x, 0x99);
      if (x >= 0x99) return;
      cmp((cpu.a = y), 0x51);
      if (y >= 0x51) return;
      readGlyph(ASCII + c * 16, 16);
      set16(0x2f, GLYPH);
      const b = x >> 3, s = x & 7, keepLeft = (0xff00 >> s) & 0xff, keepRight = 0xff >> s;
      for (let k = 0; k < 16; k++) {
        const g = ram[GLYPH + k], left = lcd(b, y + k);
        if (x === 152) wr(left, (rd(left) & 1) | (g & 0xfe));
        else {
          const right = lcd(b + 1, y + k);
          wr(left, (rd(left) & keepLeft) | (g >> s));
          wr(right, (rd(right) & keepRight) | ((g << (8 - s)) & 0xff));
        }
      }
      // as the OS's row step leaves them: A the high byte of its pointer to the next row's byte 0
      const end = y + 15;
      cpu.a = end === 0x41 ? (x < 8 ? x : ((x & 7) - 8) & 0xff) : lcd(0, end + 1) >> 8;
      cpu.x = 16;
      cpu.y = x >= 8 && x !== 152 ? 1 : 0;
      cmp(16, 16);
      cpu.p &= ~0x40;
    },
    [[0x38, 0x3c], [0x2081, 0x208d], [0x20ad, 0x20b8], [0x20e5, 0x20e7], [0x20ef, 0x20f0]],
  ),
};
