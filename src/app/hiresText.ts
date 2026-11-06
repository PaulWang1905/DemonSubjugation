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
import { LETTER_FONTS, loadSharpFont, type LetterFont } from "./sharpFonts";

/** Sharp text: the device's fonts (sans, serif) or fonts that come with the player. */
export type TextStyle = "sans" | "serif" | "kai" | "hei" | "song";
export const SHARP_STYLES: readonly TextStyle[] = ["sans", "serif", "kai", "hei", "song"];

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

/** A whole-number output scale, for pixel art the browser enlarges with hard edges. */
export function hiresScale(cssScale: number): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(2, Math.min(8, Math.ceil(cssScale * dpr)));
}

/**
 * Output scale for a screen shown `cssScale` times larger on this display:
 * one output pixel per screen pixel (not a whole number at most sizes), so the
 * browser shows the picture as drawn instead of resampling it, which would
 * blur the text and smear the LCD's fine gaps into grey.
 */
export function outputScale(cssScale: number, frameWidth = SCREEN_WIDTH): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  // at most 4096 output pixels across (the wider map view at high scales)
  return Math.max(1, Math.min(4096 / frameWidth, cssScale * dpr));
}

/** How strongly the LCD's lit cells and text cast their shadow, and how far. */
const SHADOW_ALPHA = 0.15;
const shadowOffset = (k: number) => Math.max(1, Math.round(k * 0.25));
/**
 * How much of the glass shows in the gaps between lit cells: enough to see
 * the cells, little enough that dark areas stay dark.
 */
const GAP_ALPHA = 0.3;

/** The gap between LCD cells, in output pixels (none when cells are too small to spare one). */
function lcdGap(k: number): number {
  return k < 3 ? 0 : Math.max(1, Math.round(k / 10));
}

const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Scale2x (EPX) on 32-bit pixels: each pixel becomes four, rounding off
 * diagonal edges but leaving lone pixels and checkerboard dithering as they are.
 * Pixels marked in `keep` (index y * w + x) are only enlarged.
 */
export function scale2x(src: Uint32Array, w: number, h: number, dst: Uint32Array, keep?: Uint8Array): void {
  const W = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      let e0 = p, e1 = p, e2 = p, e3 = p;
      // (the outermost pixels are only enlarged: nothing is known beyond them)
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && !keep?.[y * w + x]) {
        const a = src[(y - 1) * w + x]; // up
        const b = src[y * w + x + 1]; // right
        const c = src[y * w + x - 1]; // left
        const d = src[(y + 1) * w + x]; // down
        if (a !== d && c !== b) {
          if (c === a) e0 = a;
          if (a === b) e1 = b;
          if (c === d) e2 = c;
          if (d === b) e3 = b;
        }
      }
      const o = y * 2 * W + x * 2;
      dst[o] = e0;
      dst[o + 1] = e1;
      dst[o + W] = e2;
      dst[o + W + 1] = e3;
    }
  }
}

/**
 * The pixels of fine texture (grass, dithering): where more than `limit` of
 * the neighbouring pairs in the 7 x 7 square around a pixel differ (a
 * lone diagonal line differs in about a third of them, grass and dithering
 * in half or more). Smoothing
 * would turn such texture into a different pattern, so it is kept as drawn.
 */
export function busyPixels(src: Uint32Array, w: number, h: number, out: Uint8Array, limit = 0.4): void {
  // running sums of the "differs from the right / lower neighbour" maps
  const S = w + 1;
  const hs = new Int32Array(S * (h + 1));
  const vs = new Int32Array(S * (h + 1));
  for (let y = 0; y < h; y++) {
    let rh = 0;
    let rv = 0;
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      rh += x < w - 1 && src[y * w + x + 1] !== p ? 1 : 0;
      rv += y < h - 1 && src[(y + 1) * w + x] !== p ? 1 : 0;
      hs[(y + 1) * S + x + 1] = hs[y * S + x + 1] + rh;
      vs[(y + 1) * S + x + 1] = vs[y * S + x + 1] + rv;
    }
  }
  const sum = (t: Int32Array, x0: number, y0: number, x1: number, y1: number) =>
    x1 <= x0 || y1 <= y0 ? 0 : t[y1 * S + x1] - t[y0 * S + x1] - t[y1 * S + x0] + t[y0 * S + x0];
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 3);
    const y1 = Math.min(h, y + 4);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 3);
      const x1 = Math.min(w, x + 4);
      // pairs (x, x+1) with both in the square, and (y, y+1) likewise
      const hx1 = Math.min(x1, w - 1);
      const vy1 = Math.min(y1, h - 1);
      const pairs = Math.max(0, hx1 - x0) * (y1 - y0) + (x1 - x0) * Math.max(0, vy1 - y0);
      const diff = sum(hs, x0, y0, hx1, y1) + sum(vs, x0, y0, x1, vy1);
      out[y * w + x] = pairs && diff > limit * pairs ? 1 : 0;
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
  private glass: { key: string; surface: Surface } | null = null;
  private smoothBig: { surface: Surface; ctx: Ctx2D } | null = null;
  private smooth: {
    surface: Surface;
    ctx: Ctx2D;
    image: ImageData;
    mid: Uint32Array;
    out: Uint32Array;
    keep: Uint8Array;
    keep2: Uint8Array;
  } | null = null;
  private readonly pending = new Set<string>();
  /** What the last draw showed, so an unchanged frame is not drawn again. */
  private last: { frame: Uint8ClampedArray; key: string; out: HTMLCanvasElement } | null = null;
  /** A glyph in the last draw used a stand-in font (its own was still loading). */
  private incomplete = false;

  /** `style` null: keep the game's own pixel text (only the picture effect applies). */
  private letters: LetterFont = "auto";

  /** Draw letters in their own font ("auto": the style's). */
  setLetters(id: LetterFont): void {
    if (id === this.letters) return;
    this.letters = id;
    this.glyphs.clear();
    this.last = null;
  }

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
    this.glass = null;
    this.smooth = null;
    this.smoothBig = null;
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
    // (with the game's own pixel text, the characters' cells are only kept unsmoothed)
    const cells = marks;
    if (!this.style) marks = [];
    this.size(fw, fh);
    const W = Math.round(fw * scale);
    const H = Math.round(fh * scale);
    let resized = false;
    if (out.width !== W || out.height !== H) {
      out.width = W;
      out.height = H;
      resized = true;
    }
    const ctx = out.getContext("2d")!;

    // nothing changed since this drew the canvas last (a still scene, a menu): keep it
    const key = `${scale}:${effect}:${palette.id}:${cells.map((m) => `${m.x},${m.y},${m.w},${m.h},${m.fg},${m.bg},${m.text},${m.hidden}`).join(";")}`;
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
    const lcd = effect === "lcd" || effect === "lcd-shadow";
    if (lcd) this.drawLcd(ctx, palette, W, H, effect === "lcd-shadow");
    else if (effect === "smooth") this.drawSmooth(ctx, W, H, cells);
    else {
      this.smallCtx.putImageData(this.image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, W, H);
    }

    // 3. the characters, on the parts of their cells nothing covers
    if (this.glyphs.size > 4000) this.glyphs.clear();
    const k = scale;
    // (game pixel edges on whole output pixels, the same as the picture's)
    const X = (x: number) => Math.round((x * W) / fw);
    const Y = (y: number) => Math.round((y * H) / fh);
    // (on the LCD with shadow, the characters cast one too)
    const d = effect === "lcd-shadow" ? shadowOffset(k) : 0;
    for (const m of marks) {
      const g = this.glyph(m.text, m.w, m.h ?? 16, shade(m.fg, palette), k);
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        const x0 = X(m.x + cx);
        const y0 = Y(m.y + cy);
        const dw = X(m.x + cx + cw) - x0;
        const dh = Y(m.y + cy + ch) - y0;
        if (d) {
          ctx.globalAlpha = SHADOW_ALPHA;
          ctx.drawImage(g, cx * k, cy * k, cw * k, ch * k, x0 + d, y0 + d, dw, dh);
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(g, cx * k, cy * k, cw * k, ch * k, x0, y0, dw, dh);
      }
    }
    if (lcd) this.lcdGaps(ctx, palette, W, H);
  }

  /**
   * The LCD look, in three layers like the real screen: the glass (with a
   * faint outline of every cell), the soft shadow the lit cells cast on it,
   * and the lit cells themselves, solid and edged on whole output pixels. The
   * gaps between lit cells are drawn after the text (lcdGaps), so Sharp text
   * sits on the same screen.
   */
  private drawLcd(ctx: Ctx2D, palette: Palette, W: number, H: number, shadow: boolean): void {
    const fw = this.fw;
    const fh = this.fh;
    const k = W / fw;
    const X = (x: number) => Math.round((x * W) / fw);
    const Y = (y: number) => Math.round((y * H) / fh);
    const src = this.image.data;
    const [lr, lg, lb] = palette.light;
    const isOff = (i: number) => src[i] === lr && src[i + 1] === lg && src[i + 2] === lb;

    // the glass: background colour, a slight darkening towards the edges and
    // a barely visible outline of the unlit cells (cached)
    const gap = lcdGap(k);
    const key = `${W}x${H}:${fw}x${fh}:${palette.light.join()}:${palette.dark.join()}`;
    if (!this.glass || this.glass.key !== key) {
      const g = surface(W, H);
      const gc = g.getContext("2d") as Ctx2D;
      gc.fillStyle = css(palette.light);
      gc.fillRect(0, 0, W, H);
      const v = gc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.05)");
      gc.fillStyle = v;
      gc.fillRect(0, 0, W, H);
      if (gap) {
        const [dr, dg, db] = palette.dark;
        gc.fillStyle = `rgba(${dr},${dg},${db},0.04)`;
        for (let x = 1; x < fw; x++) gc.fillRect(X(x) - gap, 0, gap, H);
        for (let y = 1; y < fh; y++) gc.fillRect(0, Y(y) - gap, W, gap);
      }
      this.glass = { key, surface: g };
    }
    ctx.drawImage(this.glass.surface, 0, 0);

    if (shadow) {
      // the lit pixels alone, drawn up with smoothing so the shadow is soft
      if (!this.mask) {
        const s = surface(fw, fh);
        this.mask = { surface: s, ctx: s.getContext("2d") as Ctx2D, image: new ImageData(fw, fh) };
      }
      const m = this.mask.image.data;
      for (let i = 0; i < src.length; i += 4) {
        m[i] = src[i];
        m[i + 1] = src[i + 1];
        m[i + 2] = src[i + 2];
        m[i + 3] = isOff(i) ? 0 : 255;
      }
      this.mask.ctx.putImageData(this.mask.image, 0, 0);
      const d = shadowOffset(k);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = SHADOW_ALPHA;
      ctx.drawImage(this.mask.surface, d, d, W, H);
      ctx.globalAlpha = 1;
    }

    // the lit cells: runs of one colour in each row, as rectangles
    const paths = new Map<number, Path2D>();
    for (let y = 0; y < fh; y++) {
      const y0 = Y(y);
      const y1 = Y(y + 1);
      let x = 0;
      while (x < fw) {
        const i = (y * fw + x) * 4;
        if (isOff(i)) {
          x++;
          continue;
        }
        const c = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
        let e = x + 1;
        while (e < fw) {
          const j = (y * fw + e) * 4;
          if (isOff(j) || ((src[j] << 16) | (src[j + 1] << 8) | src[j + 2]) !== c) break;
          e++;
        }
        let p = paths.get(c);
        if (!p) paths.set(c, (p = new Path2D()));
        p.rect(X(x), y0, X(e) - X(x), y1 - y0);
        x = e;
      }
    }
    for (const [c, p] of paths) {
      ctx.fillStyle = `rgb(${c >> 16},${(c >> 8) & 0xff},${c & 0xff})`;
      ctx.fill(p);
    }
  }

  /**
   * The thin gaps between the LCD's cells, in the glass colour and partly
   * see-through: they show between lit cells (and across Sharp text) and
   * vanish on the unlit background.
   */
  private lcdGaps(ctx: Ctx2D, palette: Palette, W: number, H: number): void {
    const fw = this.fw;
    const fh = this.fh;
    const gap = lcdGap(W / fw);
    if (!gap) return;
    const X = (x: number) => Math.round((x * W) / fw);
    const Y = (y: number) => Math.round((y * H) / fh);
    const key = `${W}x${H}:${fw}x${fh}:${palette.light.join()}`;
    if (!this.grid || this.grid.key !== key) {
      const g = surface(W, H);
      const gc = g.getContext("2d") as Ctx2D;
      const [lr, lg, lb] = palette.light;
      gc.fillStyle = `rgba(${lr},${lg},${lb},${GAP_ALPHA})`;
      for (let x = 1; x < fw; x++) gc.fillRect(X(x) - gap, 0, gap, H);
      for (let y = 1; y < fh; y++) {
        // (the crossings are not drawn twice, so they are no lighter)
        for (let x = 0; x < fw; x++) gc.fillRect(X(x), Y(y) - gap, X(x + 1) - X(x) - (x < fw - 1 ? gap : 0), gap);
      }
      this.grid = { key, surface: g };
    }
    ctx.drawImage(this.grid.surface, 0, 0);
  }

  /**
   * Smoothed pixels: Scale2x twice (4x), enlarged by whole pixels and then
   * resampled smoothly to the output size. Fine texture and the text cells
   * are left as drawn: smoothing would change the pattern of the one and
   * break up the strokes of the pixel font in the other.
   */
  private drawSmooth(ctx: Ctx2D, W: number, H: number, cells: TextMark[]): void {
    const fw = this.fw;
    const fh = this.fh;
    if (!this.smooth) {
      const s = surface(fw * 4, fh * 4);
      const image = new ImageData(fw * 4, fh * 4);
      this.smooth = {
        surface: s,
        ctx: s.getContext("2d") as Ctx2D,
        image,
        mid: new Uint32Array(fw * 2 * fh * 2),
        out: new Uint32Array(image.data.buffer),
        keep: new Uint8Array(fw * fh),
        keep2: new Uint8Array(fw * 2 * fh * 2),
      };
    }
    const sm = this.smooth;
    const src = new Uint32Array(this.image.data.buffer);
    const keep = sm.keep;
    busyPixels(src, fw, fh, keep);
    for (const m of cells) {
      for (const [cx, cy, cw, ch] of visibleRects(m)) {
        for (let y = Math.max(0, m.y + cy); y < Math.min(fh, m.y + cy + ch); y++) {
          keep.fill(1, y * fw + Math.max(0, m.x + cx), y * fw + Math.min(fw, m.x + cx + cw));
        }
      }
    }
    const keep2 = sm.keep2;
    for (let y = 0; y < fh * 2; y++) {
      for (let x = 0; x < fw * 2; x++) keep2[y * fw * 2 + x] = keep[(y >> 1) * fw + (x >> 1)];
    }
    scale2x(src, fw, fh, sm.mid, keep);
    scale2x(sm.mid, fw * 2, fh * 2, sm.out, keep2);
    sm.ctx.putImageData(sm.image, 0, 0);
    // (to the next whole multiple above the output size, then down to it)
    const n = Math.ceil(W / (fw * 4));
    if (n * fw * 4 === W || n < 2) {
      ctx.imageSmoothingEnabled = n * fw * 4 !== W;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sm.surface, 0, 0, W, H);
      return;
    }
    // whole pixels first, so the last smooth step only softens the edges a little
    const bw = fw * 4 * n;
    const bh = fh * 4 * n;
    if (!this.smoothBig || this.smoothBig.surface.width !== bw || this.smoothBig.surface.height !== bh) {
      const b = surface(bw, bh);
      this.smoothBig = { surface: b, ctx: b.getContext("2d") as Ctx2D };
    }
    this.smoothBig.ctx.imageSmoothingEnabled = false;
    this.smoothBig.ctx.drawImage(sm.surface, 0, 0, bw, bh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.smoothBig.surface, 0, 0, W, H);
  }

  private glyph(text: string, w: number, h: number, color: string, scale: number): Surface {
    const key = `${text}\u0000${w}\u0000${h}\u0000${color}\u0000${scale}`;
    let s = this.glyphs.get(key);
    if (s) return s;
    const style = this.style!;
    const f = FONTS[style];
    const u = (h / 16) * scale; // output pixels per pixel of a 16-pixel cell
    const lf = w !== h && this.letters !== "auto" ? LETTER_FONTS.find((l) => l.id === this.letters) : undefined;
    // (WenKai Mono's letters are half its em wide, narrower than the others: a larger size fills the cell)
    const spec =
      w === h
        ? `${(14.5 * u).toFixed(1)}px ${f.cjk}`
        : lf
          ? `${(lf.size * u).toFixed(1)}px ${lf.family}, ${f.latin}`
          : `${((style === "kai" ? 15.5 : 13) * u).toFixed(1)}px ${f.latin}`;
    // a bundled font draws once its file (or the part with this character) is in;
    // until then the fallback font stands in and is not kept
    const ready = loadSharpFont(lf ? `letters:${lf.id}` : style, spec, text, () => this.glyphs.delete(key), this.pending);
    s = surface(Math.ceil(w * scale), Math.ceil(h * scale));
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
