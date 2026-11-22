// Names for the resources the game stores without one (sprites, pictures,
// icons, tilesets, tables), for the editor's lists, tabs and palette: the
// author's name from the project notes, else a name from what uses it ("Old
// Woman (walk)", "Dusk Moth (battle)", "Herb (icon)", "START tiles"), else
// none (the lists then show the kind and number). Scripts whose name other
// scripts share are named by what they are for ("三清宫 · 游戏开始"; below).
import { resourceName } from "./decode";
import type { LibArchive, LibEntry } from "./lib";
import { resourceNote, type ProjectNotes } from "./notes";
import { parseKey, resKey, type WorldIndex } from "./world";
import type { NameResolver } from "./commands";

/** "Mira, Tam" or "Mira, Tam +2". */
function list(names: string[], most = 2): string {
  const u = [...new Set(names.filter(Boolean))];
  return u.length <= most ? u.join(", ") : `${u.slice(0, most).join(", ")} +${u.length - most}`;
}

/** The name of the resource a reference comes from (a record's own name). */
function nameOf(archive: LibArchive, key: string, notes?: ProjectNotes): string {
  const noted = resourceNote(notes, key)?.name;
  if (noted) return noted;
  const { resType, type, index } = parseKey(key);
  const e = archive.entries.find((x) => x.resType === resType && x.type === type && x.index === index);
  return e ? resourceName(resType, type, e.data).trim() : "";
}

/** The maps' names a script shows. */
function mapsOf(world: WorldIndex, script: string): string[] {
  return (world.scripts.get(script)?.maps ?? []).map((m) => world.maps.get(m)?.name ?? "").filter(Boolean);
}

/** A name from what uses a resource, or null. */
export function derivedName(archive: LibArchive, world: WorldIndex, e: { resType: number; type: number; index: number }, notes?: ProjectNotes): string | null {
  const key = resKey(e.resType, e.type, e.index);
  const refs = world.refsTo.get(key) ?? [];
  const users = (pred: (from: string) => boolean) => refs.filter((r) => pred(r.from) && r.via !== "script").map((r) => nameOf(archive, r.from, notes));
  const fromScripts = () => list(refs.filter((r) => r.via === "script").flatMap((r) => mapsOf(world, r.from)));
  const named = (names: string[], role: string) => (list(names) ? `${list(names)} (${role})` : null);
  switch (e.resType) {
    case 1: {
      const maps = list(mapsOf(world, key));
      return maps ? `${maps} events` : null;
    }
    case 5:
      return named(users((f) => f.startsWith("4-") || f.startsWith("6-")), "animation");
    case 7: {
      const maps = list(refs.filter((r) => r.via === "tileset").map((r) => world.maps.get(r.from)?.name ?? ""));
      return maps ? `${maps} tiles` : null;
    }
    case 8: {
      const owner = { 1: "3-1-", 2: "3-2-", 3: "3-3-", 4: "3-4-" }[e.type];
      if (!owner) return null;
      return named(users((f) => f.startsWith(owner)), e.type === 3 ? "battle" : e.type === 4 ? "looks" : "walk");
    }
    case 9:
      return named(users((f) => f.startsWith("6-")), "icon");
    case 11: {
      if (e.type === 1) return named(users((f) => f.startsWith("3-1-")), "portrait");
      if (e.type === 3) return named(users((f) => f.startsWith("3-1-")), "battle");
      if (e.type === 4) {
        const at = fromScripts();
        return at ? `${at} battles` : null;
      }
      if (e.type === 5) {
        const at = fromScripts();
        return at ? `Picture in ${at}` : null;
      }
      return null;
    }
    case 10:
      return named(users((f) => f.startsWith("5-") || f.startsWith("4-")), "effect");
    case 12:
      if (e.type === 1) return named(users((f) => f.startsWith("3-")), "spells");
      if (e.type === 2) return named(users((f) => f.startsWith("3-1-")), "levels");
      return null;
    default:
      return null;
  }
}

/**
 * Labels for the lists: every resource that has a better name than its kind
 * and number (the author's, else a derived one). Resources the game names
 * (maps, characters, items, spells) keep their own name unless the author
 * named them.
 */
export function resourceLabels(archive: LibArchive, world: WorldIndex | null, notes?: ProjectNotes): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of archive.entries) {
    const key = resKey(e.resType, e.type, e.index);
    const noted = resourceNote(notes, key)?.name?.trim();
    if (noted) {
      out.set(key, noted);
      continue;
    }
    if (e.resType === 1) {
      const d = world ? derivedScriptLabels(world).get(key) : undefined;
      if (d) out.set(key, d);
      continue;
    }
    if (e.resType === 5 || !resourceName(e.resType, e.type, e.data).trim()) {
      const d = world ? derivedName(archive, world, e, notes) : null;
      if (d) out.set(key, d);
    }
  }
  return out;
}

/** A resource's label: from `labels` (resourceLabels), else `fallback` (its kind and number). */
export function labelOf(labels: ReadonlyMap<string, string> | undefined, e: LibEntry, fallback: (e: LibEntry) => string): string {
  return labels?.get(resKey(e.resType, e.type, e.index)) ?? fallback(e);
}

// ---------------------------------------------------------------------------
// Scripts
//
// A script's name is the text of its header, and a game may give every
// script the same one (all 185 of 伏魔记's are "游戏开始", "game start"). A
// script whose name no other script has keeps it; one whose name is shared
// (or empty) is shown with what it is for, from the world index: "start" for
// the script a new game runs (1-1), else the maps it runs on (its events
// handle them: "三清宫", "原野阡, 森林道路", "通用迷宫 +5"), else what it does
// ("battle", "shop", "cut-scene") or the maps it shows ("→ 建业城"). When
// that matches other scripts', the places its code shows (where its doors
// lead: the town of a shop) tell them apart if they can: "武器店 (忘忧村)". The
// stored name is unchanged, and the author's name from the project notes
// wins over all of this.

const SEP = " · ";

/** A script's own name: its header text. */
export function ownScriptName(e: LibEntry): string {
  return resourceName(1, e.type, e.data).trim();
}

/** "A", "A, B", "A +3". */
function places(names: string[]): string {
  const u = [...new Set(names.filter(Boolean))];
  return u.length <= 2 ? u.join(", ") : `${u[0]} +${u.length - 1}`;
}

const mapNames = (world: WorldIndex, keys: readonly string[]) => keys.map((k) => world.maps.get(k)?.name.trim() ?? "").filter(Boolean);

/** What a script does in a word, for a script that runs on no map: "battle", "shop", "pawnshop", "cut-scene", or "". */
function roleOf(world: WorldIndex, key: string): string {
  const ops = new Set<string>();
  for (const s of world.scripts.get(key)?.model.steps ?? []) if (s.kind === "instruction") ops.add(s.op.name);
  if (ops.has("enterfight")) return "battle";
  if (ops.has("buy")) return "shop";
  if (ops.has("sale")) return "pawnshop";
  if (ops.has("movie")) return "cut-scene";
  return "";
}

/**
 * What a script is for, in a few words: "start" (the script a new game runs),
 * the maps it runs on ("三清宫", "通用迷宫 +5"), else what it does ("battle")
 * or the maps it shows ("→ 建业城"), else "".
 */
export function scriptPurpose(world: WorldIndex, key: string): string {
  if (key === "1-1-1") return "start";
  const info = world.scripts.get(key);
  if (!info) return "";
  const on = places(mapNames(world, info.runsOn));
  if (on) return on;
  const role = roleOf(world, key);
  const shows = places(mapNames(world, info.maps));
  return role || (shows ? `→ ${shows}` : "");
}

interface ScriptNaming {
  /** The derived labels of the scripts whose own name is shared or empty (no notes). */
  labels: Map<string, string>;
  /** How many scripts have each own name. */
  uses: Map<string, number>;
}
const scriptCache = new WeakMap<WorldIndex, ScriptNaming>();

const derivedScriptLabels = (world: WorldIndex) => scriptNaming(world).labels;

/** The scripts' derived labels, cached per index. */
function scriptNaming(world: WorldIndex): ScriptNaming {
  const had = scriptCache.get(world);
  if (had) return had;
  const out = new Map<string, string>();
  const own = new Map<string, string>();
  const uses = new Map<string, number>();
  for (const [k, s] of world.scripts) {
    const n = ownScriptName(s.entry);
    own.set(k, n);
    uses.set(n, (uses.get(n) ?? 0) + 1);
  }
  const unclear = [...world.scripts.keys()].filter((k) => !own.get(k) || uses.get(own.get(k)!)! > 1);
  const purpose = new Map(unclear.map((k) => [k, scriptPurpose(world, k)]));
  // the same purpose: add where its code leads (the maps it shows but does not
  // run on: a shop's town), when that tells some of them apart
  const same = new Map<string, string[]>();
  for (const k of unclear) {
    const p = purpose.get(k)!;
    if (p && p !== "start" && !p.startsWith("→")) same.set(p, [...(same.get(p) ?? []), k]);
  }
  for (const [p, keys] of same) {
    if (keys.length < 2) continue;
    const leads = new Map(
      keys.map((k) => {
        const info = world.scripts.get(k)!;
        const runs = new Set(info.runsOn);
        return [k, places(mapNames(world, info.maps.filter((m) => !runs.has(m))))];
      }),
    );
    if (new Set(leads.values()).size < 2) continue;
    for (const [k, l] of leads) if (l) purpose.set(k, `${p} (${l})`);
  }
  for (const k of unclear) {
    const p = purpose.get(k)!;
    const n = own.get(k)!;
    const label = p && n ? `${p}${SEP}${n}` : p || n;
    if (label) out.set(k, label);
  }
  const naming = { labels: out, uses };
  scriptCache.set(world, naming);
  return naming;
}

/**
 * A script's name for lists, tabs and links: the author's (project notes),
 * else its own when no other script has it, else its own with what it is for
 * ("三清宫 · 游戏开始", "start · 游戏开始"), else its kind and number.
 */
export function scriptLabel(world: WorldIndex | null, key: string, notes?: ProjectNotes): string {
  const noted = resourceNote(notes, key)?.name?.trim();
  if (noted) return noted;
  const derived = world ? derivedScriptLabels(world).get(key) : undefined;
  if (derived) return derived;
  const e = world?.scripts.get(key)?.entry;
  const { type, index } = parseKey(key);
  return (e && ownScriptName(e)) || `Script ${type}-${index}`;
}

/**
 * A script's name in a dense list ("set in 三清宫 · checked in 无机阁"): its
 * label without the name other scripts share ("三清宫"), else its label.
 */
export function scriptShortLabel(world: WorldIndex | null, key: string, notes?: ProjectNotes): string {
  const label = scriptLabel(world, key, notes);
  const e = world?.scripts.get(key)?.entry;
  const tail = e ? `${SEP}${ownScriptName(e)}` : "";
  return tail && !resourceNote(notes, key)?.name?.trim() && label.endsWith(tail) && label !== tail.slice(SEP.length) ? label.slice(0, -tail.length) : label;
}

/** How many scripts share a script's own name (0: it has none), when it is shown with what it is for; else null. */
export function scriptNameShared(world: WorldIndex, key: string): number | null {
  const n = scriptNaming(world);
  const info = world.scripts.get(key);
  if (!info || !n.labels.has(key)) return null;
  const own = ownScriptName(info.entry);
  return own ? (n.uses.get(own) ?? 1) : 0;
}

/**
 * The chapters of a game whose scripts have more than one type (伏魔记's 1-14):
 * by type, the map the chapter starts on (the first of its scripts that runs
 * on one): "三清宫". A game with one type has none.
 */
export function chapterPlaces(world: WorldIndex): Map<number, string> {
  const out = new Map<number, string>();
  const types = new Set([...world.scripts.values()].map((s) => s.entry.type));
  if (types.size < 2) return out;
  const sorted = [...world.scripts.values()].sort((a, b) => a.entry.type - b.entry.type || a.entry.index - b.entry.index);
  for (const s of sorted) {
    if (out.has(s.entry.type)) continue;
    const on = mapNames(world, s.runsOn)[0];
    if (on) out.set(s.entry.type, on);
  }
  return out;
}

/**
 * Names for sentences with scripts by their labels (a resolver from
 * projectNames / scriptNames): "Switch to script “无机阁 · 游戏开始”".
 */
export function withScriptLabels<T extends NameResolver>(names: T, world: WorldIndex | null, notes?: ProjectNotes): T {
  if (!world) return names;
  const base = names.resource;
  return {
    ...names,
    resource: (resType: number, type: number, index: number) => {
      const key = resKey(resType, type, index);
      if (resType === 1 && world.scripts.has(key)) return scriptLabel(world, key, notes);
      return base ? base(resType, type, index) : "";
    },
  };
}

/**
 * Why a script is shown as it is, for a tooltip: "Runs on 三清宫药房; shows
 * 三清宫. Its own name, 游戏开始, is shared by 185 scripts." ("" for a script
 * shown by its own name).
 */
export function scriptAbout(world: WorldIndex, key: string, notes?: ProjectNotes): string {
  const info = world.scripts.get(key);
  if (!info || !derivedScriptLabels(world).has(key)) return "";
  const parts: string[] = [];
  if (key === "1-1-1") parts.push("A new game starts with it");
  const on = [...new Set(mapNames(world, info.runsOn))];
  if (on.length) parts.push(`${parts.length ? "runs" : "Runs"} on ${on.join(", ")}`);
  const runs = new Set(info.runsOn);
  const shows = [...new Set(mapNames(world, info.maps.filter((m) => !runs.has(m))))];
  if (shows.length) parts.push(`${parts.length ? "shows" : "Shows"} ${shows.length > 6 ? `${shows.slice(0, 6).join(", ")} and ${shows.length - 6} more` : shows.join(", ")}`);
  const role = on.length ? "" : roleOf(world, key);
  if (role) parts.push(`${parts.length ? "a" : "A"} ${role}, on no map of its own`);
  const own = ownScriptName(info.entry);
  const shared = scriptNaming(world).uses.get(own) ?? 1;
  const why = own ? `Its own name, ${own}, is shared by ${shared} scripts.` : "It has no name of its own.";
  const noted = resourceNote(notes, key)?.name?.trim() ? " You named it in this project." : "";
  return `${parts.length ? `${parts.join("; ")}. ` : ""}${why}${noted}`;
}
