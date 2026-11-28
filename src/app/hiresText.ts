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
import { SmoothCpu, SmoothGL } from "./smoothScale";

/** Sharp text: the device's fonts (sans, serif) or fonts that come with the player. */
export type TextStyle = "sans" | "serif" | "kai" | "hei" | "song";
export const SHARP_STYLES: readonly TextStyle[] = ["sans", "serif", "kai", "hei", "song"];

/** How the picture is scaled up. */
/** ("smooth-keep": Smooth, with dithering and texture kept as their pixels) */
export type ScreenEffect = "none" | "lcd" | "lcd-shadow" | "smooth" | "smooth-keep";

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
  /** Smooth on the GPU (null: not tried yet; false: not to be had, drawn on the CPU). */
  private smoothGL: SmoothGL | null | false = null;
  /** Smooth without WebGL: the picture at 4x. */
  private smooth: { surface: Surface; ctx: Ctx2D; image: ImageData; src: Uint8Array; cpu: SmoothCpu } | null = null;
  private readonly pending = new Set<string>();
  /** What the last draw showed, so an unchanged frame is not drawn again. */
  private last: { frame: Uint8ClampedArray; key: string; out: HTMLCanvasElement } | null = null;
  /** A glyph in the last draw used a stand-in font (its own was still loading). */
  private incomplete = false;
  /** Whether the last draw is to be drawn again (a font it needed was still loading). */
  get stale(): boolean {
    return this.incomplete;
  }

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
    // (the game's own pixel text is part of the picture)
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
    const lcd = effect === "lcd" || effect === "lcd-shadow";
    if (lcd) this.drawLcd(ctx, palette, W, H, effect === "lcd-shadow");
    else if (effect === "smooth" || effect === "smooth-keep") this.drawSmooth(ctx, palette, W, H, effect === "smooth-keep");
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
   * Smoothed pixels (src/app/smoothScale.ts): edges found at 4x and drawn as
   * smooth contours at the output size, on the GPU. Without a GPU, the same
   * at 4x on the CPU, enlarged smoothly by the browser. With `keep`, dithering
   * and texture keep their pixels.
   */
  private drawSmooth(ctx: Ctx2D, palette: Palette, W: number, H: number, keep: boolean): void {
    const fw = this.fw;
    const fh = this.fh;
    if (this.smoothGL === null) this.smoothGL = SmoothGL.create() ?? false;
    if (this.smoothGL && this.smoothGL.lost) this.smoothGL = false;
    if (this.smoothGL) {
      try {
        ctx.drawImage(this.smoothGL.draw(this.work, fw, fh, W, H, palette.light, palette.dark, keep), 0, 0);
        return;
      } catch (e) {
        console.warn("Smooth: drawing without WebGL", e);
        this.smoothGL = false;
      }
    }
    if (!this.smooth) {
      const s = surface(fw * 4, fh * 4);
      this.smooth = { surface: s, ctx: s.getContext("2d") as Ctx2D, image: new ImageData(fw * 4, fh * 4), src: new Uint8Array(fw * fh), cpu: new SmoothCpu() };
    }
    const sm = this.smooth;
    const work = this.work;
    let red = false;
    for (let i = 0; i < fw * fh; i++) {
      sm.src[i] = work[i * 4] === 0 && work[i * 4 + 1] === 0 ? 1 : 0;
      if (work[i * 4] === 255 && work[i * 4 + 1] === 0) red = true;
    }
    const word = ([r, g, b]: readonly number[]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const out = new Uint32Array(sm.image.data.buffer);
    sm.cpu.draw(sm.src, fw, fh, word(palette.dark), word(palette.light), out, keep);
    // (red pixels, as they are)
    if (red) {
      for (let i = 0; i < fw * fh; i++) {
        if (work[i * 4] !== 255 || work[i * 4 + 1] !== 0) continue;
        const o = Math.floor(i / fw) * 16 * fw + (i % fw) * 4;
        for (let k = 0; k < 16; k++) out[o + (k >> 2) * fw * 4 + (k & 3)] = 0xff0000ff;
      }
    }
    sm.ctx.putImageData(sm.image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sm.surface, 0, 0, W, H);
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
