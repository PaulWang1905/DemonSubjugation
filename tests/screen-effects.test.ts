// The Smooth picture effect (Scale2x, src/app/hiresText.ts).
import { describe, expect, it } from "vitest";
import { busyPixels, scale2x } from "../src/app/hiresText";

const grid = (rows: string[]) => Uint32Array.from(rows.join("").split(""), (c) => (c === "#" ? 1 : 0));
function smooth(rows: string[]): Uint32Array {
  const out = new Uint32Array(rows.length * rows[0].length * 4);
  scale2x(grid(rows), rows[0].length, rows.length, out);
  return out;
}
/** Plain 2x enlargement, for comparison. */
function enlarge(rows: string[]): Uint32Array {
  const w = rows[0].length;
  const src = grid(rows);
  const out = new Uint32Array(src.length * 4);
  for (let y = 0; y < rows.length * 2; y++) for (let x = 0; x < w * 2; x++) out[y * w * 2 + x] = src[(y >> 1) * w + (x >> 1)];
  return out;
}

describe("Scale2x smoothing", () => {
  it("keeps checkerboard dithering and lone pixels exactly", () => {
    const checker = ["#.#.#.", ".#.#.#", "#.#.#.", ".#.#.#", "#.#.#.", ".#.#.#"];
    expect(Array.from(smooth(checker))).toEqual(Array.from(enlarge(checker)));
    const dot = [".....", ".....", "..#..", ".....", "....."];
    expect(Array.from(smooth(dot))).toEqual(Array.from(enlarge(dot)));
  });

  it("rounds off diagonal edges, inside the original shape's outline", () => {
    const stair = ["......", ".#....", ".##...", ".###..", ".####.", "......"];
    const s = smooth(stair);
    const e = enlarge(stair);
    expect(Array.from(s)).not.toEqual(Array.from(e));
    // only pixels along the diagonal change; the inked area stays about the same
    const ink = (a: Uint32Array) => a.reduce((n, v) => n + v, 0);
    expect(Math.abs(ink(s) - ink(e))).toBeLessThanOrEqual(8);
  });
});

describe("fine texture is kept as drawn", () => {
  const busy = (rows: string[]) => {
    const w = rows[0].length;
    const out = new Uint8Array(w * rows.length);
    busyPixels(grid(rows), w, rows.length, out);
    return out;
  };
  /** Away from the picture's edge (which is never smoothed anyway). */
  const inner = (rows: string[]) => {
    const w = rows[0].length;
    const b = busy(rows);
    return Array.from(b).filter((_, i) => i % w > 0 && i % w < w - 1 && i >= w && i < b.length - w);
  };

  it("finds dithering and diagonal hatching", () => {
    const checker = Array.from({ length: 8 }, (_, y) => (y % 2 ? ".#.#.#.#" : "#.#.#.#."));
    expect(busy(checker).every((v) => v === 1)).toBe(true);
    const hatch = Array.from({ length: 8 }, (_, y) => "#..#..#..#..".slice(y % 3, y % 3 + 8));
    expect(busy(hatch)[3 * 8 + 3]).toBe(1);
  });

  it("leaves shapes, outlines and thin diagonal lines to be smoothed", () => {
    const shape = ["........", "..####..", ".######.", ".######.", ".######.", "..####..", "........", "........"];
    expect(inner(shape).some((v) => v === 1)).toBe(false);
    // a line from corner to corner of a 16 x 16 picture
    const line = Array.from({ length: 16 }, (_, y) => ".".repeat(y) + "#" + ".".repeat(15 - y));
    expect(inner(line).some((v) => v === 1)).toBe(false);
  });

  it("only enlarges the pixels marked to keep", () => {
    const stair = ["......", ".#....", ".##...", ".###..", ".####.", "......"];
    const out = new Uint32Array(36 * 4);
    scale2x(grid(stair), 6, 6, out, new Uint8Array(36).fill(1));
    expect(Array.from(out)).toEqual(Array.from(enlarge(stair)));
  });
});
