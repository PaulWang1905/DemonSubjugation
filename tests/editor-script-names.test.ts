// Scripts that share a name (every one of 伏魔记's 185 is "游戏开始") are
// told apart by what they are for, from the world index: "start · 游戏开始",
// "TOWN · 游戏开始", "SHOP (FIELD) · 游戏开始", "battle · 游戏开始",
// "WELL +2 · 游戏开始". The stored name is unchanged; the author's own name
// from the project notes wins; scripts with names of their own (the three
// templates) look the same as before.
import { describe, expect, it } from "vitest";
import { assemble } from "../src/editor/format/gut";
import { encodeMap, type MapCell } from "../src/editor/format/encode";
import { findEntry, putEntry, readLib, writeLib, type LibArchive } from "../src/editor/format/lib";
import { sentence } from "../src/editor/format/commands";
import { chapterPlaces, ownScriptName, resourceLabels, scriptAbout, scriptLabel, scriptNameShared, scriptPurpose, withScriptLabels } from "../src/editor/format/naming";
import { emptyNotes, setResourceNote } from "../src/editor/format/notes";
import { checkProject } from "../src/editor/format/validate";
import { buildWorld, projectNames } from "../src/editor/format/world";
import { mapSetups } from "../src/editor/format/worldEdit";
import { flagChoices } from "../src/editor/format/flags";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { groupEntries } from "../src/editor/ui/workspace";
import { labelParts, sideLabel } from "../src/editor/ui/Sidebar";
import { twinNames } from "../src/editor/ui/TabStrip";
import { loadRealResources } from "./helpers";

const SAME = "游戏开始";

/** A blank game whose scripts (by key "1-type-index") all start `.desc "游戏开始"`, plus maps. */
function project(scripts: Record<string, string[]>, maps: string[]): { a: LibArchive; texts: Record<string, string> } {
  const a = blankProject("TEST");
  maps.forEach((name, i) => {
    const cells: MapCell[] = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) cells.push({ tile: 0, walkable: true, event: x === 10 && y === 7 ? 1 : 0 });
    putEntry(a, { resType: 2, type: 1, index: i + 1, data: encodeMap({ type: 1, index: i + 1, tileset: 1, name, width: 20, height: 14, cells }) });
  });
  const texts: Record<string, string> = {};
  for (const [k, lines] of Object.entries(scripts)) {
    const [, t, i] = k.split("-").map(Number);
    texts[k] = [`.gut ${t} ${i}`, `.desc "${SAME}"`, ...lines, ""].join("\n");
    putEntry(a, { resType: 1, type: t, index: i, data: assemble(texts[k]) });
  }
  return { a, texts };
}

// TOWN (map 1), SHOP (2), FIELD (3), WELL (4), CAVE (5), PIT (6)
const MAPS = ["TOWN", "SHOP", "FIELD", "WELL", "CAVE", "PIT"];
/** A door: show `to` and switch to `script`. */
const door = (to: number, script: number) => [".events 41", ".event 41 @door", `  loadmap 1, ${to}, 4, 4`, "  callback", "@door:", `  loadmap 1, ${to}, 4, 4`, `  startchapter 1, ${script}`, "  callback"];
const GAME = {
  // a new game: show the town, hand over to the town's script
  "1-1-1": ["  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  startchapter 1, 2"],
  // the town's script, and a second one for the town later in the story
  "1-1-2": door(2, 3).map((l, i) => (i === 2 ? "  loadmap 1, 1, 4, 4" : l)),
  "1-1-7": door(2, 3).map((l, i) => (i === 2 ? "  loadmap 1, 1, 4, 4" : l)),
  // two shops on one map: one off the town, one off the field
  "1-1-3": [".events 41", ".event 41 @out", "  loadmap 1, 2, 4, 4", "  callback", "@out:", "  loadmap 1, 1, 4, 4", "  startchapter 1, 2", "  callback"],
  "1-1-4": [".events 41", ".event 41 @out", "  loadmap 1, 2, 4, 4", "  callback", "@out:", "  loadmap 1, 3, 4, 4", "  startchapter 1, 5", "  callback"],
  "1-1-5": ["  loadmap 1, 3, 4, 4", "  callback"],
  // a battle on no map of its own
  "1-1-6": ["  enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lose, @win", "@lose:", "  gameover", "@win:", "  callback"],
};

describe("scripts that share a name", () => {
  const { a, texts } = project(GAME, MAPS);
  const world = buildWorld(a, texts);

  it("are shown with what they are for: start, the map they run on, where their doors lead, a battle", () => {
    expect(scriptLabel(world, "1-1-1")).toBe(`start · ${SAME}`);
    expect(scriptLabel(world, "1-1-2")).toBe(`TOWN · ${SAME}`);
    expect(scriptLabel(world, "1-1-7")).toBe(`TOWN · ${SAME}`);
    // one map, two shops: the town or field each leads back to tells them apart
    expect(scriptLabel(world, "1-1-3")).toBe(`SHOP (TOWN) · ${SAME}`);
    expect(scriptLabel(world, "1-1-4")).toBe(`SHOP (FIELD) · ${SAME}`);
    expect(scriptLabel(world, "1-1-5")).toBe(`FIELD · ${SAME}`);
    expect(scriptLabel(world, "1-1-6")).toBe(`battle · ${SAME}`);
    expect(scriptPurpose(world, "1-1-6")).toBe("battle");
    // the lists get them (resourceLabels), the stored names stay
    const labels = resourceLabels(a, world);
    expect(labels.get("1-1-2")).toBe(`TOWN · ${SAME}`);
    for (const e of a.entries.filter((x) => x.resType === 1)) expect(ownScriptName(e)).toBe(SAME);
    expect(scriptNameShared(world, "1-1-2")).toBe(7);
    expect(scriptAbout(world, "1-1-4")).toBe(`Runs on SHOP; shows FIELD. Its own name, ${SAME}, is shared by 7 scripts.`);
    expect(scriptAbout(world, "1-1-6")).toBe(`A battle, on no map of its own. Its own name, ${SAME}, is shared by 7 scripts.`);
    expect(scriptAbout(world, "1-1-1")).toMatch(/^A new game starts with it; shows TOWN\./);
  });

  it("the author's own name, from the project notes, wins everywhere", () => {
    const notes = setResourceNote(emptyNotes(), "1-1-7", { name: "Town at night" });
    expect(scriptLabel(world, "1-1-7", notes)).toBe("Town at night");
    expect(resourceLabels(a, world, notes).get("1-1-7")).toBe("Town at night");
    expect(scriptAbout(world, "1-1-7", notes)).toMatch(/You named it in this project\.$/);
    // in sentences, the setups of the World view, the project check and the flags
    const names = withScriptLabels(projectNames(a, notes), world, notes);
    expect(sentence("startchapter", [1, 7], names).text).toBe("Switch to script “Town at night”");
    expect(sentence("startchapter", [1, 3], names).text).toBe(`Switch to script “SHOP (TOWN) · ${SAME}”`);
    // (other resources keep their names)
    expect(sentence("loadmap", [1, 3, 4, 4], names).text).toMatch(/FIELD/);
    expect(mapSetups(world, "2-1-1", notes).map((s) => s.label)).toContain("Town at night (script 1-7)");
    expect(mapSetups(world, "2-1-2").map((s) => s.label)).toEqual(expect.arrayContaining([`SHOP (TOWN) · ${SAME} (script 1-3)`]));
    const where = checkProject(a, texts, notes).filter((p) => p.key.startsWith("1-")).map((p) => p.where);
    for (const w of where) expect(w).not.toBe(`Script ${w.split(" ")[1]} ${SAME}`);
  });

  it("the flags' uses name scripts by what they are for, without the shared name", () => {
    const p = project({ "1-1-1": ["  loadmap 1, 1, 4, 4", "  setevent 5", "  callback"], "1-1-2": ["  loadmap 1, 3, 4, 4", "  if 5, @no", "@no:", "  callback"] }, MAPS);
    const w = buildWorld(p.a, p.texts);
    expect(flagChoices(undefined, w).find((c) => c.flag === 5)!.uses).toBe("set in start · checked in FIELD");
  });

  it("a script run on several maps names the first and how many more", () => {
    // 1-1-9 has no map of its own: it runs where each of four maps' scripts starts it
    const s: Record<string, string[]> = { "1-1-1": ["  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  callback"] };
    [3, 4, 5, 6].forEach((m, i) => (s[`1-1-${i + 2}`] = [`  loadmap 1, ${m}, 4, 4`, "  startchapter 1, 9"]));
    s["1-1-9"] = [".events 41", ".event 41 @here", "  callback", "@here:", "  callback"];
    const p = project(s, MAPS);
    const w = buildWorld(p.a, p.texts);
    expect(w.scripts.get("1-1-9")!.runsOn.length).toBe(4);
    expect(scriptLabel(w, "1-1-9")).toBe(`FIELD +3 · ${SAME}`);
  });

  it("an empty name is replaced by what the script is for; a lone script keeps its own", () => {
    const p = project({ "1-1-1": ["  loadmap 1, 1, 4, 4", "  callback"], "1-1-2": ["  loadmap 1, 3, 4, 4", "  callback"] }, MAPS);
    const t = p.texts["1-1-2"].replace(`.desc "${SAME}"`, '.desc ""');
    putEntry(p.a, { resType: 1, type: 1, index: 2, data: assemble(t) });
    const w = buildWorld(p.a, { ...p.texts, "1-1-2": t });
    expect(scriptLabel(w, "1-1-2")).toBe("FIELD");
    // 1-1-1's name is now its own: it keeps it
    expect(scriptLabel(w, "1-1-1")).toBe(SAME);
    expect(resourceLabels(p.a, w).has("1-1-1")).toBe(false);
  });

  it("the sidebar shows the shared name quieter, and two open tabs with one name show their numbers", () => {
    const e = findEntry(a, 1, 1, 2)!;
    const labels = resourceLabels(a, world);
    expect(sideLabel(e, labels)).toBe(`TOWN · ${SAME}`);
    expect(labelParts(e, sideLabel(e, labels))).toEqual(["TOWN", ` · ${SAME}`]);
    expect(labelParts(e, "Town at night")).toEqual(["Town at night", ""]);
    expect([...twinNames(["TOWN · x", "SHOP · x", "TOWN · x"])]).toEqual(["TOWN · x"]);
  });

  it("scripts of several types come by chapter, each with the map it starts on", () => {
    const p = project(
      {
        "1-1-1": ["  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  startchapter 2, 1"],
        "1-2-1": ["  loadmap 1, 3, 4, 4", "  callback"],
        "1-2-2": ["  loadmap 1, 2, 4, 4", "  callback"],
        "1-3-1": ["  gameover"],
      },
      MAPS,
    );
    const w = buildWorld(p.a, p.texts);
    const ch = chapterPlaces(w);
    expect(ch.get(2)).toBe("FIELD");
    const story = groupEntries(p.a.entries, undefined, ch).find((g) => g.id === "story")!;
    expect(story.sections.map((s) => [s.label, s.entries.length])).toEqual([
      ["Chapter 1", 1],
      ["Chapter 2 · FIELD", 2],
      ["Chapter 3", 1],
    ]);
    expect(story.count).toBe(4);
    // a game with one type keeps one list of scripts
    expect(groupEntries(a.entries, undefined, chapterPlaces(world)).find((g) => g.id === "story")!.sections.map((s) => s.label)).toEqual(["Scripts"]);
  });
});

describe("the templates' scripts have names of their own", () => {
  for (const [name, a, texts] of [
    ["Blank game", blankProject("T"), blankSources()],
    ["Lantern Path", lanternPath(), lanternPathSources()],
    ["The Silent Bell", silentBell(), silentBellSources()],
  ] as const) {
    it(`${name}: shown, linked and checked as before`, () => {
      const world = buildWorld(a, texts);
      const labels = resourceLabels(a, world);
      for (const e of a.entries.filter((x) => x.resType === 1)) {
        const k = `1-${e.type}-${e.index}`;
        expect(labels.has(k)).toBe(false);
        expect(scriptLabel(world, k)).toBe(ownScriptName(e));
        expect(scriptAbout(world, k)).toBe("");
        expect(sideLabel(e, labels)).toBe(ownScriptName(e));
      }
      expect(chapterPlaces(world).size).toBe(0);
      expect(groupEntries(a.entries, undefined, chapterPlaces(world)).find((g) => g.id === "story")!.sections.map((s) => s.label)).toEqual(["Scripts"]);
      // the project check names them as before
      expect(checkProject(a, texts).map((p) => p.where)).toEqual(checkProject(a, texts, emptyNotes()).map((p) => p.where));
      for (const p of checkProject(a, texts).filter((x) => x.key.startsWith("1-"))) expect(p.where).toMatch(/^Script \d+-\d+ \S/);
      // flags name their scripts by their own names
      for (const c of flagChoices(undefined, world)) for (const part of c.uses.split(" · ")) expect(part).toMatch(/^(set|checked|cleared) in /);
    });
  }
});

const real = loadRealResources();
describe.skipIf(!real)("伏魔记: 185 scripts named 游戏开始", () => {
  it("each is shown with what it is for, by chapter, and the game file is not touched", () => {
    const bytes = real!.datLib;
    const a = readLib(bytes);
    const before = writeLib(a);
    const world = buildWorld(a);
    const scripts = a.entries.filter((e) => e.resType === 1);
    expect(scripts.length).toBe(185);
    expect(new Set(scripts.map(ownScriptName))).toEqual(new Set([SAME]));
    const labels = resourceLabels(a, world);
    const shown = scripts.map((e) => labels.get(`1-${e.type}-${e.index}`)!);
    for (const l of shown) expect(l).toMatch(/ · 游戏开始$/);
    // from one name to more than 150
    expect(new Set(shown).size).toBeGreaterThan(150);
    expect(labels.get("1-1-1")).toBe("start · 游戏开始");
    expect(labels.get("1-2-12")).toBe("百草地 · 游戏开始");
    expect(labels.get("1-6-3")).toBe("原野阡, 森林道路 · 游戏开始");
    // the weapon shops of the towns
    expect(labels.get("1-3-2")).toBe("武器店 (忘忧村) · 游戏开始");
    expect(labels.get("1-5-11")).toBe("武器店 (石梦城) · 游戏开始");
    expect(labels.get("1-8-11")).toBe("battle · 游戏开始");
    // chapters with the map each starts on
    const ch = chapterPlaces(world);
    expect([ch.get(3), ch.get(5), ch.get(7)]).toEqual(["忘忧村", "石梦城", "建业城"]);
    const story = groupEntries(a.entries, undefined, ch).find((g) => g.id === "story")!;
    expect(story.sections.length).toBe(14);
    expect(story.sections[2].label).toBe("Chapter 3 · 忘忧村");
    // the project check says which script
    const p = checkProject(a).filter((x) => x.key.startsWith("1-"));
    for (const x of p) expect(x.where).toMatch(/^Script \d+-\d+ .+ · 游戏开始$/);
    // nothing written
    expect(writeLib(a)).toEqual(before);
  });
});
