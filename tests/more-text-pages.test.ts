// More text: a dialogue whose pages differ in height (the English 伏魔记's
// "Enough, enough. Listen..." at 10 px: 5 lines, then 1). The game clears
// only its own box between pages, so what a taller page covered above it must
// come back when a shorter one follows. Needs the fonts (FMJ_DATA_DIR).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLcd, LCD_STRIDE } from "../src/bbk/lcd";
import { use } from "../src/fulu/alu";
import { FuluDevice } from "../src/fulu/device";
import { lcd } from "../src/fulu/screen";

const FONTS = process.env.FMJ_DATA_DIR ?? "";

describe.skipIf(!FONTS || !existsSync(join(FONTS, "HZK16")))("More text pages", () => {
  it("puts back what a taller page covered", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    use(d.fulu);
    const mt = d.fulu.moreText as unknown as {
      font: unknown;
      layout(text: Int8Array, head: null): { from: number; lines: number }[];
      draw(say: object, n: number): void;
    };
    mt.font = { size: 10, hzk: new Uint8Array(readFileSync("public/fonts/small/cjk10.bin")), asc: new Uint8Array(readFileSync("public/fonts/small/latin10.bin")) };
    const raw = new TextEncoder().encode(
      "Enough,        enough.        Listen. I have been watching  the sky, and a demonic aura   hangs over the land below,    growing        thicker. I     meant to send  you down to    look.",
    );
    const text = new Int8Array(raw.length + 1);
    text.set(raw);
    const pages = mt.layout(text, null);
    expect(pages.map((p) => p.lines)).toEqual([5, 4]); // (the box is never shorter than the game's)
    // the map: a pattern on every row
    for (let y = 0; y < 96; y++) for (let b = 0; b < 20; b++) d.machine.write(lcd(b, y), (y * 7 + b * 13) & 0xff);
    const before = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(d.machine.ram, before);
    const say = { text, portrait: null, pages: pages.map((p) => p.from), gamePages: 3, answered: 0, shown: -1, under: null };
    mt.draw(say, 0);
    mt.draw(say, 1);
    const after = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(d.machine.ram, after);
    // page 1's box starts at y 41, page 2's at 51: between them, the map again
    for (let y = 41; y < 51; y++) for (let x = 0; x < 159; x++) expect(after[y * LCD_STRIDE + x]).toBe(before[y * LCD_STRIDE + x]);
    // and page 2's box is drawn (its top line)
    for (let x = 9; x <= 149; x++) expect(after[51 * LCD_STRIDE + x]).toBe(1);
  });
});
