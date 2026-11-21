// The editor workspace's logic: the sidebar's groups, tabs (with the preview
// tab), the command palette's ranking, where the game starts, making new
// resources, the author's notes and the view registry.
import { describe, expect, it } from "vitest";
import { findEntry, putEntry, type LibArchive } from "../src/editor/format/lib";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { CREATE_OPTIONS, createResource } from "../src/editor/ui/create";
import { emptyNotes, normalizeNotes, notesEmpty } from "../src/editor/ui/notes";
import { setFlagNote } from "../src/editor/format/notes";
import { pickView, registerView, viewsFor } from "../src/editor/ui/views";
import {
  closeTab, cycleTab, entryTitle, findStart, groupCounts, groupEntries, groupOf, HOME_TAB, initialTabs, keyOf, kindLabel, openTab, parseKey, pinTab,
  pushRecent, rankPalette, renameTab, resourceItem, retainTabs, setTabMode, wordScore, type PaletteItem,
} from "../src/editor/ui/workspace";

const templates: [string, () => LibArchive, Record<string, string>][] = [
  ["Blank", () => blankProject("TEST"), {}],
  ["Lantern Path", lanternPath, lanternPathSources()],
  ["The Silent Bell", silentBell, silentBellSources()],
];

describe("sidebar groups", () => {
  it.each(templates)("%s: every resource is in exactly one group, in order", (_, make) => {
    const a = make();
    const groups = groupEntries(a.entries);
    expect(groups.map((g) => g.id)).toEqual(["story", "world", "characters", "items", "art", "advanced"]);
    const listed = groups.flatMap((g) => g.sections.flatMap((s) => s.entries.map(keyOf)));
    expect(listed.length).toBe(a.entries.length);
    expect(new Set(listed).size).toBe(a.entries.length);
    for (const g of groups) expect(g.count).toBe(g.sections.reduce((n, s) => n + s.entries.length, 0));
    expect(Object.values(groupCounts(a.entries)).reduce((x, y) => x + y, 0)).toBe(a.entries.length);
  });

  it("puts each kind where an author looks for it", () => {
    expect(groupOf({ resType: 1, type: 1, index: 1 })).toBe("story");
    expect(groupOf({ resType: 2, type: 1, index: 3 })).toBe("world");
    for (const t of [1, 2, 3, 4]) expect(groupOf({ resType: 3, type: t, index: 1 })).toBe("characters");
    expect(groupOf({ resType: 6, type: 9, index: 1 })).toBe("items");
    expect(groupOf({ resType: 4, type: 1, index: 1 })).toBe("items");
    for (const rt of [5, 7, 8, 9, 10, 11]) expect(groupOf({ resType: rt, type: 1, index: 1 })).toBe("art");
    expect(groupOf({ resType: 12, type: 2, index: 1 })).toBe("advanced");
    expect(groupOf({ resType: 42, type: 1, index: 1 })).toBe("advanced");
  });

  it("splits a group into sections by sub-kind, and filters", () => {
    const a = silentBell();
    const chars = groupEntries(a.entries).find((g) => g.id === "characters")!;
    expect(chars.sections.map((s) => s.label)).toEqual(expect.arrayContaining(["Party", "People", "Monsters"]));
    const people = groupEntries(a.entries, (e) => e.resType === 3 && e.type === 2);
    expect(people.find((g) => g.id === "characters")!.sections.map((s) => s.id)).toEqual(["3-2"]);
    expect(people.filter((g) => g.count).length).toBe(1);
  });

  it("names and kinds", () => {
    const a = silentBell();
    expect(entryTitle(findEntry(a, 1, 1, 1)!)).toBe("Bellhaven");
    expect(kindLabel({ resType: 3, type: 2, index: 1 })).toBe("person");
    expect(kindLabel({ resType: 4, type: 1, index: 1 })).toBe("attack spell");
    expect(kindLabel({ resType: 8, type: 2, index: 1 })).toBe("person walk sprite");
    expect(kindLabel({ resType: 6, type: 14, index: 1 })).toBe("story item");
    expect(kindLabel({ resType: 6, type: 7, index: 1 })).toBe("weapon");
    // animations have no name: kind and number
    const anim = a.entries.find((e) => e.resType === 5)!;
    expect(entryTitle(anim)).toMatch(/animation \d+-\d+$/);
    expect(parseKey("2-1-14")).toEqual({ resType: 2, type: 1, index: 14 });
    expect(parseKey("home")).toBeNull();
  });
});

describe("where the game starts", () => {
  it.each(templates)("%s: script 1-1 and the map it loads", (_, make, sources) => {
    const a = make();
    const s = findStart(a, sources);
    expect(s.script).toBe("1-1-1");
    expect(s.map).toMatch(/^2-\d+-\d+$/);
    expect(findEntry(a, 2, s.loadmap!.type, s.loadmap!.index)).toBeTruthy();
  });

  it("says when there is no start", () => {
    const a = blankProject("X");
    expect(findStart({ ...a, entries: a.entries.filter((e) => e.resType !== 1) }, {})).toEqual({});
    const noMap = { ...a, entries: a.entries.filter((e) => e.resType !== 2) };
    const s = findStart(noMap, {});
    expect(s.script).toBe("1-1-1");
    expect(s.map).toBeUndefined();
    expect(s.loadmap).toBeTruthy();
  });
});

describe("tabs", () => {
  it("starts with the project home, which never closes", () => {
    const s = initialTabs();
    expect(s.tabs).toEqual([{ key: HOME_TAB, pinned: true }]);
    expect(closeTab(s, HOME_TAB)).toBe(s);
  });

  it("a single click replaces the preview tab; a double click or an edit keeps it", () => {
    let s = openTab(initialTabs(), "1-1-1");
    expect(s.tabs.map((t) => [t.key, t.pinned])).toEqual([[HOME_TAB, true], ["1-1-1", false]]);
    s = openTab(s, "1-1-2"); // replaces the preview in place
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2"]);
    expect(s.active).toBe("1-1-2");
    s = pinTab(s, "1-1-2");
    s = openTab(s, "2-1-1");
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2", "2-1-1"]);
    s = openTab(s, "2-1-1", { pin: true }); // already open: activated and kept
    expect(s.tabs.every((t) => t.pinned)).toBe(true);
    s = openTab(s, "3-2-1");
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2", "2-1-1", "3-2-1"]);
    // opening an open tab activates it without moving it
    s = openTab(s, "1-1-2");
    expect(s.active).toBe("1-1-2");
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2", "2-1-1", "3-2-1"]);
    // a kept tab also takes the preview's place (the preview was passing)
    s = openTab(s, "6-9-1", { pin: true });
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2", "2-1-1", "6-9-1"]);
    // with no preview, a new tab goes after the active one
    s = openTab({ ...s, active: "1-1-2" }, "7-1-1");
    expect(s.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-2", "7-1-1", "2-1-1", "6-9-1"]);
  });

  it("closing activates the right neighbour, else the left", () => {
    let s = [HOME_TAB, "a", "b", "c"].reduce((x, k) => (k === HOME_TAB ? x : openTab(x, k, { pin: true })), initialTabs());
    s = { ...s, active: "b" };
    s = closeTab(s, "b");
    expect(s.active).toBe("c");
    s = closeTab(s, "c");
    expect(s.active).toBe("a");
    s = closeTab({ ...s, active: HOME_TAB }, "a");
    expect(s.active).toBe(HOME_TAB);
    expect(s.tabs.length).toBe(1);
  });

  it("cycles, keeps a mode, follows a renumber, drops what is gone", () => {
    let s = openTab(openTab(initialTabs(), "1-1-1", { pin: true }), "2-1-1", { pin: true });
    expect(cycleTab(s, 1).active).toBe(HOME_TAB);
    expect(cycleTab(s, -1).active).toBe("1-1-1");
    s = setTabMode(s, "1-1-1", "bytes");
    expect(s.tabs[1].mode).toBe("bytes");
    s = renameTab(s, "2-1-1", "2-1-9");
    expect(s.active).toBe("2-1-9");
    const kept = retainTabs({ tabs: [...s.tabs, { key: "9-9-9", pinned: false }, { key: "1-1-1", pinned: false }], active: "9-9-9" }, (k) => k !== "9-9-9");
    expect(kept.tabs.map((t) => t.key)).toEqual([HOME_TAB, "1-1-1", "2-1-9"]);
    expect(kept.active).toBe(HOME_TAB);
  });
});

describe("command palette", () => {
  const a = silentBell();
  const resources = a.entries.map(resourceItem);
  const commands: PaletteItem[] = [
    { id: "cmd:playtest", label: "Playtest", detail: "Ctrl+Enter", kind: "command" },
    { id: "cmd:new:map", label: "New map", detail: "make", keywords: "new add create", kind: "command" },
    { id: "cmd:new:object", label: "New object (chest, sign…)", detail: "make", kind: "command" },
  ];
  const items = [...commands, ...resources];

  it("finds by name, kind and number", () => {
    expect(rankPalette(items, "whisper")[0].label.toLowerCase()).toBe("whisperwood");
    expect(rankPalette(items, "whisper map")[0].id).toBe("res:2-1-2");
    expect(rankPalette(items, "script 1-3")[0].id).toBe("res:1-1-3");
    expect(rankPalette(items, "new map")[0].id).toBe("cmd:new:map");
    expect(rankPalette(items, "playt")[0].id).toBe("cmd:playtest");
  });

  it("matches scattered letters only from the start of a word", () => {
    expect(wordScore("wsp", "Whisperwood")).not.toBeNull();
    expect(wordScore("oq", "Old Quarry")).not.toBeNull();
    expect(wordScore("whis", "New object (chest, sign…)")).toBeNull();
    expect(rankPalette(items, "whis").some((x) => x.id === "cmd:new:object")).toBe(false);
    expect(wordScore("map", "Map")! > wordScore("map", "a bitmap")!).toBe(true);
    expect(rankPalette(items, "zzzz")).toEqual([]);
  });

  it("puts recent items first", () => {
    const recents = ["res:3-2-1", "cmd:new:map"];
    const empty = rankPalette(items, "", recents);
    expect(empty.slice(0, 2).map((x) => x.id)).toEqual(recents);
    expect(empty[2].kind).toBe("command");
    // with a query, a recent item wins a tie
    const tie = rankPalette(items, "whisperwood", ["res:1-1-2"]);
    expect(tie[0].id).toBe("res:1-1-2");
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });
});

describe("making resources", () => {
  it("every option makes something the sidebar shows in its group", () => {
    const a = blankProject("NEW");
    for (const o of CREATE_OPTIONS) {
      const key = createResource(a, o.what);
      const r = parseKey(key)!;
      expect(findEntry(a, r.resType, r.type, r.index), o.what).toBeTruthy();
      expect(groupOf(r), o.what).toBe(o.group);
    }
    expect(() => createResource(a, "nonsense")).toThrow();
  });

  it("a new script and map take the next free number", () => {
    const a = silentBell();
    expect(createResource(a, "script")).toBe("1-1-6");
    expect(createResource(a, "map")).toBe("2-1-6");
    putEntry(a, { resType: 1, type: 1, index: 8, data: new Uint8Array(4) });
    expect(createResource(a, "script")).toBe("1-1-7");
  });
});

describe("author notes", () => {
  it("reads projects saved before notes existed, and anything malformed", () => {
    expect(normalizeNotes(undefined)).toEqual(emptyNotes());
    // (the workspace's first shape, as saved before the notes model existed)
    expect(normalizeNotes({ flags: { 3: "gate open", 4: 7 }, vars: [1], notes: { project: "my game" }, extra: { x: [1] } })).toEqual({
      version: 1,
      flags: { 3: { name: "gate open" } },
      variables: {},
      resources: { project: { note: "my game" } },
      extra: { x: [1] },
    });
  });

  it("sets and clears names", () => {
    let n = setFlagNote(emptyNotes(), 3, { name: "gate open" });
    expect(n.flags).toEqual({ 3: { name: "gate open" } });
    expect(notesEmpty(n)).toBe(false);
    n = setFlagNote(n, 3, { name: " " });
    expect(notesEmpty(n)).toBe(true);
  });
});

describe("view registry", () => {
  it("every resource of the templates has a default view, and bytes last", () => {
    for (const [, make] of templates)
      for (const e of make().entries) {
        const views = viewsFor(e);
        expect(views.length, keyOf(e)).toBeGreaterThan(0);
        expect(views[views.length - 1].id).toBe("bytes");
      }
    expect(pickView({ resType: 1, type: 1, index: 1 })!.id).toBe("script.text");
    expect(pickView({ resType: 2, type: 1, index: 1 })!.id).toBe("map.tiles");
    expect(pickView({ resType: 1, type: 1, index: 1 }, "bytes")!.id).toBe("bytes");
    expect(pickView({ resType: 1, type: 1, index: 1 }, "no-such-view")!.id).toBe("script.text");
  });

  it("a registered view joins in its order and can be the default", () => {
    const visual = { id: "test.visual", label: "Visual", order: 10, match: (e: { resType: number }) => e.resType === 1, component: () => null };
    registerView(visual);
    expect(viewsFor({ resType: 1, type: 1, index: 1 }).map((v) => v.id)).toEqual(["test.visual", "script.text", "bytes"]);
    expect(pickView({ resType: 1, type: 1, index: 1 })!.id).toBe("test.visual");
    expect(viewsFor({ resType: 2, type: 1, index: 1 }).map((v) => v.id)).toEqual(["map.tiles", "bytes"]);
    // the same id replaces it
    registerView({ ...visual, order: 60 });
    expect(viewsFor({ resType: 1, type: 1, index: 1 }).map((v) => v.id)).toEqual(["script.text", "test.visual", "bytes"]);
  });
});
