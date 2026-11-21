// The world index (src/editor/format/world.ts) of the templates: maps,
// people, exits, the start, flags, variables, references; renumbering with
// references updated; and the author-notes sidecar (notes.ts).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble, disassemble } from "../src/editor/format/gut";
import { decodeMap } from "../src/editor/format/decode";
import { findEntry, readLib, type LibArchive } from "../src/editor/format/lib";
import { checkProject } from "../src/editor/format/validate";
import { sentence } from "../src/editor/format/commands";
import { outline, outlineSteps, parseScript, toSource } from "../src/editor/format/scriptModel";
import { buildWorld, describeKey, parseKey, projectNames, renumberResource, resKey, scriptNames, unreferenced, withCellEvent, type WorldIndex } from "../src/editor/format/world";
import {
  dropResourceNote,
  emptyNotes,
  flagName,
  moveResourceNote,
  notesEmpty,
  readNotes,
  resourceNote,
  setFlagNote,
  setResourceNote,
  setVariableNote,
  variableName,
} from "../src/editor/format/notes";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { blankProject } from "../src/editor/template/blank";

const bell = () => ({ archive: silentBell(), sources: silentBellSources() });
const BELL = bell();
const BELL_WORLD = buildWorld(BELL.archive, BELL.sources);
const LANTERN_WORLD = buildWorld(lanternPath(), lanternPathSources());

const exitOf = (w: WorldIndex, map: string, label: string) => w.maps.get(map)!.exits.find((e) => e.label === label)!;

/** Every script's stored bytes are what its source assembles to. */
function consistent(a: LibArchive, sources: Record<string, string>) {
  for (const [k, src] of Object.entries(sources)) {
    const { type, index } = parseKey(k);
    const e = findEntry(a, 1, type, index)!;
    expect(e, k).toBeDefined();
    expect([...assemble(src)], k).toEqual([...e.data]);
  }
}

describe("maps and who is on them", () => {
  it("knows which scripts show each map and where they put the view", () => {
    const w = BELL_WORLD;
    expect([...w.maps.keys()]).toEqual(["2-1-1", "2-1-2", "2-1-3", "2-1-4", "2-1-5"]);
    const village = w.maps.get("2-1-1")!;
    expect(village.name).toBe("BELLHAVEN");
    expect(village.loadedBy.map((l) => [l.script, l.cameraX, l.cameraY, l.group])).toEqual([
      ["1-1-1", 5, 4, "start"],
      ["1-1-1", 17, 4, "start"],
      ["1-1-1", 1, 0, "start"],
      ["1-1-1", 8, 11, "start"],
      ["1-1-1", 10, 0, "start"],
    ]);
    expect(w.scripts.get("1-1-3")!.maps).toEqual(["2-1-3"]);
    expect(w.scripts.get("1-1-3")!.authored).toBe(true);
  });

  it("lists the people and objects each map's script places, with the line", () => {
    const village = BELL_WORLD.maps.get("2-1-1")!;
    expect(village.people.map((p) => [p.kind, p.id, p.name, p.x, p.y, p.conditional])).toEqual([
      ["person", 1, "Wen", 13, 8, false],
      ["person", 2, "Tam", 15, 8, false],
      ["person", 3, "Hana", 13, 11, false],
      ["person", 4, "Pip", 18, 12, false],
      ["person", 5, "Joss", 13, 13, false],
      ["object", 6, "Chest", 21, 5, false],
      ["object", 7, "Boulder", 5, 4, true],
    ]);
    const wen = village.people[0];
    expect(wen).toMatchObject({ script: "1-1-1", resource: "3-2-1", map: "2-1-1", start: true, group: "start" });
    expect(BELL.sources["1-1-1"].split("\n")[wen.line - 1].trim()).toBe("createnpc 1, 1, 13, 8");
    const wood = BELL_WORLD.maps.get("2-1-2")!;
    expect(wood.people.map((p) => `${p.name}${p.conditional ? "?" : ""}`)).toEqual(["Bram?", "Chest", "Bell Shard?"]);
    expect(wood.removals.map((r) => [r.id, r.group])).toEqual([
      [1, "bram"],
      [3, "shard"],
    ]);
    // the quarry's levers are placed again when they snap back (in an event)
    const levers = BELL_WORLD.maps.get("2-1-3")!.people.filter((p) => p.name === "Lever");
    expect(levers.map((p) => [p.id, p.start])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [1, false],
      [2, false],
      [3, false],
    ]);
  });

  it("knows which cells have events and which script event handles them", () => {
    const village = BELL_WORLD.maps.get("2-1-1")!;
    expect(village.eventCells.map((c) => [c.mapEvent, c.cells, c.handlers.map((h) => h.label)])).toEqual([
      [1, [{ x: 22, y: 7 }], ["east"]],
      [2, [{ x: 5, y: 2 }], ["north"]],
      [3, [{ x: 12, y: 15 }], ["pier"]],
      [4, [{ x: 14, y: 2 }], ["tower"]],
      [5, [{ x: 9, y: 6 }], ["home"]],
      [6, [{ x: 16, y: 6 }], ["shop"]],
      [7, [{ x: 10, y: 11 }], ["inn"]],
    ]);
  });
});

describe("the start and the exits", () => {
  it("finds where a new game puts the player", () => {
    expect(BELL_WORLD.start).toMatchObject({ script: "1-1-1", map: "2-1-1", cameraX: 5, cameraY: 4, screenX: 4, screenY: 3, x: 9, y: 7, flagsSet: [1] });
    expect(BELL_WORLD.start!.actor?.line).toBe(BELL_WORLD.start!.load.line + 1);
    expect(LANTERN_WORLD.start).toMatchObject({ map: "2-1-1", x: 7, y: 7 });
    const blank = buildWorld(blankProject());
    expect(blank.start).toMatchObject({ script: "1-1-1", map: "2-1-1", x: 8, y: 7 });
    expect(buildWorld({ titleBytes: new Uint8Array(0), entries: [] }).start).toBeNull();
  });

  it("follows exits through script switches, with the place they lead to", () => {
    const w = BELL_WORLD;
    // back from the wood: var 0 = 1 picks the village's east entrance
    const west = exitOf(w, "2-1-2", "west");
    expect(west.trigger).toEqual({ kind: "tile", mapEvent: 1, cells: [{ x: 3, y: 8 }] });
    expect(west.targets.map((t) => [t.map, t.x, t.y, t.cameraX, t.cameraY, t.certain])).toEqual([["2-1-1", 21, 7, 17, 4, true]]);
    expect(west.targets[0].load).toMatchObject({ script: "1-1-1", group: "start" });
    // to the wood: only once the elder has spoken (flag 2)
    const east = exitOf(w, "2-1-1", "east");
    expect(east.targets.map((t) => [t.map, t.x, t.y, t.certain])).toEqual([["2-1-2", 4, 8, false]]);
    expect(exitOf(w, "2-1-3", "south").targets.map((t) => [t.map, t.x, t.y])).toEqual([["2-1-1", 5, 3]]);
    expect(exitOf(w, "2-1-4", "dock").targets.map((t) => [t.map, t.x, t.y])).toEqual([["2-1-1", 12, 14]]);
    expect(exitOf(w, "2-1-5", "door").targets.map((t) => [t.map, t.x, t.y])).toEqual([["2-1-1", 14, 3]]);
    // winning the last battle also leads back (an event of a person: the bell)
    expect(w.maps.get("2-1-5")!.exits.find((e) => e.trigger.kind === "person")?.label).toBe("bell");
    expect(w.maps.get("2-1-1")!.entrances.map((e) => e.from).sort()).toEqual(["2-1-2", "2-1-3", "2-1-4", "2-1-5", "2-1-5"]);
    // the Lantern Path: flag 1 is set when the game starts, so the Glade's exit picks @returning
    expect(exitOf(LANTERN_WORLD, "2-1-2", "exit_west").targets.map((t) => [t.map, t.x, t.y, t.certain])).toEqual([["2-1-1", 15, 7, true]]);
  });
});

describe("flags, variables and references", () => {
  it("lists the flags and variables used, and how", () => {
    const w = BELL_WORLD;
    expect([...w.flags.keys()].sort((a, b) => a - b)).toEqual([1, 2, 12, 13, 14, 15, 21, 22, 23, 24, 31, 32, 33, 40]);
    const two = w.flags.get(2)!;
    expect(new Set(two.map((u) => u.access))).toEqual(new Set(["read", "set"]));
    expect(two.find((u) => u.access === "set")).toMatchObject({ script: "1-1-1", group: "elder", events: [1] });
    const zero = w.variables.get(0)!;
    expect(new Set(zero.filter((u) => u.access === "write").map((u) => u.script))).toEqual(new Set(["1-1-1", "1-1-2", "1-1-3", "1-1-4", "1-1-5"]));
    expect(zero.filter((u) => u.access === "read").length).toBe(4);
    expect(w.variables.get(10)!.some((u) => u.access === "read" && u.script === "1-1-3")).toBe(true);
  });

  it("knows who refers to what", () => {
    const w = BELL_WORLD;
    const herb = w.refsTo.get("6-9-1")!;
    expect(herb.filter((r) => r.via === "field").map((r) => [r.from, r.field!.key])).toEqual([
      ["3-3-2", "dropIndex"],
      ["3-3-6", "dropIndex"],
    ]);
    const lines = herb.filter((r) => r.via === "script").map((r) => BELL.sources["1-1-1"].split("\n")[r.where!.line - 1].trim());
    expect(lines.filter((l) => l.startsWith("gaingoods"))).toEqual(["gaingoods 9, 1", "gaingoods 9, 1", "gaingoods 9, 1"]);
    expect(lines.filter((l) => l.startsWith("buy")).length).toBe(3);
    expect(w.refsTo.get("2-1-3")!.map((r) => [r.from, r.via, r.operand])).toEqual([["1-1-3", "script", 1]]);
    expect(w.refsTo.get("7-1-1")!.map((r) => r.from)).toEqual(["2-1-1", "2-1-2", "2-1-3", "2-1-4", "2-1-5"]);
    expect(w.refsTo.get("4-1-3")!.map((r) => [r.from, r.via, r.position])).toEqual([["12-1-2", "spellList", 0]]);
    expect(w.refsTo.get("11-3-2")!.map((r) => [r.from, r.via, r.note])).toEqual([["3-1-2", "implicit", "battle sprite"]]);
    expect(w.refsTo.get("3-2-6")!.map((r) => r.from)).toEqual(["1-1-2"]);
    expect(w.refsTo.get("1-1-5")!.map((r) => r.from)).toEqual(["1-1-1"]);
    expect(w.refsFrom.get("3-3-4")!.map((r) => r.target).sort()).toEqual(["12-1-3", "8-3-4"]);
    // portraits: says, and the party member's own by number
    expect(new Set(w.refsTo.get("11-1-2")!.map((r) => r.from))).toEqual(new Set(["1-1-1", "1-1-2", "1-1-3", "1-1-5", "3-1-2"]));
    for (const k of unreferenced(w, BELL.archive)) expect(w.refsTo.get(k), k).toBeUndefined();
    expect(unreferenced(w, BELL.archive)).not.toContain("1-1-1");
  });

  it("names things for sentences", () => {
    const a = BELL.archive;
    const names = scriptNames(BELL_WORLD, a, "1-1-1", setFlagNote(emptyNotes(), 2, { name: "quest given" }));
    expect(names.npcId!(1)).toBe("Wen");
    expect(names.event!(1)).toBe("talking to Wen");
    expect(names.event!(42)).toBe("map event 2");
    expect(sentence("facetoface", [0, 1], names).text).toBe("Wen (#1) turns to the player");
    expect(sentence("if", [2, "elder_hint"], names).text).toBe("If “quest given” is set, go to @elder_hint");
    expect(sentence("startchapter", [1, 2], names).text).toBe("Switch to script “Whisperwood”");
    expect(projectNames(a).resource!(6, 9, 99)).toBeNull();
    expect(describeKey(a, "6-9-1")).toBe("Item 9-1 Herb (medicine)");
    expect(describeKey(a, "2-1-9")).toBe("Map 1-9 (missing)");
    expect(resKey(3, 2, 1)).toBe("3-2-1");
    expect(parseKey("11-1-3")).toEqual({ resType: 11, type: 1, index: 3 });
  });

  it("sets the event number of a map cell", () => {
    const map = findEntry(BELL.archive, 2, 1, 2)!;
    const m = decodeMap(withCellEvent(map.data, 2, 3, 5));
    expect(m.cells[3 * m.width + 2].event).toBe(5);
    expect(decodeMap(map.data).cells[3 * m.width + 2].event).toBe(0);
    expect(() => withCellEvent(map.data, m.width, 0, 1)).toThrow(/outside/);
  });

  it("indexes a project of about 200 resources in well under 50 ms", () => {
    const { archive, sources } = bell();
    expect(archive.entries.length).toBeGreaterThan(150);
    buildWorld(archive, sources);
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) buildWorld(archive, sources);
    expect((performance.now() - t0) / 5).toBeLessThan(50);
  });
});

describe("renumbering", () => {
  it("moves a map and updates the scripts that load it", () => {
    const { archive, sources } = bell();
    const notes = setResourceNote(emptyNotes(), "2-1-3", { note: "the quarry" });
    const r = renumberResource(archive, sources, { resType: 2, type: 1, index: 3 }, 9, { notes });
    expect(r.changed.sort()).toEqual(["1-1-3", "2-1-9"]);
    expect(findEntry(r.archive, 2, 1, 3)).toBeUndefined();
    expect(decodeMap(findEntry(r.archive, 2, 1, 9)!.data).index).toBe(9);
    expect(r.sources["1-1-3"]).toBe(sources["1-1-3"].replace("loadmap 1, 3, 6, 12", "loadmap 1, 9, 6, 12"));
    expect(resourceNote(r.notes, "2-1-9")?.note).toBe("the quarry");
    expect(checkProject(r.archive, r.sources)).toEqual([]);
    consistent(r.archive, r.sources);
    const w = buildWorld(r.archive, r.sources);
    expect(w.maps.get("2-1-9")!.loadedBy.map((l) => l.script)).toEqual(["1-1-3"]);
    expect(exitOf(w, "2-1-1", "north").targets[0].map).toBe("2-1-9");
    // the inputs are untouched
    expect(findEntry(archive, 2, 1, 3)).toBeDefined();
    expect(sources["1-1-3"]).toContain("loadmap 1, 3, 6, 12");
  });

  it("moves an item and updates gifts, shops and monster drops", () => {
    const { archive, sources } = bell();
    const r = renumberResource(archive, sources, { resType: 6, type: 9, index: 1 }, 7);
    expect(checkProject(r.archive, r.sources)).toEqual([]);
    consistent(r.archive, r.sources);
    const before = sources["1-1-1"].split("\n");
    const after = r.sources["1-1-1"].split("\n");
    const changed = after.filter((l, i) => l !== before[i]);
    expect(changed.length).toBe(6);
    expect(changed.every((l) => /gaingoods 9, 7|buy 9:7,/.test(l))).toBe(true);
    expect(after.join("\n")).not.toMatch(/gaingoods 9, 1\b|9:1,/);
    const w = buildWorld(r.archive, r.sources);
    expect(w.refsTo.get("6-9-1")).toBeUndefined();
    expect(w.refsTo.get("6-9-7")!.filter((x) => x.via === "field").map((x) => x.from)).toEqual(["3-3-2", "3-3-6"]);
    expect(r.changed.sort()).toEqual(["1-1-1", "3-3-2", "3-3-6", "6-9-7"]);
  });

  it("moves a party member with their battle sprite and level table, and who may use what", () => {
    const { archive, sources } = bell();
    const r = renumberResource(archive, sources, { resType: 3, type: 1, index: 2 }, 3);
    // portrait 1-3 is the elder's: Bram keeps his own number's portrait slot and the author is told
    expect(r.warnings.some((x) => /portrait 1-3 already exists/.test(x))).toBe(true);
    expect(findEntry(r.archive, 11, 3, 3)).toBeDefined();
    expect(findEntry(r.archive, 11, 3, 2)).toBeUndefined();
    expect(findEntry(r.archive, 12, 2, 3)?.data[1]).toBe(3);
    expect(r.sources["1-1-2"]).toContain("createactor 3, 4, 3");
    expect(r.sources["1-1-1"]).toContain("resumeactorhp 3, 100");
    expect(r.sources["1-1-4"]).toContain("resumeactorhp 3, 100");
    // the axes were Bram's only
    expect(findEntry(r.archive, 6, 7, 3)!.data[3]).toBe(4);
    expect(findEntry(r.archive, 6, 7, 1)!.data[3]).toBe(1);
    expect(checkProject(r.archive, r.sources)).toEqual([]);
    consistent(r.archive, r.sources);
  });

  it("moves a script and updates the switches to it", () => {
    const { archive, sources } = bell();
    const r = renumberResource(archive, sources, { resType: 1, type: 1, index: 2 }, 6);
    expect(r.sources["1-1-2"]).toBeUndefined();
    expect(r.sources["1-1-6"].startsWith(".gut 1 6\n")).toBe(true);
    expect(r.sources["1-1-1"]).toContain("startchapter 1, 6");
    expect(r.sources["1-1-1"]).not.toContain("startchapter 1, 2");
    expect(checkProject(r.archive, r.sources)).toEqual([]);
    consistent(r.archive, r.sources);
    expect(renumberResource(archive, sources, { resType: 1, type: 1, index: 1 }, 9).warnings[0]).toMatch(/starts the game/);
  });

  it("updates scripts that have no author source (disassembled)", () => {
    const a = lanternPath();
    const r = renumberResource(a, {}, { resType: 6, type: 9, index: 1 }, 5);
    expect(Object.keys(r.sources)).toEqual(["1-1-1"]);
    expect(r.sources["1-1-1"]).toBe(disassemble(findEntry(r.archive, 1, 1, 1)!.data));
    expect(r.sources["1-1-1"]).toContain("gaingoods 9, 5");
    expect(checkProject(r.archive, r.sources)).toEqual([]);
  });

  it("refuses numbers in use, out of range, or missing", () => {
    const { archive, sources } = bell();
    expect(() => renumberResource(archive, sources, { resType: 2, type: 1, index: 1 }, 2)).toThrow(/already used/);
    expect(() => renumberResource(archive, sources, { resType: 2, type: 1, index: 1 }, 0)).toThrow(/1-255/);
    expect(() => renumberResource(archive, sources, { resType: 2, type: 1, index: 42 }, 43)).toThrow(/does not exist/);
    expect(renumberResource(archive, sources, { resType: 2, type: 1, index: 1 }, 1).changed).toEqual([]);
  });
});

describe("author notes", () => {
  it("sets, reads, moves and drops notes without changing the old object", () => {
    const a = emptyNotes();
    const b = setFlagNote(a, 12, { name: " gate open " });
    expect(flagName(a, 12)).toBeUndefined();
    expect(flagName(b, 12)).toBe("gate open");
    const c = setVariableNote(b, 0, { name: "came from", note: "1 wood, 2 quarry" });
    expect(variableName(c, 0)).toBe("came from");
    const d = setResourceNote(c, "2-1-3", { name: "Quarry" });
    const e = moveResourceNote(d, "2-1-3", "2-1-9");
    expect(resourceNote(e, "2-1-9")?.name).toBe("Quarry");
    expect(resourceNote(e, "2-1-3")).toBeUndefined();
    expect(resourceNote(dropResourceNote(e, "2-1-9"), "2-1-9")).toBeUndefined();
    expect(setFlagNote(b, 12, { name: "" }).flags).toEqual({});
    expect(notesEmpty(a)).toBe(true);
    expect(notesEmpty(d)).toBe(false);
  });

  it("survives JSON and reads damaged notes without failing", () => {
    const n = setResourceNote(setFlagNote(emptyNotes(), 3, { name: "x" }), "3-2-1", { note: "the elder" });
    expect(readNotes(JSON.parse(JSON.stringify(n)))).toEqual(n);
    expect(readNotes(null)).toEqual(emptyNotes());
    expect(readNotes({ flags: { "1": { name: 5 }, x: { name: "bad key" }, "2": { name: "ok" } }, resources: { "1-1": { name: "bad" } }, variables: "nope" })).toEqual({ ...emptyNotes(), flags: { "2": { name: "ok" } } });
  });
});

// The original game, when its archive is here (never committed): every script's
// disassembly reads and writes back, and the index is quick enough.
const DATA = process.env.FMJ_DATA_DIR ?? "";
describe.skipIf(!DATA || !existsSync(`${DATA}/DAT.LIB`))("the original game", () => {
  it("models every script and indexes the world", () => {
    const a = readLib(new Uint8Array(readFileSync(`${DATA}/DAT.LIB`)));
    const scripts = a.entries.filter((e) => e.resType === 1);
    expect(scripts.length).toBeGreaterThan(100);
    for (const e of scripts) {
      const src = disassemble(e.data);
      const m = parseScript(src);
      expect(toSource(m)).toBe(src);
      expect(m.steps.some((s) => s.kind === "raw")).toBe(false);
      for (const g of m.groups) expect(outlineSteps(outline(m, g)).length).toBe(g.to - g.from);
    }
    buildWorld(a);
    const t0 = performance.now();
    const w = buildWorld(a);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(w.start).not.toBeNull();
    expect(w.maps.size).toBeGreaterThan(50);
    expect(w.exits.length).toBeGreaterThan(50);
  });
});
