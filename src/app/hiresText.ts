// Draws the game's frame at the display's resolution: the picture scaled up
// (with hard pixel edges, an LCD look or smoothed), and optionally the text
// redrawn with fonts at full resolution (Sharp text).
//
// For Sharp text the engine still draws its 1-bit glyphs and reports where
// each character is (engine.textLayer()). The parts of each character cell
// that still show the glyph are cleared to the cell's background in a copy of
// the frame, the frame is scaled up, and the characters are painted on top at
// the output resolution. Whatever was drawn over a character later (menus,
// borders, sprites) keeps its own pixels.
import { SCREEN_HEIGHT, SCREEN_WIDTH, type TextMark } from "../engine";
import { applyPalette, type Palette } from "./palettes";
import { loadSharpFont } from "./sharpFonts";

/** Sharp text: the device's fonts (sans, serif) or fonts that come with the player. */
export type TextStyle = "sans" | "serif" | "kai" | "hei" | "song";

/** How the picture is scaled up. */
export type ScreenEffect = "none" | "lcd" | "lcd-shadow" | "smooth";

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
  // bundled (src/app/sharpFonts.ts): the same on every device
  kai: { cjk: '"LXGW WenKai Mono", "KaiTi", "STKaiti", serif', latin: '"LXGW WenKai Mono", serif' },
  hei: { cjk: '"Noto Sans SC", sans-serif', latin: '"Noto Sans Mono", monospace' },
  song: { cjk: '"Noto Serif SC", serif', latin: '"Courier Prime", monospace' },
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

/**
 * Output scale for the picture effects: as near as possible one output pixel
 * per screen pixel, so the LCD grid lines land on whole pixels.
 */
export function effectScale(cssScale: number, frameWidth = SCREEN_WIDTH): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  // at most 4096 output pixels across (the wider map view at high scales)
  return Math.max(2, Math.min(16, Math.floor(4096 / frameWidth), Math.round(cssScale * dpr)));
}

/** A colour between `a` and `b` (t = 0: a, 1: b). */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Scale2x (EPX) on 32-bit pixels: each pixel becomes four, rounding off
 * diagonal edges but leaving lone pixels and checkerboard dithering as they are.
 */
export function scale2x(src: Uint32Array, w: number, h: number, dst: Uint32Array): void {
  const W = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      const a = y > 0 ? src[(y - 1) * w + x] : p; // up
      const b = x < w - 1 ? src[y * w + x + 1] : p; // right
      const c = x > 0 ? src[y * w + x - 1] : p; // left
      const d = y < h - 1 ? src[(y + 1) * w + x] : p; // down
      let e0 = p, e1 = p, e2 = p, e3 = p;
      // (the outermost pixels are only enlarged: nothing is known beyond them)
      const inner = x > 0 && y > 0 && x < w - 1 && y < h - 1;
      if (inner && a !== d && c !== b) {
        if (c === a) e0 = a;
        if (a === b) e1 = b;
        if (c === d) e2 = c;
        if (d === b) e3 = b;
      }
      const o = y * 2 * W + x * 2;
      dst[o] = e0;
      dst[o + 1] = e1;
      dst[o + W] = e2;
      dst[o + W + 1] = e3;
    }
  }
}

/** Which renderer drew each canvas last (another one may have drawn over it since). */
const drawnBy = new WeakMap<HTMLCanvasElement, HiresText>();

function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  if (a.byteOffset % 4 || b.byteOffset % 4) return a.every((v, i) => v === b[i]);
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
  const y = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** The parts of a character cell that still show it, as [x, y, w, h] in the cell. */
function visibleRects(m: TextMark): [number, number, number, number][] {
  const h = m.h ?? 16;
  if (!m.hidden) return [[0, 0, m.w, h]];
  const [x0, y0, x1, y1] = m.hidden;
  const out: [number, number, number, number][] = [];
  if (y0 > 0) out.push([0, 0, m.w, y0]);
  if (y1 < h) out.push([0, y1, m.w, h - y1]);
  if (x0 > 0) out.push([0, y0, x0, y1 - y0]);
  if (x1 < m.w) out.push([x1, y0, m.w - x1, y1 - y0]);
  return out;
}

export class HiresText {
  private fw = 0;
  private fh = 0;
  private small!: Surface;
  private smallCtx!: Ctx2D;
  private image!: ImageData;
  private work!: Uint8ClampedArray;
  private readonly glyphs = new Map<string, Surface>();
  /** Effect layers: the dark pixels alone, the LCD grid, the smoothed picture. */
  private mask: { surface: Surface; ctx: Ctx2D; image: ImageData } | null = null;
  private grid: { key: string; surface: Surface } | null = null;
  private smooth: { surface: Surface; ctx: Ctx2D; image: ImageData; mid: Uint32Array; out: Uint32Array } | null = null;
  private readonly pending = new Set<string>();
  /** What the last draw showed, so an unchanged frame is not drawn again. */
  private last: { frame: Uint8ClampedArray; key: string; out: HTMLCanvasElement } | null = null;
  /** A glyph in the last draw used a stand-in font (its own was still loading). */
  private incomplete = false;

  /** `style` null: keep the game's own pixel text (only the picture effect applies). */
  constructor(private readonly style: TextStyle | null = "sans") {
    this.size(SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  /** Buffers for frames of `w` x `h` (the device's screen, or the wider map view). */
  private size(w: number, h: number): void {
    if (w === this.fw && h === this.fh) return;
    this.fw = w;
    this.fh = h;
    this.small = surface(w, h);
    this.smallCtx = this.small.getContext("2d") as Ctx2D;
    this.image = new ImageData(w, h);
    this.work = new Uint8ClampedArray(w * h * 4);
    this.mask = null;
    this.grid = null;
    this.smooth = null;
  }

  /** Draw `frame` (engine RGBA, `fw` x `fh`) with `marks` onto `out` at `scale` x. */
  draw(
    out: HTMLCanvasElement,
    frame: Uint8ClampedArray,
    marks: TextMark[],
    palette: Palette,
    scale: number,
    fw = SCREEN_WIDTH,
    fh = SCREEN_HEIGHT,
    effect: ScreenEffect = "none",
  ): void {
    if (!this.style) marks = [];
    this.size(fw, fh);
    const W = fw * scale;
    const H = fh * scale;
    let resized = false;
    if (out.width !== W || out.height !== H) {
      out.width = W;
      out.height = H;
      resized = true;
    }
    const ctx = out.getContext("2d")!;

    // nothing changed since this drew the canvas last (a still scene, a menu): keep it
    const key = `${scale}:${effect}:${palette.id}:${marks.map((m) => `${m.x},${m.y},${m.w},${m.h},${m.fg},${m.bg},${m.text},${m.hidden}`).join(";")}`;
    const last = this.last;
    const mine = drawnBy.get(out) === this;
    drawnBy.set(out, this);
    if (last && mine && !resized && !this.incomplete && last.out === out && last.key === key && sameBytes(last.frame, frame)) return;
    if (last && last.frame.length === frame.length) last.frame.set(frame);
    this.last = { frame: last && last.frame.length === frame.length ? last.frame : frame.slice(), key, out };
    this.incomplete = false;

    // 1. clear the low-resolution glyphs where they will be redrawn
    const work = this.work;
    work.set(frame);
    for (const m of marks) {
      const br = m.bg & 0xff;
      const bg = (m.bg >>> 8) & 0xff;
      const bb = (m.bg >>> 16) & 0xff;
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        for (let y = Math.max(0, m.y + cy); y < Math.min(fh, m.y + cy + ch); y++) {
          for (let x = Math.max(0, m.x + cx); x < Math.min(fw, m.x + cx + cw); x++) {
            const o = (y * fw + x) * 4;
            work[o] = br;
            work[o + 1] = bg;
            work[o + 2] = bb;
          }
        }
      }
    }

    // 2. the picture, scaled up
    applyPalette(work, this.image.data, palette);
    if (effect === "lcd" || effect === "lcd-shadow") this.drawLcd(ctx, palette, scale, effect === "lcd-shadow");
    else if (effect === "smooth") this.drawSmooth(ctx, W, H);
    else {
      this.smallCtx.putImageData(this.image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, W, H);
    }

    // 3. the characters, on the parts of their cells nothing covers
    if (this.glyphs.size > 4000) this.glyphs.clear();
    const k = scale;
    for (const m of marks) {
      const g = this.glyph(m.text, m.w, m.h ?? 16, shade(m.fg, palette), k);
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        ctx.drawImage(g, cx * k, cy * k, cw * k, ch * k, (m.x + cx) * k, (m.y + cy) * k, cw * k, ch * k);
      }
    }
  }

  /**
   * The LCD look: each game pixel a cell with a fine gap round it, the dark
   * cells (optionally) casting a soft shadow on the glass behind.
   */
  private drawLcd(ctx: Ctx2D, palette: Palette, k: number, shadow: boolean): void {
    const fw = this.fw;
    const fh = this.fh;
    const W = fw * k;
    const H = fh * k;
    // the dark (and coloured) pixels alone, on a transparent layer
    if (!this.mask) {
      const s = surface(fw, fh);
      this.mask = { surface: s, ctx: s.getContext("2d") as Ctx2D, image: new ImageData(fw, fh) };
    }
    const src = this.image.data;
    const m = this.mask.image.data;
    const [lr, lg, lb] = palette.light;
    for (let i = 0; i < src.length; i += 4) {
      const off = src[i] === lr && src[i + 1] === lg && src[i + 2] === lb;
      m[i] = src[i];
      m[i + 1] = src[i + 1];
      m[i + 2] = src[i + 2];
      m[i + 3] = off ? 0 : 255;
    }
    this.mask.ctx.putImageData(this.mask.image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = css(palette.light);
    ctx.fillRect(0, 0, W, H);
    if (shadow) {
      const d = Math.max(1, Math.round(k / 6));
      ctx.globalAlpha = 0.34;
      ctx.drawImage(this.mask.surface, d, d, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.mask.surface, 0, 0, W, H);
    // the gaps between the cells
    const gap = k >= 6 ? Math.max(1, Math.round(k / 8)) : 1;
    const key = `${W}x${H}:${k}:${gap}:${palette.light.join()}:${palette.dark.join()}`;
    if (!this.grid || this.grid.key !== key) {
      const g = surface(W, H);
      const gc = g.getContext("2d") as Ctx2D;
      gc.fillStyle = css(mix(palette.light, palette.dark, 0.12));
      for (let x = 0; x < fw; x++) gc.fillRect(x * k + k - gap, 0, gap, H);
      for (let y = 0; y < fh; y++) gc.fillRect(0, y * k + k - gap, W, gap);
      this.grid = { key, surface: g };
    }
    ctx.drawImage(this.grid.surface, 0, 0);
  }

  /** Smoothed pixels: Scale2x twice (4x), then to the output size. */
  private drawSmooth(ctx: Ctx2D, W: number, H: number): void {
    const fw = this.fw;
    const fh = this.fh;
    if (!this.smooth) {
      const s = surface(fw * 4, fh * 4);
      const image = new ImageData(fw * 4, fh * 4);
      this.smooth = { surface: s, ctx: s.getContext("2d") as Ctx2D, image, mid: new Uint32Array(fw * 2 * fh * 2), out: new Uint32Array(image.data.buffer) };
    }
    const src = new Uint32Array(this.image.data.buffer);
    scale2x(src, fw, fh, this.smooth.mid);
    scale2x(this.smooth.mid, fw * 2, fh * 2, this.smooth.out);
    this.smooth.ctx.putImageData(this.smooth.image, 0, 0);
    // whole multiples stay hard-edged; other sizes are resampled smoothly
    ctx.imageSmoothingEnabled = W % (fw * 4) !== 0;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.smooth.surface, 0, 0, W, H);
  }

  private glyph(text: string, w: number, h: number, color: string, scale: number): Surface {
    const key = `${text}\u0000${w}\u0000${h}\u0000${color}\u0000${scale}`;
    let s = this.glyphs.get(key);
    if (s) return s;
    const style = this.style!;
    const f = FONTS[style];
    const u = (h / 16) * scale; // output pixels per pixel of a 16-pixel cell
    // (WenKai Mono's letters are half its em wide, narrower than the others: a larger size fills the cell)
    const spec = w === h ? `${(14.5 * u).toFixed(1)}px ${f.cjk}` : `${((style === "kai" ? 15.5 : 13) * u).toFixed(1)}px ${f.latin}`;
    // a bundled font draws once its file (or the part with this character) is in;
    // until then the fallback font stands in and is not kept
    const ready = loadSharpFont(style, spec, text, () => this.glyphs.delete(key), this.pending);
    s = surface(w * scale, h * scale);
    const ctx = s.getContext("2d") as Ctx2D;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.font = spec;
    if (w === h) {
      // full-width: fill most of the cell, like the original font
      ctx.textBaseline = "middle";
      ctx.fillText(text, 8 * u, 8.4 * u);
    } else {
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, 4 * u, 12.4 * u, 8 * u);
    }
    if (ready) this.glyphs.set(key, s);
    else this.incomplete = true;
    return s;
  }
}
