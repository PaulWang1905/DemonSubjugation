// The glyph source: a font ROM for Fulu's machine, made from the site's own
// pixel fonts (HZK16 / ASC16 layout, public/fonts), with each glyph where the
// OS looks for it (docs/fulu-notes.md, "The boot page and the fonts"). Codes
// the site's fonts lack (GBK's, and BBK's own) stay blank.

import { REGION_SIZE } from "../bbk/firmware";

/** The 8 × 16 ASCII glyphs, 16 bytes each. */
const ASCII = 0x08b363;
/** The 16 × 16 glyphs in GB2312 order (94 a row, from $A1A1): the rows the OS keeps together, and where. */
const BLOCKS: { first: number; last: number; base: number }[] = [
  { first: 0xb0, last: 0xf7, base: 0x000000 }, // hanzi
  { first: 0xa1, last: 0xa9, base: 0x034e00 }, // symbols
  { first: 0xaa, last: 0xaf, base: 0x03df40 },
  { first: 0xf8, last: 0xff, base: 0x0425c0 },
];
const ROW = 94 * 32;

/** A font ROM with `cjk` (HZK16: 32 bytes a glyph from $A1A1) and `latin` (ASC16: 256 glyphs of 16 bytes). */
export function fontRom(cjk: Uint8Array, latin: Uint8Array): Uint8Array {
  const rom = new Uint8Array(REGION_SIZE);
  for (const { first, last, base } of BLOCKS) {
    const from = (first - 0xa1) * ROW, to = Math.min(cjk.length, (last - 0xa1 + 1) * ROW);
    if (to > from) rom.set(cjk.subarray(from, to), base);
  }
  rom.set(latin.subarray(0, 256 * 16), ASCII);
  return rom;
}
