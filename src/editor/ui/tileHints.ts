// How tiles are walked on, for painting: the project's maps, and the maps of
// the built-in templates when the project uses the same tileset picture (a
// blank game starts with the demo's tileset and only one map, so the demo's
// maps say which of its tiles are houses and trees).
import { useMemo } from "react";
import { decodeMap, type DecodedMap } from "../format/decode";
import { findEntry, type LibArchive } from "../format/lib";
import type { ProjectNotes } from "../format/notes";
import { tileUsage, tileWalks, type TileUsage, type TileWalk } from "../format/tiles";
import { lanternPath } from "../template/demo";
import { silentBell } from "../template/silentBell";

let templates: { picture: Uint8Array; maps: DecodedMap[]; tileset: number }[] | null = null;

function templateSets() {
  if (!templates) {
    templates = [];
    for (const a of [lanternPath(), silentBell()]) {
      const maps = a.entries.filter((e) => e.resType === 2).map((e) => decodeMap(e.data));
      for (const t of a.entries.filter((e) => e.resType === 7 && e.type === 1)) templates.push({ picture: t.data, maps, tileset: t.index });
    }
  }
  return templates;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** How a template's maps use the tiles of this tileset picture (undefined when no template has it). */
export function templateUsage(picture: Uint8Array): TileUsage | undefined {
  const t = templateSets().find((x) => same(x.picture, picture));
  return t ? tileUsage(t.maps, t.tileset) : undefined;
}

/** Whether painting each tile of a tileset makes a cell walkable (format/tiles.ts tileWalk). */
export function useTileWalks(archive: LibArchive, notes: ProjectNotes | undefined, tileset: number, count: number): TileWalk[] {
  const maps = useMemo(() => {
    const out: DecodedMap[] = [];
    for (const e of archive.entries) {
      if (e.resType !== 2) continue;
      try {
        out.push(decodeMap(e.data));
      } catch {
        /* a broken map says nothing */
      }
    }
    return tileUsage(out, tileset);
  }, [archive, tileset]);
  const picture = findEntry(archive, 7, 1, tileset)?.data;
  const template = useMemo(() => (picture ? templateUsage(picture) : undefined), [picture]);
  return useMemo(() => tileWalks(count, tileset, { notes, maps, template }), [count, tileset, notes, maps, template]);
}
