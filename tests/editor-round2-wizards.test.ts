// Fixes from the second new-author test (round 2), items 6-12: a companion
// who joins, a new party member's own art and level table, learning a new
// spell from its card, the inn and "+ Add step" inside the right branch,
// random battles' settings, the shop wizard on an existing person, and the
// chest's script read as "If opened: … / Otherwise: …". Generated scripts
// assemble, keep their text through the model, and play in the engine.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { Player } from "../src/engine/fmj/characters/Player";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { findEntry, putEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { assemble } from "../src/editor/format/gut";
import { readLevels, readMagicChain } from "../src/editor/format/schema";
import { eventGroup, outline, parseScript, startGroup, toSource, type OutlineNode } from "../src/editor/format/scriptModel";
import {
  addCompanion,
  addInn,
  addShop,
  backgroundFor,
  battleSlots,
  fullTexts,
  mapBattles,
  newPerson,
  randomBattles,
  saysFirst,
  shopValueHints,
  slotWeights,
  type Change,
  type Project,
  type WizardResult,
} from "../src/editor/format/wizards";
import { addSpellToMember, companionOf, fitSpellsKnown, innParty, joinsAs, learnFromLevel, memberRecord, spellLearners, stillCopies } from "../src/editor/format/party";
import { addChest } from "../src/editor/format/worldEdit";
import { buildWorld } from "../src/editor/format/world";
import { insertionPoint, joinLabels, listEnd, startingValues } from "../src/editor/ui/scriptVisualLogic";
import { createResource } from "../src/editor/ui/create";
import { notePlaced, worldSelection } from "../src/editor/ui/intents";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
function boot(a: LibArchive): Engine {
  let s = 11;
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
const project = (a: LibArchive, texts?: Record<string, string>): Project => ({ archive: a, texts: fullTexts(a, texts) });
function apply(p: Project, r: WizardResult | { changes: Change[] }): Project {
  for (const c of r.changes) {
    const [resType, type, index] = c.key.split("-").map(Number);
    putEntry(p.archive, { resType, type, index, data: c.data });
  }
  const texts = { ...p.texts };
  for (const c of r.changes) if (c.source !== undefined) texts[c.key] = c.source;
  return { archive: p.archive, texts };
}
type Block = Extract<OutlineNode, { kind: "block" }>;
const blocks = (nodes: OutlineNode[]): Block[] => nodes.flatMap((n) => (n.kind === "block" ? [n, ...n.arms.flatMap((a) => (a.nodes ? blocks(a.nodes) : []))] : []));
const texts = (nodes: OutlineNode[] | null) => (nodes ?? []).map((n) => n.step.text.trim()).filter(Boolean);
/** Every generated script keeps its text through the model, and assembles. */
const roundTrips = (p: Project) => {
  for (const [k, t] of Object.entries(p.texts)) {
    expect(toSource(parseScript(t)), k).toBe(t);
    expect(() => assemble(t), k).not.toThrow();
  }
};

// a blank game with a person (the innkeeper, the shop keeper) on START
function withPerson(name = "Hana", tile = { x: 10, y: 6 }, line = "Hello!") {
  let p = project(blankProject("T"), blankSources());
  const r = newPerson(p, { who: { sprite: 2 }, name, map: "2-1-1", tile, line, walks: false });
  p = apply(p, r);
  return { p, id: r.placed!.id };
}

describe("12. the chest reads as If opened / Otherwise", () => {
  const m0 = parseScript(blankSources()["1-1-1"]);
  const r = addChest(m0, { box: 1, name: "Chest", x: 8, y: 5, at: "end", item: { type: 9, index: 1 }, flag: 9 });
  const m = r.model;

  it("its event: If the flag is set, the empty line; Otherwise give, set the flag", () => {
    const [b] = blocks(outline(m, eventGroup(m, r.id)!));
    expect(b.step.op.name).toBe("if");
    expect(b.arms.map((a) => a.key)).toEqual(["ifSet", "otherwise"]);
    expect(texts(b.arms[0].nodes)).toEqual([expect.stringMatching(/^message "The chest is/), "callback"]);
    expect(texts(b.arms[1].nodes)).toEqual([`boxopen ${r.id}`, "gaingoods 9, 1", "setevent 9", "callback"]);
    // "add a step" with nothing selected goes before the Otherwise's End
    const end = b.arms[1].nodes!.find((n) => n.step.text.trim() === "callback")!;
    expect(listEnd(outline(m, eventGroup(m, r.id)!), "end")).toEqual({ before: end.step.id });
  });

  it("the map's start: If opened, shown open; Otherwise nothing, and the join label is said in words", () => {
    const nodes = outline(m, startGroup(m)!);
    const it = blocks(nodes).find((b) => b.block === "ifThen")!;
    expect(texts(it.arms[0].nodes)).toEqual([`boxopen ${r.id}`]);
    expect(joinLabels(nodes, new Map([[it.joinLabel!, 1]]))).toEqual(new Set([it.joinLabel]));
  });

  it("a skip (if set, go past some steps) shows them as its Otherwise: the blank game's welcome, Bram in the Whisperwood", () => {
    const blank = parseScript(blankSources()["1-1-1"]);
    const [welcome] = blocks(outline(blank, startGroup(blank)!));
    expect(welcome.joinLabel).toBe("welcomed");
    expect(welcome.arms.map((a) => [a.key, a.skip ?? false])).toEqual([
      ["ifSet", true],
      ["otherwise", false],
    ]);
    expect(texts(welcome.arms[1].nodes)[0]).toBe("setevent 1");
    const wood = parseScript(silentBellSources()["1-1-2"]);
    const bram = blocks(outline(wood, startGroup(wood)!)).find((b) => b.joinLabel === "no_bram")!;
    expect(texts(bram.arms[1].nodes)).toEqual(["createnpc 1, 6, 12, 4"]);
  });

  it("every template script still shows each of its steps once", () => {
    for (const src of [...Object.values(blankSources()), ...Object.values(silentBellSources()), ...Object.values(lanternPathSources())]) {
      const mm = parseScript(src);
      for (const g of mm.groups) {
        const ids = blocks(outline(mm, g)).length >= 0 ? outlineIds(outline(mm, g)) : [];
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort((a, b) => a - b)).toEqual(mm.steps.slice(g.from, g.to).map((s) => s.id));
      }
    }
  });
});

function outlineIds(nodes: OutlineNode[]): number[] {
  return nodes.flatMap((n) => (n.kind === "step" ? [n.step.id] : [n.step.id, ...n.extra.map((s) => s.id), ...n.arms.flatMap((a) => [...(a.labelStep ? [a.labelStep.id] : []), ...(a.nodes ? outlineIds(a.nodes) : [])])]));
}

describe("9. + Add step after an If goes on its Otherwise, not into its branch", () => {
  it("selecting an If (money, a flag) adds after it, the way it goes on", () => {
    const src = '.gut 1 1\n.events 1\n.event 1 @inn\n\n@start:\n  callback\n@inn:\n  testmoney 10, @poor\n  usemoney 10\n  callback\n@poor:\n  message "No."\n  callback\n';
    const m = parseScript(src);
    const g = eventGroup(m, 1)!;
    const test = m.steps.find((s) => s.kind === "instruction" && s.op.name === "testmoney")!;
    expect(insertionPoint(m, g, test.id)).toEqual({ after: test.id });
    const [b] = blocks(outline(m, g));
    expect(texts(b.arms[1].nodes)).toEqual(["usemoney 10", "callback"]);
  });
});

describe("9. the inn", () => {
  it("in the blank game: asks, takes the money, restores HP and MP; the Visual view nests it", () => {
    const { p: p0, id } = withPerson();
    const r = addInn(p0, { script: "1-1-1", id, name: "Hana", price: 10, offer: "A bed is 10 gold.", rested: "You feel rested.", poor: "Not enough gold.", no: "Come again!" });
    expect(r.party.always.map((x) => x.name)).toEqual(["Mira"]);
    const p = apply(p0, r);
    roundTrips(p);
    const m = parseScript(p.texts["1-1-1"]);
    const g = eventGroup(m, id)!;
    const choice = blocks(outline(m, g)).find((b) => b.block === "choice")!;
    const money = choice.arms[0].nodes!.find((n): n is Block => n.kind === "block")!;
    expect(money.step.op.name).toBe("testmoney");
    expect(texts(money.arms[0].nodes)).toEqual([expect.stringMatching(/^say 0, "Hana: Not/), "callback"]);
    expect(texts(money.arms[1].nodes)).toEqual(["usemoney 10", "; HP and MP back to full (the game stops MP at each member's maximum)", "resumeactorhp 1, 100", "attribadd 1, 5, 999", expect.stringMatching(/^message "You feel/), "callback"]);
    expect(texts(choice.arms[1].nodes)[0]).toMatch(/^say 0, "Hana: Come/);

    // played: hurt, with money, talk and rest
    const e = newGame(p.archive);
    const hero = e.game.playerList[0];
    hero.hp = 5;
    hero.mp = 1;
    Player.sMoney = 25;
    e.game.mainScene.triggerEvent(id);
    settle(e);
    expect([hero.hp, hero.mp, Player.sMoney]).toEqual([hero.maxHP, hero.maxMP, 15]);
    // without the money: nothing changes
    hero.hp = 5;
    Player.sMoney = 3;
    e.game.mainScene.triggerEvent(id);
    settle(e);
    expect([hero.hp, Player.sMoney]).toEqual([5, 3]);
  });

  it("in The Silent Bell: Rin always, Bram while flag 12 (he joined) is set", () => {
    const a = silentBell();
    const party = innParty(buildWorld(a, silentBellSources()), a, silentBellSources()["1-1-1"]);
    expect(party.always.map((x) => x.name)).toEqual(["Rin"]);
    expect(party.whenFlag.map((x) => [x.name, x.flag])).toEqual([["Bram", 12]]);
    expect(party.unknown).toEqual([]);
  });

  it("a companion is rested only once they joined (the original stops on a member not in the party)", () => {
    let { p } = withPerson("Hana", { x: 10, y: 6 });
    const c = addCompanion(p, { member: { name: "Kai", walk: 1, ownWalk: true, like: 1, level: 1, maxHP: 50, maxMP: 8, attack: 9, defend: 4, speed: 9, spells: [] }, map: "2-1-1", tile: { x: 12, y: 8 }, line: "Can I come?", joined: "" });
    p = apply(p, c);
    const hana = buildWorld(p.archive, p.texts).placements.find((x) => x.name === "Hana")!;
    const r = addInn(p, { script: "1-1-1", id: hana.id, name: "Hana", price: 0, offer: "", rested: "", poor: "", no: "" });
    expect(r.party.whenFlag.map((x) => [x.name, x.flag])).toEqual([["Kai", c.flag]]);
    p = apply(p, r);
    roundTrips(p);
    const src = p.texts["1-1-1"];
    expect(src).toMatch(new RegExp(`if ${c.flag}, @inn_kai\\n  goto @inn_kai_rested\\n@inn_kai:\\n  resumeactorhp ${c.member}, 100\\n  attribadd ${c.member}, 5, 999\\n@inn_kai_rested:`));
    const e = newGame(p.archive);
    e.game.mainScene.triggerEvent(c.id); // Kai joins
    settle(e);
    const kai = e.game.playerList.find((x) => x.index === c.member)!;
    kai.hp = 3;
    e.game.mainScene.triggerEvent(hana.id);
    settle(e);
    expect(kai.hp).toBe(kai.maxHP);
  });
});

describe("6. a companion who joins", () => {
  const start = () => project(blankProject("T"), blankSources());
  const kai = { name: "Kai", walk: 1, ownWalk: true, like: 1, level: 1, maxHP: 55, maxMP: 12, attack: 11, defend: 5, speed: 9, spells: [{ type: 3, index: 1 }] };

  it("makes the member with art of their own, the person who looks like them, the join event and the guard", () => {
    const p0 = start();
    const c = addCompanion(p0, { member: kai, map: "2-1-1", tile: { x: 12, y: 8 }, line: "Mind if I come along?", joined: "Kai joined the party!" });
    const keys = c.changes.map((x) => x.key);
    expect(c.member).toBe(2);
    // portrait, battle sprite, level table by number; own walk sprite; a person sprite like it; spell list
    for (const k of ["11-1-2", "11-3-2", "12-2-2", "8-1-2", "12-1-2", "3-1-2", "3-2-1", "1-1-1"]) expect(keys).toContain(k);
    const p = apply(p0, c);
    roundTrips(p);
    // the person on the map looks like Kai's walk sprite (a person sprite with the same frames)
    const look = findEntry(p.archive, 3, 2, 1)!.data[0x16];
    expect(findEntry(p.archive, 8, 2, look)!.data.slice(2)).toEqual(findEntry(p.archive, 8, 1, 2)!.data.slice(2));
    expect(memberRecord(p.archive, 2)).toMatchObject({ name: "Kai", walk: 2, list: 2, known: 1 });
    // the level table copied from Mira's counts no more spells than Kai's list has
    expect(Math.max(...readLevels(findEntry(p.archive, 12, 2, 2)!.data).map((r) => r[8]))).toBeLessThanOrEqual(1);
    const src = p.texts["1-1-1"];
    expect(src).toContain(`  if ${c.flag}, @join_kai_gone\n  createnpc ${c.id}, 1, 12, 8\n@join_kai_gone:`);
    expect(src).toMatch(new RegExp(`@join_kai:\\n  facetoface 0, ${c.id}\\n  say 0, "Kai: [^"]*"\\n  deletenpc ${c.id}\\n  createactor 2, 4, 3\\n  setevent ${c.flag}\\n  message "Kai joined`));
    // the place name still shows: the guard skips only the placing line
    expect(src.indexOf("showscenename")).toBeGreaterThan(src.indexOf("@join_kai_gone:"));
    const w = buildWorld(p.archive, p.texts);
    expect(companionOf(w, 2)?.person?.name).toBe("Kai");
    expect(joinsAs(w, "3-2-1")?.member).toBe(2);
    // the notes name the flag
    expect(c.notes!({ version: 1, flags: {}, variables: {}, resources: {}, extra: {} }).flags[String(c.flag)].name).toBe("Kai joined the party");
  });

  it("plays: talking adds Kai and removes him; back on the map he is not there", () => {
    let p = start();
    const c = addCompanion(p, { member: kai, map: "2-1-1", tile: { x: 12, y: 8 }, line: "Hi", joined: "" });
    p = apply(p, c);
    const e = newGame(p.archive);
    expect(e.game.mainScene.getNPC(c.id)?.name).toBe("Kai");
    e.game.mainScene.triggerEvent(c.id);
    settle(e);
    expect(e.game.playerList.map((x) => x.name)).toEqual(["Mira", "Kai"]);
    expect(ScriptResources.globalEvents[c.flag]).toBe(true);
    // the map's script again (as when the party comes back): Kai is not placed
    e.game.mainScene.startChapter(1, 1);
    settle(e);
    expect(e.game.mainScene.getNPC(c.id)?.name ?? "").not.toBe("Kai");
  });

  it("the party holds 3: a fourth companion is refused", () => {
    let p = start();
    for (const [n, x] of [
      ["Kai", 12],
      ["Lio", 13],
    ] as const)
      p = apply(p, addCompanion(p, { member: { ...kai, name: n }, map: "2-1-1", tile: { x, y: 8 }, line: "", joined: "" }));
    expect(() => addCompanion(p, { member: { ...kai, name: "Ana" }, map: "2-1-1", tile: { x: 14, y: 8 }, line: "", joined: "" })).toThrow(/3 members at most/);
  });
});

describe("7. a new party member's own art", () => {
  it("New party member: portrait, battle sprite, level table and walk sprite are copies to draw over", () => {
    const a = blankProject("T");
    const key = createResource(a, "player");
    expect(key).toBe("3-1-2");
    for (const k of [
      [11, 1, 2],
      [11, 3, 2],
      [12, 2, 2],
      [8, 1, 2],
    ] as const)
      expect(findEntry(a, k[0], k[1], k[2]), k.join("-")).toBeTruthy();
    expect(memberRecord(a, 2)!.walk).toBe(2);
    expect(stillCopies(a, 2).map((c) => c.what)).toEqual(["portrait", "battle sprite", "walk sprite"]);
    // a new party walk sprite: a copy of one, not blank frames
    const w = createResource(a, "gfx:8-1");
    const [, , i] = w.split("-").map(Number);
    expect(findEntry(a, 8, 1, i)!.data.slice(2)).toEqual(findEntry(a, 8, 1, 1)!.data.slice(2));
  });
});

describe("8. learning a new spell from its card", () => {
  it("shows who learns it and adds it to a member's list (their own when it is shared)", () => {
    const a = blankProject("T");
    createResource(a, "player"); // Hero 2 shares Mira's list
    putEntry(a, { resType: 4, type: 3, index: 2, data: findEntry(a, 4, 3, 1)!.data.slice() });
    const spell = { type: 3, index: 2 };
    expect(spellLearners(a, { type: 3, index: 1 }).learners.map((l) => [l.member.name, l.position, l.at])).toEqual([
      ["Mira", 2, expect.anything()],
      ["Hero 2", 2, expect.anything()],
    ]);
    expect(spellLearners(a, spell).others.map((m) => m.name)).toEqual(["Mira", "Hero 2"]);
    const r = addSpellToMember(a, 2, spell, true);
    expect(r.created).toBe(true);
    for (const c of r.changes) {
      const [rt, t, i] = c.key.split("-").map(Number);
      putEntry(a, { resType: rt, type: t, index: i, data: c.data });
    }
    expect(readMagicChain(findEntry(a, 12, 1, r.list)!.data)).toEqual([{ type: 1, index: 1 }, { type: 3, index: 1 }, spell]);
    const l = spellLearners(a, spell);
    expect(l.learners.map((x) => [x.member.name, x.position])).toEqual([["Hero 2", 3]]);
    expect(l.others.map((m) => m.name)).toEqual(["Mira"]);
    // the copied table never counts 3 spells: learning it at level 4 sets the table from there
    const t = learnFromLevel(a, 2, 3, 4);
    expect(readLevels(t.data).map((row) => row[8]).slice(2, 5)).toEqual([expect.any(Number), 3, 3]);
  });

  it("a level table counting more spells than the list has is cut to the list (the original stops on it)", () => {
    const a = blankProject("T");
    const t = findEntry(a, 12, 2, 1)!.data;
    const cut = fitSpellsKnown(t, 1);
    expect(Math.max(...readLevels(cut).map((r) => r[8]))).toBe(1);
    expect(fitSpellsKnown(t, 99)).toBe(t);
  });
});

describe("10. random battles", () => {
  it("how common each monster is fills the 8 places; 1-3 come at a time (the engine's rule)", () => {
    expect(battleSlots([1, 2], [2, 1])).toEqual([1, 1, 2]);
    expect(() => battleSlots([1, 2, 3], [3, 3, 3])).toThrow(/8 monster places/);
    expect(slotWeights([1, 2, 3, 1, 2, 0, 0, 0])).toEqual({ monsters: [1, 2, 3], weights: [2, 2, 1] });
    const p0 = project(silentBell(), silentBellSources());
    expect(mapBattles(p0, "2-1-2")).toMatchObject({ slots: [1, 2, 3, 1, 2, 0, 0, 0], on: true });
  });

  it("writes the weights and a background that suits the map", () => {
    const p0 = project(blankProject("T"), blankSources());
    const r = randomBattles(p0, { map: "2-1-1", monsters: [1, 2], weights: [3, 1], background: 2, othersOff: false });
    const p = apply(p0, r);
    expect(p.texts["1-1-1"]).toContain("initfight 1, 1, 1, 2, 0, 0, 0, 0, 2, 0, 0");
    roundTrips(p);
    // its own battles' background now
    expect(backgroundFor(p, "2-1-1")).toBe(2);
    // a background named like the map
    expect(backgroundFor(p0, "2-1-1", (k) => (k === "11-4-3" ? "Start meadow" : ""))).toBe(3);
  });

  it("a battle when talking to: the person just placed is the one", () => {
    notePlaced("2-1-9", { script: "1-1-1", id: 4 });
    expect(worldSelection("2-1-9")).toBe("1-1-1#4");
  });
});

describe("11. the shop wizard on someone who talks already", () => {
  it("adds no greeting when they say something first; hints at worse value", () => {
    const { p: p0, id } = withPerson("Tam", { x: 10, y: 6 }, "Welcome, traveller!");
    expect(saysFirst(p0, "1-1-1", id)).toBe("Welcome, traveller!");
    const r = addShop(p0, { script: "1-1-1", id, name: "Tam", items: [{ type: 9, index: 1 }], greeting: "Take a look!" });
    const p = apply(p0, r);
    expect(p.texts["1-1-1"]).not.toContain("Take a look");
    expect(p.texts["1-1-1"].match(/say 0/g)!.length).toBe(p0.texts["1-1-1"].match(/say 0/g)!.length);
    // a dearer herb that heals less is worse value
    const a = p.archive;
    const herb = findEntry(a, 6, 9, 1)!.data;
    const pie = herb.slice();
    pie[1] = 3;
    pie[0x12] = 15; // buy price
    pie[0x16] = 5; // HP healed
    putEntry(a, { resType: 6, type: 9, index: 3, data: pie });
    expect(shopValueHints(a, [{ type: 9, index: 1 }, { type: 9, index: 3 }])[0]).toMatch(/15 gold for 5 HP healed/);
    expect(shopValueHints(a, [{ type: 9, index: 1 }])).toEqual([]);
  });

  it("a hand-added Open shop step sells the project's own items", () => {
    const a = lanternPath();
    const has = (rt: number, t: number, i: number) => !!findEntry(a, rt, t, i);
    const v = startingValues("buy", has)[0] as [number, number][];
    expect(v.length).toBeGreaterThan(0);
    for (const [t, i] of v) expect(findEntry(a, 6, t, i)).toBeTruthy();
  });
});
