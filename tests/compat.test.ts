// Dev tool: boots every *.lib under FMJ_COMPAT_DIR (fonts from FMJ_DATA_DIR),
// compiles all scripts and plays a few thousand ticks with scripted input.
// Writes a report to FMJ_COMPAT_REPORT if set. Skipped otherwise.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, inspectDatLib, Keys } from "../src/engine";
import { loadRealResources, memorySaves } from "./helpers";

const dir = process.env.FMJ_COMPAT_DIR;
const fonts = loadRealResources();

function walk(d: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.lib$/i.test(n)) out.push(p);
  }
  return out;
}

describe.skipIf(!dir || !fonts)("compatibility sweep", () => {
  it("runs every archive", () => {
    const rows: { file: string; scripts: string; play: string }[] = [];
    for (const file of walk(dir!)) {
      const datLib = new Uint8Array(readFileSync(file));
      let scripts = "";
      let play = "ok";
      if (!inspectDatLib(datLib).playable) {
        rows.push({ file: file.slice(dir!.length + 1), scripts: "-", play: "rejected at import (not playable)" });
        continue;
      }
      try {
        let s = 1;
        const e = createEngine({
          resources: { datLib, hzk16: fonts!.hzk16, asc16: fonts!.asc16 },
          saves: memorySaves(),
          random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32),
        });
        const errs = e.checkScripts();
        scripts = errs.length ? `${errs.length} failed: ${errs[0]}` : "ok";
        const press = (k: number) => {
          e.keyDown(k as never);
          e.update();
          e.keyUp(k as never);
          e.update();
        };
        for (let i = 0; i < 300; i++) e.update();
        press(Keys.ENTER);
        const dirs = [Keys.RIGHT, Keys.DOWN, Keys.LEFT, Keys.UP];
        for (let i = 0; i < 2500; i++) {
          if (i % 5 === 0) press(Keys.ENTER);
          else if (i % 13 === 0) press(Keys.CANCEL);
          else if (i % 3 === 0) press(dirs[Math.floor(i / 40) % 4]);
          else e.update();
        }
      } catch (err) {
        play = String((err as Error).message).slice(0, 140);
      }
      rows.push({ file: file.slice(dir!.length + 1), scripts, play });
    }
    const report = rows.map((r) => `${r.play === "ok" ? "PASS" : r.scripts === "-" ? "SKIP" : "FAIL"}\t${r.file}\tscripts=${r.scripts}\tplay=${r.play}`).join("\n");
    if (process.env.FMJ_COMPAT_REPORT) writeFileSync(process.env.FMJ_COMPAT_REPORT, report + "\n");
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
