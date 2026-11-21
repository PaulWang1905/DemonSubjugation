// The last known issues of the editor's version 2 (docs/editor-plan.md,
// Status): wizards that start from what the author is looking at, monster
// templates scaled to the party (checked by fighting them in the engine),
// the battle wizard's win line, names for art in the lists, and no script
// syntax in the author-facing words.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { findEntry, putEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { estimateFight, fightWords, scaledMonster, startingParty, atLevel, type MonsterStats, type TemplateId } from "../src/editor/format/difficulty";
import { addBattle, fullTexts, newMonster, newPerson, type Change, type Project, type WizardResult } from "../src/editor/format/wizards";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyNotes, setResourceNote } from "../src/editor/format/notes";
import { buildWorld } from "../src/editor/format/world";
import { resourceLabels } from "../src/editor/format/naming";
import { checkProject } from "../src/editor/format/validate";
import { noteWorldSelection, wizardContext, worldSelection } from "../src/editor/ui/intents";
import { plainProblem } from "../src/editor/ui/plainWords";
import { sideLabel } from "../src/editor/ui/Sidebar";
import { tabCap, TAB_MIN } from "../src/editor/ui/tabFit";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

function boot(a: LibArchive, seed: number): Engine {
  let s = seed;
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

/**
 * Talk to Tam, who starts a battle with one monster, and fight it by
 * attacking every round (Enter on the battle menu). Returns whether the
 * party won, the rounds it took and the leader's lowest HP.
 */
function fight(stats: MonsterStats, seed: number): { won: boolean; rounds: number; lowest: number; maxHP: number } {
  let p = project(blankProject("T"), blankSources());
  p = apply(p, newPerson(p, { who: { sprite: 2 }, name: "Tam", map: "2-1-1", tile: { x: 10, y: 6 }, line: "Fight me!", walks: false }));
  const m = newMonster(p, { name: "Wood King", sprite: 1, template: "boss", stats });
  p = apply(p, { changes: [m.change] });
  p = apply(p, addBattle(p, { script: "1-1-1", id: 1, name: "Tam", monsters: [m.index], background: 1, winLine: "The end", speaker: null, loseEnds: true, onceFlag: 5 }));
  const e = boot(p.archive, seed);
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  settle(e);
  e.game.mainScene.triggerEvent(1);
  for (let i = 0; i < 40 && !Combat.IsActive(); i++) press(e, Keys.ENTER, 6);
  expect(Combat.IsActive()).toBe(true);
  const hero = e.game.playerList[0];
  let lowest = hero.hp;
  let rounds = 0;
  for (let i = 0; i < 6000 && Combat.IsActive(); i++) {
    press(e, Keys.ENTER, 4);
    lowest = Math.min(lowest, hero.hp);
    // (the engine counts the rounds before the one being fought)
    rounds = Math.max(rounds, ((Combat.current as unknown as { mRoundCnt: number } | null)?.mRoundCnt ?? rounds - 1) + 1);
  }
  for (let i = 0; i < 300 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 6);
  return { won: ScriptResources.globalEvents[5] === true, rounds, lowest, maxHP: hero.maxHP };
}

describe("monster templates scaled to the party", () => {
  const a = blankProject("T");
  const party = startingParty(a, blankSources()["1-1-1"]);

  it("reads the starting party from script 1-1 and the records", () => {
    expect(party.map((f) => [f.name, f.level, f.maxHP, f.attack])).toEqual([["Mira", 1, 60, 12]]);
    const bell = silentBell();
    const bp = startingParty(bell, silentBellSources()["1-1-1"]);
    expect(bp.map((f) => f.name)).toEqual(["Rin"]);
    // at level 3, from the level table
    expect(atLevel(a, party[0], 3)).toMatchObject({ level: 3, maxHP: 60 + 28, attack: 12 + 6 });
  });

  it("the old boss (level 10, 400 HP) was out of reach; the scaled one is beatable", () => {
    const old: MonsterStats = { level: 10, maxHP: 400, attack: 26, defend: 14, speed: 12, money: 200, exp: 150 };
    expect(estimateFight(party, [old])!.level).toBe("too hard");
    const boss = scaledMonster("boss", party, a);
    const est = estimateFight(party, [boss])!;
    expect(est.level).toBe("hard");
    expect(est.rounds).toBe(5);
    expect(fightWords(est, party)).toMatch(/^About 5 rounds for your party; it hits for ~9 of your 60 HP\. Hard: bring a few potions\.$/);
  });

  it("scales each template so the rounds and hits grow from weak to boss", () => {
    const ids: TemplateId[] = ["weak", "normal", "strong", "boss"];
    const est = ids.map((id) => estimateFight(party, [scaledMonster(id, party, a)])!);
    expect(est.map((e) => e.rounds)).toEqual([2, 3, 4, 5]);
    for (let i = 1; i < est.length; i++) expect(est[i].hit).toBeGreaterThan(est[i - 1].hit);
    expect(est.map((e) => e.level)).toEqual(["easy", "fair", "fair", "hard"]);
  });

  it("in the engine: a level-1 party that only attacks beats each template in a few rounds, the boss too", () => {
    const aims = { weak: 2, normal: 3, strong: 4, boss: 5 };
    for (const id of ["weak", "normal", "strong", "boss"] as TemplateId[]) {
      const m = scaledMonster(id, party, a);
      const runs = [7, 11, 23, 42, 99, 123, 2024, 31337].map((seed) => fight(m, seed));
      for (const r of runs) {
        expect(r.won, `${id} seed run ${JSON.stringify(r)}`).toBe(true);
        expect(r.rounds).toBeLessThanOrEqual(aims[id] + 3);
      }
      const mean = runs.reduce((s, r) => s + r.rounds, 0) / runs.length;
      expect(Math.abs(mean - aims[id])).toBeLessThanOrEqual(1.5);
      if (id === "boss") {
        // it hurts: the hero ends the fight wounded (a potion or two is wise), but alive
        const lowest = runs.map((r) => r.lowest);
        expect(Math.min(...lowest)).toBeGreaterThan(0);
        expect(lowest.reduce((s, v) => s + v, 0) / lowest.length).toBeLessThan(45);
      }
      console.log(id, JSON.stringify(m), runs.map((r) => `${r.rounds}r/${r.lowest}hp`).join(" "));
    }
  });

  it("in the engine: the old boss beats the same party", () => {
    const old: MonsterStats = { level: 10, maxHP: 400, attack: 26, defend: 14, speed: 12, money: 200, exp: 150 };
    expect(fight(old, 7).won).toBe(false);
  });
});

describe("the battle wizard's win line", () => {
  const base = () => {
    const p = project(blankProject("T"), blankSources());
    return apply(p, newPerson(p, { who: { sprite: 2 }, name: "Wood King", map: "2-1-1", tile: { x: 10, y: 6 }, line: "Fight me!", walks: false }));
  };
  const won = (speaker: { name: string; portrait: number } | null | undefined) => {
    const p = base();
    const r = addBattle(p, { script: "1-1-1", id: 1, name: "Wood King", monsters: [1], background: 1, winLine: "The end", speaker, loseEnds: true, onceFlag: null });
    return /@fight_wood_king_won:\n(.*)\n/.exec(r.changes[0].source!)![1];
  };
  it("is a plain message unless the author picks a speaker", () => {
    expect(won(undefined)).toMatch(/^  message "The end *"$/);
    expect(won(null)).toMatch(/^  message "The end *"$/);
    expect(won({ name: "Wood King", portrait: 0 })).toBe('  say 0, "Wood King: The end"');
    expect(won({ name: "", portrait: 1 })).toBe('  say 1, "The end"');
  });
});

describe("where a wizard opened from a menu starts", () => {
  const maps = new Set(["2-1-1", "2-1-2", "2-1-3"]);
  const shows: Record<string, string[]> = { "1-1-2": ["2-1-2"], "1-1-1": ["2-1-1"] };
  const ctx = (active: string | null, lastMap: string | null, sel: Record<string, string> = {}) =>
    wizardContext({ active, lastMap, mapsOf: (k) => shows[k], exists: (k) => maps.has(k), selection: (m) => sel[m] });
  it("the map in the current tab, the map a script shows, else the last map viewed", () => {
    expect(ctx("2-1-3", "2-1-2")).toEqual({ map: "2-1-3" });
    expect(ctx("1-1-2", "2-1-3")).toEqual({ map: "2-1-2" });
    expect(ctx("3-3-1", "2-1-3")).toEqual({ map: "2-1-3" });
    expect(ctx(null, "2-1-2")).toEqual({ map: "2-1-2" });
    // nothing known (or the map is gone): the wizard starts on the start map
    expect(ctx(null, null)).toEqual({});
    expect(ctx(null, "2-1-9")).toEqual({});
  });
  it("the person selected on that map's World view", () => {
    expect(ctx("2-1-2", null, { "2-1-2": "1-1-2#3" })).toEqual({ map: "2-1-2", person: "1-1-2#3" });
    expect(ctx("2-1-1", null, { "2-1-2": "1-1-2#3" })).toEqual({ map: "2-1-1" });
  });
  it("World views report who is selected", () => {
    noteWorldSelection("2-1-2", { script: "1-1-2", id: 4 });
    expect(worldSelection("2-1-2")).toBe("1-1-2#4");
    expect(wizardContext({ active: "2-1-2", lastMap: null, mapsOf: () => undefined, exists: () => true })).toEqual({ map: "2-1-2", person: "1-1-2#4" });
    noteWorldSelection("2-1-2", null);
    expect(worldSelection("2-1-2")).toBeUndefined();
  });
});

describe("names for art in the lists", () => {
  it("the author's name, else one from what uses it, else none", () => {
    const a = silentBell();
    const w = buildWorld(a, silentBellSources());
    const notes = setResourceNote(emptyNotes(), "8-2-1", { name: "Old Wen" });
    const l = resourceLabels(a, w, notes);
    expect(l.get("8-2-1")).toBe("Old Wen");
    expect(l.get("8-2-2")).toBe("Tam (walk)");
    expect(l.get("8-3-1")).toBe("Dusk Moth (battle)");
    expect(l.get("8-1-1")).toBe("Rin (walk)");
    expect(l.get("11-1-1")).toBe("Rin (portrait)");
    expect(l.get("9-9-1")).toBe("Herb (icon)");
    expect(l.get("12-2-1")).toBe("Rin (levels)");
    expect(l.get("7-1-1")).toMatch(/^BELLHAVEN, WHISPERWOOD \+\d tiles$/);
    expect(l.get("11-4-8")).toBe("BELL TOWER battles");
    // records keep their own names
    expect(l.has("3-3-1")).toBe(false);
    // unused art has no name: the list shows its kind (and its number beside it)
    const blank = blankProject("T");
    const bl = resourceLabels(blank, buildWorld(blank, blankSources()));
    expect(bl.has("8-2-1")).toBe(false);
    expect(sideLabel(findEntry(blank, 8, 2, 1)!, bl)).toBe("Person walk sprite");
    expect(sideLabel(findEntry(blank, 8, 3, 1)!, bl)).toBe("Dusk Moth (battle)");
    expect(sideLabel(findEntry(blank, 3, 3, 1)!, bl)).toBe("Dusk Moth");
  });
});

describe("no script syntax in the author's words", () => {
  it("the project check reads in the editor's words outside the Text view", () => {
    expect(plainProblem("loadmap: map 1-9 does not exist")).toBe("Go to map: map 1-9 does not exist");
    expect(plainProblem("unknown label @done")).toBe("unknown label done");
    const p = checkProject(blankProject("T"), blankSources()).map((x) => plainProblem(x.message));
    for (const m of p) expect(m).not.toMatch(/loadmap|createnpc|\.event|@\w/);
  });

  it("the author-facing views and wizards show no instruction names, labels with @ or .event", () => {
    const files = [
      "ui/Wizards.tsx", "ui/WorldView.tsx", "ui/WorldMap.tsx", "ui/Guide.tsx", "ui/guideModel.ts", "ui/HomeStarter.tsx", "ui/StoryFlags.tsx",
      "ui/CardView.tsx", "ui/CardParts.tsx", "ui/GalleryView.tsx", "ui/FlagPicker.tsx", "ui/ResourcePicker.tsx", "ui/ProjectHome.tsx",
      "ui/Sidebar.tsx", "ui/TabStrip.tsx", "ui/TilePalette.tsx", "ui/MapEditor.tsx", "ui/EditorDialogs.tsx", "ui/ScriptVisual.tsx",
      "ui/ScriptVisualSteps.tsx", "ui/ScriptVisualControls.tsx", "ui/ScriptVisualEvents.tsx", "ui/scriptVisualLogic.ts", "ui/cardModel.ts",
      "format/wizards.ts", "format/worldEdit.ts", "format/difficulty.ts", "format/naming.ts",
    ];
    const words = /\b(loadmap|createnpc|createbox|createactor|enterfight|initfight|facetoface|setscenename|gutevent|npcmovemod|startchapter)\b|\.event \w|@\$\{|>@\{|^\s*@\{|`@|"@/;
    // lines that write or read script text are code, not words
    const code = /instructionLine|insertLines|tails\.push|addCellHandler|op\.name|name === |\.name !== |=== "|\.exec\(|new RegExp|\.test\(|case "|COMMON|import |^\s*(\/\/|\*|\/\*)|\[`@|`@\$\{\w+\}:`|"@start:"|`\.event|"\.event|labelTarget|replaceSpan|new Set\(\[|has\("|start\.loadmap/;
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(join(__dirname, "../src/editor", f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (words.test(line) && !code.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("tabs that fit", () => {
  it("each as wide as its name while they fit, then the widest shrink to one width", () => {
    expect(tabCap([100, 120, 90], 400)).toBeNull();
    // 80 + 90 fit; the two widest share the rest evenly
    expect(tabCap([80, 200, 90, 300], 500)).toBe(165);
    expect(tabCap([150, 150, 150, 150], 400)).toBe(100);
    // never below the smallest: the strip scrolls then
    expect(tabCap(new Array(12).fill(200), 600)).toBe(TAB_MIN);
  });
});
