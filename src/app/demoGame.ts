// The built-in Lantern Path demo (original content) as a playable game.
import { writeLib } from "../editor/format/lib";
import { lanternPath } from "../editor/template/demo";
import type { StoredGame } from "../storage/db";

export const DEMO_ID = "builtin:lantern-path";

let cached: Uint8Array | null = null;

export function demoArchive(): Uint8Array {
  if (!cached) cached = writeLib(lanternPath());
  return cached;
}

export function demoGame(): StoredGame {
  const data = demoArchive();
  return {
    id: DEMO_ID,
    name: "Lantern Path",
    fileName: "built-in demo",
    size: data.length,
    addedAt: 0,
    data: data.slice().buffer as ArrayBuffer,
  };
}
