// SRS animations: decodeSrs -> encodeSrsParts round-trips, on the demo game
// and (opt-in) on every archive under FMJ_COMPAT_DIR / FMJ_DATA_DIR.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeSrs, srsDamaged, srsWarnings } from "../src/editor/format/decode";
import { encodeSrsParts } from "../src/editor/format/encode";
import { readLib, type LibArchive } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { ResSrs } from "../src/engine/fmj/lib/ResSrs";

function check(lib: LibArchive): { count: number; damaged: number; bad: string[] } {
  const bad: string[] = [];
  let count = 0;
  let damaged = 0;
  for (const e of lib.entries) {
    if (e.resType !== 5) continue;
    if (srsDamaged(e.data)) {
      damaged++;
      continue;
    }
    count++;
    const d = decodeSrs(e.data);
    let out: Uint8Array;
    try {
      out = encodeSrsParts(d);
    } catch (err) {
      bad.push(`${e.type}-${e.index}: ${(err as Error).message}`);
      continue;
    }
    // The stored extent may carry padding after the last image.
    if (out.length > e.data.length || !out.every((v, i) => v === e.data[i])) bad.push(`${e.type}-${e.index}: bytes differ`);
  }
  return { count, damaged, bad };
}

describe("SRS format", () => {
  it("round-trips the demo game's animations", () => {
    const { count, bad } = check(lanternPath());
    expect(count).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it("reports the frames on screen as the animation plays", () => {
    const d = decodeSrs(lanternPath().entries.find((e) => e.resType === 5)!.data);
    const bytes = encodeSrsParts({
      ...d,
      frames: [
        { x: 0, y: 0, show: 3, next: 2, image: 0 },
        { x: 4, y: 0, show: 2, next: 2, image: 0 },
      ],
      end: 1,
    });
    const s = new ResSrs();
    s.setData(new Int8Array(bytes.buffer), 0);
    s.start();
    const seen: number[][] = [s.visibleFrames()];
    while (s.update(40)) seen.push(s.visibleFrames());
    expect(seen).toEqual([[0], [0], [0, 1], [1]]);
  });

  it("keeps odd values the engine tolerates, and warns about them", () => {
    const d = decodeSrs(lanternPath().entries.find((e) => e.resType === 5)!.data);
    const odd = {
      ...d,
      frames: [
        { x: 0, y: 0, show: 2, next: 0, image: d.images.length },
        { x: 0, y: 0, show: 0, next: 1, image: 0 },
      ],
    };
    const again = decodeSrs(encodeSrsParts(odd));
    expect(again.frames).toEqual(odd.frames);
    expect(srsWarnings(again)).toEqual([
      `Frame 1 uses image ${d.images.length + 1}, which does not exist (nothing is drawn).`,
      "Frame 1 has Next 0, so the animation stops after it.",
      "Frame 2 shows for 0 ticks, so it never appears.",
    ]);
    expect(() => encodeSrsParts({ ...d, frames: [{ x: 256, y: 0, show: 1, next: 1, image: 0 }] })).toThrow(/frame 1 x/);
  });

  it("keeps images an archive declares but does not store", () => {
    const d = decodeSrs(lanternPath().entries.find((e) => e.resType === 5)!.data);
    const bytes = encodeSrsParts(d);
    bytes[3] += 2; // claim two more images than are stored
    const cut = decodeSrs(bytes);
    expect(cut.missingImages).toBe(2);
    expect(encodeSrsParts(cut)).toEqual(bytes);
  });
});

const dirs = [process.env.FMJ_COMPAT_DIR, process.env.FMJ_DATA_DIR].filter(Boolean) as string[];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    try {
      return statSync(p).isDirectory() ? walk(p) : /\.lib$/i.test(n) ? [p] : [];
    } catch {
      return []; // broken link
    }
  });

describe.skipIf(dirs.length === 0)("SRS round-trip on real archives", () => {
  it("re-encodes every animation byte for byte", () => {
    let total = 0;
    let damaged = 0;
    const bad: string[] = [];
    for (const f of dirs.flatMap((d) => (existsSync(d) ? walk(d) : []))) {
      let lib;
      try {
        lib = readLib(new Uint8Array(readFileSync(f)));
      } catch {
        continue;
      }
      const r = check(lib);
      total += r.count;
      damaged += r.damaged;
      bad.push(...r.bad.map((b) => `${f}: ${b}`));
    }
    console.log(`SRS animations checked: ${total}, damaged (skipped): ${damaged}, mismatches: ${bad.length}`);
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
