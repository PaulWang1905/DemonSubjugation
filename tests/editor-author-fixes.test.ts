// Fixes from the new-author test (phase 3b): what the player can reach on a
// map, the way back landing beside the exit, arrivals that do not replay a
// new game's welcome, people placed after an arrival exists, and the other
// pure logic the fixes added (each test names its item of the fix list).
import { describe, expect, it, vi } from "vitest";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { commandInfo } from "../src/editor/format/commands";
import { createEngine, Keys, type Engine } from "../src/engine";
import { decodeMap } from "../src/editor/format/decode";
import { encodeMap, encodeNpc, type MapCell } from "../src/editor/format/encode";
import { assemble } from "../src/editor/format/gut";
import { findEntry, putEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { canTouch, nearestTouchable, reachArea, standProblem, touchProblem, unreachable } from "../src/editor/format/reach";
import { outline, parseScript, toSource, type InstructionStep, type OutlineNode } from "../src/editor/format/scriptModel";
import { deleteNode, insertCommand, startingValues } from "../src/editor/ui/scriptVisualLogic";
import { checkProject } from "../src/editor/format/validate";
import { buildWorld, withCellEvent } from "../src/editor/format/world";
import { addChest, addExit, addPerson, arrivalCamera, besideExit, firstLine, guardOnce, placementPosition, type Texts } from "../src/editor/format/worldEdit";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { lanternPath } from "../src/editor/template/demo";
import { emptyNotes, setFlagNote } from "../src/editor/format/notes";
import { flagChoices, nextFreeFlag, searchFlags } from "../src/editor/format/flags";
import { paintLo, setTileNote, tileName, tileNote, tileUsage, tileWalk, tileWalks } from "../src/editor/format/tiles";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

function store(a: LibArchive, texts: Texts): LibArchive {
  for (const [k, src] of Object.entries(texts)) {
    const [, type, index] = k.split("-").map(Number);
    putEntry(a, { resType: 1, type, index, data: assemble(src) });
  }
  return a;
}
function boot(a: LibArchive): Engine {
  let s = 7;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return createEngine({ resources: { datLib: writeLib(a), ...blankFonts }, saves: memorySaves(), random });
}
const tick = (e: Engine, n: number) => {
  for (let i = 0; i < n; i++) e.update();
};
const press = (e: Engine, k: number, wait = 3) => {
  e.keyDown(k as never);
  e.update();
  e.keyUp(k as never);
  tick(e, wait);
};
const settle = (e: Engine) => {
  for (let i = 0; i < 300 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
};
const newGame = (a: LibArchive) => {
  const e = boot(a);
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  settle(e);
  return e;
};
const pos = (e: Engine) => ({ ...e.game.playerList[0].posInMap });
const where = (e: Engine) => e.game.mainScene.currentMap?.mapName;

/** The blank game's START map: a 20×14 meadow ringed by trees (walkable 3-16 × 2-11). */
const START = () => decodeMap(findEntry(blankProject("T"), 2, 1, 1)!.data);

/** A blank game with a FOREST map 1-2 (all walkable). */
function withForest(): LibArchive {
  const a = blankProject("TEST");
  const cells: MapCell[] = Array.from({ length: 20 * 14 }, () => ({ tile: 0, walkable: true, event: 0 }));
  putEntry(a, { resType: 2, type: 1, index: 2, data: encodeMap({ type: 1, index: 2, tileset: 1, name: "FOREST", width: 20, height: 14, cells }) });
  return a;
}

describe("1. what the player can reach", () => {
  it("knows the engine's band and the walls: an exit at the map's edge cannot be reached", () => {
    const m = START();
    const r = reachArea(m, [{ x: 8, y: 7 }]);
    expect(r.seeded).toBe(true);
    // the leader stands on 4-15 × 3-11 (the band), every tile of it walkable here
    expect(canTouch(r, 15, 7)).toBe(true);
    expect(canTouch(r, 16, 7)).toBe(true); // walked into from 15, 7
    expect(canTouch(r, 17, 7)).toBe(false);
    expect(canTouch(r, 19, 7)).toBe(false);
    expect(touchProblem(m, r, 19, 7)).toBe("it is too close to the edge: the player always keeps 4 tiles from the right edge");
    expect(nearestTouchable(r, 19, 7)).toEqual({ x: 16, y: 7 });
    expect(canTouch(r, 8, 2)).toBe(true); // walked into from 8, 3
    expect(canTouch(r, 8, 12)).toBe(true); // from 8, 11
    expect(standProblem(m, r, 8, 12)).toMatch(/2 tiles from the bottom edge/);
  });

  it("finds places walled off from where the player enters", () => {
    const m = START();
    // a wall of trees down column 10: the east half cannot be reached from the start's west half
    const cells = m.cells.map((c, i) => (i % m.width === 10 ? { ...c, walkable: false } : c));
    const walled = { ...m, cells };
    const r = reachArea(walled, [{ x: 8, y: 7 }]);
    expect(canTouch(r, 10, 7)).toBe(true); // walked into from 9, 7
    expect(canTouch(r, 13, 7)).toBe(false);
    expect(touchProblem(walled, r, 13, 7)).toBe("blocked tiles wall it off from where the player enters this map");
    // with no known entry only the band and the walls decide
    expect(canTouch(reachArea(walled), 13, 7)).toBe(true);
  });

  it("the project check reports an exit, a person and an arrival the player can never reach", () => {
    const a = withForest();
    const texts: Texts = { ...blankSources() };
    const world = buildWorld(a, texts);
    let r = addExit(texts, { fromScript: "1-1-1", mapEvent: 1, toMap: { type: 1, index: 2, name: "FOREST" }, camera: arrivalCamera(18, 7, world.playerScreen), toScript: { key: "1-1-2", exists: false }, usedVariables: new Set() });
    const m = parseScript(r.texts["1-1-1"]);
    const p = addPerson(m, { npc: 1, name: "Hermit", x: 2, y: 1, at: placementPosition(m, world, "2-1-1", world.maps.get("2-1-1")!.loadedBy[0]), text: "Hi" });
    r = { ...r, texts: { ...r.texts, "1-1-1": toSource(p.model) } };
    // the tester's gate: event 1 at 19, 7
    putEntry(a, { resType: 2, type: 1, index: 1, data: withCellEvent(findEntry(a, 2, 1, 1)!.data, 19, 7, 1) });
    putEntry(a, { resType: 3, type: 2, index: 1, data: encodeNpc({ index: 1, name: "Hermit", sprite: 1, facing: 3, step: 1 }) });
    store(a, r.texts);
    const found = checkProject(a, r.texts).filter((x) => /never be reached/.test(x.message));
    expect(found.map((x) => [x.key, x.tile, x.message])).toEqual([
      ["2-1-1", { x: 19, y: 7 }, "The exit to FOREST at 19, 7 can never be reached: it is too close to the edge: the player always keeps 4 tiles from the right edge. The nearest tile that works is 16, 7."],
      ["2-1-1", { x: 2, y: 1 }, expect.stringMatching(/^Hermit at 2, 1 can never be reached: it is too close to the edge: the player always keeps 4 tiles from the left edge and 3 tiles from the top edge\. The nearest tile that works is 4, 2\.$/)],
      ["2-1-2", { x: 18, y: 7 }, "The arrival from START at 18, 7 can never be reached: it is too close to the edge: the player always keeps 4 tiles from the right edge. The nearest tile that works is 15, 7."],
    ]);
    expect(unreachable(buildWorld(a, r.texts), (k) => decodeMap(findEntry(a, 2, 1, Number(k.split("-")[2]))!.data))).toHaveLength(3);
  });
});

describe("2. the automatic way back lands beside the exit", () => {
  it("picks the nearest walkable tile the player can reach, not a corner of the search", () => {
    const meadow = (x: number, y: number) => x >= 3 && x < 17 && y >= 2 && y < 12;
    // the tester's gate at 19, 7: the old search returned the ring's first corner (15, 3)
    expect(besideExit(19, 7, 20, 14, meadow)).toEqual({ x: 15, y: 7 });
    expect(besideExit(16, 7, 20, 14, meadow)).toEqual({ x: 15, y: 7 });
    // not on another event tile, not walled off
    expect(besideExit(16, 7, 20, 14, meadow, (x, y) => !(x === 15 && y === 7))).toEqual({ x: 15, y: 8 });
    expect(besideExit(10, 1, 20, 14, meadow)).toEqual({ x: 10, y: 3 });
  });
});

describe("3. an arrival does not replay a new game's welcome", () => {
  /** The blank game's start script without its "once" guard (as phase 3a had it before). */
  const unguarded = (src: string) => src.replace("  if 1, @welcomed\n  setevent 1\n", "");

  it("guards the start script's new-game-only steps with a flag when an arrival is added", () => {
    const a = withForest();
    const texts: Texts = { "1-1-1": unguarded(blankSources()["1-1-1"]) };
    const world = buildWorld(a, texts);
    let r = addExit(texts, { fromScript: "1-1-1", mapEvent: 1, toMap: { type: 1, index: 2, name: "FOREST" }, camera: arrivalCamera(5, 7, world.playerScreen), toScript: { key: "1-1-2", exists: false }, usedVariables: new Set() });
    r = addExit(r.texts, { fromScript: "1-1-2", mapEvent: 1, toMap: { type: 1, index: 1, name: "START" }, camera: arrivalCamera(15, 7, world.playerScreen), toScript: { key: "1-1-1", exists: true }, usedVariables: new Set(), fromName: "FOREST", onceFlags: [2, 3] });
    expect(r.onceFlags).toEqual([2]);
    expect(r.texts["1-1-1"]).toContain('  showscenename\n  if 2, @once_done\n  setevent 2\n  say 1, "');
    expect(r.texts["1-1-1"]).toMatch(/here!"\n@once_done:\n@welcomed:\n  callback/);
    putEntry(a, { resType: 2, type: 1, index: 1, data: withCellEvent(findEntry(a, 2, 1, 1)!.data, 16, 7, 1) });
    putEntry(a, { resType: 2, type: 1, index: 2, data: withCellEvent(findEntry(a, 2, 1, 2)!.data, 3, 7, 1) });
    store(a, r.texts);
    const e = newGame(a);
    expect(where(e)).toBe("START");
    e.game.mainScene.triggerEvent(41);
    settle(e);
    expect(where(e)).toBe("FOREST");
    e.game.mainScene.triggerEvent(41);
    tick(e, 60);
    // back on START, beside the gate, and no welcome is waiting for a key press
    expect(where(e)).toBe("START");
    expect(pos(e)).toMatchObject({ x: 15, y: 7 });
    expect(e.game.mainScene.scriptProcess.running).toBe(false);
  });

  it("leaves a welcome that is already played once (the blank template's flag 1) as it is", () => {
    const src = blankSources()["1-1-1"];
    const joined = src.replace("  createactor 1, 4, 3\n", "  createactor 1, 4, 3\n@j:\n");
    const g = guardOnce(parseScript(joined), "j", [5]);
    expect(g.flags).toEqual([]);
    expect(toSource(g.model)).toBe(joined);
  });
});

describe("4. painting a tile paints its walkability", () => {
  it("takes the author's setting, else how the maps use the tile, else the template's maps, else walkable", () => {
    const a = blankProject("T");
    const maps = a.entries.filter((e) => e.resType === 2).map((e) => decodeMap(e.data));
    const usage = tileUsage(maps, 1);
    // the blank START: grass (0) walkable, trees (2) blocked; nothing else is used yet
    expect(tileWalk(0, { maps: usage })).toEqual({ walkable: true, from: "maps" });
    expect(tileWalk(2, { maps: usage })).toEqual({ walkable: false, from: "maps" });
    expect(tileWalk(6, { maps: usage })).toEqual({ walkable: true, from: "guess" });
    // the demo's maps (the same tileset picture) know the houses: tiles 5-8 block
    const demo = tileUsage(lanternPath().entries.filter((e) => e.resType === 2).map((e) => decodeMap(e.data)), 1);
    expect([5, 6, 7, 8].map((t) => tileWalk(t, { maps: usage, template: demo }).walkable)).toEqual([false, false, false, false]);
    expect(tileWalk(9, { maps: usage, template: demo })).toEqual({ walkable: true, from: "template" });
    // the author says a tree is walkable (a gap in the hedge): their setting wins, and it is kept in the notes
    let notes = setTileNote(emptyNotes(), 1, 2, { solid: false, name: "tree" });
    expect(tileNote(notes, 1, 2)).toEqual({ name: "tree", solid: false });
    expect(tileName(notes, 1, 2)).toBe("tree");
    expect(tileName(notes, 1, 3)).toBe("tile 3");
    expect(tileWalks(3, 1, { notes, maps: usage })[2]).toEqual({ walkable: true, from: "yours" });
    notes = setTileNote(notes, 1, 2, { solid: undefined, name: "" });
    expect(notes.extra).toEqual({});
    // the cell's byte: the tile and its walkability (bit 7), or only the tile
    expect(paintLo(0x80 | 3, 5, false)).toBe(5);
    expect(paintLo(3, 4, true)).toBe(0x80 | 4);
    expect(paintLo(0x80 | 3, 5, null)).toBe(0x80 | 5);
  });
});

describe("5. flags are picked by name", () => {
  it("lists named and used flags with where they are used, finds them by name or number, and gives the next free one", () => {
    const a = blankProject("T");
    const world = buildWorld(a, blankSources());
    let notes = setFlagNote(emptyNotes(), 12, { name: "got old key" });
    const list = flagChoices(notes, world, [7]);
    expect(list).toEqual([
      { flag: 1, name: undefined, uses: "set in start · checked in start" },
      { flag: 7, name: undefined, uses: "" },
      { flag: 12, name: "got old key", uses: "" },
    ]);
    expect(searchFlags(list, "old key").map((c) => c.flag)).toEqual([12]);
    expect(searchFlags(list, "7").map((c) => c.flag)).toEqual([7]);
    expect(nextFreeFlag(notes, world, [2, 3])).toBe(4);
    notes = setFlagNote(notes, 4, { name: "x" });
    expect(nextFreeFlag(notes, world, [2, 3])).toBe(5);
  });
});

describe("12. what a chest says once it is open is labelled so", () => {
  it("knows the first message is said only on the way that does not give the item", () => {
    let m = parseScript(blankSources()["1-1-1"]);
    const r = addChest(m, { box: 1, name: "Chest", x: 8, y: 5, at: "end", item: { type: 9, index: 1 }, flag: 9 });
    m = r.model;
    expect(firstLine(m, r.label)).toMatchObject({ text: "The chest is empty.", always: false, afterItem: true });
    const p = addPerson(m, { npc: 1, name: "Old Woman", x: 6, y: 6, at: "end", text: "Hello!" });
    expect(firstLine(p.model, p.label)).toMatchObject({ text: "Hello!", always: true, afterItem: false });
  });
});

describe("6. an If keeps its shape when the last step of its Otherwise is deleted", () => {
  it("ends the Otherwise there instead of turning the arm into a plain jump", () => {
    // the tester's gate: the exit's event, an If put on top, the switch put into "If set", the old switch deleted
    let m = parseScript('.gut 1 1\n.events 41\n.event 41 @to_forest\n\n@start:\n  callback\n@to_forest:\n  startchapter 1, 2\n');
    const group = () => m.groups.find((g) => g.label === "to_forest")!;
    const sw = m.steps.find((s) => s.kind === "instruction" && s.op.name === "startchapter")!;
    let r = insertCommand(m, group(), "if", { before: sw.id }, [12, "label"]);
    m = r.model;
    const ifStep = m.steps.find((s) => s.id === r.id) as InstructionStep;
    const label = String(ifStep.values[1]);
    const armLabel = m.steps.find((s) => s.kind === "label" && s.label === label)!;
    r = insertCommand(m, group(), "startchapter", { after: armLabel.id }, [1, 2]);
    m = r.model;
    const shape = () => {
      const nodes = outline(m, group());
      const b = nodes.find((n) => n.kind === "block") as Extract<OutlineNode, { kind: "block" }>;
      // (the steps after the If, or its Otherwise when they end the event there)
      const otherwise = b.arms.find((a) => a.key === "otherwise")?.nodes ?? [];
      return { arm: b.arms[0].nodes?.map((n) => n.step.text.trim()), after: [...otherwise, ...nodes.slice(nodes.indexOf(b) + 1)].map((n) => n.step.text.trim()).filter(Boolean) };
    };
    expect(shape()).toEqual({ arm: ["startchapter 1, 2", "callback"], after: ["startchapter 1, 2"] });
    // delete the Otherwise's switch (the step after the block)
    const res = deleteNode(m, group(), sw.id);
    if ("error" in res) throw new Error(res.error);
    m = res.model;
    expect(shape()).toEqual({ arm: ["startchapter 1, 2", "callback"], after: ["callback"] });
    expect(toSource(m)).toContain(`@to_forest:\n  if 12, @${label}\n  callback\n@${label}:\n  startchapter 1, 2\n  callback\n`);
  });
});

describe("16. battles use pictures the project has", () => {
  it("a new battle step takes an existing background; the engine draws picture 0 as none and a one-member party needs one portrait", () => {
    const a = blankProject("T");
    const has = (rt: number, t: number, i: number) => !!findEntry(a, rt, t, i);
    const bg = commandInfo("enterfight")!.operands.findIndex((o) => o.key === "background");
    expect(startingValues("enterfight")[bg]).toBe(0);
    expect(startingValues("enterfight", has)[bg]).toBe(1);
    expect(has(11, 4, 1) && !has(11, 1, 2)).toBe(true);
    // a battle with only a background (corners 0), in a game whose party has one portrait
    const src = blankSources()["1-1-1"].replace(".events 40", ".events 41\n.event 41 @boss") + "@boss:\n  enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lost, @won\n@won:\n  callback\n@lost:\n  gameover\n";
    store(a, { "1-1-1": src });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const e = newGame(a);
      e.game.mainScene.triggerEvent(41);
      tick(e, 120);
      expect(Combat.IsActive()).toBe(true);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /Missing resource PIC/.test(m))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("placing someone after an arrival exists", () => {
  it("puts them where every way meets after showing the map, so they are there on arrival too", () => {
    const a = withForest();
    const texts: Texts = { ...blankSources() };
    const world = buildWorld(a, texts);
    let r = addExit(texts, { fromScript: "1-1-1", mapEvent: 1, toMap: { type: 1, index: 2, name: "FOREST" }, camera: arrivalCamera(5, 7, world.playerScreen), toScript: { key: "1-1-2", exists: false }, usedVariables: new Set() });
    r = addExit(r.texts, { fromScript: "1-1-2", mapEvent: 1, toMap: { type: 1, index: 1, name: "START" }, camera: arrivalCamera(15, 7, world.playerScreen), toScript: { key: "1-1-1", exists: true }, usedVariables: new Set(), fromName: "FOREST" });
    store(a, r.texts);
    const w2 = buildWorld(a, r.texts);
    const m = parseScript(r.texts["1-1-1"]);
    const load = w2.maps.get("2-1-1")!.loadedBy.find((l) => l.start) ?? null;
    const p = addPerson(m, { npc: 1, name: "Old Woman", x: 8, y: 6, at: placementPosition(m, w2, "2-1-1", load), text: "Hi" });
    const src = toSource(p.model);
    expect(src).toContain("@arrive_from_forest_join:\n  createnpc 1, 1, 8, 6\n  setscenename");
    const w3 = buildWorld(store(a, { "1-1-1": src }), { ...r.texts, "1-1-1": src });
    expect(w3.maps.get("2-1-1")!.people.map((x) => [x.name, x.conditional])).toEqual([[expect.any(String), false]]);
  });
});
