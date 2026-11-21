// The editor workspace's logic, without React: the sidebar's groups (by what
// an author thinks about, not by the archive's raw kinds), the open tabs
// (with VS Code's preview tab), the command palette's ranking, and where the
// game starts. Tested in tests/editor-workspace.test.ts.
import { resourceName, subTypeName } from "../format/decode";
import { scriptSource } from "../format/gut";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { ITEM_KINDS } from "./create";

type Ref = { resType: number; type: number; index: number };

/** A resource's key: "resType-type-index". */
export const keyOf = (e: Ref) => `${e.resType}-${e.type}-${e.index}`;

export function parseKey(key: string): Ref | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(key);
  return m ? { resType: Number(m[1]), type: Number(m[2]), index: Number(m[3]) } : null;
}

export function entryOf(a: LibArchive, key: string): LibEntry | undefined {
  const r = parseKey(key);
  return r ? findEntry(a, r.resType, r.type, r.index) : undefined;
}

// --- sidebar groups ----------------------------------------------------------

export type GroupId = "story" | "world" | "characters" | "items" | "art" | "advanced";

export const GROUPS: { id: GroupId; label: string; blurb: string }[] = [
  { id: "story", label: "Story", blurb: "Scripts: what happens, who says what" },
  { id: "world", label: "World", blurb: "Maps: the places" },
  { id: "characters", label: "Characters & monsters", blurb: "The party, people, monsters, chests and signs" },
  { id: "items", label: "Items & magic", blurb: "Things to carry, wear and use; spells" },
  { id: "art", label: "Art", blurb: "Tilesets, sprites, icons, pictures, animations" },
  { id: "advanced", label: "Advanced", blurb: "Spell lists, level tables, other data" },
];

/** A sub-heading in a group: its id is "resType" or "resType-type". */
interface SectionDef {
  id: string;
  label: string;
  group: GroupId;
  match: (r: Ref) => boolean;
}

const ITEM_SECTIONS = ["Hats", "Clothes", "Shoes", "Armour", "Bracers", "Accessories", "Weapons", "Thrown weapons", "Medicine", "Revival", "Elixirs", "Stimulants", "Escape items", "Story items"];
const SPELL_SECTIONS = ["Attack spells", "Enhancing spells", "Restoring spells", "Reviving spells", "Special spells"];

const SECTIONS: SectionDef[] = [
  { id: "1", label: "Scripts", group: "story", match: (r) => r.resType === 1 },
  { id: "2", label: "Maps", group: "world", match: (r) => r.resType === 2 },
  { id: "3-1", label: "Party", group: "characters", match: (r) => r.resType === 3 && r.type === 1 },
  { id: "3-2", label: "People", group: "characters", match: (r) => r.resType === 3 && r.type === 2 },
  { id: "3-3", label: "Monsters", group: "characters", match: (r) => r.resType === 3 && r.type === 3 },
  { id: "3-4", label: "Objects (chests, signs)", group: "characters", match: (r) => r.resType === 3 && r.type === 4 },
  ...ITEM_SECTIONS.map((label, i): SectionDef => ({ id: `6-${i + 1}`, label, group: "items", match: (r) => r.resType === 6 && r.type === i + 1 })),
  { id: "6", label: "Other items", group: "items", match: (r) => r.resType === 6 },
  ...SPELL_SECTIONS.map((label, i): SectionDef => ({ id: `4-${i + 1}`, label, group: "items", match: (r) => r.resType === 4 && r.type === i + 1 })),
  { id: "4", label: "Other spells", group: "items", match: (r) => r.resType === 4 },
  { id: "7", label: "Tilesets", group: "art", match: (r) => r.resType === 7 },
  { id: "8-1", label: "Party walk sprites", group: "art", match: (r) => r.resType === 8 && r.type === 1 },
  { id: "8-2", label: "Person walk sprites", group: "art", match: (r) => r.resType === 8 && r.type === 2 },
  { id: "8-3", label: "Monster battle sprites", group: "art", match: (r) => r.resType === 8 && r.type === 3 },
  { id: "8-4", label: "Object sprites", group: "art", match: (r) => r.resType === 8 && r.type === 4 },
  { id: "8", label: "Other sprites", group: "art", match: (r) => r.resType === 8 },
  { id: "9", label: "Item icons", group: "art", match: (r) => r.resType === 9 },
  { id: "11-1", label: "Portraits", group: "art", match: (r) => r.resType === 11 && r.type === 1 },
  { id: "11-3", label: "Party battle sprites", group: "art", match: (r) => r.resType === 11 && r.type === 3 },
  { id: "11-4", label: "Battle backgrounds", group: "art", match: (r) => r.resType === 11 && r.type === 4 },
  { id: "11-5", label: "Story pictures", group: "art", match: (r) => r.resType === 11 && r.type === 5 },
  { id: "11", label: "System pictures", group: "art", match: (r) => r.resType === 11 },
  { id: "10", label: "Effect images", group: "art", match: (r) => r.resType === 10 },
  { id: "5", label: "Animations", group: "art", match: (r) => r.resType === 5 },
  { id: "12-1", label: "Spell lists", group: "advanced", match: (r) => r.resType === 12 && r.type === 1 },
  { id: "12-2", label: "Level tables", group: "advanced", match: (r) => r.resType === 12 && r.type === 2 },
  { id: "raw", label: "Other data", group: "advanced", match: () => true },
];

function sectionOf(r: Ref): SectionDef {
  return SECTIONS.find((s) => s.match(r))!;
}

/** The sidebar group a resource belongs to. */
export function groupOf(r: Ref): GroupId {
  return sectionOf(r).group;
}

export interface SidebarSection {
  id: string;
  label: string;
  entries: LibEntry[];
}

export interface SidebarGroup {
  id: GroupId;
  label: string;
  blurb: string;
  count: number;
  sections: SidebarSection[];
}

const byNumber = (a: Ref, b: Ref) => a.resType - b.resType || a.type - b.type || a.index - b.index;

/**
 * The sidebar's groups, every one of them (an empty group still offers "+"),
 * each with its non-empty sections in order. `match` filters the entries.
 */
export function groupEntries(entries: readonly LibEntry[], match?: (e: LibEntry) => boolean): SidebarGroup[] {
  const sections = new Map<string, LibEntry[]>();
  for (const e of [...entries].sort(byNumber)) {
    if (match && !match(e)) continue;
    const s = sectionOf(e).id;
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(e);
  }
  return GROUPS.map((g) => {
    const list = SECTIONS.filter((s) => s.group === g.id && sections.has(s.id)).map((s) => ({ id: s.id, label: s.label, entries: sections.get(s.id)! }));
    return { ...g, sections: list, count: list.reduce((n, s) => n + s.entries.length, 0) };
  });
}

/** How many resources each group holds. */
export function groupCounts(entries: readonly LibEntry[]): Record<GroupId, number> {
  const out = { story: 0, world: 0, characters: 0, items: 0, art: 0, advanced: 0 } as Record<GroupId, number>;
  for (const e of entries) out[groupOf(e)]++;
  return out;
}

/** A resource's kind in a few words: "script", "map", "NPC", "hat", "attack spell", "NPC walk sprite". */
export function kindLabel(r: Ref): string {
  switch (r.resType) {
    case 1:
      return "script";
    case 2:
      return "map";
    case 3:
      return ["character", "party member", "person", "monster", "object"][r.type] ?? "character";
    case 4:
      return `${(["", "attack", "enhancing", "restoring", "reviving", "special"][r.type] || "") + " "}spell`.trim();
    case 5:
      return r.type === 1 ? "cut-scene animation" : "effect animation";
    case 6:
      return (ITEM_KINDS[r.type - 1] ?? "item").toLowerCase().replace(/^(revival|story)$/, "$1 item");
    case 7:
      return "tileset";
    case 8:
      return ["sprite", "party walk sprite", "person walk sprite", "monster battle sprite", "object sprite"][r.type] ?? "sprite";
    case 9:
      return "item icon";
    case 10:
      return "effect image";
    case 11:
      return ["picture", "portrait", "system picture", "party battle sprite", "battle background", "story picture"][r.type] ?? "picture";
    case 12:
      return r.type === 1 ? "spell list" : r.type === 2 ? "level table" : "table";
    default:
      return "data";
  }
}

/** The name a resource shows in lists and tabs: its own name, else its kind and number. */
export function entryTitle(e: LibEntry): string {
  const n = resourceName(e.resType, e.type, e.data).trim();
  if (n && e.resType !== 5) return n;
  const k = kindLabel(e);
  return `${k[0].toUpperCase()}${k.slice(1)} ${e.type}-${e.index}`;
}

// --- where the game starts ---------------------------------------------------

export interface StartInfo {
  /** The script the engine runs first (always 1-1): its key, if it exists. */
  script?: string;
  /** The first map that script loads, if it exists. */
  map?: string;
  /** The `loadmap` line found, for a message when its map is missing. */
  loadmap?: { type: number; index: number; line: number };
}

/**
 * Where the game starts: script 1-1 and the first map it loads.
 *
 * HOOK: a simple reading of the script's text. The world index
 * (src/editor/format/world.ts, phase 1a) knows the player's start for real;
 * replace the body with it when it lands, keeping this signature.
 */
export function findStart(a: LibArchive, sources: Record<string, string>): StartInfo {
  const e = findEntry(a, 1, 1, 1);
  if (!e) return {};
  const out: StartInfo = { script: "1-1-1" };
  let text: string;
  try {
    text = scriptSource(e.data, sources["1-1-1"]);
  } catch {
    return out;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*loadmap\s+(\d+)\s*,\s*(\d+)/i.exec(lines[i].replace(/;.*/, ""));
    if (!m) continue;
    out.loadmap = { type: Number(m[1]), index: Number(m[2]), line: i + 1 };
    if (findEntry(a, 2, out.loadmap.type, out.loadmap.index)) out.map = `2-${out.loadmap.type}-${out.loadmap.index}`;
    break;
  }
  return out;
}

// --- tabs ---------------------------------------------------------------------

/** The project home's tab: always there, always first. */
export const HOME_TAB = "home";

export interface Tab {
  /** HOME_TAB or a resource key. */
  key: string;
  /** A preview tab (pinned false) is replaced by the next resource opened with a single click. */
  pinned: boolean;
  /** The view shown (a view id from views.tsx); the kind's first view when unset. */
  mode?: string;
}

export interface TabState {
  tabs: Tab[];
  active: string;
}

export const initialTabs = (): TabState => ({ tabs: [{ key: HOME_TAB, pinned: true }], active: HOME_TAB });

/**
 * Show a resource. An open tab is activated (and pinned if asked); otherwise
 * the new tab goes right after the active one, replacing the preview tab
 * (which goes away: it was only passing) — in place when the preview is the
 * active tab, so a new tab never turns up somewhere else in the strip.
 */
export function openTab(s: TabState, key: string, opts: { pin?: boolean; mode?: string } = {}): TabState {
  const at = s.tabs.findIndex((t) => t.key === key);
  if (at >= 0) {
    const t = s.tabs[at];
    const next = { ...t, pinned: t.pinned || !!opts.pin, mode: opts.mode ?? t.mode };
    const tabs = next.pinned === t.pinned && next.mode === t.mode ? s.tabs : s.tabs.map((x, i) => (i === at ? next : x));
    return { tabs, active: key };
  }
  const tab: Tab = { key, pinned: !!opts.pin, ...(opts.mode ? { mode: opts.mode } : {}) };
  const preview = s.tabs.findIndex((t) => !t.pinned);
  if (preview >= 0 && s.tabs[preview].key === s.active) return { tabs: s.tabs.map((t, i) => (i === preview ? tab : t)), active: key };
  const rest = preview >= 0 ? s.tabs.filter((_, i) => i !== preview) : s.tabs;
  const after = Math.max(0, rest.findIndex((t) => t.key === s.active));
  return { tabs: [...rest.slice(0, after + 1), tab, ...rest.slice(after + 1)], active: key };
}

export function pinTab(s: TabState, key: string): TabState {
  const t = s.tabs.find((x) => x.key === key);
  if (!t || t.pinned) return s;
  return { ...s, tabs: s.tabs.map((x) => (x.key === key ? { ...x, pinned: true } : x)) };
}

/** Close a tab (never the home tab); the one to its right, else its left, becomes active. */
export function closeTab(s: TabState, key: string): TabState {
  if (key === HOME_TAB) return s;
  const at = s.tabs.findIndex((t) => t.key === key);
  if (at < 0) return s;
  const tabs = s.tabs.filter((t) => t.key !== key);
  const active = s.active !== key ? s.active : (tabs[at] ?? tabs[at - 1] ?? tabs[0]).key;
  return { tabs, active };
}

/** Activate the next (dir 1) or previous (dir -1) tab, wrapping around. */
export function cycleTab(s: TabState, dir: 1 | -1): TabState {
  const n = s.tabs.length;
  const at = s.tabs.findIndex((t) => t.key === s.active);
  return { ...s, active: s.tabs[(((at + dir) % n) + n) % n].key };
}

export function setTabMode(s: TabState, key: string, mode: string): TabState {
  return { ...s, tabs: s.tabs.map((t) => (t.key === key ? { ...t, mode, pinned: true } : t)) };
}

/** A resource got another key (renumbered): its tab follows it. */
export function renameTab(s: TabState, from: string, to: string): TabState {
  if (!s.tabs.some((t) => t.key === from)) return s;
  const tabs = s.tabs.filter((t) => t.key !== to).map((t) => (t.key === from ? { ...t, key: to } : t));
  return { tabs, active: s.active === from ? to : s.active };
}

/** Drop the tabs of resources that no longer exist (and fix a stored state). */
export function retainTabs(s: TabState, exists: (key: string) => boolean): TabState {
  const seen = new Set<string>();
  const tabs = [{ key: HOME_TAB, pinned: true } as Tab, ...s.tabs.filter((t) => t.key !== HOME_TAB && exists(t.key))].filter((t) =>
    seen.has(t.key) ? false : (seen.add(t.key), true),
  );
  // (one preview tab at most)
  let preview = false;
  for (const t of tabs) if (!t.pinned) preview ? (t.pinned = true) : (preview = true);
  const active = tabs.some((t) => t.key === s.active) ? s.active : HOME_TAB;
  return { tabs, active };
}

// --- recent items and the command palette --------------------------------------

/** Put an id first in a most-recent-first list. */
export function pushRecent(list: readonly string[], id: string, max = 30): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export interface PaletteItem {
  /** "res:1-1-2", "cmd:playtest" */
  id: string;
  label: string;
  /** Shown beside the label (kind, number). */
  detail: string;
  /** More words that match (not shown). */
  keywords?: string;
  kind: "resource" | "command";
}

const norm = (s: string) => s.toLowerCase();

/**
 * How well one query word matches a text: higher is better, null when it
 * does not. Substrings beat scattered letters; the start of a word (or of
 * the text) beats the middle.
 */
export function wordScore(word: string, text: string, fuzzy = true): number | null {
  const t = norm(text);
  const at = t.indexOf(word);
  if (at >= 0) {
    const boundary = at === 0 || /[^a-z0-9]/.test(t[at - 1]);
    return 100 + (at === 0 ? 40 : 0) + (boundary ? 30 : 0) + (word.length === t.length ? 30 : 0) - Math.min(at, 30) * 0.5;
  }
  return fuzzy ? fuzzyScore(word, t) : null;
}

/**
 * Letters in order, starting at the start of a word, with few jumps: "wsp"
 * finds "whisperwood", "oq" finds "old quarry"; "whis" does not find "new
 * object (chest, sign)".
 */
function fuzzyScore(word: string, t: string): number | null {
  if (word.length < 2) return null;
  let best: number | null = null;
  for (let s = t.indexOf(word[0]); s >= 0; s = t.indexOf(word[0], s + 1)) {
    if (s > 0 && !/[^a-z0-9]/.test(t[s - 1])) continue;
    let last = s;
    let gaps = 0;
    for (let k = 1; k < word.length && last >= 0; k++) {
      const j = t.indexOf(word[k], last + 1);
      if (j > last + 1) gaps++;
      last = j;
    }
    if (last >= 0 && gaps <= Math.max(2, word.length >> 1)) best = Math.max(best ?? 0, 40 - gaps * 8 - (s ? 5 : 0));
  }
  return best;
}

/**
 * The palette's list for a query: every word must match the item's label,
 * detail or keywords; the label counts most. Recently used items come first
 * when nothing is typed and get a lift when something is.
 */
export function rankPalette(items: readonly PaletteItem[], query: string, recents: readonly string[] = []): PaletteItem[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const recency = new Map(recents.map((id, i) => [id, recents.length - i] as const));
  if (!words.length) {
    const recent = recents.map((id) => items.find((x) => x.id === id)).filter((x): x is PaletteItem => !!x);
    const rest = items.filter((x) => !recency.has(x.id));
    return [...recent, ...rest.filter((x) => x.kind === "command"), ...rest.filter((x) => x.kind === "resource")];
  }
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    let score = 0;
    for (const w of words) {
      const best = Math.max(
        (wordScore(w, item.label) ?? -1) * 1.5,
        wordScore(w, item.detail, false) ?? -1,
        item.keywords ? (wordScore(w, item.keywords, false) ?? -1) * 0.8 : -1,
      );
      if (best < 0) return;
      score += best;
    }
    score += (recency.get(item.id) ?? 0) * 2;
    scored.push({ item, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((x) => x.item);
}

/** The palette's entry for a resource. */
export function resourceItem(e: LibEntry): PaletteItem {
  const kind = kindLabel(e);
  const n = `${e.type}-${e.index}`;
  const group = GROUPS.find((g) => g.id === groupOf(e))!.label;
  return { id: `res:${keyOf(e)}`, label: entryTitle(e), detail: `${kind} ${n}`, keywords: `${group} #${e.index} ${subTypeName(e.resType, e.type)}`, kind: "resource" };
}
