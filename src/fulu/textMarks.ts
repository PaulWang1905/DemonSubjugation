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
/** The column of status icons, which glyphs never cover. */
const ICONS = 159;

interface Glyph {
  x: number;
  y: number;
  /** 8 or 16. */
  w: number;
  text: string;
  /** 16 rows of `w` bits, the leftmost pixel in the highest bit. */
  rows: number[];
}

export class TextMarks {
  private glyphs: Glyph[] = [];

  /**
   * A glyph drawn with its top left at (x, y), replacing what its cell held.
   * `text` is its character, or "" when there is none to redraw (a space, a
   * symbol of the device's own).
   */
  drawn(x: number, y: number, w: number, rows: number[], text: string): void {
    this.glyphs = this.glyphs.filter((g) => g.x >= x + w || x >= g.x + g.w || g.y >= y + 16 || y >= g.y + 16);
    if (text.trim()) this.glyphs.push({ x, y, w, text, rows });
  }

  clear(): void {
    this.glyphs = [];
  }

  /** The characters `screen` (decoded, 1 = dark) shows whole, for HiresText. */
  marks(screen: Uint8Array): TextMark[] {
    const out: TextMark[] = [];
    for (const g of this.glyphs) {
      const shown = shows(screen, g);
      if (shown === null) continue;
      const cut = Math.max(0, g.x + g.w - ICONS);
      out.push({
        x: g.x,
        y: g.y,
        w: g.w,
        h: 16,
        text: g.text,
        fg: shown === "inverted" ? LIGHT : DARK,
        bg: shown === "inverted" ? DARK : LIGHT,
        hidden: cut ? [g.w - cut, 0, g.w, 16] : null,
      });
    }
    return out;
  }
}

/** Whether the screen shows the glyph's whole cell as drawn, inverted, or neither (null). */
function shows(screen: Uint8Array, g: Glyph): "drawn" | "inverted" | null {
  let drawn = true, inverted = true;
  const w = Math.min(g.w, ICONS - g.x);
  for (let k = 0; k < 16 && (drawn || inverted); k++) {
    const row = g.rows[k], at = (g.y + k) * LCD_STRIDE + g.x;
    for (let c = 0; c < w; c++) {
      const same = screen[at + c] === ((row >> (g.w - 1 - c)) & 1);
      drawn &&= same;
      inverted &&= !same;
    }
  }
  return drawn ? "drawn" : inverted ? "inverted" : null;
}
