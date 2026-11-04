// Dev tool: disassemble -> assemble every GUT script in every archive under
// FMJ_COMPAT_DIR (and FMJ_DATA_DIR/DAT.LIB) and check the bytes are identical.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assemble, disassemble } from "../src/editor/format/gut";
import { readLib } from "../src/editor/format/lib";
import { ResGut } from "../src/engine/fmj/lib/ResGut";
import { ScriptVM } from "../src/engine/fmj/script/ScriptVM";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { registerResources } from "../src/engine/fmj/registry";
import { setPlatform } from "../src/engine/java";

const dirs = [process.env.FMJ_COMPAT_DIR, process.env.FMJ_DATA_DIR].filter(Boolean) as string[];

function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.lib$/i.test(n) ? [p] : [];
  });
}

describe.skipIf(dirs.length === 0)("GUT assembler round-trip on real archives", () => {
  it("reassembles every script byte for byte", () => {
    let scripts = 0;
    let withRaw = 0;
    const vm = new ScriptVM({ game: {}, parent: null } as never);
    const engineCount = (data: Uint8Array) => {
      const g = new ResGut();
      g.setData(new Int8Array(data.buffer, data.byteOffset, data.length), 0);
      return (vm as unknown as { loadGut(g: ResGut): { debugState: { total: number } } }).loadGut(g).debugState.total;
    };
    const bad: string[] = [];
    for (const f of dirs.flatMap((d) => (existsSync(d) ? walk(d) : []))) {
      let lib;
      const raw = new Uint8Array(readFileSync(f));
      try {
        lib = readLib(raw);
      } catch {
        continue;
      }
      registerResources();
      setPlatform({ rom: new Map([["DAT.LIB", new Int8Array(raw.buffer, raw.byteOffset, raw.length)]]), saves: { get: () => null, set() {}, has: () => false }, exit() {}, random: Math.random });
      DatLib.reset();
      for (const e of lib.entries) {
        if (e.resType !== 1 || e.data.length < 0x1b) continue;
        const len = e.data[0x18] | (e.data[0x19] << 8);
        const expected = e.data.subarray(0, Math.min(0x18 + len, e.data.length));
        if (0x18 + len > e.data.length || len < e.data[0x1a] * 2 + 3) continue; // truncated record
        scripts++;
        try {
          const text = disassemble(e.data);
          if (text.includes(".raw ")) withRaw++;
          const out = assemble(text);
          if (out.length !== expected.length || out.some((b, i) => b !== expected[i])) bad.push(`${f} GUT ${e.type}-${e.index}`);
          // instruction boundaries must match the engine's own decoder
          const ours = text.split("\n").filter((l) => /^  [a-z]/.test(l)).length;
          if (!text.includes(".raw ") && ours !== engineCount(expected)) bad.push(`${f} GUT ${e.type}-${e.index}: ${ours} vs engine ${engineCount(expected)} instructions`);
        } catch (err) {
          bad.push(`${f} GUT ${e.type}-${e.index}: ${(err as Error).message}`);
        }
      }
    }
    process.stdout.write(`\nGUT round-trip: ${scripts - bad.length}/${scripts} identical, ${withRaw} keep raw tails\n`);
    expect(scripts).toBeGreaterThan(0);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 600_000);
});
