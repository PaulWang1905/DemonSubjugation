// The record cards' logic (src/editor/ui/cardModel.ts): what a record is in
// words, which control edits each field, what a stored value may be, the
// effect sentences, "used by", the renumbering plan and the gallery; and the
// author tasks the cards are for, played in the engine (a monster's HP and
// battle sprite in a battle, an item's icon and price in a shop).
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { findEntry, putEntry, writeLib, type LibArchive, type LibEntry } from "../src/editor/format/lib";
import { emptyNotes, resourceNote, setResourceNote } from "../src/editor/format/notes";
import { fieldsFor, readField, writeField, type Field } from "../src/editor/format/schema";
import { checkProject } from "../src/editor/format/validate";
import { buildWorld, referencesTo } from "../src/editor/format/world";
import { scriptSource } from "../src/editor/format/gut";
import {
  checkValue, controlFor, crossChecks, effectText, GALLERY_GROUPS, galleryEntries, galleryGroupOf, hasCard, mergeDrafts, pictureOf, planRenumber, recordKind, refValue, roleOf, sortKeys,
  topFields, usedBy, usedBySummary, usersText, writeRef, type Control,
} from "../src/editor/ui/cardModel";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { memorySaves } from "./helpers";

const BELL = silentBell();
const BELL_SRC = silentBellSources();
const BELL_WORLD = buildWorld(BELL, BELL_SRC);

const rec = (a: LibArchive, resType: number, type: number, index: number) => findEntry(a, resType, type, index)!;
const field = (e: { resType: number; type: number }, key: string) => fieldsFor(e.resType, e.type)!.find((f) => f.key === key)!;
const ctl = (e: LibEntry, key: string): Control => controlFor(e, field(e, key), fieldsFor(e.resType, e.type)!, e.data);

describe("what a record is", () => {
  it("names its role in words", () => {
    expect(roleOf({ resType: 3, type: 1, index: 1 })).toBe("Party member #1");
    expect(roleOf({ resType: 3, type: 2, index: 4 })).toBe("A person");
    expect(roleOf({ resType: 3, type: 3, index: 4 })).toBe("Monster");
    expect(roleOf({ resType: 3, type: 4, index: 1 })).toBe("Chest or object");
    expect(roleOf({ resType: 6, type: 7, index: 1 })).toBe("Weapon");
    expect(roleOf({ resType: 6, type: 9, index: 1 })).toBe("Medicine");
    expect(roleOf({ resType: 4, type: 3, index: 1 })).toBe("Restoring spell");
  });
  it("gives cards to records only", () => {
    expect(hasCard({ resType: 3, type: 3 })).toBe(true);
    expect(hasCard({ resType: 6, type: 14 })).toBe(true);
    expect(hasCard({ resType: 4, type: 5 })).toBe(true);
    expect(hasCard({ resType: 2, type: 1 })).toBe(false);
    expect(hasCard({ resType: 12, type: 1 })).toBe(false);
    expect(recordKind({ resType: 3, type: 9 })).toBe(null);
  });
  it("shows the key numbers of each kind", () => {
    expect(topFields({ resType: 3, type: 3 })).toEqual({ picture: "sprite", stats: ["level", "maxHP", "maxMP", "attack", "defend", "speed"] });
    expect(topFields({ resType: 3, type: 1 }).picture).toBe("walk");
    expect(topFields({ resType: 6, type: 9 })).toEqual({ picture: "icon", stats: ["buy", "sell"] });
    expect(topFields({ resType: 4, type: 1 })).toEqual({ picture: "ani", stats: ["cost"] });
  });
});

describe("fields to controls", () => {
  const wolf = rec(BELL, 3, 3, 3);
  const herb = rec(BELL, 6, 9, 1);
  const spark = rec(BELL, 4, 1, 1);
  const wen = rec(BELL, 3, 2, 1);
  const chest = rec(BELL, 3, 4, 1);
  it("text, numbers with their ranges and units", () => {
    expect(ctl(wolf, "name")).toEqual({ kind: "text", maxBytes: 11, multiline: false });
    expect(ctl(herb, "desc")).toMatchObject({ kind: "text", multiline: true });
    expect(ctl(wolf, "speed")).toEqual({ kind: "number", min: 0, max: 99, unit: undefined });
    expect(ctl(wolf, "maxHP")).toMatchObject({ kind: "number", min: 0, max: 999 });
    expect(ctl(wolf, "iq")).toMatchObject({ kind: "number", max: 100, unit: "%" });
    expect(ctl(herb, "buy")).toMatchObject({ kind: "number", max: 65535, unit: "gold" });
    expect(ctl(spark, "cost")).toMatchObject({ kind: "number", max: 127, unit: "MP" });
    expect(ctl(spark, "rounds")).toMatchObject({ kind: "number", max: 127, unit: "rounds" });
    expect(ctl(spark, "hp")).toMatchObject({ kind: "number", min: -32767, max: 32767 });
    expect(ctl(rec(BELL, 3, 1, 1), "level")).toMatchObject({ kind: "number", min: 1 });
  });
  it("enums and bit fields", () => {
    expect(ctl(wen, "facing")).toMatchObject({ kind: "select", options: [[1, "North"], [2, "East"], [3, "South"], [4, "West"]] });
    expect(ctl(wen, "step")).toMatchObject({ kind: "select", options: [[0, "Left foot forward"], [1, "Standing"], [2, "Right foot forward"]] });
    expect((ctl(chest, "step") as { options: unknown[] }).options).toHaveLength(2);
    expect(ctl(wolf, "immune")).toMatchObject({ kind: "checks" });
    expect(ctl(herb, "users")).toMatchObject({ kind: "checks" });
    expect(ctl(spark, "all")).toEqual({ kind: "toggle" });
  });
  it("references become pickers of the right kind", () => {
    expect(ctl(wolf, "sprite")).toEqual({ kind: "ref", resType: 8, types: [3], allowNone: true });
    expect(ctl(wen, "sprite")).toMatchObject({ kind: "ref", resType: 8, types: [2] });
    expect(ctl(herb, "icon")).toMatchObject({ kind: "ref", resType: 9, types: [9] });
    expect(ctl(spark, "ani")).toMatchObject({ kind: "ref", resType: 5, types: [2] });
    expect(ctl(wolf, "chain")).toEqual({ kind: "spellList" });
    expect(ctl(rec(BELL, 3, 1, 2), "weapon")).toMatchObject({ kind: "ref", resType: 6, types: [7] });
    // a drop: one picker over every item kind; the kind byte goes with it
    const drop = ctl(wolf, "dropIndex");
    expect(drop).toMatchObject({ kind: "ref", resType: 6, types: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] });
    expect((drop as { typeField: Field }).typeField.key).toBe("dropType");
    expect(ctl(wolf, "dropType")).toEqual({ kind: "hidden" });
    expect(ctl(wolf, "stealType")).toEqual({ kind: "hidden" });
  });
  it("a picked reference writes the index and its kind", () => {
    const rat = rec(BELL, 3, 3, 2);
    const c = ctl(rat, "dropIndex") as Extract<Control, { kind: "ref" }>;
    expect(refValue(field(rat, "dropIndex"), c, rat.data)).toEqual({ type: 9, index: 1 });
    const next = writeRef(rat.data, field(rat, "dropIndex"), c, { type: 7, index: 2 });
    expect(next[0x2b]).toBe(7);
    expect(next[0x2c]).toBe(2);
    expect([...next].filter((b, i) => b !== rat.data[i]).length).toBe(2);
    const none = writeRef(rat.data, field(rat, "dropIndex"), c, null);
    expect(refValue(field(rat, "dropIndex"), c, none)).toBe(null);
  });
});

describe("what a stored value may be", () => {
  const wolf = rec(BELL, 3, 3, 3);
  const fields = fieldsFor(3, 3)!;
  const check = (data: Uint8Array, key: string, e: LibEntry = wolf) => checkValue(BELL, e, field(e, key), fieldsFor(e.resType, e.type)!, data);
  it("is fine as the templates store it", () => {
    const found: string[] = [];
    for (const a of [BELL, lanternPath(), blankProject("X")])
      for (const e of a.entries.filter(hasCard))
        for (const f of fieldsFor(e.resType, e.type)!) {
          const issue = checkValue(a, e, f, fieldsFor(e.resType, e.type)!, e.data);
          if (issue) found.push(`${e.resType}-${e.type}-${e.index} ${f.key}: ${issue.text}`);
        }
    // (the Silent Bell's last boss asks for more HP than the game keeps)
    expect(found).toEqual(["3-3-12 maxHP: Stored 1100; allowed 0-999 (the game treats more as 999).", "3-3-12 hp: Stored 1100; allowed 0-999 (the game treats more as 999)."]);
  });
  it("says what is allowed, in place, for a wrong number, choice, bit or reference", () => {
    const d = wolf.data.slice();
    d[0x13] = 150; // speed
    expect(check(d, "speed")).toEqual({ level: "error", text: "Stored 150; allowed 0-99." });
    const wen = rec(BELL, 3, 2, 1);
    const w = wen.data.slice();
    w[2] = 9;
    expect(check(w, "facing", wen)?.text).toBe("Stored 9, which is not one of: North (1), East (2), South (3), West (4).");
    d[3] = 8 | 64; // immune: poison and an unknown bit
    expect(check(d, "immune")).toMatchObject({ level: "warning", text: expect.stringContaining("bit 64") });
    d[0x2e] = 77; // a sprite that does not exist
    expect(check(d, "sprite")?.text).toBe("Refers to sprite 3-77, which does not exist. Pick one, or None.");
    d[0x2f] = 40;
    expect(check(d, "chain")?.text).toMatch(/spell list 1-40, which does not exist/);
    d[0x2b] = 30; // a drop of an item kind that does not exist
    d[0x2c] = 1;
    expect(check(d, "dropIndex")?.text).toMatch(/kind 30/);
    // (items made by the kit store "everyone" as 0xFF: not a problem)
    const herb = rec(BELL, 6, 9, 1);
    const h = herb.data.slice();
    h[3] = 0xff;
    expect(check(h, "users", herb)).toBe(null);
    expect(fields.length).toBeGreaterThan(20);
  });
  it("checks fields against each other", () => {
    const d = wolf.data.slice();
    d[0x1a] = 200; // HP at the start above max HP 55
    d[2] = 4; // knows 4 spells, has no list
    expect(crossChecks(BELL, { ...wolf, data: d }).get("hp")?.text).toBe("HP at the start (200) is more than Max HP (55).");
    expect(crossChecks(BELL, { ...wolf, data: d }).get("known")?.text).toBe("Knows 4 spells, but has no spell list.");
    const rod = rec(BELL, 6, 7, 1);
    const r = writeField(writeField(rod.data, field(rod, "sell"), 99), field(rod, "users"), 0);
    const cross = crossChecks(BELL, { ...rod, data: r });
    expect(cross.get("sell")?.text).toMatch(/Sells for more \(99\) than it costs \(30\)/);
    expect(cross.get("users")?.text).toMatch(/No one can use it/);
    const rin = rec(BELL, 3, 1, 1);
    expect(crossChecks(BELL, writeLevel(rin, 40)).get("level")?.text).toMatch(/above the level table's \d+ levels/);
    expect(crossChecks(BELL, rec(BELL, 3, 3, 1)).size).toBe(0);
  });
});
const writeLevel = (e: LibEntry, n: number): LibEntry => ({ ...e, data: writeField(e.data, field(e, "level"), n) });

describe("effects, users and pictures in words", () => {
  it("says what items and spells do", () => {
    expect(effectText(BELL, rec(BELL, 6, 9, 1))).toBe("Restores 60 HP");
    expect(effectText(BELL, rec(BELL, 6, 7, 1))).toBe("+5 attack");
    expect(effectText(BELL, rec(BELL, 4, 1, 1))).toBe("Deals 40 HP damage");
    expect(effectText(BELL, rec(BELL, 4, 1, 2))).toBe("Deals 70 HP damage to all enemies");
    expect(effectText(BELL, rec(BELL, 4, 3, 1))).toBe("Heals 70 HP");
    expect(effectText(BELL, rec(BELL, 4, 4, 1))).toMatch(/^Revives with \d+% of max HP$/);
    expect(effectText(BELL, rec(BELL, 6, 14, 1))).toBe("Carried for the story");
  });
  it("names who can use an item", () => {
    expect(usersText(BELL, rec(BELL, 6, 7, 1))).toBe("Rin");
    const rod = rec(BELL, 6, 7, 1);
    expect(usersText(BELL, { ...rod, data: writeField(rod.data, field(rod, "users"), 3) })).toBe("Everyone (Rin and Bram)");
    expect(usersText(BELL, { ...rod, data: writeField(rod.data, field(rod, "users"), 0) })).toBe("No one");
  });
  it("finds each record's picture", () => {
    expect(pictureOf(BELL, rec(BELL, 3, 3, 3))).toMatchObject({ key: "8-3-3", still: 0 });
    expect(pictureOf(BELL, rec(BELL, 3, 2, 1))).toEqual({ key: "8-2-1", still: 7, walk: [7, 6, 7, 8] });
    expect(pictureOf(BELL, rec(BELL, 6, 9, 1))).toMatchObject({ key: "9-9-1" });
    expect(pictureOf(BELL, rec(BELL, 4, 1, 1))).toMatchObject({ key: "5-2-2" });
    const wolf = rec(BELL, 3, 3, 3);
    expect(pictureOf(BELL, { ...wolf, data: writeField(wolf.data, field(wolf, "sprite"), 0) })).toBe(null);
  });
});

describe("used by", () => {
  it("lists script lines in words and records, scripts first", () => {
    const herb = usedBy(BELL_WORLD, BELL, "6-9-1");
    expect(herb[0]).toEqual({ from: "1-1-1", group: "script", title: "Bellhaven, talking to Wen", detail: "Give Herb", count: 1, open: { key: "1-1-1", line: 77 } });
    expect(herb.find((u) => u.open.line === 107)?.detail).toMatch(/^Open a shop selling Herb, Tonic/);
    const records = herb.filter((u) => u.group === "record");
    expect(records.map((u) => `${u.title}: ${u.detail}`)).toEqual(["Monster Thorn Rat: drops it", "Monster Rock Beetle: drops it"]);
    expect(usedBySummary(herb)).toBe("Used in 6 script lines and 2 records");
  });
  it("counts a monster twice in one battle once, ×2", () => {
    const wolf = usedBy(BELL_WORLD, BELL, "3-3-3");
    const battle = wolf.find((u) => u.open.line === 33)!;
    expect(battle.count).toBe(2);
    expect(battle.title).toBe("Whisperwood, talking to Bram");
    expect(usedBySummary(wolf)).toBe("Used in 2 script lines");
  });
  it("says who learns a spell through a spell list, and who starts with an item", () => {
    expect(usedBy(BELL_WORLD, BELL, "4-1-1")).toEqual([{ from: "12-1-1", group: "table", title: "Spell list 1-1 (Party member Rin)", detail: "spell 1 of the list", count: 1, open: { key: "12-1-1" } }]);
    expect(usedBy(BELL_WORLD, BELL, "6-7-3").map((u) => `${u.title}: ${u.detail}`)).toEqual(["Party member Bram: starts holding it (weapon)"]);
    expect(usedBySummary(usedBy(BELL_WORLD, BELL, "4-1-1"))).toBe("Used in 1 table");
  });
  it("says when nothing uses a record", () => {
    const blank = blankProject("X");
    const w = buildWorld(blank);
    expect(usedBy(w, blank, "6-9-2")).toEqual([]);
    expect(usedBySummary([])).toBe("Not used anywhere");
    expect(usedBySummary(usedBy(w, blank, "3-1-1"))).toBe("Used in 1 script line");
  });
  it("uses the author's name for a script's people", () => {
    const people = usedBy(BELL_WORLD, BELL, "3-2-1");
    expect(people).toHaveLength(1);
    expect(people[0].detail).toMatch(/^Place Wen at/);
  });
});

describe("renumbering through the world index", () => {
  it("moves an item and every reference to it, and says what it touches", () => {
    const a = silentBell();
    const before = checkProject(a, BELL_SRC).filter((p) => p.level === "error");
    const plan = planRenumber(a, BELL_SRC, {}, { resType: 6, type: 9, index: 1 }, 7, setResourceNote(emptyNotes(), "6-9-1", { note: "starter heal" }));
    expect(plan.moved).toEqual([["6-9-1", "6-9-7"]]);
    expect(plan.summary).toBe("1 script and 2 records will be updated.");
    expect(plan.details).toEqual(expect.arrayContaining(["Script 1-1 Bellhaven", "Monster 3-2 Thorn Rat"]));
    const r = plan.result;
    const w = buildWorld(r.archive, r.sources);
    expect(referencesTo(w, "6-9-1")).toEqual([]);
    expect(referencesTo(w, "6-9-7")).toHaveLength(referencesTo(BELL_WORLD, "6-9-1").length);
    expect(checkProject(r.archive, r.sources).filter((p) => p.level === "error")).toEqual(before);
    expect(resourceNote(r.notes, "6-9-7")?.note).toBe("starter heal");
    // (the input is not changed)
    expect(findEntry(a, 6, 9, 1)).toBeDefined();
  });
  it("updates unapplied script text too, and warns about text that does not assemble", () => {
    const a = silentBell();
    const draft = `${BELL_SRC["1-1-2"]}\n; typed, not applied\n`;
    const plan = planRenumber(a, BELL_SRC, { "1-1-2": draft, "1-1-4": "this is not a script" }, { resType: 6, type: 9, index: 2 }, 9);
    expect(plan.merged).toEqual(["1-1-2"]);
    expect(plan.result.sources["1-1-2"]).toContain("; typed, not applied");
    expect(plan.result.sources["1-1-2"]).toMatch(/gaingoods 9, 9/);
    expect(plan.warnings.some((w) => /Script 1-4 The Mire has typed text that does not assemble/.test(w))).toBe(true);
  });
  it("moves a party member with its portrait, battle sprite and level table", () => {
    const plan = planRenumber(silentBell(), BELL_SRC, {}, { resType: 3, type: 1, index: 2 }, 3);
    expect(plan.moved.map(([a, b]) => `${a}>${b}`)).toEqual(expect.arrayContaining(["3-1-2>3-1-3", "12-2-2>12-2-3"]));
    expect(plan.warnings.join(" ")).toMatch(/Also moved/);
  });
  it("refuses a number that is taken or out of range", () => {
    expect(() => planRenumber(silentBell(), BELL_SRC, {}, { resType: 6, type: 9, index: 1 }, 2)).toThrow(/already used/);
    expect(() => planRenumber(silentBell(), BELL_SRC, {}, { resType: 6, type: 9, index: 1 }, 300)).toThrow(/1-255/);
  });
  it("renumbers a map with its scripts' loadmap lines, and a script", () => {
    const plan = planRenumber(silentBell(), BELL_SRC, {}, { resType: 2, type: 1, index: 3 }, 9);
    expect(plan.summary).toMatch(/script/);
    expect(plan.result.sources["1-1-3"]).toMatch(/loadmap 1, 9,/);
    const s = planRenumber(silentBell(), BELL_SRC, {}, { resType: 1, type: 1, index: 5 }, 8);
    expect(s.moved).toEqual([["1-1-5", "1-1-8"]]);
    expect(s.result.sources["1-1-8"]).toMatch(/^\.gut 1 8/m);
  });
  it("merges drafts without changing the project", () => {
    const a = silentBell();
    const m = mergeDrafts(a, BELL_SRC, { "1-1-3": scriptSource(rec(a, 1, 1, 3).data, BELL_SRC["1-1-3"]) + "\n" });
    expect(m.merged).toEqual(["1-1-3"]);
    expect(m.archive).not.toBe(a);
    expect(mergeDrafts(a, BELL_SRC, {}).archive).toBe(a);
  });
});

describe("the gallery", () => {
  it("groups, sorts by a number and searches", () => {
    const monsters = GALLERY_GROUPS.find((g) => g.id === "3-3")!;
    const byHp = galleryEntries(BELL, monsters, "", "maxHP", true);
    expect(byHp).toHaveLength(12);
    const hp = byHp.map((e) => Number(readField(e.data, field(e, "maxHP"))));
    expect(hp).toEqual([...hp].sort((a, b) => b - a));
    expect(galleryEntries(BELL, monsters, "wisp", "index", false).map((e) => e.index)).toEqual([7, 10]);
    expect(galleryEntries(BELL, monsters, "", "index", true)[0].index).toBe(12);
    expect(sortKeys(byHp).map(([k]) => k)).toEqual(expect.arrayContaining(["index", "maxHP", "attack", "exp", "money"]));
    expect(sortKeys(byHp).map(([k]) => k)).not.toContain("sprite");
    expect(galleryGroupOf({ resType: 6, type: 7, index: 1 })?.label).toBe("Weapons");
    expect(galleryGroupOf({ resType: 4, type: 3, index: 1 })?.id).toBe("4");
    const notes = setResourceNote(emptyNotes(), "3-3-4", { note: "the forest boss" });
    expect(galleryEntries(BELL, monsters, "boss", "index", false, notes).map((e) => e.index)).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// The author tasks, played in the engine

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
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
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
};
function boot(a: LibArchive): Engine {
  let s = 7;
  const e = createEngine({ resources: { datLib: writeLib(a), ...blankFonts }, saves: memorySaves(), random: () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  settle(e);
  return e;
}

describe("author tasks, played", () => {
  it("a monster's new HP and battle sprite show in a battle", () => {
    const a = lanternPath();
    const wisp = rec(a, 3, 3, 3);
    const fields = fieldsFor(3, 3)!;
    let d = writeField(wisp.data, field(wisp, "maxHP"), 321);
    d = writeField(d, field(wisp, "hp"), 321);
    const c = controlFor(wisp, field(wisp, "sprite"), fields, d) as Extract<Control, { kind: "ref" }>;
    d = writeRef(d, field(wisp, "sprite"), c, { type: 3, index: 1 });
    // only those bytes changed
    expect([...d].map((b, i) => (b !== wisp.data[i] ? i : -1)).filter((i) => i >= 0)).toEqual([0x18, 0x19, 0x1a, 0x1b, 0x2e]);
    putEntry(a, { ...wisp, data: d });
    const e = boot(a);
    e.game.mainScene.triggerEvent(1);
    settle(e);
    e.game.mainScene.triggerEvent(41); // to the glade
    settle(e);
    e.game.mainScene.triggerEvent(1); // the stone: a fight with the wisp
    for (let i = 0; i < 50 && !Combat.IsActive(); i++) press(e, Keys.ENTER, 3);
    expect(Combat.IsActive()).toBe(true);
    const monsters = (Combat.current as unknown as { mMonsterList: { name: string; maxHP: number; fightingSprite: { mImage: { index: number } } }[] }).mMonsterList;
    const m = monsters.find((x) => x.name === "Glade Wisp")!;
    expect(m.maxHP).toBe(321);
    expect(m.fightingSprite.mImage.index).toBe(1);
    Combat.ForceWin();
  });

  it("an item's new price and icon show in a shop", () => {
    const a = lanternPath();
    const herb = rec(a, 6, 9, 1);
    const fields = fieldsFor(6, 9)!;
    let d = writeField(herb.data, field(herb, "buy"), 77);
    const c = controlFor(herb, field(herb, "icon"), fields, d) as Extract<Control, { kind: "ref" }>;
    expect(c.types).toEqual([9]);
    // a second medicine icon to pick
    putEntry(a, { resType: 9, type: 9, index: 5, data: (() => { const x = rec(a, 9, 9, 2).data.slice(); x[1] = 5; return x; })() });
    d = writeRef(d, field(herb, "icon"), c, { type: 9, index: 5 });
    putEntry(a, { ...herb, data: d });
    const e = boot(a);
    e.game.mainScene.triggerEvent(2); // Tam's shop
    for (let i = 0; i < 20 && e.game.getCurScreen().constructor.name === "ScreenMainGame"; i++) press(e, Keys.ENTER, 3);
    const screen = e.game.getCurScreen() as unknown as { constructor: { name: string }; goodsList: { name: string; buyPrice: number; mImage: { index: number } }[] };
    expect(screen.constructor.name).toBe("ScreenGoodsList");
    const sold = screen.goodsList.find((g) => g.name === "Herb")!;
    expect(sold.buyPrice).toBe(77);
    expect(sold.mImage.index).toBe(5);
  });

  it("the shop and the battle templates stay clean in the project check after card edits", () => {
    const a = lanternPath();
    const src = lanternPathSources();
    const herb = rec(a, 6, 9, 1);
    putEntry(a, { ...herb, data: writeField(herb.data, field(herb, "buy"), 12) });
    expect(checkProject(a, src).filter((p) => p.level === "error")).toEqual([]);
  });
});
