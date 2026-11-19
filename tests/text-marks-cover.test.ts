// HD text on Fulu (src/fulu/textMarks.ts): a character partly covered (a
// popup's box or text over a menu's) is still redrawn, the covered part
// hidden; one covered whole, or cleared, is not.
import { describe, expect, it } from "vitest";
import { LCD_STRIDE } from "../src/bbk/lcd";
import { TextMarks } from "../src/fulu/textMarks";

/** A 16 × 16 glyph: a frame with a cross, every row inked. */
const ROWS = Array.from({ length: 16 }, (_, r) => (r === 0 || r === 15 ? 0xffff : 0x8001 | (r === 8 ? 0x7ffe : 0x0180)));
const draw = (screen: Uint8Array, x: number, y: number, rows: number[], w = 16) => {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++) screen[(y + r) * LCD_STRIDE + x + c] = (rows[r] >> (w - 1 - c)) & 1;
};

describe("text marks under a popup", () => {
  it("keeps a character a popup covers in part, with the covered part hidden", () => {
    const marks = new TextMarks(), screen = new Uint8Array(LCD_STRIDE * 96);
    draw(screen, 28, 26, ROWS);
    marks.drawn(28, 26, 16, ROWS, "性");
    // the popup: cleared from x 39, its text at (42, 32) overlapping the corner of the cell
    for (let y = 20; y < 60; y++) for (let x = 39; x < 120; x++) screen[y * LCD_STRIDE + x] = 0;
    draw(screen, 42, 32, ROWS);
    marks.drawn(42, 32, 16, ROWS, "读");
    const got = marks.marks(screen);
    const xing = got.find((m) => m.text === "性");
    expect(xing).toBeDefined();
    expect(xing!.hidden).toEqual([11, 0, 16, 16]);
    expect(got.find((m) => m.text === "读")?.hidden).toBeNull();
  });

  it("drops a character covered whole, and reports none where the screen was cleared", () => {
    const marks = new TextMarks(), screen = new Uint8Array(LCD_STRIDE * 96);
    draw(screen, 10, 10, ROWS);
    marks.drawn(10, 10, 16, ROWS, "甲");
    draw(screen, 10, 10, ROWS);
    marks.drawn(10, 10, 16, ROWS, "乙");
    expect(marks.marks(screen).map((m) => m.text)).toEqual(["乙"]);
    screen.fill(0);
    expect(marks.marks(screen)).toEqual([]);
  });
});
