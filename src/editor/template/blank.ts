// A blank starter project: all of the demo's original assets (system UI,
// tiles, sprites, sample monsters, items and spells) with a minimal story,
// so a new game is playable from the first minute.
import { encodeMap, type MapCell } from "../format/encode";
import { assemble } from "../format/gut";
import { putEntry, removeEntry, type LibArchive } from "../format/lib";
import { gbkBytes } from "../../engine/java";
import { lanternPath } from "./demo";

export function blankProject(title = "MY GAME"): LibArchive {
  const a = lanternPath();
  const titleBytes = Uint8Array.from(gbkBytes(title).slice(0, 9), (b) => b & 0xff);
  // drop the demo's story: second map/script, NPCs and scene objects
  removeEntry(a, 1, 1, 2);
  removeEntry(a, 2, 1, 2);
  for (const e of [...a.entries]) if (e.resType === 3 && (e.type === 2 || e.type === 4)) removeEntry(a, 3, e.type, e.index);

  // a 20x14 meadow ringed by trees (tile 0 grass, 2 tree)
  const w = 20;
  const h = 14;
  const cells: MapCell[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const border = x < 3 || y < 2 || x >= w - 3 || y >= h - 2;
      cells.push({ tile: border ? 2 : 0, walkable: !border, event: 0 });
    }
  putEntry(a, { resType: 2, type: 1, index: 1, data: encodeMap({ type: 1, index: 1, tileset: 1, name: "START", width: w, height: h, cells }) });
  putEntry(a, {
    resType: 1,
    type: 1,
    index: 1,
    data: assemble(`
.gut 1 1
.desc "start"
.events 40

@start:
  loadmap 1, 1, 4, 4
  createactor 1, 4, 3
  setscenename "START"
  showscenename
  say 1, "Your adventure    starts here!"
  callback
`),
  });
  return { titleBytes, entries: a.entries };
}
