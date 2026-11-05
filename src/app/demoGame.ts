// The built-in demos (original content) as playable games: The Silent Bell
// (about twenty minutes) and the short Lantern Path.
import { writeLib } from "../editor/format/lib";
import { lanternPath } from "../editor/template/demo";
import { silentBell } from "../editor/template/silentBell";
import type { StoredGame } from "../storage/db";

export const DEMO_ID = "builtin:lantern-path";
export const BELL_ID = "builtin:silent-bell";

let cached: Uint8Array | null = null;
let bellCached: Uint8Array | null = null;

/** Lantern Path's archive (also played by the launch page's preview). */
export function demoArchive(): Uint8Array {
  if (!cached) cached = writeLib(lanternPath());
  return cached;
}

function stored(id: string, name: string, fileName: string, data: Uint8Array): StoredGame {
  return { id, name, fileName, size: data.length, addedAt: 0, data: data.slice().buffer as ArrayBuffer };
}

export function demoGame(): StoredGame {
  return stored(DEMO_ID, "Lantern Path", "built-in demo", demoArchive());
}

export function bellGame(): StoredGame {
  if (!bellCached) bellCached = writeLib(silentBell());
  return stored(BELL_ID, "The Silent Bell", "built-in demo", bellCached);
}
