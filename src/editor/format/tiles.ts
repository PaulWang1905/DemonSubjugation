// What a tile of a tileset means to an author: its name ("grass", "house
// door") and whether the player can walk on it, so painting a tile also
// paints its walkability (a house is solid, a path is not). The engine only
// stores walkability per map cell; the names and the author's own "solid"
// setting are notes kept beside the project (notes.extra.tiles), and the rest
// comes from how the project's maps (or a template's maps with the same
// tileset picture) already use each tile.
import type { DecodedMap } from "./decode";
import type { ProjectNotes } from "./notes";

/** The author's note on a tile. */
export interface TileNote {
  name?: string;
  /** Painting it blocks the cell (true) or makes it walkable (false); unset: as the maps use it. */
  solid?: boolean;
}

/** notes.extra key: { "<tileset>": { "<tile>": TileNote } }. */
export const TILE_NOTES = "tiles";

type TileNotes = Record<string, Record<string, TileNote>>;

function allTileNotes(notes: ProjectNotes | undefined): TileNotes {
  const raw = notes?.extra[TILE_NOTES];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as TileNotes) : {};
}

/** The author's note on tile `i` of tileset `tileset`. */
export function tileNote(notes: ProjectNotes | undefined, tileset: number, i: number): TileNote | undefined {
  const n = allTileNotes(notes)[String(tileset)]?.[String(i)];
  return n && typeof n === "object" ? n : undefined;
}

/** A tile's name: the author's, else "tile N". */
export function tileName(notes: ProjectNotes | undefined, tileset: number, i: number): string {
  return tileNote(notes, tileset, i)?.name?.trim() || `tile ${i}`;
}

/** Set (merge) a tile's note; an empty name and an unset `solid` remove it. */
export function setTileNote(notes: ProjectNotes, tileset: number, i: number, patch: TileNote): ProjectNotes {
  const all = allTileNotes(notes);
  const set = { ...(all[String(tileset)] ?? {}) };
  const merged: TileNote = { ...set[String(i)], ...patch };
  const clean: TileNote = {};
  if (merged.name?.trim()) clean.name = merged.name.trim().slice(0, 40);
  if (typeof merged.solid === "boolean") clean.solid = merged.solid;
  if (clean.name || clean.solid !== undefined) set[String(i)] = clean;
  else delete set[String(i)];
  const next: TileNotes = { ...all, [String(tileset)]: set };
  if (!Object.keys(set).length) delete next[String(tileset)];
  const extra: Record<string, unknown> = { ...notes.extra, [TILE_NOTES]: next };
  if (!Object.keys(next).length) delete extra[TILE_NOTES];
  return { ...notes, extra };
}

/** How often each tile of a tileset is walkable / blocked on these maps. */
export type TileUsage = Map<number, { walk: number; block: number }>;

export function tileUsage(maps: Iterable<Pick<DecodedMap, "tileset" | "cells">>, tileset: number): TileUsage {
  const out: TileUsage = new Map();
  for (const m of maps) {
    if (m.tileset !== tileset) continue;
    for (const c of m.cells) {
      const u = out.get(c.tile) ?? { walk: 0, block: 0 };
      if (c.walkable) u.walk++;
      else u.block++;
      out.set(c.tile, u);
    }
  }
  return out;
}

export interface TileWalk {
  walkable: boolean;
  /** Where it comes from: the author's setting, the project's maps, a template's maps, or a guess (walkable). */
  from: "yours" | "maps" | "template" | "guess";
}

/**
 * Whether painting tile `i` makes the cell walkable: the author's setting,
 * else how the project's maps use it most, else how a template's maps with
 * the same tileset picture do, else walkable.
 */
export function tileWalk(i: number, o: { note?: TileNote; maps?: TileUsage; template?: TileUsage }): TileWalk {
  if (typeof o.note?.solid === "boolean") return { walkable: !o.note.solid, from: "yours" };
  const pick = (u: TileUsage | undefined) => {
    const c = u?.get(i);
    return c && c.walk + c.block > 0 ? c.walk >= c.block : null;
  };
  const m = pick(o.maps);
  if (m !== null) return { walkable: m, from: "maps" };
  const t = pick(o.template);
  if (t !== null) return { walkable: t, from: "template" };
  return { walkable: true, from: "guess" };
}

/** Every tile's walkability when painted (see tileWalk). */
export function tileWalks(count: number, tileset: number, o: { notes?: ProjectNotes; maps?: TileUsage; template?: TileUsage }): TileWalk[] {
  return Array.from({ length: count }, (_, i) => tileWalk(i, { note: tileNote(o.notes, tileset, i), maps: o.maps, template: o.template }));
}

/** Paint tile `tile` on cell lo byte `lo` (bit 7 walkable): the tile, and its walkability when `walk` says. */
export function paintLo(lo: number, tile: number, walk: boolean | null): number {
  const w = walk === null ? lo & 0x80 : walk ? 0x80 : 0;
  return w | (tile & 0x7f);
}
