// Draws the 160x96 frame scaled up with its text redrawn at full resolution.
//
// The engine still draws its 1-bit glyphs and reports where each character is
// (engine.textLayer()). The parts of each character cell that still show the
// glyph are cleared to the cell's background in a copy of the frame, the frame
// is scaled up with hard pixel edges, and the characters are painted on top
// with the device's fonts at the output resolution. Whatever was drawn over a
// character later (menus, borders, sprites) keeps its own pixels.
import { SCREEN_HEIGHT, SCREEN_WIDTH, type TextMark } from "../engine";
import { applyPalette, type Palette } from "./palettes";

export type TextStyle = "sans" | "serif";

const FONTS: Record<TextStyle, { cjk: string; latin: string }> = {
  sans: {
    cjk:
      '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", ' +
      '"WenQuanYi Micro Hei", "WenQuanYi Zen Hei", sans-serif',
    latin: '"SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Liberation Mono", monospace',
  },
  serif: {
    cjk: '"Songti SC", "STSong", "SimSun", "NSimSun", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", serif',
    latin: '"Courier New", "Nimbus Mono PS", "Liberation Mono", monospace',
  },
};

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

function surface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** The palette colour an engine colour is shown in (mirrors applyPalette). */
function shade(c: number, p: Palette): string {
  const r = c & 0xff;
  const g = (c >>> 8) & 0xff;
  const [cr, cg, cb] = r === 0 && g === 0 ? p.dark : r === 255 && g === 0 ? [255, 0, 0] : p.light;
  return `rgb(${cr},${cg},${cb})`;
}

/** Output scale for a screen shown `cssScale` times larger on this display. */
export function hiresScale(cssScale: number): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(2, Math.min(8, Math.ceil(cssScale * dpr)));
}

/** The parts of a character cell that still show it, as [x, y, w, h] in the cell. */
function visibleRects(m: TextMark): [number, number, number, number][] {
  if (!m.hidden) return [[0, 0, m.w, 16]];
  const [x0, y0, x1, y1] = m.hidden;
  const out: [number, number, number, number][] = [];
  if (y0 > 0) out.push([0, 0, m.w, y0]);
  if (y1 < 16) out.push([0, y1, m.w, 16 - y1]);
  if (x0 > 0) out.push([0, y0, x0, y1 - y0]);
  if (x1 < m.w) out.push([x1, y0, m.w - x1, y1 - y0]);
  return out;
}

export class HiresText {
  private readonly small = surface(SCREEN_WIDTH, SCREEN_HEIGHT);
  private readonly smallCtx = this.small.getContext("2d") as Ctx2D;
  private readonly image = new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
  private readonly work = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  private readonly glyphs = new Map<string, Surface>();

  constructor(private readonly style: TextStyle = "sans") {}

  /** Draw `frame` (engine RGBA) with `marks` onto `out` at `scale` x. */
  draw(out: HTMLCanvasElement, frame: Uint8ClampedArray, marks: TextMark[], palette: Palette, scale: number): void {
    const W = SCREEN_WIDTH * scale;
    const H = SCREEN_HEIGHT * scale;
    if (out.width !== W || out.height !== H) {
      out.width = W;
      out.height = H;
    }
    const ctx = out.getContext("2d")!;

    // 1. clear the low-resolution glyphs where they will be redrawn
    const work = this.work;
    work.set(frame);
    for (const m of marks) {
      const br = m.bg & 0xff;
      const bg = (m.bg >>> 8) & 0xff;
      const bb = (m.bg >>> 16) & 0xff;
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        for (let y = Math.max(0, m.y + cy); y < Math.min(SCREEN_HEIGHT, m.y + cy + ch); y++) {
          for (let x = Math.max(0, m.x + cx); x < Math.min(SCREEN_WIDTH, m.x + cx + cw); x++) {
            const o = (y * SCREEN_WIDTH + x) * 4;
            work[o] = br;
            work[o + 1] = bg;
            work[o + 2] = bb;
          }
        }
      }
    }

    // 2. the picture, scaled up with hard edges
    applyPalette(work, this.image.data, palette);
    this.smallCtx.putImageData(this.image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, W, H);

    // 3. the characters, on the parts of their cells nothing covers
    if (this.glyphs.size > 4000) this.glyphs.clear();
    const k = scale;
    for (const m of marks) {
      const g = this.glyph(m.text, m.w, shade(m.fg, palette), k);
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        ctx.drawImage(g, cx * k, cy * k, cw * k, ch * k, (m.x + cx) * k, (m.y + cy) * k, cw * k, ch * k);
      }
    }
  }

  private glyph(text: string, w: number, color: string, scale: number): Surface {
    const key = `${text}\u0000${w}\u0000${color}\u0000${scale}`;
    let s = this.glyphs.get(key);
    if (s) return s;
    s = surface(w * scale, 16 * scale);
    const ctx = s.getContext("2d") as Ctx2D;
    const f = FONTS[this.style];
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    if (w === 16) {
      // full-width: fill most of the 16x16 cell, like the original font
      ctx.font = `${(14.5 * scale).toFixed(1)}px ${f.cjk}`;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 8 * scale, 8.4 * scale);
    } else {
      ctx.font = `${(13 * scale).toFixed(1)}px ${f.latin}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, 4 * scale, 12.4 * scale, 8 * scale);
    }
    this.glyphs.set(key, s);
    return s;
  }
}
