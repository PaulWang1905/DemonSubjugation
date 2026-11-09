// HD text on Fulu: a character is reported only while the screen shows its whole cell.
import { describe, expect, it } from "vitest";
import { LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { TextMarks } from "../src/fulu/textMarks";

/** A 16 × 16 glyph: a frame (the edges dark). */
const FRAME = Array.from({ length: 16 }, (_, k) => (k === 0 || k === 15 ? 0xffff : 0x8001));
/** An 8 × 16 glyph: one dark column. */
const BAR = Array(16).fill(0x10);

/** Put a glyph's bits on the screen at (x, y), inverted if asked. */
function paint(screen: Uint8Array, x: number, y: number, w: number, rows: number[], inverted = false): void {
  for (let k = 0; k < 16; k++) for (let c = 0; c < w && x + c < LCD_STRIDE; c++) screen[(y + k) * LCD_STRIDE + x + c] = ((rows[k] >> (w - 1 - c)) & 1) ^ (inverted ? 1 : 0);
}

describe("text marks", () => {
  it("reports a character while its cell shows it, drawn or inverted", () => {
    const t = new TextMarks(), screen = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    t.drawn(13, 20, 16, FRAME, "字");
    expect(t.marks(screen)).toEqual([]); // not on the screen (yet)
    paint(screen, 13, 20, 16, FRAME);
    expect(t.marks(screen)).toEqual([{ x: 13, y: 20, w: 16, h: 16, text: "字", fg: 0xff000000, bg: 0xffffffff, hidden: null }]);
    paint(screen, 13, 20, 16, FRAME, true); // a menu's selection
    expect(t.marks(screen)).toMatchObject([{ fg: 0xffffffff, bg: 0xff000000 }]);
    screen[25 * LCD_STRIDE + 20] ^= 1; // one pixel drawn over: the pixels stay
    expect(t.marks(screen)).toEqual([]);
  });

  it("forgets what a new glyph draws over, and keeps nothing for a blank character", () => {
    const t = new TextMarks(), screen = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    t.drawn(0, 0, 16, FRAME, "甲");
    t.drawn(8, 4, 8, BAR, "1"); // over half of 甲
    t.drawn(32, 0, 8, BAR, " ");
    paint(screen, 0, 0, 16, FRAME);
    paint(screen, 8, 4, 8, BAR);
    expect(t.marks(screen).map((m) => m.text)).toEqual(["1"]);
    t.clear();
    expect(t.marks(screen)).toEqual([]);
  });

  it("leaves the status icons' column out of a glyph at the right edge", () => {
    const t = new TextMarks(), screen = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    t.drawn(152, 80, 8, Array(16).fill(0xff), "W");
    paint(screen, 152, 80, 7, Array(16).fill(0x7f)); // columns 152-158; 159 is an icon's
    expect(t.marks(screen)).toMatchObject([{ x: 152, w: 8, hidden: [7, 0, 8, 16] }]);
  });
});
