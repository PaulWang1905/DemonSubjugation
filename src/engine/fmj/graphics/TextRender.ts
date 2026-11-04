// Port of fmj/graphics/TextRender.kt — draws GB2312 text with the HZK16 /
// ASC16 bitmap fonts.
import { Global } from "../Global";
import { Bitmap, Canvas, Rect, type GlyphMark } from "../../graphics";
import { gbkBytes, getPlatform, sysGbkDecode } from "../../java";

/** Byte source for a bitmap font: a loaded file or the platform fallback. */
interface FontSource {
  byte(offset: number): number;
}

let hzkSource: FontSource | null = null;
let ascSource: FontSource | null = null;
const mPixels = new Uint32Array(16 * 16);
const mBmpHzk = Bitmap.createBitmap(16, 16);
const mBmpAsc = Bitmap.createBitmap(8, 16);
const BLANK: FontSource = { byte: () => 0 };

function fileSource(name: string): FontSource | null {
  const p = getPlatform();
  const buf = p.rom.get(name);
  return buf ? { byte: (o) => buf[o] ?? 0 } : null;
}

function cachedSource(glyphBytes: number, render: (glyph: number) => ArrayLike<number>): FontSource {
  const cache = new Map<number, ArrayLike<number>>();
  return {
    byte(o: number): number {
      const g = Math.floor(o / glyphBytes);
      let bytes = cache.get(g);
      if (!bytes) {
        bytes = render(g);
        cache.set(g, bytes);
      }
      return bytes[o - g * glyphBytes] ?? 0;
    },
  };
}

function hzk(): FontSource {
  if (!hzkSource) {
    const fb = getPlatform().fontFallback;
    hzkSource = fileSource("HZK16") ?? (fb ? cachedSource(32, (g) => fb.hzk(g)) : BLANK);
  }
  return hzkSource;
}
function asc(): FontSource {
  if (!ascSource) {
    const fb = getPlatform().fontFallback;
    ascSource = fileSource("ASC16") ?? (fb ? cachedSource(16, (c) => fb.asc(c)) : BLANK);
  }
  return ascSource;
}

function fillGlyph(src: FontSource, offset: number, rows: number, bytesPerRow: number): void {
  const fg = Global.fgColor;
  const bg = Global.bgColor;
  const n = rows * bytesPerRow;
  for (let i = 0; i < n; i++) {
    const t = src.byte(offset + i) | 0;
    const k = i << 3;
    for (let b = 0; b < 8; b++) {
      mPixels[k | b] = (t & (0x80 >> b)) !== 0 ? fg : bg;
    }
  }
}

function getHzk(offset: number): Bitmap {
  fillGlyph(hzk(), offset, 16, 2);
  mBmpHzk.setPixels(mPixels, 0, 0, 0, 16, 16);
  return mBmpHzk;
}

function getAsc(offset: number): Bitmap {
  fillGlyph(asc(), offset, 16, 1);
  mBmpAsc.setPixels(mPixels, 0, 0, 0, 8, 16);
  return mBmpAsc;
}

function drawHzk(canvas: Canvas, offset: number, x: number, y: number): void {
  canvas.drawBitmap(getHzk(offset), x, y);
  canvas.markGlyph({ x, y, w: 16, font: 0, code: offset >> 5, fg: Global.fgColor, bg: Global.bgColor });
}

function drawAsc(canvas: Canvas, code: number, x: number, y: number): void {
  canvas.drawBitmap(getAsc(code * 16), x, y);
  canvas.markGlyph({ x, y, w: 8, font: 1, code, fg: Global.fgColor, bg: Global.bgColor });
}

const charCache = new Map<number, string>();

/** The Unicode character a glyph mark stands for. */
export function glyphChar(m: GlyphMark): string {
  if (m.font === 1) return String.fromCharCode(m.code);
  let ch = charCache.get(m.code);
  if (ch === undefined) {
    ch = sysGbkDecode([0xa1 + Math.floor(m.code / 94), 0xa1 + (m.code % 94)]);
    if (ch.length !== 1 || ch === "\ufffd") ch = "";
    charCache.set(m.code, ch);
  }
  return ch;
}

/**
 * How much of a glyph cell still shows what was drawn. Returns null when no
 * inked pixel of the glyph is left (the cell was drawn over since), an empty
 * array when the whole cell is intact, or the cell-relative box [x0, y0, x1,
 * y1) that something else now covers. The box is stretched to the cell edge
 * on sides it nearly touches, since covering shapes (menus, borders,
 * clipping) are rectangles.
 */
export function glyphVisibility(m: GlyphMark, buf: Uint32Array, width: number, height: number): number[] | null {
  const src = m.font === 0 ? hzk() : asc();
  const bpr = m.font === 0 ? 2 : 1;
  const base = m.font === 0 ? m.code * 32 : m.code * 16;
  let x0 = 99;
  let y0 = 99;
  let x1 = -1;
  let y1 = -1;
  const ink: number[] = [];
  for (let r = 0; r < 16; r++) {
    const y = m.y + r;
    for (let c = 0; c < m.w; c++) {
      const x = m.x + c;
      const bit = (src.byte(base + r * bpr + (c >> 3)) & (0x80 >> (c & 7))) !== 0;
      const on = x >= 0 && y >= 0 && x < width && y < height;
      if (on && buf[y * width + x] === (bit ? m.fg : m.bg)) {
        if (bit) ink.push(r * 16 + c);
        continue;
      }
      if (x0 > c) x0 = c;
      if (y0 > r) y0 = r;
      if (x1 < c + 1) x1 = c + 1;
      if (y1 < r + 1) y1 = r + 1;
    }
  }
  if (x1 < 0) return ink.length ? [] : null;
  if (x0 <= 2) x0 = 0;
  if (y0 <= 2) y0 = 0;
  if (x1 >= m.w - 2) x1 = m.w;
  if (y1 >= 14) y1 = 16;
  const shown = ink.some((p) => {
    const r = p >> 4;
    const c = p & 15;
    return c < x0 || c >= x1 || r < y0 || r >= y1;
  });
  return shown ? [x0, y0, x1, y1] : null;
}

function toBytes(text: string | Int8Array): Int8Array {
  return typeof text === "string" ? gbkBytes(text) : text;
}

export const TextRender = {
  /** Drop cached fonts (used when another game is loaded). */
  reset(): void {
    hzkSource = null;
    ascSource = null;
  },

  drawText(canvas: Canvas, text: string | Int8Array, x: number, y: number): void {
    const bytes = toBytes(text);
    let x0 = x;
    let i = 0;
    while (i < bytes.length && bytes[i] !== 0) {
      const t = bytes[i] & 0xff;
      if (t >= 0xa1) {
        ++i;
        const offset = (94 * (t - 0xa1) + (bytes[i] & 0xff) - 0xa1) * 32;
        drawHzk(canvas, offset, x0, y);
        x0 += 16;
      } else if (t < 128) {
        drawAsc(canvas, t, x0, y);
        x0 += 8;
      } else {
        x0 += 8;
      }
      i++;
    }
  },

  drawSelText(canvas: Canvas, text: string | Int8Array, x: number, y: number): void {
    Global.fgColor = Global.COLOR_WHITE;
    Global.bgColor = Global.COLOR_BLACK;
    TextRender.drawText(canvas, text, x, y);
    Global.fgColor = Global.COLOR_BLACK;
    Global.bgColor = Global.COLOR_WHITE;
  },

  /**
   * Draws text that starts at `y` clipped to the rows inside `r`.
   * @returns 0 all text above r.top, 1 text inside r, 2 all text below r.bottom
   */
  drawTextInRect(canvas: Canvas, text: string | Int8Array, r: Rect, y: number): number {
    const buf = toBytes(text);
    let tmpY = y;
    let i = 0;
    while (tmpY <= r.top - 16 && i < buf.length) {
      let tmpX = 0;
      while (tmpX < 160 && i < buf.length) {
        const t = buf[i] & 0xff;
        if (t >= 0xa1) {
          i += 2;
          tmpX += 16;
        } else {
          ++i;
          tmpX += 8;
        }
      }
      tmpY += 16;
    }
    if (i >= buf.length) return 0;

    while (tmpY < r.bottom && i < buf.length) {
      let tmpX = 0;
      while (tmpX < 160 && i < buf.length) {
        const t = buf[i] & 0xff;
        if (t >= 0xa1) {
          ++i;
          const offset = (94 * (t - 0xa1) + (buf[i] & 0xff) - 0xa1) * 32;
          drawHzk(canvas, offset, tmpX, tmpY);
          tmpX += 16;
        } else if (t < 128) {
          drawAsc(canvas, t, tmpX, tmpY);
          tmpX += 8;
        } else {
          tmpX += 8;
        }
        ++i;
      }
      tmpY += 16;
    }
    return i === 0 && buf.length > 0 ? 2 : 1;
  },

  /**
   * Draws as much of `buf` (from byte `start`) as fits in `r`.
   * @returns index of the next byte to draw
   */
  drawTextFrom(canvas: Canvas, text: string | Int8Array, start: number, r: Rect): number {
    const buf = toBytes(text);
    let i = start;
    let y = r.top;
    while (y <= r.bottom - 16 && i < buf.length) {
      let x = r.left;
      while (x <= r.right - 16 && i < buf.length) {
        const t = buf[i] & 0xff;
        if (t >= 0xa1) {
          ++i;
          const offset = (94 * (t - 0xa1) + (buf[i] & 0xff) - 0xa1) * 32;
          drawHzk(canvas, offset, x, y);
          x += 16;
        } else if (t < 128) {
          drawAsc(canvas, t, x, y);
          x += 8;
        } else {
          x += 8;
        }
        ++i;
      }
      y += 16;
    }
    return i;
  },
};
