// Draws a laid-out text box (format/dialogueBox.ts) onto a 160×96 screen
// with the engine's own drawing code (src/engine/graphics.ts: the boxes'
// rectangles and lines, as ScriptVM and Util draw them) and the 16-pixel
// fonts. The result is the engine's black/white buffer; the preview colours it.
import { Bitmap, Canvas, Colors, Paint, PaintStyle, RectF } from "../../engine/graphics";
import type { Frame } from "../format/encode";
import type { BoxLayout, Glyph } from "../format/dialogueBox";

export interface Fonts {
  hzk: Uint8Array | null;
  asc: Uint8Array | null;
}

const W = Colors.WHITE;
const B = Colors.BLACK;

/** A frame (0 white, 1 black, 2 transparent) drawn at x, y. */
function drawFrame(bmp: Bitmap, f: Frame, x: number, y: number): void {
  for (let j = 0; j < f.height; j++) {
    for (let i = 0; i < f.width; i++) {
      const v = f.pixels[j * f.width + i];
      if (v === 2) continue;
      const px = x + i;
      const py = y + j;
      if (px < 0 || py < 0 || px >= bmp.width || py >= bmp.height) continue;
      bmp.buffer[py * bmp.width + px] = v === 1 ? B : W;
    }
  }
}

/** A glyph from the HZK16 / ASC16 bytes (fg on bg). */
function drawGlyph(bmp: Bitmap, fonts: Fonts, g: Glyph, dy = 0, fg = B, bg = W): void {
  const w = g.wide ? 16 : 8;
  const src = g.wide ? fonts.hzk : fonts.asc;
  const base = g.wide ? g.code * 32 : g.code * 16;
  const bpr = g.wide ? 2 : 1;
  for (let r = 0; r < 16; r++) {
    const y = g.y + dy + r;
    if (y < 0 || y >= bmp.height) continue;
    for (let c = 0; c < w; c++) {
      const x = g.x + c;
      if (x < 0 || x >= bmp.width) continue;
      const byte = src ? (src[base + r * bpr + (c >> 3)] ?? 0) : 0;
      bmp.buffer[y * bmp.width + x] = byte & (0x80 >> (c & 7)) ? fg : bg;
    }
  }
}

/** The map behind the box: a light hatch, so the screen reads as a screen. */
function scene(bmp: Bitmap): void {
  bmp.buffer.fill(W);
  for (let y = 1; y < bmp.height; y += 4) for (let x = (y >> 2) % 2 ? 1 : 3; x < bmp.width; x += 4) bmp.buffer[y * bmp.width + x] = B;
}

export interface RenderOptions {
  fonts: Fonts;
  /** say: the page to draw. */
  page?: number;
  /** say: the portrait's first frame; showgut: the top and bottom pictures. */
  portrait?: Frame | null;
  top?: Frame | null;
  bottom?: Frame | null;
}

/** The screen with the box, as the engine draws it at the device's text size. */
export function renderBox(layout: BoxLayout, o: RenderOptions): Bitmap {
  const bmp = Bitmap.createBitmap(160, 96);
  const canvas = new Canvas(bmp);
  const paint = new Paint();
  const fill = (color: number) => {
    paint.color = color;
    paint.style = PaintStyle.FILL;
  };
  const stroke = (color: number) => {
    paint.color = color;
    paint.style = PaintStyle.STROKE;
    paint.strokeWidth = 1;
  };
  switch (layout.kind) {
    case "say": {
      scene(bmp);
      // ScriptVM cmd_say at 16 px
      const r = layout.portrait ? new RectF(9, 50, 151, 96 - 0.5) : new RectF(9, 55, 151, 96 - 0.5);
      fill(W);
      canvas.drawRectR(r, paint);
      stroke(B);
      canvas.drawRectR(r, paint);
      if (layout.portrait) {
        canvas.drawLine(38, 50, 44, 56, paint);
        canvas.drawLine(43.5, 56, 151, 56, paint);
        if (o.portrait) drawFrame(bmp, o.portrait, 13, 46);
      }
      const page = layout.pages[Math.min(o.page ?? 0, layout.pages.length - 1)];
      for (const g of page?.glyphs ?? []) drawGlyph(bmp, o.fonts, g);
      break;
    }
    case "message": {
      scene(bmp);
      // Util.showMessage: the information box for this many lines, at (11, textY - 2)
      const i = layout.lines - 1;
      const box = Bitmap.createBitmap(138, 23 + 16 * i);
      const c = new Canvas(box);
      const p = new Paint();
      p.color = W;
      p.style = PaintStyle.FILL_AND_STROKE;
      c.drawColor(B);
      c.drawRect(1, 1, 135, 20 + 16 * i, p);
      c.drawRect(136, 0, 138, 3, p);
      c.drawLine(0, 21 + 16 * i, 3, 21 + 16 * i, p);
      c.drawLine(0, 22 + 16 * i, 3, 22 + 16 * i, p);
      canvas.drawBitmap(box, 11, layout.textY - 2);
      for (const g of layout.page.glyphs) drawGlyph(bmp, o.fonts, g);
      break;
    }
    case "choice": {
      scene(bmp);
      // the original's box: cleared, framed, the first answer's bar inverted
      const fill = (r: { x: number; y: number; x2: number; y2: number } | null, color: number) => {
        if (!r) return;
        for (let y = r.y; y < r.y2; y++) for (let x = r.x; x < r.x2; x++) if (x >= 0 && x < 160 && y >= 0 && y < 96) bmp.buffer[y * 160 + x] = color;
      };
      fill(layout.clear, W);
      if (layout.frame) {
        const p = new Paint();
        p.color = B;
        p.style = PaintStyle.STROKE;
        canvas.drawRect(layout.frame.x1, layout.frame.y1, layout.frame.x2, layout.frame.y2, p);
      }
      fill(layout.bar, B);
      for (const g of layout.first) drawGlyph(bmp, o.fonts, g, 0, layout.bar ? W : B, layout.bar ? B : W); // the first answer is picked
      for (const g of layout.second) drawGlyph(bmp, o.fonts, g);
      break;
    }
    case "showgut": {
      // the moment the text's first line reaches the top of the space between the pictures
      bmp.buffer.fill(W);
      const top = o.top?.height ?? 0;
      const bottom = o.bottom ? 96 - o.bottom.height : 96;
      for (const row of layout.rows) {
        for (const g of row) {
          const y = top + g.y;
          if (y >= bottom || y + 16 <= top) continue;
          drawGlyph(bmp, o.fonts, g, top);
        }
      }
      if (o.top) drawFrame(bmp, o.top, 0, 0);
      if (o.bottom) drawFrame(bmp, o.bottom, 0, 96 - o.bottom.height);
      break;
    }
  }
  return bmp;
}

/** The engine's buffer coloured as the editor's LCD (white → light, black → dark). */
export function toImageData(bmp: Bitmap, light: readonly number[], dark: readonly number[]): ImageData {
  const img = new ImageData(bmp.width, bmp.height);
  for (let i = 0; i < bmp.buffer.length; i++) {
    const c = bmp.buffer[i] === B ? dark : light;
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = 255;
  }
  return img;
}
