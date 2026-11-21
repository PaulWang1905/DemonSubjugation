// Names for the resources the game stores without one (sprites, pictures,
// icons, tilesets, tables), for the editor's lists, tabs and palette: the
// author's name from the project notes, else a name from what uses it ("Old
// Woman (walk)", "Dusk Moth (battle)", "Herb (icon)", "START tiles"), else
// none (the lists then show the kind and number).
import { resourceName } from "./decode";
import type { LibArchive, LibEntry } from "./lib";
import { resourceNote, type ProjectNotes } from "./notes";
import { parseKey, resKey, type WorldIndex } from "./world";

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
