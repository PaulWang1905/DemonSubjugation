// The world map: exits followed the way the engine runs them (a hub
// script's events happen on the map it was started on, callchapter comes
// back, start flags that are cleared again are not assumed), exits to a map
// known only at run time; the map's graph (one link per pair) and layout
// (joined maps near each other, the exits' sides kept); the drawing helpers.
// The real 伏魔记 (DAT.LIB under FMJ_DATA_DIR, never committed) when present.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeMap } from "../src/editor/format/decode";
import { encodeMap } from "../src/editor/format/encode";
import { assemble } from "../src/editor/format/gut";
import { findEntry, putEntry, readLib, type LibArchive } from "../src/editor/format/lib";
import { buildWorld, withCellEvent } from "../src/editor/format/world";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { boxEdge, clampZoom, fitZoom, layoutWorldMap, linkLength, linkLine, mapGraph, neighbours, ZOOM_MAX } from "../src/editor/ui/worldMapLayout";

/** A project: the blank start map (2-1-1) and two more, the scripts as given (stored assembled). */
function project(texts: Record<string, string>): { archive: LibArchive; sources: Record<string, string> } {
  const a = blankProject("T");
  const cells = Array.from({ length: 20 * 14 }, () => ({ tile: 0, walkable: true, event: 0 }));
  putEntry(a, { resType: 2, type: 1, index: 2, data: encodeMap({ type: 1, index: 2, tileset: 1, name: "FOREST", width: 20, height: 14, cells }) });
  putEntry(a, { resType: 2, type: 1, index: 3, data: encodeMap({ type: 1, index: 3, tileset: 1, name: "CAVE", width: 20, height: 14, cells }) });
  // the start map: cell event 1 on its east edge, 2 on its north edge; the forest: 1 on its west edge
  let start = findEntry(a, 2, 1, 1)!.data;
  const { width, height } = decodeMap(start);
  start = withCellEvent(start, width - 1, Math.floor(height / 2), 1);
  start = withCellEvent(start, Math.floor(width / 2), 0, 2);
  putEntry(a, { resType: 2, type: 1, index: 1, data: start });
  putEntry(a, { resType: 2, type: 1, index: 2, data: withCellEvent(findEntry(a, 2, 1, 2)!.data, 0, 7, 1) });
  for (const [k, src] of Object.entries(texts)) {
    const [, type, index] = k.split("-").map(Number);
    putEntry(a, { resType: 1, type, index, data: assemble(src) });
  }
  return { archive: a, sources: texts };
}

// script 1-1 shows the start map and hands over to 1-2, the map's own script,
// which shows no map itself (like the towns of 伏魔记); 1-3 is the forest's
const HUB = {
  "1-1-1": [".gut 1 1", ".events 0", "", "  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  setevent 5", "  startchapter 1, 2", ""].join("\n"),
  "1-1-2": [
    ".gut 1 2",
    ".events 42",
    ".event 1 @talk",
    ".event 41 @east",
    ".event 42 @north",
    "",
    "  createnpc 1, 1, 6, 6",
    "  callback",
    "@east:",
    "  if 5, @notyet",
    "  loadmap 1, 2, 0, 3",
    "  startchapter 1, 3",
    "  callback",
    "@notyet:",
    '  say 0, "Talk to me first."',
    "  callback",
    "@north:",
    "  loadmap 1, 3, 2, 2",
    "  startchapter 1, 9",
    "  callback",
    "@talk:",
    "  clrevent 5",
    "  callchapter 1, 4",
    "  callback",
    "",
  ].join("\n"),
  "1-1-3": [".gut 1 3", ".events 41", ".event 41 @west", "", "  callback", "@west:", "  loadmap 1, 1, 14, 4", "  startchapter 1, 2", "  callback", ""].join("\n"),
  // run by callchapter: shows the cave and comes back
  "1-1-4": [".gut 1 4", ".events 0", "", "  loadmap 1, 3, 6, 6", "  return", ""].join("\n"),
};

describe("exits, as the engine runs them", () => {
  const { archive, sources } = project(HUB);
  const w = buildWorld(archive, sources);
  const exitsOf = (map: string) => w.maps.get(map)!.exits.map((e) => [e.script, e.event, e.targets.map((t) => t.map).join("/"), !!e.unknown]);

  it("puts a hub script's events on the map it was started on, not on the maps it shows", () => {
    // 1-2 shows the forest and the cave, but runs on the start map
    expect(exitsOf("2-1-1")).toEqual([
      ["1-1-2", 1, "2-1-3", false],
      ["1-1-2", 41, "2-1-2", false],
      ["1-1-2", 42, "", true],
    ]);
    expect(exitsOf("2-1-2")).toEqual([["1-1-3", 41, "2-1-1", false]]);
    expect(exitsOf("2-1-3")).toEqual([]);
    expect(w.maps.get("2-1-2")!.entrances.map((e) => `${e.from}:${e.event}`)).toEqual(["2-1-1:41"]);
  });

  it("follows callchapter into the other script and back", () => {
    const talk = w.maps.get("2-1-1")!.exits.find((e) => e.event === 1)!;
    expect(talk.trigger).toEqual({ kind: "person", id: 1 });
    expect(talk.targets).toMatchObject([{ map: "2-1-3", cameraX: 6, cameraY: 6, certain: true }]);
  });

  it("does not take a flag the start sets as set for good when a script clears it", () => {
    // flag 5 is set at the start and cleared by talking: the east exit opens then
    const east = w.maps.get("2-1-1")!.exits.find((e) => e.event === 41)!;
    expect(east.targets).toMatchObject([{ map: "2-1-2", x: 4, y: 6, certain: false }]);
  });

  it("marks an exit whose map is known only at run time, with no target", () => {
    const north = w.maps.get("2-1-1")!.exits.find((e) => e.event === 42)!;
    expect(north).toMatchObject({ unknown: true, targets: [] });
    const g = mapGraph(w);
    expect(g.unknown.get("2-1-1")).toBe(1);
  });

  it("keeps the templates' exits as they were", () => {
    const bell = buildWorld(silentBell(), silentBellSources());
    expect(bell.exits.every((e) => !e.unknown && e.targets.length > 0)).toBe(true);
    const lantern = buildWorld(lanternPath(), lanternPathSources());
    expect(lantern.exits.map((e) => `${e.from}>${e.targets.map((t) => t.map).join("/")}`).sort()).toEqual(["2-1-1>2-1-2", "2-1-2>2-1-1"]);
  });
});

describe("the world map's graph", () => {
  it("has one link per pair of maps, with the exits each way", () => {
    const g = mapGraph(buildWorld(silentBell(), silentBellSources()));
    expect(g.links.length).toBe(4);
    expect(g.links.every((l) => l.a < l.b && l.ab > 0 && l.ba > 0)).toBe(true);
    expect(g.start).toBe("2-1-1");
    expect(neighbours(g, "2-1-1").length).toBe(4);
    expect(neighbours(g, "2-1-2").map((n) => n.key)).toEqual(["2-1-1"]);
  });

  it("counts exits to maps that do not exist on the map they leave", () => {
    const texts = { ...HUB, "1-1-3": HUB["1-1-3"].replace("loadmap 1, 1, 14, 4", "loadmap 1, 9, 14, 4") };
    const { archive, sources } = project(texts);
    const g = mapGraph(buildWorld(archive, sources));
    expect(g.missing.get("2-1-2")).toEqual(["2-1-9"]);
    expect(g.links.find((l) => l.a === "2-1-1" && l.b === "2-1-2")).toMatchObject({ ab: 1, ba: 0 });
  });
});

describe("the world map's layout", () => {
  const distinct = (l: ReturnType<typeof layoutWorldMap>) => new Set(l.nodes.map((n) => `${n.col},${n.row}`)).size === l.nodes.length;

  it("keeps the exits' sides on a small world", () => {
    const w = buildWorld(silentBell(), silentBellSources());
    const l = layoutWorldMap(w);
    const at = Object.fromEntries(l.nodes.map((n) => [w.maps.get(n.key)!.name, [n.col, n.row]]));
    const [vc, vr] = at.BELLHAVEN;
    expect(at.WHISPERWOOD).toEqual([vc + 1, vr]); // east
    expect(at["OLD QUARRY"]).toEqual([vc, vr - 1]); // north
    expect(at["THE MIRE"]).toEqual([vc, vr + 1]); // south (the pier)
    expect(at["BELL TOWER"]).toEqual([vc - 1, vr]);
    expect(distinct(l)).toBe(true);
    expect(l).toMatchObject({ cols: 3, rows: 3, aloneRow: null });
  });

  it("lays out two maps side by side, and a lone map on its own", () => {
    const lw = layoutWorldMap(buildWorld(lanternPath(), lanternPathSources()));
    expect(lw.nodes.map((n) => [n.col, n.row])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const bw = layoutWorldMap(buildWorld(blankProject()));
    expect(bw).toMatchObject({ cols: 1, rows: 1, aloneRow: 0, nodes: [{ key: "2-1-1", col: 0, row: 0, group: -1 }] });
  });

  it("puts maps no exit joins on rows below the joined ones", () => {
    const { archive, sources } = project(HUB);
    const l = layoutWorldMap(buildWorld(archive, sources));
    expect(l.aloneRow).toBe(null); // all three are joined
    const a = silentBell();
    const cells = Array.from({ length: 10 * 8 }, () => ({ tile: 0, walkable: true, event: 0 }));
    for (const i of [6, 7, 8]) putEntry(a, { resType: 2, type: 1, index: i, data: encodeMap({ type: 1, index: i, tileset: 1, name: `LONE${i}`, width: 10, height: 8, cells }) });
    const l2 = layoutWorldMap(buildWorld(a, silentBellSources()));
    expect(l2.aloneRow).toBe(4);
    expect(l2.nodes.filter((n) => n.group < 0).map((n) => [n.key, n.row])).toEqual([
      ["2-1-6", 4],
      ["2-1-7", 4],
      ["2-1-8", 4],
    ]);
    expect(distinct(l2)).toBe(true);
  });
});

describe("drawing helpers", () => {
  it("ends lines at the cards' edges", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 300, y: 0, w: 100, h: 50 };
    expect(linkLine(a, b, 0)).toEqual({ x1: 100, y1: 25, x2: 300, y2: 25 });
    const c = { x: 0, y: 200, w: 100, h: 50 };
    expect(linkLine(a, c, 4)).toEqual({ x1: 50, y1: 54, x2: 50, y2: 196 });
    const p = boxEdge(a, 150, 125, 0); // diagonal: leaves through the bottom
    expect(p.y).toBeCloseTo(50);
  });

  it("fits a world in the view, never above the cap", () => {
    expect(fitZoom(1000, 500, 548, 600, 1, 24)).toBeCloseTo(0.5);
    expect(fitZoom(100, 100, 1000, 1000)).toBe(1);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0.01, 0.05)).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// The real game, when its file is at hand

const LIB = process.env.FMJ_DATA_DIR ? `${process.env.FMJ_DATA_DIR}/DAT.LIB` : "";
describe.skipIf(!LIB || !existsSync(LIB))("伏魔记 (DAT.LIB)", () => {
  const archive = () => readLib(new Uint8Array(readFileSync(LIB)));
  let cached: ReturnType<typeof buildWorld> | null = null;
  const world = () => (cached ??= buildWorld(archive(), {}));
  const goesTo = (map: string) => [...new Set(world().maps.get(map)!.exits.flatMap((e) => e.targets.map((t) => t.map)))].filter((k) => k !== map).sort();

  it("puts the hub towns' doors on the towns, not on the rooms they lead to", () => {
    // 三清宫 (2-1-1): its script 2-1 is started by the rooms' scripts after they show it
    expect(goesTo("2-1-1")).toEqual(["2-1-2", "2-1-8", "2-2-1", "2-2-2", "2-2-3", "2-2-4", "2-2-5", "2-2-6", "2-2-7", "2-2-8", "2-2-9"].sort());
    // 师傅居 (2-2-1), a room of it, only leads back
    expect(goesTo("2-2-1")).toEqual(["2-1-1"]);
    // 石梦城 (2-1-37): the road and its houses
    expect(goesTo("2-1-37")).toContain("2-1-30");
    expect(goesTo("2-1-37").length).toBe(15);
  });

  it("opens the way the first quest's flag blocks once it is cleared", () => {
    // 百草地 (2-1-2): the bamboo path is closed until the master is seen (flag 1, set at the start, cleared later)
    expect(goesTo("2-1-2")).toEqual(["2-1-1", "2-1-3"]);
  });

  it("finds a few hundred exits, every one leading somewhere known", () => {
    const w = world();
    expect(w.exits.length).toBeGreaterThan(300);
    expect(w.exits.length).toBeLessThan(450);
    expect(w.exits.filter((e) => e.unknown)).toEqual([]);
    for (const e of w.exits) for (const t of e.targets) expect(w.maps.has(t.map), `${e.script} ${e.event} → ${t.map}`).toBe(true);
    // every map is joined to another
    const g = mapGraph(w);
    expect(g.keys.length).toBe(83);
    expect(g.keys.filter((k) => !neighbours(g, k).length)).toEqual([]);
    expect(g.links.length).toBeGreaterThan(140);
    expect(g.links.length).toBeLessThan(200);
  }, 30000);

  it("lays the 83 maps out compactly, joined maps close", () => {
    const w = world();
    const g = mapGraph(w);
    const t = Date.now();
    const l = layoutWorldMap(w, g);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(new Set(l.nodes.map((n) => `${n.col},${n.row}`)).size).toBe(83);
    expect(l.cols * l.rows).toBeLessThan(83 * 2.2);
    expect(l.cols).toBeGreaterThanOrEqual(l.rows); // wider than tall
    // on average a link spans less than 2.5 cells
    expect(linkLength(l, g) / g.links.length).toBeLessThan(2.5);
  }, 30000);
});
