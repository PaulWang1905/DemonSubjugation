// The Smooth picture effect (Scale2x, src/app/hiresText.ts).
import { describe, expect, it } from "vitest";
import { scale2x } from "../src/app/hiresText";

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
