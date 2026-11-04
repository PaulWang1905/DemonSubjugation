// Dev tool: for every playable *.lib under FMJ_COMPAT_DIR, rewrite it with the
// editor's writer and check the copy has the same resources and plays
// frame-for-frame the same. Needs FMJ_DATA_DIR for fonts.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, inspectDatLib, Keys } from "../src/engine";
import { readLib, writeLib } from "../src/editor/format/lib";
import { loadRealResources, memorySaves } from "./helpers";

const dir = process.env.FMJ_COMPAT_DIR;
const fonts = loadRealResources();

function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.lib$/i.test(n) ? [p] : [];
  });
}

function trace(datLib: Uint8Array): string {
  let s = 1;
  const e = createEngine({
    resources: { datLib, hzk16: fonts!.hzk16, asc16: fonts!.asc16 },
    saves: memorySaves(),
    random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32),
  });
  const h = createHash("sha1");
  const press = (k: number) => {
    e.keyDown(k as never);
    e.update();
    e.keyUp(k as never);
    e.update();
  };
  const dirs = [Keys.RIGHT, Keys.DOWN, Keys.LEFT, Keys.UP];
  try {
    for (let i = 0; i < 300; i++) e.update();
    press(Keys.ENTER);
    for (let i = 0; i < 2000; i++) {
      if (i % 5 === 0) press(Keys.ENTER);
      else if (i % 13 === 0) press(Keys.CANCEL);
      else if (i % 3 === 0) press(dirs[Math.floor(i / 40) % 4]);
      else e.update();
      if (i % 10 === 0) h.update(e.render());
    }
  } catch (err) {
    h.update("ERR " + (err as Error).message);
  }
  h.update([...e.checkScripts()].sort().join("|"));
  return h.digest("hex");
}

describe.skipIf(!dir || !fonts)("LIB writer round-trip on real archives", () => {
  it("rewritten archives play identically and grow by at most one block", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of walk(dir!)) {
      const b = new Uint8Array(readFileSync(f));
      if (!inspectDatLib(b).playable) continue;
      checked++;
      const out = writeLib(readLib(b));
      // The original tool sometimes packs a little tighter; allow one block.
      if (out.length > Math.ceil(b.length / 0x4000) * 0x4000 + 0x4000) bad.push(`${f}: grew ${b.length} -> ${out.length}`);
      if (trace(b) !== trace(out)) bad.push(`${f}: plays differently`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 1_800_000);
});
