// The World view's logic (src/editor/format/worldEdit.ts): what is drawn over
// a map, from the world index; exits' arrival positions; the edits the view
// makes (move, start here, add a person, a chest, an exit and the way back,
// delete), checked through the world index and by playing the edited game.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { decodeMap } from "../src/editor/format/decode";
import { encodeMap } from "../src/editor/format/encode";
import { assemble } from "../src/editor/format/gut";
import { findEntry, putEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { parseScript, toSource } from "../src/editor/format/scriptModel";
import { buildWorld, withCellEvent, type WorldIndex } from "../src/editor/format/world";
import {
  addChest,
  addExit,
  addPerson,
  arrivalCamera,
  besideExit,
  deletePlacement,
  eventSummary,
  firstLine,
  freeCellEvent,
  freeFlag,
  inPlayerBand,
  mapOverlay,
  mapSetups,
  movePlacement,
  moveStart,
  placementCondition,
  placementPosition,
  placementUses,
  setLineText,
  standingSprite,
  startPosition,
  worldLayout,
  type Texts,
} from "../src/editor/format/worldEdit";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { memorySaves } from "./helpers";

const BELL = () => ({ archive: silentBell(), texts: silentBellSources() as Texts });
const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

/** Store edited script texts in an archive (assembled), as the view does. */
function store(a: LibArchive, texts: Texts): LibArchive {
  for (const [k, src] of Object.entries(texts)) {
    const [, type, index] = k.split("-").map(Number);
    putEntry(a, { resType: 1, type, index, data: assemble(src) });
  }
  return a;
}

/** Lines that differ between two texts. */
function changed(a: string, b: string): { removed: string[]; added: string[] } {
  const x = a.split("\n");
  const y = b.split("\n");
  return { removed: x.filter((l) => !y.includes(l)), added: y.filter((l) => !x.includes(l)) };
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

describe("what is drawn over a map", () => {
  const { archive, texts } = BELL();
  const world = buildWorld(archive, texts);

  it("draws people and objects with the frame the engine shows", () => {
    // Wen is a person facing south, standing (step 1): frame 8 (index 7)
    const wen = findEntry(archive, 3, 2, 1)!;
    const s = standingSprite(archive, "3-2-1")!;
    expect(s.sprite).toBe(`8-2-${wen.data[0x16]}`);
    expect(s.frame).toBe({ 1: 0, 2: 3, 3: 6, 4: 9 }[wen.data[2]]! + [0, 1, 2, 1][wen.data[3] % 4]);
    // a closed chest: frame 1 (index 0); objects always face north
    expect(standingSprite(archive, "3-4-1")).toEqual({ sprite: "8-4-1", frame: 0 });
    expect(standingSprite(archive, "3-3-1")).toBeNull();
  });

  it("puts the people the scripts place, the start, arrivals and event cells on Bellhaven", () => {
    const o = mapOverlay(world, archive, "2-1-1", "1-1-1");
    expect(o.people.map((p) => [p.placement.name, p.placement.x, p.placement.y, p.label, p.placement.conditional])).toEqual([
      ["Wen", 13, 8, "elder", false],
      ["Tam", 15, 8, "tam", false],
      ["Hana", 13, 11, "hana", false],
      ["Pip", 18, 12, "pip", false],
      ["Joss", 13, 13, "joss", false],
      ["Chest", 21, 5, "chest", false],
      ["Boulder", 5, 4, "boulder", true],
    ]);
    expect(o.start).toMatchObject({ x: 9, y: 7, script: "1-1-1" });
    expect(o.arrivals.map((a) => [a.from, a.x, a.y]).sort()).toEqual([
      ["2-1-2", 21, 7],
      ["2-1-3", 5, 3],
      ["2-1-4", 12, 14],
      ["2-1-5", 14, 3],
    ]);
    const phrase = Object.fromEntries(o.cells.map((c) => [c.mapEvent, c.phrase]));
    expect(phrase[1]).toBe("→ WHISPERWOOD?"); // only after talking to the elder
    expect(phrase[2]).toBe("→ OLD QUARRY");
    expect(phrase[5]).toBe("message");
    const boulder = o.people.find((p) => p.placement.name === "Boulder")!.placement;
    expect(placementCondition(world.scripts.get("1-1-1")!.model, boulder)).toMatch(/flag 13.*line 53/);
  });

  it("says who sets the map up, and what someone says first", () => {
    expect(mapSetups(world, "2-1-1").map((s) => [s.script, s.label, s.where])).toEqual([["1-1-1", "Bellhaven (script 1-1)", "when it starts"]]);
    const m = world.scripts.get("1-1-1")!.model;
    expect(firstLine(m, "pip")).toMatchObject({ kind: "say", text: "Pip: Bram the woodcutter went to the Whisperwood and never came home!" });
    expect(firstLine(m, "chest")).toMatchObject({ kind: "message", text: "Found a Herb and a Tonic!" });
  });

  it("opening a map writes nothing (the overlay only reads)", () => {
    const before = writeLib(archive);
    for (const k of world.maps.keys()) for (const s of mapSetups(world, k)) mapOverlay(world, archive, k, s.script);
    expect([...writeLib(archive)]).toEqual([...before]);
  });
});

describe("positions", () => {
  it("knows where the player can stand and where the view goes on arrival", () => {
    expect(inPlayerBand(4, 3, 26, 18)).toBe(true);
    expect(inPlayerBand(3, 3, 26, 18)).toBe(false);
    expect(inPlayerBand(21, 15, 26, 18)).toBe(true);
    expect(inPlayerBand(22, 16, 26, 18)).toBe(false);
    expect(arrivalCamera(12, 7, { x: 4, y: 3 })).toEqual({ x: 8, y: 4 });
    // the leader keeps its screen place while the view stays inside the map
    expect(startPosition({ screenX: 4, screenY: 3 }, 12, 9, 26, 18)).toEqual({ cameraX: 8, cameraY: 6, actorX: 4, actorY: 3 });
    // else as playerStart
    expect(startPosition({ screenX: 4, screenY: 3 }, 2, 1, 26, 18)).toEqual({ cameraX: 0, cameraY: 0, actorX: 2, actorY: 1 });
    const open = (x: number, y: number) => !(x === 5 && y === 3);
    expect(besideExit(5, 2, 20, 14, open)).toEqual({ x: 6, y: 3 });
  });
});

describe("edits", () => {
  it("moves a person: one operand pair, and the game puts them there", () => {
    const { archive, texts } = BELL();
    const world = buildWorld(archive, texts);
    const wen = world.maps.get("2-1-1")!.people.find((p) => p.name === "Wen")!;
    const m = movePlacement(parseScript(texts["1-1-1"]), wen.stepId, 11, 9);
    const out = toSource(m);
    expect(changed(texts["1-1-1"], out)).toEqual({ removed: ["  createnpc 1, 1, 13, 8"], added: ["  createnpc 1, 1, 11, 9"] });
    const next = { ...texts, "1-1-1": out };
    const w2 = buildWorld(store(archive, next), next);
    expect(w2.maps.get("2-1-1")!.people.find((p) => p.name === "Wen")).toMatchObject({ x: 11, y: 9 });
    const e = newGame(archive);
    expect({ ...e.game.mainScene.getNPC(1).posInMap }).toMatchObject({ x: 11, y: 9 });
  });

  it("moves the start: the loadmap's view (and the leader's screen place when it must)", () => {
    const { archive, texts } = BELL();
    const world = buildWorld(archive, texts);
    const next = moveStart(texts, world.start!, 12, 9, 26, 18);
    expect(changed(texts["1-1-1"], next["1-1-1"])).toEqual({ removed: ["  loadmap 1, 1, 5, 4"], added: ["  loadmap 1, 1, 8, 6"] });
    const w2 = buildWorld(store(archive, next), next);
    expect(w2.start).toMatchObject({ x: 12, y: 9 });
    expect(pos(newGame(archive))).toMatchObject({ x: 12, y: 9 });
  });

  it("adds a person who talks, and their first line can be changed in place", () => {
    const a = blankProject("TEST");
    putEntry(a, { resType: 3, type: 2, index: 1, data: findEntry(lanternPath(), 3, 2, 1)!.data });
    const texts: Texts = { "1-1-1": buildWorld(a).scripts.get("1-1-1")!.source };
    const world = buildWorld(a, texts);
    const load = world.maps.get("2-1-1")!.loadedBy[0];
    const model = parseScript(texts["1-1-1"]);
    const r = addPerson(model, { npc: 1, name: "Old man", x: 9, y: 6, at: placementPosition(model, world, "2-1-1", load), text: "Hello, traveller! Lovely day." });
    expect(r.id).toBe(1);
    expect(r.label).toBe("talk_old_man");
    let src = toSource(r.model);
    expect(src).toContain(".event 1 @talk_old_man");
    expect(src).toMatch(/createactor 1, 4, 3\n {2}createnpc 1, 1, 9, 6\n/);
    expect(src).toContain('  say 0, "Hello,         traveller!     Lovely day."');
    const line = firstLine(r.model, r.label)!;
    src = toSource(setLineText(r.model, line.stepId, "Good morning!"));
    expect(src).toContain('say 0, "Good morning!"');
    const next = { "1-1-1": src };
    const w2 = buildWorld(store(a, next), next);
    expect(w2.maps.get("2-1-1")!.people).toMatchObject([{ id: 1, x: 9, y: 6, conditional: false }]);
    const e = newGame(a);
    expect({ ...e.game.mainScene.getNPC(1).posInMap }).toMatchObject({ x: 9, y: 6 });
    // talk: walk to (9,7)... the leader starts at 8,7; face the person above-right
    e.game.mainScene.triggerEvent(1);
    expect(e.game.mainScene.scriptProcess.running).toBe(true);
  });

  it("adds a chest that opens once and gives an item", () => {
    const { archive, texts } = BELL();
    const world = buildWorld(archive, texts);
    const flag = freeFlag(world);
    expect(world.flags.has(flag)).toBe(false);
    const model = parseScript(texts["1-1-1"]);
    const load = world.maps.get("2-1-1")!.loadedBy[0];
    const r = addChest(model, { box: 1, name: "Chest", x: 20, y: 9, at: placementPosition(model, world, "2-1-1", load), item: { type: 9, index: 3 }, flag });
    expect(r.id).toBe(8);
    const next = { ...texts, "1-1-1": toSource(r.model) };
    const w2 = buildWorld(store(archive, next), next);
    expect(w2.maps.get("2-1-1")!.people.find((p) => p.id === 8)).toMatchObject({ kind: "object", x: 20, y: 9, conditional: false });
    // the old lines are all still there, in order
    const old = texts["1-1-1"].split("\n");
    const now = next["1-1-1"].split("\n");
    let k = 0;
    for (const l of now) if (l === old[k]) k++;
    expect(k).toBe(old.length);
    const e = newGame(archive);
    const before = (ScriptResources.globalEvents[flag] as boolean | undefined) ?? false;
    expect(before).toBe(false);
    e.game.mainScene.triggerEvent(8);
    settle(e);
    expect(ScriptResources.globalEvents[flag]).toBe(true);
    expect(e.game.mainScene.getNPC(8).step).toBe(1); // open
  });

  it("adds an exit to another map and the way back, and the player walks through both", () => {
    const { archive, texts } = BELL();
    const world = buildWorld(archive, texts);
    const village = decodeMap(findEntry(archive, 2, 1, 1)!.data);
    // a new exit at the village's south-east corner (22, 13) to the Whisperwood at 10, 10
    const fromEvent = freeCellEvent([world.scripts.get("1-1-1")!.model], village.cells.map((c) => c.event));
    expect(fromEvent).toBe(8);
    const used = new Set(world.variables.keys());
    const cam = arrivalCamera(10, 10, world.playerScreen);
    let r = addExit(texts, { fromScript: "1-1-1", mapEvent: fromEvent, toMap: { type: 1, index: 2, name: "WHISPERWOOD" }, camera: cam, toScript: { key: "1-1-2", exists: true }, usedVariables: used, fromName: "BELLHAVEN" });
    // the wood's script learns the arrival on a variable nothing else uses
    expect(r.variable).toEqual({ variable: 1, value: 1 });
    expect(r.texts["1-1-1"]).toContain(`@${r.label}:\n  set 1, 1\n  startchapter 1, 2`);
    expect(r.texts["1-1-2"]).toContain("@start:\n  ifcmp 1, 1, @arrive_from_bellhaven\n  loadmap 1, 2, 0, 5\n@arrive_from_bellhaven_join:\n  initfight");
    // the arrival's code ends the start code (it is part of it, not of the last event)
    expect(r.texts["1-1-2"]).toContain("  showscenename\n  callback\n\n@arrive_from_bellhaven:\n  loadmap 1, 2, 6, 7\n  set 1, 0\n  goto @arrive_from_bellhaven_join\n\n@bram:");
    // the way back: from the wood's (20, 3) to beside the new exit
    const wood = decodeMap(findEntry(archive, 2, 1, 2)!.data);
    const backEvent = freeCellEvent([parseScript(r.texts["1-1-2"])], wood.cells.map((c) => c.event));
    const beside = besideExit(22, 13, village.width, village.height, (x, y) => village.cells[y * village.width + x].walkable);
    r = addExit(r.texts, { fromScript: "1-1-2", mapEvent: backEvent, toMap: { type: 1, index: 1, name: "BELLHAVEN" }, camera: arrivalCamera(beside.x, beside.y, world.playerScreen), toScript: { key: "1-1-1", exists: true }, usedVariables: used, fromName: "WHISPERWOOD" });
    expect(r.variable).toEqual({ variable: 0, value: 5 }); // the village counts its arrivals in var 0
    const next = r.texts;
    putEntry(archive, { resType: 2, type: 1, index: 1, data: withCellEvent(findEntry(archive, 2, 1, 1)!.data, 22, 13, fromEvent) });
    putEntry(archive, { resType: 2, type: 1, index: 2, data: withCellEvent(findEntry(archive, 2, 1, 2)!.data, 20, 3, backEvent) });
    const w2 = buildWorld(store(archive, next), next);
    const exit = w2.maps.get("2-1-1")!.exits.find((e) => e.event === 40 + fromEvent)!;
    expect(exit.targets).toMatchObject([{ map: "2-1-2", x: 10, y: 10, certain: true }]);
    const back = w2.maps.get("2-1-2")!.exits.find((e) => e.event === 40 + backEvent)!;
    expect(back.targets).toMatchObject([{ map: "2-1-1", x: beside.x, y: beside.y, certain: true }]);
    // every load of the village is in its start code; the new exit's steps are only its own
    expect(w2.maps.get("2-1-1")!.loadedBy.every((l) => l.start)).toBe(true);
    expect(mapSetups(w2, "2-1-1")[0].where).toBe("when it starts");
    expect(eventSummary(w2.scripts.get("1-1-1")!.model, exit.label).lines).toEqual(["Set variable 1 to 1", "Switch to script 1-2"]);
    // the old exits still arrive where they did
    expect(w2.maps.get("2-1-1")!.exits.find((e) => e.label === "east")!.targets[0]).toMatchObject({ map: "2-1-2", x: 4, y: 8 });
    expect(w2.maps.get("2-1-2")!.exits.find((e) => e.label === "west")!.targets[0]).toMatchObject({ map: "2-1-1", x: 21, y: 7 });
    // play it
    const e = newGame(archive);
    e.game.mainScene.triggerEvent(40 + fromEvent);
    settle(e);
    expect(where(e)).toBe("WHISPERWOOD");
    expect(pos(e)).toMatchObject({ x: 10, y: 10 });
    e.game.mainScene.triggerEvent(40 + backEvent);
    settle(e);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject(beside);
    expect(e.game.playerList.length).toBe(1);
    // the usual ways still land where they did: east (after the elder) to 4, 8, back west to 21, 7
    ScriptResources.setEvent(2);
    e.game.mainScene.triggerEvent(41);
    settle(e);
    expect(where(e)).toBe("WHISPERWOOD");
    expect(pos(e)).toMatchObject({ x: 4, y: 8 });
    e.game.mainScene.triggerEvent(41);
    settle(e);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: 21, y: 7 });
  });

  it("adds an exit to a map no script shows yet: a new script sets it up", () => {
    const a = blankProject("TEST");
    const cells = Array.from({ length: 20 * 14 }, () => ({ tile: 0, walkable: true, event: 0 }));
    putEntry(a, { resType: 2, type: 1, index: 2, data: encodeMap({ type: 1, index: 2, tileset: 1, name: "FOREST", width: 20, height: 14, cells }) });
    const texts: Texts = { "1-1-1": buildWorld(a).scripts.get("1-1-1")!.source };
    const world: WorldIndex = buildWorld(a, texts);
    const r = addExit(texts, { fromScript: "1-1-1", mapEvent: 1, toMap: { type: 1, index: 2, name: "FOREST" }, camera: arrivalCamera(12, 7, world.playerScreen), toScript: { key: "1-1-2", exists: false }, usedVariables: new Set() });
    expect(r.texts["1-1-2"]).toBe('.gut 1 2\n.desc "FOREST"\n.events 40\n\n@start:\n  loadmap 1, 2, 8, 4\n  callback\n');
    putEntry(a, { resType: 2, type: 1, index: 1, data: withCellEvent(findEntry(a, 2, 1, 1)!.data, 15, 7, 1) });
    const w2 = buildWorld(store(a, r.texts), r.texts);
    expect(w2.maps.get("2-1-1")!.exits[0].targets).toMatchObject([{ map: "2-1-2", x: 12, y: 7, certain: true }]);
    const e = newGame(a);
    // walk east into the exit cell (the leader starts at 8, 7)
    for (let i = 0; i < 7; i++) press(e, Keys.RIGHT, 2);
    settle(e);
    expect(where(e)).toBe("FOREST");
    expect(pos(e)).toMatchObject({ x: 12, y: 7 });
  });

  it("deletes a person with what only they use, and keeps an event other code needs", () => {
    const { texts } = BELL();
    const model = parseScript(texts["1-1-1"]);
    const pip = model.steps.find((s) => s.text === "  createnpc 4, 4, 18, 12")!;
    const u = placementUses(model, pip.id);
    expect(u.followUps.map((id) => model.steps.find((s) => s.id === id)!.text)).toEqual(["  npcmovemod 4, 2"]);
    expect(u.event).toMatchObject({ number: 4, label: "pip" });
    expect(u.keepEvent).toBeNull();
    const out = toSource(deletePlacement(model, pip.id, true).model);
    expect(out).not.toMatch(/createnpc 4,|npcmovemod 4,|\.event 4 |@pip/);
    expect(out).toContain("@joss:");
    expect(() => assemble(out)).not.toThrow();
    // only the placement: the event stays
    const only = toSource(deletePlacement(model, pip.id, false).model);
    expect(only).toContain(".event 4 @pip");
    expect(only).not.toContain("createnpc 4,");
    // the quarry places the same lever twice: its event stays
    const q = parseScript(BELL().texts["1-1-3"]);
    const lever = q.steps.filter((s) => s.text === "  createbox 1, 4, 5, 8");
    expect(lever.length).toBe(2);
    expect(placementUses(q, lever[0].id).keepEvent).toMatch(/another line also places #1/);
  });
});

describe("the world map", () => {
  it("lays the maps out by where their exits are", () => {
    const w = buildWorld(silentBell(), silentBellSources());
    const l = worldLayout(w);
    const at = Object.fromEntries(l.nodes.map((n) => [n.name, [n.col, n.row]]));
    const [vc, vr] = at.BELLHAVEN;
    expect(at.WHISPERWOOD).toEqual([vc + 1, vr]); // east
    expect(at["OLD QUARRY"][1]).toBeLessThan(vr); // north
    expect(at["THE MIRE"][1]).toBeGreaterThan(vr); // south (the pier)
    expect(l.nodes.find((n) => n.start)!.name).toBe("BELLHAVEN");
    expect(l.edges.every((e) => e.both)).toBe(true);
    expect(l.edges.length).toBe(4);
    const lw = worldLayout(buildWorld(lanternPath(), lanternPathSources()));
    expect(lw.nodes.map((n) => [n.col, n.row])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const bw = worldLayout(buildWorld(blankProject()));
    expect(bw).toMatchObject({ cols: 1, rows: 1, edges: [] });
  });
});
