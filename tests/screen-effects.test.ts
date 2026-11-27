// The Smooth picture effect (src/app/smoothScale.ts): xBR at 4x on the two
// colours, a small blur and a contour cut at the output size.
import { describe, expect, it } from "vitest";
import { SmoothCpu, smoothContour, smoothCpu, smoothField, xbr4 } from "../src/app/smoothScale";

const grid = (rows: string[]) => Uint8Array.from(rows.join("").split(""), (c) => (c === "#" ? 1 : 0));
const size = (rows: string[]) => [rows[0].length, rows.length] as const;
/** Plain 4x enlargement, for comparison. */
function enlarge(rows: string[]): Uint8Array {
  const [w, h] = size(rows);
  const src = grid(rows);
  const out = new Uint8Array(w * h * 16);
  for (let y = 0; y < h * 4; y++) for (let x = 0; x < w * 4; x++) out[y * w * 4 + x] = src[(y >> 2) * w + (x >> 2)];
  return out;
}
const mask = (rows: string[]) => xbr4(grid(rows), ...size(rows));
/** Ink coverage at `s` output pixels per pixel. */
const smooth = (rows: string[], s: number) => smoothCpu(grid(rows), ...size(rows), s);
const checker = (n: number) => Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => ((x + y) % 2 ? "." : "#")).join(""));
/** A disc of radius r (in pixels) in an n x n picture. */
const disc = (n: number, r: number) =>
  Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) <= r ? "#" : ".")).join(""));
/** A one-pixel line from the top-left corner down to the right. */
const diagonal = (n: number) => Array.from({ length: n }, (_, y) => ".".repeat(y) + "#" + ".".repeat(n - 1 - y));
/** A glyph-like shape: one-pixel strokes, a box with a cross stroke and a slanted tail. */
const glyph = [
  "................",
  "....#...........",
  "....#...........",
  "..##########....",
  "....#.......#...",
  "....#.......#...",
  "..##########....",
  "....#...........",
  "....#.....#.....",
  "....#......#....",
  "....#.......#...",
  "...#.........#..",
  "..#.............",
  ".#..............",
  "................",
  "................",
];

describe("the 4x mask (xBR on two colours)", () => {
  it("keeps checkerboard dithering, stripes and lone pixels exactly", () => {
    for (const rows of [checker(8), ["#.#.#.#.", "#.#.#.#.", "#.#.#.#.", "#.#.#.#."], [".....", ".....", "..#..", ".....", "....."]]) {
      expect(Array.from(mask(rows))).toEqual(Array.from(enlarge(rows)));
    }
  });

  it("turns the steps of a diagonal into a slope and never changes a pixel's middle", () => {
    const rows = diagonal(8);
    const m = mask(rows);
    expect(Array.from(m)).not.toEqual(Array.from(enlarge(rows)));
    // (the middle 2 x 2 cells of every pixel are the pixel's colour, on any picture)
    let seed = 1;
    const noise = Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >> 16) & 1 ? "#" : ".").join(""));
    for (const r of [rows, noise, glyph, disc(16, 6)]) {
      const [w, h] = size(r);
      const src = grid(r);
      const out = mask(r);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (const [dx, dy] of [[1, 1], [2, 1], [1, 2], [2, 2]]) expect(out[(y * 4 + dy) * w * 4 + x * 4 + dx]).toBe(src[y * w + x]);
    }
  });

  it("is the same for both colours (ink on paper or paper on ink)", () => {
    for (const rows of [glyph, disc(16, 6), diagonal(10)]) {
      const inverse = rows.map((r) => r.replace(/[#.]/g, (c) => (c === "#" ? "." : "#")));
      expect(Array.from(mask(inverse))).toEqual(Array.from(mask(rows), (v) => 1 - v));
    }
  });
});

describe("the smoothed picture", () => {
  const s = 8;
  /** For each output row, where the ink starts (the first pixel at least half covered). */
  const starts = (cov: ArrayLike<number>, W: number, rows: [number, number]) =>
    Array.from({ length: rows[1] - rows[0] }, (_, k) => {
      const Y = rows[0] + k;
      let X = 0;
      while (X < W && cov[Y * W + X] < 0.5) X++;
      return X;
    });

  it("is the same every time", () => {
    expect(Array.from(smooth(glyph, 6.5))).toEqual(Array.from(smooth(glyph, 6.5)));
  });

  it("draws a diagonal line as a straight slope, without steps", () => {
    const n = 16;
    const cov = smooth(diagonal(n), s);
    const W = n * s;
    // (away from the ends) the ink starts one output pixel further right on each row
    const st = starts(cov, W, [3 * s, (n - 3) * s]);
    const jumps = st.slice(1).map((v, i) => v - st[i]);
    expect(Math.max(...jumps)).toBeLessThanOrEqual(2);
    expect(Math.min(...jumps)).toBeGreaterThanOrEqual(0);
    // (enlarged, it would jump by a whole pixel every eighth row)
    const nearest = starts(enlarge(diagonal(n)), n * 4, [12, (n - 3) * 4]);
    expect(Math.max(...nearest.slice(1).map((v, i) => v - nearest[i]))).toBe(4);
  });

  it("draws a disc as a round shape", () => {
    const n = 20;
    const r = 7;
    const cov = smooth(disc(n, r), s);
    const W = n * s;
    // the edge's distance from the centre, all the way round
    const radii: number[] = [];
    for (let a = 0; a < 360; a += 3) {
      const dx = Math.cos((a * Math.PI) / 180);
      const dy = Math.sin((a * Math.PI) / 180);
      let d = 0;
      while (cov[Math.floor(W / 2 + dy * d) * W + Math.floor(W / 2 + dx * d)] >= 0.5) d += 0.25;
      radii.push(d / s);
    }
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.75);
    expect(Math.abs(radii.reduce((a, b) => a + b) / radii.length - r)).toBeLessThan(0.5);
  });

  it("keeps checkerboard dithering a regular pattern", () => {
    const n = 12;
    const cov = smooth(checker(n), s);
    const W = n * s;
    // every pixel of the dither looks the same (away from the picture's edge), and its middle is its colour
    for (let y = 2; y < n - 2; y++) {
      for (let x = 2; x < n - 2; x++) {
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const v = cov[(y * s + dy) * W + x * s + dx];
            const ref = cov[(2 * s + dy) * W + 2 * s + dx];
            expect(Math.abs(v - ((x + y) % 2 ? 1 - ref : ref))).toBeLessThan(1e-6);
          }
        }
        expect(cov[(y * s + s / 2) * W + x * s + s / 2] > 0.5).toBe((x + y) % 2 === 0);
      }
    }
  });

  it("keeps a lone pixel, round, in its place", () => {
    const rows = [".......", ".......", ".......", "...#...", ".......", ".......", "......."];
    const cov = smooth(rows, s);
    const W = 7 * s;
    const ink = Array.from(cov).reduce((a, v) => a + v, 0) / (s * s);
    expect(ink).toBeGreaterThan(0.6);
    expect(ink).toBeLessThan(1.1);
    // symmetric about its middle
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) expect(Math.abs(cov[y * W + x] - cov[y * W + (W - 1 - x)])).toBeLessThan(1e-6);
    expect(cov[(3 * s + s / 2) * W + 3 * s + s / 2]).toBe(1);
  });

  it("keeps a glyph's strokes whole and straight", () => {
    const cov = smooth(glyph, s);
    const W = 16 * s;
    const src = grid(glyph);
    // every inked pixel's middle stays inked, every blank pixel's middle blank
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(cov[(y * s + s / 2) * W + x * s + s / 2] > 0.5).toBe(src[y * 16 + x] === 1);
    // a horizontal one-pixel stroke stays one pixel thick and straight along its length
    for (let X = 6 * s; X < 11 * s; X++) {
      let n = 0;
      for (let Y = 2 * s; Y < 5 * s; Y++) n += cov[Y * W + X];
      expect(Math.abs(n - s)).toBeLessThan(0.75);
    }
  });

  it("shows no seams where tiles meet", () => {
    // a tile of grass-like texture repeated 4 x 4: the tiles away from the picture's edge look the same
    const tile = ["#..#.##.", ".##..#..", "#..##..#", "..#..#.#", ".#.#..#.", "##..#...", "..#.##.#", "#....#.."];
    const rows = Array.from({ length: 32 }, (_, y) => tile[y % 8].repeat(4));
    const cov = smooth(rows, s);
    const W = 32 * s;
    const T = 8 * s;
    for (let y = T; y < 2 * T; y++) {
      for (let x = T; x < 2 * T; x++) {
        expect(Math.abs(cov[y * W + x] - cov[y * W + x + T])).toBeLessThan(1e-6);
        expect(Math.abs(cov[y * W + x] - cov[(y + T) * W + x])).toBeLessThan(1e-6);
      }
    }
  });

  it("only mixes the two colours, and flat areas are exactly one of them", () => {
    const cov = smooth(glyph, 7.3);
    expect(cov.every((v) => v >= 0 && v <= 1)).toBe(true);
    const W = Math.round(16 * 7.3);
    expect(cov[0]).toBe(0);
    expect(cov[W * W - 1]).toBe(0);
    const field = smoothField(grid(checker(6)), 6, 6);
    expect(smoothContour(field, 6, 6, 4).every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("is drawn the same without WebGL, at 4x in the palette's two colours", () => {
    // (ink and paper as RGBA words: the paper's channels say how much ink there is)
    const ink = 0xff102030, paper = 0xfff0e0d0;
    for (const rows of [glyph, disc(16, 6), checker(8)]) {
      const [w, h] = size(rows);
      const out = new Uint32Array(w * h * 16);
      new SmoothCpu().draw(grid(rows), w, h, ink, paper, out);
      const cov = smooth(rows, 4);
      for (let i = 0; i < out.length; i++) {
        const k = cov[i];
        expect(Math.abs((out[i] & 0xff) - (0xd0 * (1 - k) + 0x30 * k))).toBeLessThanOrEqual(1);
        expect(Math.abs(((out[i] >>> 16) & 0xff) - (0xf0 * (1 - k) + 0x10 * k))).toBeLessThanOrEqual(1);
        expect(out[i] >>> 24).toBe(0xff);
      }
      // (only the two colours where nothing is near an edge)
      const words = new Set(out);
      expect(words.has(ink >>> 0) && words.has(paper >>> 0)).toBe(true);
    }
  });
});
