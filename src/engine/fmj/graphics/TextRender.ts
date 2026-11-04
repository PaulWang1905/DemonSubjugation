// Port of fmj/graphics/TextRender.kt — draws GB2312 text with the HZK16 /
// ASC16 bitmap fonts.
import { Global } from "../Global";
import { Bitmap, Canvas, Rect } from "../../graphics";
import { File, gbkBytes } from "../../java";

let mHZKBuf: Int8Array | null = null;
let mASCBuf: Int8Array | null = null;
const mPixels = new Uint32Array(16 * 16);
const mBmpHzk = Bitmap.createBitmap(16, 16);
const mBmpAsc = Bitmap.createBitmap(8, 16);

function hzk(): Int8Array {
  if (!mHZKBuf) mHZKBuf = File.contentsOf("HZK16");
  return mHZKBuf;
}
function asc(): Int8Array {
  if (!mASCBuf) mASCBuf = File.contentsOf("ASC16");
  return mASCBuf;
}

function fillGlyph(src: Int8Array, offset: number, rows: number, bytesPerRow: number): void {
  const fg = Global.fgColor;
  const bg = Global.bgColor;
  const n = rows * bytesPerRow;
  for (let i = 0; i < n; i++) {
    const t = src[offset + i] | 0;
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

function toBytes(text: string | Int8Array): Int8Array {
  return typeof text === "string" ? gbkBytes(text) : text;
}

export const TextRender = {
  /** Drop cached fonts (used when another game is loaded). */
  reset(): void {
    mHZKBuf = null;
    mASCBuf = null;
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
        canvas.drawBitmap(getHzk(offset), x0, y);
        x0 += 16;
      } else if (t < 128) {
        canvas.drawBitmap(getAsc(t * 16), x0, y);
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
          canvas.drawBitmap(getHzk(offset), tmpX, tmpY);
          tmpX += 16;
        } else if (t < 128) {
          canvas.drawBitmap(getAsc(t * 16), tmpX, tmpY);
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
          canvas.drawBitmap(getHzk(offset), x, y);
          x += 16;
        } else if (t < 128) {
          canvas.drawBitmap(getAsc(t * 16), x, y);
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
