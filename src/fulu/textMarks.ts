// HD text for programs on Fulu: where the characters on the screen are.
//
// Every character a program shows is drawn by Fulu (SysPrintString,
// SysAscii), so Fulu knows where each one went and what it is. The screen is
// the program's to change, though (it clears, draws pictures, inverts), so a
// character is reported only while its whole cell still holds its glyph, as
// drawn or inverted (a menu's selection); otherwise its pixels stay as they
// are. Nothing is redrawn that the screen does not show.

import { LCD_STRIDE } from "../bbk/lcd";
import type { TextMark } from "../engine";

/** The screen's colours, as the player's frame has them (0xAABBGGRR). */
const DARK = 0xff000000, LIGHT = 0xffffffff;
/** How many glyphs are kept (the oldest go first): more than the screen holds. */
const MAX_GLYPHS = 800;
/** The column of status icons, which glyphs never cover. */
const ICONS = 159;

interface Glyph {
  x: number;
  y: number;
  /** 8 or 16 (5, 6, 10, 12 for More text). */
  w: number;
  /** 16 (12 or 10 for More text). */
  h: number;
  text: string;
  /** `h` rows of `w` bits, the leftmost pixel in the highest bit. */
  rows: number[];
}

export class TextMarks {
  private glyphs: Glyph[] = [];

  /**
   * A glyph drawn with its top left at (x, y), replacing what its cell held.
   * `text` is its character, or "" when there is none to redraw (a space, a
   * symbol of the device's own).
   */
  drawn(x: number, y: number, w: number, rows: number[], text: string, h = 16): void {
    // a glyph whose cell this one covers whole is gone; one it covers in part
    // stays (a popup's text over a menu's), shown where the screen still has it
    this.glyphs = this.glyphs.filter((g) => !(x <= g.x && g.x + g.w <= x + w && y <= g.y && g.y + g.h <= y + h));
    if (text.trim()) this.glyphs.push({ x, y, w, h, text, rows });
    if (this.glyphs.length > MAX_GLYPHS) this.glyphs.splice(0, this.glyphs.length - MAX_GLYPHS);
  }

  clear(): void {
    this.glyphs = [];
  }

  /**
   * The characters `screen` (decoded, 1 = dark) shows, for HiresText: whole,
   * or partly covered (a popup over them), with the covered box hidden so
   * that only the rest is redrawn.
   */
  marks(screen: Uint8Array): TextMark[] {
    const out: TextMark[] = [];
    for (const g of this.glyphs) {
      const shown = shows(screen, g);
      if (!shown) continue;
      out.push({
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        text: g.text,
        fg: shown.inverted ? LIGHT : DARK,
        bg: shown.inverted ? DARK : LIGHT,
        hidden: shown.hidden,
      });
    }
    return out;
  }
}

/**
 * How the screen shows a glyph's cell: as drawn or inverted, and the box of
 * it that something else now covers ([x0, y0, x1, y1) in the cell, stretched
 * to the cell's edges it nearly touches, since covers are rectangles; null
 * when the whole cell is intact). Null when none of its ink shows outside
 * that box. (As FMJ React's glyphVisibility.)
 */
function shows(screen: Uint8Array, g: Glyph): { inverted: boolean; hidden: [number, number, number, number] | null } | null {
  const fit = (inverted: boolean) => {
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    const ink: number[] = [];
    for (let r = 0; r < g.h; r++) {
      const row = g.rows[r], at = (g.y + r) * LCD_STRIDE + g.x;
      for (let c = 0; c < g.w; c++) {
        const bit = (row >> (g.w - 1 - c)) & 1;
        // (the column of status icons is never the glyph's)
        if (g.x + c < ICONS && screen[at + c] === (inverted ? bit ^ 1 : bit)) {
          if (bit) ink.push(r * 16 + c);
          continue;
        }
        if (x0 > c) x0 = c;
        if (y0 > r) y0 = r;
        if (x1 < c + 1) x1 = c + 1;
        if (y1 < r + 1) y1 = r + 1;
      }
    }
    if (x1 < 0) return ink.length ? { inverted, hidden: null, covered: 0 } : null;
    if (x0 <= 2) x0 = 0;
    if (y0 <= 2) y0 = 0;
    if (x1 >= g.w - 2) x1 = g.w;
    if (y1 >= g.h - 2) y1 = g.h;
    const visible = ink.some((p) => {
      const r = p >> 4, c = p & 15;
      return c < x0 || c >= x1 || r < y0 || r >= y1;
    });
    return visible ? { inverted, hidden: [x0, y0, x1, y1] as [number, number, number, number], covered: (x1 - x0) * (y1 - y0) } : null;
  };
  const drawn = fit(false), inverted = fit(true);
  const best = drawn && inverted ? (drawn.covered <= inverted.covered ? drawn : inverted) : (drawn ?? inverted);
  return best && { inverted: best.inverted, hidden: best.hidden };
}
