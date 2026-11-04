// A tiny pixel painter for building original template art in code.
// Pixel values: 0 white, 1 black, 2 transparent.
import type { Frame } from "../format/encode";

export const W = 0;
export const B = 1;
export const T = 2;

// Original 3x5 / 4x5 / 5x5 glyphs (uppercase, digits, a little punctuation).
const GLYPHS: Record<string, string[]> = {
  A: [".##.", "#..#", "####", "#..#", "#..#"],
  B: ["###.", "#..#", "###.", "#..#", "###."],
  C: [".###", "#...", "#...", "#...", ".###"],
  D: ["###.", "#..#", "#..#", "#..#", "###."],
  E: ["####", "#...", "###.", "#...", "####"],
  F: ["####", "#...", "###.", "#...", "#..."],
  G: [".###", "#...", "#.##", "#..#", ".###"],
  H: ["#..#", "#..#", "####", "#..#", "#..#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..##", "...#", "...#", "#..#", ".##."],
  K: ["#..#", "#.#.", "##..", "#.#.", "#..#"],
  L: ["#...", "#...", "#...", "#...", "####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  P: ["###.", "#..#", "###.", "#...", "#..."],
  Q: [".##.", "#..#", "#..#", "#.#.", ".#.#"],
  R: ["###.", "#..#", "###.", "#.#.", "#..#"],
  S: [".###", "#...", ".##.", "...#", "###."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#..#", "#..#", "#..#", "#..#", ".##."],
  V: ["#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#..#", "#..#", ".##.", "#..#", "#..#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["####", "..#.", ".#..", "#...", "####"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  "-": ["...", "...", "###", "...", "..."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  ":": [".", "#", ".", "#", "."],
  ".": [".", ".", ".", ".", "#"],
  "!": ["#", "#", "#", ".", "#"],
  ">": ["#..", ".#.", "..#", ".#.", "#.."],
  "&": [".#..", "#.#.", ".#..", "#.#.", ".#.#"],
  " ": ["..", "..", "..", "..", ".."],
};

export function glyph(ch: string): string[] {
  const g = GLYPHS[ch.toUpperCase()];
  if (!g) throw new Error(`no glyph for "${ch}"`);
  return g;
}

export class Pix {
  readonly px: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    fill = T,
  ) {
    this.px = new Uint8Array(width * height).fill(fill);
  }

  static fromArt(rows: string[]): Pix {
    const p = new Pix(Math.max(...rows.map((r) => r.length)), rows.length);
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) p.set(x, y, r[x] === "#" ? B : r[x] === "." ? W : T);
    });
    return p;
  }

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? T : this.px[y * this.width + x];
  }
  set(x: number, y: number, v: number): this {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.px[y * this.width + x] = v;
    return this;
  }
  fill(x: number, y: number, w: number, h: number, v: number): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, v = B): this {
    for (let i = x; i < x + w; i++) {
      this.set(i, y, v);
      this.set(i, y + h - 1, v);
    }
    for (let j = y; j < y + h; j++) {
      this.set(x, j, v);
      this.set(x + w - 1, j, v);
    }
    return this;
  }
  /** White box with a black border (rounded corners). */
  panel(x: number, y: number, w: number, h: number): this {
    this.fill(x, y, w, h, W).rect(x, y, w, h, B);
    this.set(x, y, T).set(x + w - 1, y, T).set(x, y + h - 1, T).set(x + w - 1, y + h - 1, T);
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, v = B): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }
  /** Copy `src`; transparent source pixels are skipped. */
  blit(src: Pix, x: number, y: number, flipX = false): this {
    for (let j = 0; j < src.height; j++)
      for (let i = 0; i < src.width; i++) {
        const v = src.get(flipX ? src.width - 1 - i : i, j);
        if (v !== T) this.set(x + i, y + j, v);
      }
    return this;
  }
  art(rows: string[], x: number, y: number): this {
    return this.blit(Pix.fromArt(rows), x, y);
  }
  /** Draw text with the template's pixel font; returns this. */
  text(s: string, x: number, y: number, v = B, spacing = 1): this {
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      g.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] === "#") this.set(cx + i, y + j, v);
      });
      cx += g[0].length + spacing;
    }
    return this;
  }
  invert(x: number, y: number, w: number, h: number): this {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const v = this.get(i, j);
        if (v !== T) this.set(i, j, v === B ? W : B);
      }
    return this;
  }
  clone(): Pix {
    const p = new Pix(this.width, this.height);
    p.px.set(this.px);
    return p;
  }
  flipped(): Pix {
    return new Pix(this.width, this.height).blit(this, 0, 0, true);
  }
  frame(): Frame {
    return { width: this.width, height: this.height, pixels: this.px.slice() };
  }
}

export function textWidth(s: string, spacing = 1): number {
  let w = 0;
  for (const ch of s) w += glyph(ch)[0].length + spacing;
  return Math.max(0, w - spacing);
}
