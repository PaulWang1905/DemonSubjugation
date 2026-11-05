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

/** Full-width punctuation that may not start a line (as GBK code pairs). */
const CLOSING = new Set(
  [..."，。、；：？！…—’”）》」』】〕～·"].map((c) => {
    const g = gbkBytes(c);
    return ((g[0] & 0xff) << 8) | (g[1] & 0xff);
  }),
);

/** Text cell height in use: 16 on the device, 12 or 10 for compact text. */
let cell = 16;

/**
 * A glyph shrunk to an h-pixel cell, as one 0/1 per pixel (row by row). A
 * target pixel is inked when enough of the source pixels under it are.
 */
const scaledCache = new Map<string, Uint8Array>();
function scaledBits(font: 0 | 1, code: number, h: number): Uint8Array {
  const key = `${font}:${code}:${h}`;
  let bits = scaledCache.get(key);
  if (bits) return bits;
  const src = font === 0 ? hzk() : asc();
  const sw = font === 0 ? 16 : 8;
  const bpr = font === 0 ? 2 : 1;
  const base = font === 0 ? code * 32 : code * 16;
  const w = font === 0 ? h : h >> 1;
  const f = 16 / h;
  bits = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let on = 0;
      let n = 0;
      for (let sr = Math.floor(r * f); sr < Math.min(16, Math.ceil((r + 1) * f)); sr++) {
        for (let sc = Math.floor(c * f); sc < Math.min(sw, Math.ceil((c + 1) * f)); sc++) {
          n++;
          if (src.byte(base + sr * bpr + (sc >> 3)) & (0x80 >> (sc & 7))) on++;
        }
      }
      bits[r * w + c] = on * 3 >= n ? 1 : 0;
    }
  }
  if (scaledCache.size > 6000) scaledCache.clear();
  scaledCache.set(key, bits);
  return bits;
}

const scaledBmp = new Map<number, Bitmap>();
function drawScaled(canvas: Canvas, font: 0 | 1, code: number, x: number, y: number): void {
  const h = cell;
  const w = font === 0 ? h : h >> 1;
  const bits = scaledBits(font, code, h);
  const k = w * 100 + h;
  let bmp = scaledBmp.get(k);
  if (!bmp) scaledBmp.set(k, (bmp = Bitmap.createBitmap(w, h)));
  const px = new Uint32Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = bits[i] ? Global.fgColor : Global.bgColor;
  bmp.setPixels(px, 0, 0, 0, w, h);
  canvas.drawBitmap(bmp, x, y);
  canvas.markGlyph({ x, y, w, h, font, code, fg: Global.fgColor, bg: Global.bgColor });
}

function drawHzk(canvas: Canvas, offset: number, x: number, y: number): void {
  if (cell !== 16) return drawScaled(canvas, 0, offset >> 5, x, y);
  canvas.drawBitmap(getHzk(offset), x, y);
  canvas.markGlyph({ x, y, w: 16, h: 16, font: 0, code: offset >> 5, fg: Global.fgColor, bg: Global.bgColor });
}

function drawAsc(canvas: Canvas, code: number, x: number, y: number): void {
  if (cell !== 16) return drawScaled(canvas, 1, code, x, y);
  canvas.drawBitmap(getAsc(code * 16), x, y);
  canvas.markGlyph({ x, y, w: 8, h: 16, font: 1, code, fg: Global.fgColor, bg: Global.bgColor });
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
  const h = m.h ?? 16;
  const scaled = h !== 16 ? scaledBits(m.font, m.code, h) : null;
  const src = m.font === 0 ? hzk() : asc();
  const bpr = m.font === 0 ? 2 : 1;
  const base = m.font === 0 ? m.code * 32 : m.code * 16;
  let x0 = 99;
  let y0 = 99;
  let x1 = -1;
  let y1 = -1;
  const ink: number[] = [];
  for (let r = 0; r < h; r++) {
    const y = m.y + r;
    for (let c = 0; c < m.w; c++) {
      const x = m.x + c;
      const bit = scaled ? scaled[r * m.w + c] === 1 : (src.byte(base + r * bpr + (c >> 3)) & (0x80 >> (c & 7))) !== 0;
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
  if (y1 >= h - 2) y1 = h;
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
    scaledCache.clear();
  },

  /** The text cell height in use (16 on the device). */
  get size(): number {
    return cell;
  },

  /** Run `fn` drawing text in `size`-pixel cells, then go back to 16. */
  withSize<T>(size: number, fn: () => T): T {
    const old = cell;
    cell = size;
    try {
      return fn();
    } finally {
      cell = old;
    }
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
        x0 += cell;
      } else if (t < 128) {
        drawAsc(canvas, t, x0, y);
        x0 += cell >> 1;
      } else {
        x0 += cell >> 1;
      }
      i++;
    }
  },

  /**
   * Compact-text layout: draws `text` from byte `start` into one line per
   * entry of `rows` (x, y, right edge), in the current cell size. Runs of
   * spaces fold into one (texts were padded with spaces to break lines at
   * the device's 16-pixel width), Latin words are not split unless they are
   * longer than a line, and Chinese breaks anywhere. With `canvas` null it
   * only measures. Returns the next byte to draw (the text's length when
   * nothing but spaces is left) and how many rows were used.
   */
  drawWrapped(canvas: Canvas | null, text: string | Int8Array, start: number, rows: { x: number; y: number; right: number }[]): { next: number; rows: number } {
    const b = toBytes(text);
    let len = b.indexOf(0);
    if (len < 0) len = b.length;
    const half = cell >> 1;
    let i = start;
    let used = 0;
    const isWord = (j: number) => j < len && b[j] !== 0x20 && (b[j] & 0xff) < 0x80;
    const isWide = (j: number) => j + 1 < len && (b[j] & 0xff) >= 0xa1;
    for (const row of rows) {
      while (i < len && b[i] === 0x20) i++;
      if (i >= len) break;
      used++;
      const width = row.right + 1 - row.x;
      // 1. where this line ends: [i, end) fits, end is where the next starts
      let x = 0;
      let j = i;
      let lastWide = -1; // start of the last full-width character on the line
      let wideCount = 0;
      while (j < len) {
        if (isWide(j)) {
          if (x + cell > width) break;
          lastWide = j;
          wideCount++;
          x += cell;
          j += 2;
        } else if (b[j] === 0x20) {
          let k = j;
          while (k < len && b[k] === 0x20) k++;
          if (x + half > width) {
            j = k;
            break;
          }
          x += half;
          j = k;
        } else if (isWord(j)) {
          let k = j;
          while (isWord(k)) k++;
          if (x + (k - j) * half > width) {
            if (x === 0) j += Math.max(1, Math.floor(width / half)); // longer than a line
            break;
          }
          x += (k - j) * half;
          j = k;
        } else {
          x += half;
          j++;
        }
      }
      // a line may not start with closing punctuation: take the character
      // before it down too
      if (j < len && isWide(j) && CLOSING.has(((b[j] & 0xff) << 8) | (b[j + 1] & 0xff)) && wideCount > 1 && lastWide === j - 2) j = lastWide;
      // 2. draw it
      if (canvas) {
        let dx = row.x;
        let k = i;
        while (k < j) {
          const t = b[k] & 0xff;
          if (isWide(k)) {
            drawHzk(canvas, (94 * (t - 0xa1) + (b[k + 1] & 0xff) - 0xa1) * 32, dx, row.y);
            dx += cell;
            k += 2;
          } else if (t === 0x20) {
            while (k < j && b[k] === 0x20) k++;
            dx += half;
          } else {
            if (t < 0x80) drawAsc(canvas, t, dx, row.y);
            dx += half;
            k++;
          }
        }
      }
      i = j;
    }
    while (i < len && b[i] === 0x20) i++;
    return { next: i >= len ? b.length : i, rows: used };
  },

  /**
   * Text in a rectangle: fmj.kt's drawTextFrom at the device's size, the
   * wrapping compact layout at a smaller `size`.
   */
  drawBlock(canvas: Canvas, text: string | Int8Array, start: number, r: Rect, size: number): number {
    if (size === 16) return TextRender.drawTextFrom(canvas, text, start, r);
    return TextRender.withSize(size, () => {
      const rows: { x: number; y: number; right: number }[] = [];
      for (let y = r.top; y + size <= r.bottom + 1; y += size) rows.push({ x: r.left, y, right: r.right });
      return TextRender.drawWrapped(canvas, text, start, rows).next;
    });
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
    while (tmpY <= r.top - cell && i < buf.length) {
      let tmpX = 0;
      while (tmpX < 160 && i < buf.length) {
        const t = buf[i] & 0xff;
        if (t >= 0xa1) {
          i += 2;
          tmpX += cell;
        } else {
          ++i;
          tmpX += cell >> 1;
        }
      }
      tmpY += cell;
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
          tmpX += cell;
        } else if (t < 128) {
          drawAsc(canvas, t, tmpX, tmpY);
          tmpX += cell >> 1;
        } else {
          tmpX += cell >> 1;
        }
        ++i;
      }
      tmpY += cell;
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
    // 16-pixel text keeps fmj.kt's limits; smaller cells fill the rectangle
    const yMax = cell === 16 ? r.bottom - 16 : r.bottom + 1 - cell;
    const xMax = cell === 16 ? r.right - 16 : r.right + 1 - cell;
    while (y <= yMax && i < buf.length) {
      let x = r.left;
      while (x <= xMax && i < buf.length) {
        const t = buf[i] & 0xff;
        if (t >= 0xa1) {
          ++i;
          const offset = (94 * (t - 0xa1) + (buf[i] & 0xff) - 0xa1) * 32;
          drawHzk(canvas, offset, x, y);
          x += cell;
        } else if (t < 128) {
          drawAsc(canvas, t, x, y);
          x += cell >> 1;
        } else {
          x += cell >> 1;
        }
        ++i;
      }
      y += cell;
    }
    return i;
  },
};
