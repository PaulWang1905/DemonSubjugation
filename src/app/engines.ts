// The three engines a game can run on, and which one each game uses:
//
//   react     FMJ React, this site's engine: a .lib, or the library a .gam
//             carries, remastered (HD text, wider maps, the debug menu)
//   fulu      Fulu, this site's stand-in for the 4988's OS: any .gam
//   original  BBK's own firmware, emulated: any .gam, once its files are added
//
// The choice is per game and remembered in this browser; the default is the
// engine a .gam exported by the editor asks for, else the original OS when its
// files are there, Fulu otherwise. The editor's own containers (no BBK code)
// play on FMJ React alone.

import type { StoredGame } from "../storage/db";
import { pref, setPref } from "./playerShell";

export type EngineId = "react" | "fulu" | "original";

export interface EngineOption {
  id: EngineId;
  /** Whether it can run the game now (the original OS needs its files). */
  ready: boolean;
}

/** The engines `game` can run on, in the order they are offered. */
export function enginesFor(game: StoredGame, firmwareReady: boolean): EngineOption[] {
  if (game.format !== "gam" || game.reactOnly) return [{ id: "react", ready: true }];
  return [
    { id: "original", ready: firmwareReady },
    { id: "fulu", ready: true },
    ...(game.libOffset !== undefined ? [{ id: "react" as const, ready: true }] : []),
  ];
}

const key = (game: StoredGame) => `engine:${game.id}`;

/** The engine `game` plays on: the one chosen for it if it can, else the default. */
export function engineFor(game: StoredGame, firmwareReady: boolean): EngineId {
  const options = enginesFor(game, firmwareReady);
  const chosen = options.find((o) => o.id === pref<string>(key(game), "") && o.ready);
  const asked = options.find((o) => o.id === game.engine && o.ready);
  return chosen?.id ?? asked?.id ?? (options.find((o) => o.ready && o.id !== "react") ?? options[0]).id;
}

export function chooseEngine(game: StoredGame, id: EngineId): void {
  setPref(key(game), id);
}
