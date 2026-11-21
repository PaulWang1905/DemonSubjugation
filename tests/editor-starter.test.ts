// Making it easy to start (phase 3a): the wizards' edits (src/editor/format/
// wizards.ts), "play from here", and the guided first game's step detection
// (src/editor/ui/guideModel.ts), checked through the world index and by
// playing the result in the engine.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { decodeMap } from "../src/editor/format/decode";
import { findEntry, putEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { emptyNotes } from "../src/editor/format/notes";
import { parseScript, toSource as toText } from "../src/editor/format/scriptModel";
import { assemble as assembleText } from "../src/editor/format/gut";
import { buildWorld } from "../src/editor/format/world";
import {
  addBattle,
  addShop,
  buyPrice,
  fullTexts,
  newMap,
  newMonster,
  newPerson,
  playFromHere,
  projectWorld,
  randomBattles,
  setupScript,
  sideExit,
  type Change,
  type Project,
  type WizardResult,
} from "../src/editor/format/wizards";
import { addChest, addPerson, freeFlag, placementPosition, setLineText, firstLine, type Texts } from "../src/editor/format/worldEdit";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { lanternPath } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { advance, goTo, guideSignals, notePlaytest, readGuide, startGuide, STEPS, writeGuide, type GuideState } from "../src/editor/ui/guideModel";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

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
const screen = (e: Engine) => e.game.parent.getCurScreen().constructor.name;

/** A project as the editor holds it: the archive and every script's text. */
const project = (a: LibArchive, texts?: Texts): Project => ({ archive: a, texts: fullTexts(a, texts) });

/** Store a wizard's changes, as the editor does. */
function apply(p: Project, r: WizardResult | { changes: Change[] }): Project {
  for (const c of r.changes) {
    const [resType, type, index] = c.key.split("-").map(Number);
    putEntry(p.archive, { resType, type, index, data: c.data });
  }
  const texts = { ...p.texts };
  for (const c of r.changes) if (c.source !== undefined) texts[c.key] = c.source;
  return { archive: p.archive, texts };
}

/** The old text's lines are all still there, in order. */
function keeps(before: string, after: string) {
  // (the event count grows with new events)
  const old = before.split("\n").filter((l) => !l.startsWith(".events"));
  let k = 0;
  for (const l of after.split("\n")) if (l === old[k]) k++;
  expect(k).toBe(old.length);
}

describe("the New map wizard", () => {
  it("makes a map of a size, filled, with a blocked ring", () => {
    const p = project(blankProject("T"), blankSources());
    const r = newMap(p, { name: "Forest", width: 14, height: 10, tileset: 1, fill: 3, border: 2, connect: null });
    expect(r.changes.map((c) => c.key)).toEqual(["2-1-2"]);
    const m = decodeMap(r.changes[0].data);
    expect(m).toMatchObject({ name: "FOREST", width: 14, height: 10, tileset: 1 });
    expect(m.cells[0]).toMatchObject({ tile: 2, walkable: false });
    expect(m.cells[5 * 14 + 6]).toMatchObject({ tile: 3, walkable: true });
    expect(() => newMap(p, { name: "X", width: 8, height: 10, tileset: 1, fill: 0, border: null })).toThrow(/9-127/);
  });

  it("finds a side's exit tile just beyond where the player stands", () => {
    expect(sideExit(20, 14, "east")).toEqual({ out: { x: 16, y: 7 }, inside: { x: 15, y: 7 } });
    expect(sideExit(20, 14, "west")).toEqual({ out: { x: 3, y: 7 }, inside: { x: 4, y: 7 } });
    expect(sideExit(20, 14, "north")).toEqual({ out: { x: 9, y: 2 }, inside: { x: 9, y: 3 } });
    expect(sideExit(20, 14, "south")).toEqual({ out: { x: 9, y: 12 }, inside: { x: 9, y: 11 } });
    // a used tile: the next one along
    expect(sideExit(20, 14, "east", (o) => o.y !== 7).out).toEqual({ x: 16, y: 6 });
  });

  it("joins the new map to the first with an exit and the way back, and the player walks through both", () => {
    let p = project(blankProject("T"), blankSources());
    const before = p.texts["1-1-1"];
    const r = newMap(p, { name: "Forest", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } });
    expect(r.changes.map((c) => c.key).sort()).toEqual(["1-1-1", "1-1-2", "2-1-1", "2-1-2"]);
    p = apply(p, r);
    keeps(before, p.texts["1-1-1"]);
    const w = projectWorld(p);
    expect(w.maps.get("2-1-1")!.exits[0].targets).toMatchObject([{ map: "2-1-2", x: 4, y: 7, certain: true }]);
    expect(w.maps.get("2-1-2")!.exits[0].targets).toMatchObject([{ map: "2-1-1", x: 15, y: 7, certain: true }]);
    expect(setupScript(w, "2-1-2")).toBe("1-1-2");
    const notes = r.notes!(emptyNotes());
    expect(Object.values(notes.variables)[0]).toEqual({ name: "where the party comes from" });
    // play: the leader starts at 8, 7; walk east off the meadow, then west back
    const e = newGame(p.archive);
    expect(pos(e)).toMatchObject({ x: 8, y: 7 });
    for (let i = 0; i < 9; i++) press(e, Keys.RIGHT, 2);
    settle(e);
    expect(where(e)).toBe("FOREST");
    expect(pos(e)).toMatchObject({ x: 4, y: 7 });
    press(e, Keys.LEFT, 2);
    settle(e);
    expect(where(e)).toBe("START");
    expect(pos(e)).toMatchObject({ x: 15, y: 7 });
    expect(e.game.playerList.length).toBe(1);
  });

  it("joins a new map to The Silent Bell's village (an existing arrival variable)", () => {
    let p = project(silentBell(), silentBellSources());
    const r = newMap(p, { name: "Orchard", width: 20, height: 14, tileset: 1, fill: 0, border: null, connect: { from: "2-1-1", side: "south" } });
    p = apply(p, r);
    const w = projectWorld(p);
    const k = r.changes.find((c) => c.key.startsWith("2-1-") && c.key !== "2-1-1")!.key;
    const back = w.maps.get(k)!.exits[0];
    expect(back.targets[0].map).toBe("2-1-1");
    const e = newGame(p.archive);
    const there = w.maps.get("2-1-1")!.exits.find((x) => x.targets[0].map === k)!;
    e.game.mainScene.triggerEvent(there.event);
    settle(e);
    expect(where(e)).toBe("ORCHARD");
    e.game.mainScene.triggerEvent(back.event);
    settle(e);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: back.targets[0].x, y: back.targets[0].y });
  });
});

describe("the New person wizard", () => {
  it("makes a person from a walk sprite and puts them on a tile with a line; talking to them says it", () => {
    let p = project(blankProject("T"), blankSources());
    const r = newPerson(p, { who: { sprite: 2 }, name: "Old Ada", map: "2-1-1", tile: { x: 10, y: 6 }, line: "Welcome to the meadow, friend!", walks: false });
    expect(r.npc).toBe(1);
    expect(r.changes.map((c) => c.key)).toEqual(["3-2-1", "1-1-1"]);
    const before = p.texts["1-1-1"];
    p = apply(p, r);
    keeps(before, p.texts["1-1-1"]);
    const w = projectWorld(p);
    expect(w.maps.get("2-1-1")!.people).toMatchObject([{ kind: "person", name: "Old Ada", x: 10, y: 6, id: 1 }]);
    const e = newGame(p.archive);
    expect({ ...e.game.mainScene.getNPC(1).posInMap }).toMatchObject({ x: 10, y: 6 });
    e.game.mainScene.triggerEvent(1);
    expect(e.game.mainScene.scriptProcess.running).toBe(true);
    settle(e);
    expect(e.game.mainScene.scriptProcess.running).toBe(false);
  });

  it("without a tile only makes the person (the World view places them); walking people get npcmovemod", () => {
    const p = project(blankProject("T"), blankSources());
    const r = newPerson(p, { who: { sprite: 1 }, name: "Kid", map: "2-1-1", tile: null, line: "Hi", walks: true });
    expect(r.changes.map((c) => c.key)).toEqual(["3-2-1"]);
    expect(r.open).toEqual({ key: "2-1-1", mode: "map.world" });
    const q = apply(p, r);
    const r2 = newPerson(q, { who: { npc: 1 }, name: "Kid", map: "2-1-1", tile: { x: 6, y: 5 }, line: "Hi", walks: true });
    expect(r2.changes[0].source).toMatch(/createnpc 1, 1, 6, 5\n {2}npcmovemod 1, 1\n/);
  });
});

/** Tam's shop, as The Silent Bell has it, on a blank game: a person, then a shop at them. */
function blankWithPerson(): Project {
  const p = project(blankProject("T"), blankSources());
  return apply(p, newPerson(p, { who: { sprite: 2 }, name: "Tam", map: "2-1-1", tile: { x: 10, y: 6 }, line: "Fine wares!", walks: false }));
}

describe("the New shop wizard", () => {
  it("adds a buy to a person's event where it ends; the shop opens with the cards' prices", () => {
    let p = blankWithPerson();
    expect(buyPrice(p.archive, 9, 1)).toBeGreaterThan(0);
    const before = p.texts["1-1-1"];
    const r = addShop(p, { script: "1-1-1", id: 1, name: "Tam", items: [{ type: 9, index: 1 }, { type: 7, index: 1 }], greeting: "Have a look!" });
    p = apply(p, r);
    keeps(before, p.texts["1-1-1"]);
    expect(p.texts["1-1-1"]).toMatch(/say 0, "Fine wares!"\n {2}say 0, "Tam: Have a +look!"\n {2}buy 9:1, 7:1\n {2}callback/);
    // again: the list is replaced, nothing added
    const again = addShop(p, { script: "1-1-1", id: 1, name: "Tam", items: [{ type: 9, index: 2 }], greeting: "Hello" });
    expect(again.changes[0].source!.match(/buy /g)!.length).toBe(1);
    expect(again.changes[0].source).toContain("buy 9:2\n");
    // play: talk to Tam, and after the lines the shop is open
    const e = newGame(p.archive);
    e.game.mainScene.triggerEvent(1);
    for (let i = 0; i < 6 && screen(e) !== "ScreenGoodsList"; i++) press(e, Keys.ENTER, 6);
    expect(screen(e)).toBe("ScreenGoodsList");
  });

  it("gives a person without an event a shop event", () => {
    const p = project(silentBell(), silentBellSources());
    const m = parseScript(p.texts["1-1-1"]);
    expect(m.events.some((x) => x.number === 9)).toBe(false);
    const r = addShop(p, { script: "1-1-1", id: 9, name: "Peddler", items: [{ type: 9, index: 1 }], greeting: "" });
    expect(r.changes[0].source).toContain(".event 9 @shop_peddler");
    expect(r.changes[0].source).toContain("@shop_peddler:\n  facetoface 0, 9\n  buy 9:1\n  callback");
  });
});

describe("the New battle wizard", () => {
  it("makes a monster from a template", () => {
    const p = project(blankProject("T"), blankSources());
    const m = newMonster(p, { name: "Bog Toad", sprite: 2, template: "normal" });
    expect(m.index).toBe(4);
    const q = apply(p, { changes: [m.change] });
    expect(buildWorld(q.archive).scripts.size).toBe(1);
    expect(findEntry(q.archive, 3, 3, 4)!.data[0x12]).toBe(2); // level: the party (level 1) + 1
  });

  it("turns random battles on for a map (and off on the others); walking there meets monsters", () => {
    let p = project(blankProject("T"), blankSources());
    p = apply(p, newMap(p, { name: "Wilds", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    const r = randomBattles(p, { map: "2-1-2", monsters: [1, 2], background: 1, othersOff: true });
    p = apply(p, r);
    expect(p.texts["1-1-2"]).toContain("  initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0\n  fightenable\n");
    expect(p.texts["1-1-1"]).toMatch(/@start:\n {2}fightdisenable\n {2}ifcmp/);
    // again: the list changes in place
    const again = randomBattles(p, { map: "2-1-2", monsters: [3], background: 2, othersOff: true });
    expect(again.changes.map((c) => c.key)).toEqual(["1-1-2"]);
    expect(again.changes[0].source).toContain("initfight 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0\n");
    const e = newGame(p.archive);
    for (let i = 0; i < 20 && !Combat.IsActive(); i++) press(e, Keys.RIGHT, 2);
    // (on the meadow there are none)
    settle(e);
    expect(where(e)).toBe("WILDS");
    let fought = false;
    for (let i = 0; i < 300 && !fought; i++) {
      press(e, i % 8 < 4 ? Keys.RIGHT : Keys.LEFT, 6);
      fought = Combat.IsActive();
    }
    expect(fought).toBe(true);
  });

  it("starts a battle when talking to someone; winning says the line once, losing ends the game", () => {
    let p = blankWithPerson();
    const r = addBattle(p, { script: "1-1-1", id: 1, name: "Tam", monsters: [1], background: 1, winLine: "You win this time.", loseEnds: true, onceFlag: 5 });
    const before = p.texts["1-1-1"];
    p = apply(p, r);
    keeps(before, p.texts["1-1-1"]);
    expect(p.texts["1-1-1"]).toContain("  if 5, @fight_tam_done\n  enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @fight_tam_lost, @fight_tam_won\n@fight_tam_won:\n  setevent 5\n");
    expect(p.texts["1-1-1"]).toContain("@fight_tam_lost:\n  gameover");
    const e = newGame(p.archive);
    e.game.mainScene.triggerEvent(1);
    for (let i = 0; i < 20 && !Combat.IsActive(); i++) press(e, Keys.ENTER, 6);
    expect(Combat.IsActive()).toBe(true);
    Combat.ForceWin();
    for (let i = 0; i < 400 && (Combat.IsActive() || e.game.mainScene.scriptProcess.running); i++) press(e, Keys.ENTER, 6);
    expect(ScriptResources.globalEvents[5]).toBe(true);
  });
});

describe("play from here", () => {
  it("on the start map: the copy only moves the start, the project is untouched", () => {
    const a = blankProject("T");
    const p = project(a);
    const before = writeLib(a);
    const r = playFromHere(p, "2-1-1", 12, 9);
    expect(writeLib(a)).toEqual(before);
    expect(r.note).toMatch(/flags and variables start as in a new game/i);
    const e = newGame(r.archive);
    expect(where(e)).toBe("START");
    expect(pos(e)).toMatchObject({ x: 12, y: 9 });
  });

  it("on another map: set up by its own script (its people there), the leader on the tile; exits still work", () => {
    let p = project(blankProject("T"), blankSources());
    p = apply(p, newMap(p, { name: "Forest", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    p = apply(p, newPerson(p, { who: { sprite: 1 }, name: "Woodcutter", map: "2-1-2", tile: { x: 9, y: 5 }, line: "Timber!", walks: false }));
    const r = playFromHere(p, "2-1-2", 10, 8);
    const e = newGame(r.archive);
    expect(where(e)).toBe("FOREST");
    expect(pos(e)).toMatchObject({ x: 10, y: 8 });
    expect({ ...e.game.mainScene.getNPC(1).posInMap }).toMatchObject({ x: 9, y: 5 });
    expect(e.game.playerList.length).toBe(1);
    // back through the forest's west exit to the meadow, which plays as usual
    const back = projectWorld(p).maps.get("2-1-2")!.exits[0];
    e.game.mainScene.triggerEvent(back.event);
    settle(e);
    expect(where(e)).toBe("START");
    expect(pos(e)).toMatchObject({ x: 15, y: 7 });
    expect(e.game.playerList.length).toBe(1);
  });

  it("on The Silent Bell's wood and village", () => {
    const p = project(silentBell(), silentBellSources());
    for (const [map, x, y, name] of [["2-1-2", 8, 8, "WHISPERWOOD"], ["2-1-1", 13, 9, "BELLHAVEN"]] as const) {
      const e = newGame(playFromHere(p, map, x, y).archive);
      expect(where(e)).toBe(name);
      expect(pos(e)).toMatchObject({ x, y });
      expect(e.game.playerList.length).toBe(1);
    }
  });

  it("refuses a tile where the player cannot stand", () => {
    expect(() => playFromHere(project(blankProject("T"), blankSources()), "2-1-1", 1, 1)).toThrow(/edge/);
  });
});

describe("the guided first game", () => {
  /** The guide's signals for a project. */
  const sig = (p: Project, g: GuideState) => guideSignals(projectWorld(p), p.archive, g.playtests);

  it("keeps its progress in the notes", () => {
    const n = startGuide(emptyNotes());
    expect(readGuide(n)).toMatchObject({ step: 0, done: [], closed: false, playtests: 0 });
    const n2 = notePlaytest(n);
    expect(readGuide(n2)!.playtests).toBe(1);
    const closed = writeGuide(n2, { ...readGuide(n2)!, closed: true });
    expect(readGuide(startGuide(closed))!.closed).toBe(false);
    expect(readGuide(emptyNotes())).toBeNull();
  });

  it("follows a new author through the seven steps, each done by doing it", () => {
    let p = project(blankProject("T"), blankSources());
    let notes = startGuide(emptyNotes());
    let g = readGuide(notes)!;
    const step = () => STEPS[g.step]?.id;
    g = advance(g, sig(p, g)); // the first step begins
    expect(step()).toBe("paint");
    expect(advance(g, sig(p, g))).toBe(g); // nothing done yet
    // 1. paint a tile
    const map = findEntry(p.archive, 2, 1, 1)!;
    const painted = map.data.slice();
    painted[0x12 + (7 * 20 + 10) * 2] = 0x80 | 5;
    p = apply(p, { changes: [{ key: "2-1-1", data: painted }] });
    g = advance(g, sig(p, g));
    expect(step()).toBe("person");
    // 2. add a person (as the World view does)
    p = apply(p, { changes: [{ key: "3-2-1", data: findEntry(lanternPath(), 3, 2, 1)!.data }] });
    const w = projectWorld(p);
    const m = parseScript(p.texts["1-1-1"]);
    const load = w.maps.get("2-1-1")!.loadedBy[0];
    const added = addPerson(m, { npc: 1, name: "Ostra", x: 10, y: 6, at: placementPosition(m, w, "2-1-1", load), text: "Hello there!" });
    p = { ...p, texts: { ...p.texts, "1-1-1": toText(added.model) } };
    p = apply(p, { changes: [{ key: "1-1-1", data: assembleText(p.texts["1-1-1"]), source: p.texts["1-1-1"] }] });
    g = advance(g, sig(p, g));
    expect(step()).toBe("line");
    // 3. change their line
    const line = firstLine(added.model, added.label)!;
    const said = toText(setLineText(added.model, line.stepId, "Lovely day for a walk."));
    p = apply(p, { changes: [{ key: "1-1-1", data: assembleText(said), source: said }] });
    g = advance(g, sig(p, g));
    expect(step()).toBe("play");
    // 4. playtest (the editor counts it in the notes)
    notes = notePlaytest(writeGuide(notes, g));
    g = readGuide(notes)!;
    g = advance(g, sig(p, g));
    expect(step()).toBe("chest");
    // 5. a chest (an object resource first, as the World view's "make one")
    p = apply(p, { changes: [{ key: "3-4-1", data: findEntry(lanternPath(), 3, 4, 1)!.data }] });
    const w2 = projectWorld(p);
    const m2 = parseScript(p.texts["1-1-1"]);
    const chest = addChest(m2, { box: 1, name: "Chest", x: 12, y: 5, at: placementPosition(m2, w2, "2-1-1", w2.maps.get("2-1-1")!.loadedBy[0]), item: { type: 9, index: 1 }, flag: freeFlag(w2) });
    const t2 = toText(chest.model);
    p = apply(p, { changes: [{ key: "1-1-1", data: assembleText(t2), source: t2 }] });
    g = advance(g, sig(p, g));
    expect(step()).toBe("map");
    // 6. a map alone is part-way; joined by an exit it is done
    const alone = apply(structuredCloneProject(p), newMap(p, { name: "Pond", width: 14, height: 10, tileset: 1, fill: 0, border: null }));
    expect(STEPS[g.step].check(g.base!, sig(alone, g))).toBe(false);
    expect(STEPS[g.step].progress!(g.base!, sig(alone, g))).toMatch(/second map ✓/);
    p = apply(p, newMap(p, { name: "Forest", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    g = advance(g, sig(p, g));
    expect(step()).toBe("play2");
    // 7. playtest again
    g = { ...g, playtests: g.playtests + 1 };
    g = advance(g, sig(p, g));
    expect(g.step).toBe(STEPS.length);
    expect(g.done).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // and the game it made plays: talk, open the chest, walk through the exit
    const e = newGame(p.archive);
    e.game.mainScene.triggerEvent(1);
    settle(e);
    e.game.mainScene.triggerEvent(chest.id);
    settle(e);
    expect(ScriptResources.globalEvents[2]).toBe(true);
    for (let i = 0; i < 9; i++) press(e, Keys.RIGHT, 2);
    settle(e);
    expect(where(e)).toBe("FOREST");
  });

  it("Back and Skip start the step again from the project as it is", () => {
    const p = project(blankProject("T"), blankSources());
    let g = readGuide(startGuide(emptyNotes()))!;
    const now = sig(p, g);
    g = goTo(g, 2, now);
    expect(g).toMatchObject({ step: 2, done: [] });
    g = goTo(g, 3, now, true);
    expect(g).toMatchObject({ step: 3, done: [2] });
    g = goTo(g, 2, now);
    expect(g.step).toBe(2);
  });
});

function structuredCloneProject(p: Project): Project {
  return { archive: { ...p.archive, entries: [...p.archive.entries] }, texts: { ...p.texts } };
}
