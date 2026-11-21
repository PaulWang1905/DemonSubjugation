// Fixes from the second new-author test (round 2), the editor's own logic:
// the title screen's logo kept in step with renames (template/titleLogo.ts),
// the game file's title for a long name, the guide's step detection and its
// folded state, the World view's labels that never cover each other
// (ui/labelLayout.ts), and the step palette's note on darkness.
import { describe, expect, it } from "vitest";
import { gbkBytes } from "../src/engine/java";
import { findEntry, putEntry, type LibArchive } from "../src/editor/format/lib";
import { emptyNotes } from "../src/editor/format/notes";
import { fullTexts, newMap, projectWorld, type Change, type Project, type WizardResult } from "../src/editor/format/wizards";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { lanternPath } from "../src/editor/template/demo";
import { silentBell } from "../src/editor/template/silentBell";
import { gameLogo } from "../src/editor/template/system";
import { fileTitle, isLogoOf, LOGO, logoAfterRename, logoSource } from "../src/editor/template/titleLogo";
import { advance, goTo, guideSignals, readGuide, startGuide, STEPS, writeGuide, type GuideState } from "../src/editor/ui/guideModel";
import { placeLabels, type LabelRequest } from "../src/editor/ui/labelLayout";
import { paletteNote } from "../src/editor/ui/paletteNotes";
import { commandInfo } from "../src/editor/format/commands";

const gbk = (s: string) => gbkBytes(s).length;
const logoOf = (a: LibArchive) => findEntry(a, LOGO.resType, LOGO.type, LOGO.index)!.data;

describe("the title in the game file and the title screen", () => {
  it("keeps a long project name: only the game file's title is cut to 9 bytes", () => {
    expect(fileTitle("Harbor Tale", gbk)).toBe("HARBOR");
    expect(fileTitle("My game", gbk)).toBe("MY GAME");
    expect(fileTitle("The Silent Bell", gbk)).toBe("THE SILEN");
    expect(fileTitle("Supercalifragilistic", gbk)).toBe("SUPERCALI");
    expect(fileTitle("伏魔记外传之二", gbk)).toBe("伏魔记外");
    for (const n of ["Harbor Tale", "伏魔记外传之二", "a b c d e f g h i j"]) expect(gbk(fileTitle(n, gbk))).toBeLessThanOrEqual(9);
  });

  it("a new game's title screen shows its full name, and follows renames of it", () => {
    const a = blankProject(fileTitle("Harbor Tale", gbk), "Harbor Tale");
    expect(logoSource(a, "HARBOR", "Harbor Tale")).toBe("name");
    // the title changes: the picture shows the name, so it stays
    expect(logoAfterRename(a, { title: "HARBOR", name: "Harbor Tale" }, { title: "HARBOUR", name: "Harbor Tale" })).toBeNull();
    // the name changes: a new picture with the new name
    const next = logoAfterRename(a, { title: "HARBOR", name: "Harbor Tale" }, { title: "HARBOR", name: "Harbor Saga" })!;
    expect(next.data).toEqual(gameLogo("Harbor Saga").data);
  });

  it("a logo that shows the title is rebuilt when the title changes", () => {
    const a = blankProject("HARBOR TA");
    expect(logoSource(a, "HARBOR TA", "Harbor Tale")).toBe("title");
    const next = logoAfterRename(a, { title: "HARBOR TA", name: "Harbor Tale" }, { title: "HARBOR", name: "Harbor Tale" })!;
    expect(next).toMatchObject({ resType: 5, type: 1, index: 248 });
    expect(isLogoOf(next.data, "HARBOR")).toBe(true);
    putEntry(a, next);
    expect(logoSource(a, "HARBOR", "Harbor Tale")).toBe("title");
    // renaming the project leaves a title logo alone
    expect(logoAfterRename(a, { title: "HARBOR", name: "Harbor Tale" }, { title: "HARBOR", name: "Port Tale" })).toBeNull();
  });

  it("knows the templates' logos (the full name with a subtitle) and leaves an author's picture alone", () => {
    expect(logoSource(lanternPath(), "LANTERN", "Lantern Path")).toBe("name");
    expect(logoSource(silentBell(), "BELL", "The Silent Bell")).toBe("name");
    const a = lanternPath();
    const drawn = logoOf(a).slice();
    drawn[drawn.length - 1] ^= 0xff;
    putEntry(a, { ...LOGO, data: drawn });
    expect(logoSource(a, "LANTERN", "Lantern Path")).toBe("drawn");
    expect(logoAfterRename(a, { title: "LANTERN", name: "Lantern Path" }, { title: "LAMP", name: "Lamp Path" })).toBeNull();
  });

  it("puts a name too long for one line on two", () => {
    const long = gameLogo("The Very Long Name Of A Small Game");
    expect(long.data).not.toEqual(gameLogo("The Very Long").data);
    expect(() => gameLogo("Supercalifragilisticexpialidocious")).not.toThrow();
  });
});

describe("the guide", () => {
  const project = (a: LibArchive): Project => ({ archive: a, texts: fullTexts(a, blankSources()) });
  const apply = (p: Project, r: WizardResult | { changes: Change[] }): Project => {
    for (const c of r.changes) {
      const [resType, type, index] = c.key.split("-").map(Number);
      putEntry(p.archive, { resType, type, index, data: c.data });
    }
    const texts = { ...p.texts };
    for (const c of r.changes) if (c.source !== undefined) texts[c.key] = c.source;
    return { archive: p.archive, texts };
  };
  const sig = (p: Project, g: GuideState) => guideSignals(projectWorld(p), p.archive, g.playtests);

  it("counts maps joined before their step (and exits between any two maps)", () => {
    let p = project(blankProject("T"));
    let g = readGuide(startGuide(emptyNotes()))!;
    g = advance(g, sig(p, g)); // begins: the project as it was
    expect(g.first).toMatchObject({ maps: 1, exits: 0 });
    // the author makes a road joined to the start, and a cave joined to the road, before step 6
    p = apply(p, newMap(p, { name: "Road", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    p = apply(p, newMap(p, { name: "Cave", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-2", side: "south" } }));
    expect(sig(p, g).exits).toBeGreaterThanOrEqual(4); // there and back, twice
    // (the exit's event numbers on the first map are not painting)
    expect(STEPS[advance(g, sig(p, g)).step].id).toBe("paint");
    // steps 1-5 skipped by hand: step 6 begins with the maps already there
    for (let i = 0; i < 5; i++) g = goTo(g, g.step + 1, sig(p, g));
    expect(STEPS[g.step].id).toBe("map");
    g = advance(g, sig(p, g));
    expect(STEPS[g.step].id).toBe("play2");
    expect(g.done).toContain(5);
  });

  it("a guide saved before it kept its beginning still sees joined maps", () => {
    let p = project(blankProject("T"));
    p = apply(p, newMap(p, { name: "Road", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    const old: GuideState = { v: 1, step: 5, done: [0, 1, 2, 3, 4], base: sig(p, { playtests: 0 } as GuideState), closed: false, playtests: 0 };
    expect(STEPS[advance(old, sig(p, old)).step].id).toBe("play2");
  });

  it("going back to a step waits for a new change", () => {
    let p = project(blankProject("T"));
    let g = readGuide(startGuide(emptyNotes()))!;
    g = advance(g, sig(p, g));
    p = apply(p, newMap(p, { name: "Road", width: 20, height: 14, tileset: 1, fill: 0, border: 2, connect: { from: "2-1-1", side: "east" } }));
    g = goTo(g, 5, sig(p, g));
    g = advance(g, sig(p, g));
    expect(STEPS[g.step].id).toBe("play2");
    g = goTo(g, 5, sig(p, g)); // Back
    expect(g.back).toBe(true);
    expect(advance(g, sig(p, g))).toBe(g);
  });

  it("remembers being folded and closed", () => {
    const n = startGuide(emptyNotes());
    const folded = writeGuide(n, { ...readGuide(n)!, folded: true });
    expect(readGuide(JSON.parse(JSON.stringify(folded)))!.folded).toBe(true);
    const closed = writeGuide(folded, { ...readGuide(folded)!, closed: true });
    expect(readGuide(JSON.parse(JSON.stringify(closed)))!.closed).toBe(true);
    // the project home's "Guide me" shows it open again
    expect(readGuide(startGuide(closed))).toMatchObject({ closed: false, folded: false });
  });
});

describe("the World view's labels", () => {
  const person = (id: string, x: number, w = 60): LabelRequest => ({ id, anchor: { x: x * 28, y: 6 * 28 - 14, w: 28, h: 42 }, w, h: 15, sides: ["below", "above", "below2", "above2"] });
  const boxes = (ps: ReturnType<typeof placeLabels>) => ps.map((p) => ({ x: p.x, y: p.y, w: p.w, h: 15 }));
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("people side by side get their names on different lines (Merchant, Save Stone, Innkeeper)", () => {
    const placed = placeLabels([person("merchant", 6), person("stone", 8, 70), person("inn", 11)], { stage: { w: 560, h: 392 } });
    const b = boxes(placed);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) expect(overlaps(b[i], b[j])).toBe(false);
    expect(placed[0].side).toBe("below");
    expect(new Set(placed.map((p) => p.side)).size).toBeGreaterThan(1);
    expect(placed.every((p) => !p.short)).toBe(true);
  });

  it("shortens a name only when every place is taken (the full name shows on hover)", () => {
    const crowd = [0, 1, 2, 3, 4].map((k) => person(`p${k}`, 5 + k * 0.5, 120));
    const placed = placeLabels(crowd, { stage: { w: 560, h: 392 } });
    expect(placed).toHaveLength(5);
    expect(placed.some((p) => p.short)).toBe(true);
    // (on the map)
    for (const p of placed) expect(p.x).toBeGreaterThanOrEqual(0);
  });
});

describe("the step palette's note", () => {
  it("answers a search for darkness with what to do instead", () => {
    for (const q of ["dark", "dark room", "light", "night", "torch", "fade out", "darkn"]) expect(paletteNote(q)?.id).toBe("dark");
    for (const q of ["", "give", "say", "battle", "li"]) expect(paletteNote(q)).toBeNull();
    // (its steps exist)
    for (const s of paletteNote("dark")!.steps) expect(commandInfo(s.name)?.title).toBe(s.label);
  });
});
