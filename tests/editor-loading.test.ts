// Loading games and projects: the remembered results (format/memo.ts) give
// the same answers as working them out again, and never stale ones; the
// world map's pictures are drawn as before, only faster; a project is
// prepared step by step and can be cancelled; long work runs in slices.
import { describe, expect, it } from "vitest";
import { bytesHash, Lru, projectMemo, sameBytes } from "../src/editor/format/memo";
import { assemble, disassemble, scriptSource } from "../src/editor/format/gut";
import { putEntry, readLib, type LibArchive } from "../src/editor/format/lib";
import { buildWorld } from "../src/editor/format/world";
import { checkProject } from "../src/editor/format/validate";
import { decodeMap } from "../src/editor/format/decode";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { lanternPath } from "../src/editor/template/demo";
import { framesOf, frameRgba, mapRgba } from "../src/editor/ui/worldArt";
import { LIGHT } from "../src/editor/ui/pixels";
import { worldMapOf } from "../src/editor/ui/worldMapLayout";
import { loadSteps, prepareProject } from "../src/editor/ui/prepareProject";
import { Cancelled, inSlices } from "../src/app/slices";
import { loadingProgress } from "../src/app/Loading";
import { BOOT_FRAMES, FPS, finish } from "../src/bbk/device";
import { loadRealResources } from "./helpers";

/** The same project, read again (new arrays, the same bytes). */
const reread = (a: LibArchive): LibArchive => ({ ...a, entries: a.entries.map((e) => ({ ...e, data: e.data.slice() })) });

describe("memo helpers", () => {
  it("hashes and compares bytes", () => {
    expect(bytesHash(new Uint8Array([1, 2, 3]))).toBe(bytesHash(Uint8Array.of(1, 2, 3)));
    expect(bytesHash(new Uint8Array([1, 2, 3]))).not.toBe(bytesHash(Uint8Array.of(3, 2, 1)));
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
  });

  it("keeps the entries used last", () => {
    const l = new Lru<string, number>(2);
    l.set("a", 1);
    l.set("b", 2);
    expect(l.get("a")).toBe(1); // a is now the newest
    l.set("c", 3);
    expect(l.get("b")).toBeUndefined();
    expect(l.get("a")).toBe(1);
    expect(l.get("c")).toBe(3);
  });

  it("remembers a project's result by content, and works it out again when anything changes", () => {
    let calls = 0;
    const f = projectMemo(() => ({ n: ++calls }));
    const a = lanternPath();
    const first = f(a, {});
    expect(f(reread(a), {})).toBe(first); // read again: the same content
    expect(calls).toBe(1);
    // bytes changed in place are not mistaken for the old ones
    const script = a.entries.find((e) => e.resType === 1)!;
    script.data[script.data.length - 1] ^= 1;
    expect(f(a, {})).not.toBe(first);
    expect(calls).toBe(2);
    script.data[script.data.length - 1] ^= 1;
    expect(f(a, {})).toBe(first); // (still remembered)
    // a script's source counts; another resource's does not
    const k = `1-${script.type}-${script.index}`;
    expect(f(a, { [k]: "; text" })).not.toBe(first);
    expect(f(a, { "2-1-1": "not a script" })).toBe(first);
    // a resource added
    const b = reread(a);
    putEntry(b, { resType: 12, type: 9, index: 9, data: new Uint8Array(4) });
    expect(f(b, {})).not.toBe(first);
  });
});

describe("the assembler and disassembler remember", () => {
  it("gives a new copy of the bytes each time, and the same text for the same bytes", () => {
    const text = scriptSource(silentBell().entries.find((e) => e.resType === 1)!.data);
    const a = assemble(text);
    a[0] ^= 0xff; // the caller may change what it got
    const b = assemble(text);
    expect(b).not.toBe(a);
    expect(b[0]).toBe(a[0] ^ 0xff);
    expect(disassemble(b.slice())).toBe(disassemble(b));
    expect(disassemble(b)).toBe(text);
  });

  it("throws the same error again for text that does not assemble", () => {
    expect(() => assemble(".gut 1 1\n  notaninstruction 1\n")).toThrow();
    expect(() => assemble(".gut 1 1\n  notaninstruction 1\n")).toThrow();
  });
});

describe("the world index and the project check are worked out once per content", () => {
  it("gives the same index for the same project read again, a new one after a change", () => {
    const a = silentBell();
    const s = silentBellSources();
    const w = buildWorld(a, s);
    expect(buildWorld(reread(a), { ...s })).toBe(w);
    expect(checkProject(reread(a), s)).toBe(checkProject(a, s));
    // a map changed: a new index, which knows the change
    const b = reread(a);
    const m = b.entries.find((e) => e.resType === 2)!;
    const data = m.data.slice();
    data[0x13] = 7; // the first cell's event
    putEntry(b, { ...m, data });
    const w2 = buildWorld(b, s);
    expect(w2).not.toBe(w);
    expect(w2.maps.get(`2-${m.type}-${m.index}`)!.eventCells.some((c) => c.mapEvent === 7 && c.cells.some((p) => p.x === 0 && p.y === 0))).toBe(true);
  });

  it("lays the world map out once per index", () => {
    const w = buildWorld(silentBell(), silentBellSources());
    expect(worldMapOf(w)).toBe(worldMapOf(w));
  });
});

/** The map as the editor drew it before: the screen colour, then each cell's tile as putImageData would. */
function referenceMap(map: ReturnType<typeof decodeMap>, tiles: ReturnType<typeof framesOf>): Uint8ClampedArray {
  const W = Math.max(1, map.width * 16);
  const H = Math.max(1, map.height * 16);
  const out = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    out.set(c, (y * W + x) * 4);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [...LIGHT, 255]);
  map.cells.forEach((cell, i) => {
    const x0 = (i % map.width) * 16;
    const y0 = Math.floor(i / map.width) * 16;
    const f = tiles[cell.tile];
    if (!f) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x0 + x, y0 + y, [0xcc, 0x33, 0x33, 255]);
      return;
    }
    const px = frameRgba(f, true);
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) put(x0 + x, y0 + y, [...px.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4)]);
  });
  return out;
}

describe("the world map's pictures", () => {
  it("draws every map of the templates as before", () => {
    for (const a of [lanternPath(), silentBell()]) {
      for (const e of a.entries.filter((x) => x.resType === 2)) {
        const map = decodeMap(e.data);
        const ts = a.entries.find((x) => x.resType === 7 && x.type === 1 && x.index === map.tileset);
        const tiles = ts ? framesOf(ts.data) : [];
        const got = mapRgba(map, tiles);
        expect(got.width).toBe(map.width * 16);
        expect(sameBytes(new Uint8Array(got.data.buffer), new Uint8Array(referenceMap(map, tiles).buffer))).toBe(true);
      }
    }
  });

  it("draws a missing tile in red", () => {
    const a = lanternPath();
    const map = decodeMap(a.entries.find((x) => x.resType === 2)!.data);
    const got = mapRgba(map, []);
    expect([...got.data.subarray(0, 4)]).toEqual([0xcc, 0x33, 0x33, 255]);
    expect(sameBytes(new Uint8Array(got.data.buffer), new Uint8Array(referenceMap(map, []).buffer))).toBe(true);
  });
});

describe("preparing a project to open", () => {
  it("names its steps by what the project holds", () => {
    const steps = loadSteps(silentBell(), ["Reading the file"]);
    const scripts = silentBell().entries.filter((e) => e.resType === 1).length;
    expect(steps.map((s) => s.label)).toEqual([
      "Reading the file",
      `Reading ${scripts} scripts`,
      expect.stringMatching(/^Indexing the world: \d+ maps?/),
      "Checking the project",
      expect.stringMatching(/^Drawing \d+ maps?$/),
    ]);
    expect(steps[1].total).toBe(scripts);
  });

  it("goes through every step, and leaves the work remembered", async () => {
    const a = silentBell();
    const s = silentBellSources();
    const seen: [number, number | undefined][] = [];
    // (no canvas here: the pictures are skipped)
    await prepareProject(a, s, (step, done) => seen.push([step, done]), { from: 1 });
    expect([...new Set(seen.map(([st]) => st))]).toEqual([1, 2, 3, 4]);
    const scripts = a.entries.filter((e) => e.resType === 1).length;
    expect(seen).toContainEqual([1, scripts]);
    expect(buildWorld(reread(a), s)).toBe(buildWorld(a, s));
  });

  it("stops when it is cancelled", async () => {
    let n = 0;
    await expect(prepareProject(lanternPath(), {}, () => n++, { alive: () => n < 2 })).rejects.toBeInstanceOf(Cancelled);
  });

  it("opens the real 伏魔记 with its 185 scripts and 83 maps (FMJ_DATA_DIR)", async () => {
    const real = loadRealResources();
    if (!real) return;
    const a = readLib(real.datLib);
    const steps = loadSteps(a);
    expect(steps[0].label).toBe("Reading 185 scripts");
    expect(steps[3].label).toBe("Drawing 83 maps");
    let last = 0;
    await prepareProject(a, {}, (step) => (last = Math.max(last, step)));
    expect(last).toBe(3);
    // the workspace then finds them ready
    expect(buildWorld(readLib(real.datLib), {})).toBe(buildWorld(a, {}));
    expect(checkProject(readLib(real.datLib), {})).toBe(checkProject(a, {}));
  }, 60_000);
});

describe("long work in slices", () => {
  function* count(n: number): Generator<void, string> {
    for (let i = 0; i < n; i++) yield;
    return "done";
  }

  it("runs a generator to its end, saying how far", async () => {
    const seen: number[] = [];
    expect(await inSlices(count(1000), { alive: () => true, progress: (n) => seen.push(n), budget: 0 })).toBe("done");
    expect(seen.at(-1)).toBe(1000);
    expect(finish(count(5))).toBe("done");
  });

  it("stops when what it was for has gone", async () => {
    await expect(inSlices(count(1000), { alive: () => false, budget: 0 })).rejects.toBeInstanceOf(Cancelled);
  });

  it("knows how long the device's power-on is", () => {
    expect(BOOT_FRAMES).toBe(18 * FPS);
  });

  it("says how far a load is", () => {
    const steps = [{ label: "a" }, { label: "b", done: 50, total: 100 }, { label: "c" }];
    expect(loadingProgress(steps, 0)).toBe(0);
    expect(loadingProgress(steps, 1)).toBeCloseTo(0.5);
    expect(loadingProgress(steps, 3)).toBe(1);
  });
});
