// Requests to a map's World view from outside it (the guided first game,
// the New person wizard): "arm the Add person tool with this person and
// line", "show this person". A request waits until that map's World view is
// on screen (it may be opening), which takes it once.
import { useEffect, useRef } from "react";

export interface WorldIntent {
  /** The tool to arm ("person", "chest", "exit", "tile", "select"…). */
  tool?: string;
  /** Person (3-2-n) to place with Add person. */
  npc?: number;
  /** The line they say. */
  say?: string;
  /** Object (3-4-n) for Add chest. */
  box?: number;
  /** A tile to select (a problem the project check found there). */
  select?: { x: number; y: number };
}

const pending = new Map<string, WorldIntent>();
const listeners = new Set<(mapKey: string) => void>();

/** Ask the World view of a map to do something (now if it is open, else when it opens). */
export function requestWorld(mapKey: string, intent: WorldIntent): void {
  pending.set(mapKey, intent);
  for (const l of listeners) l(mapKey);
}

/** Take a waiting request (for tests and the view). */
export function takeWorldIntent(mapKey: string): WorldIntent | undefined {
  const i = pending.get(mapKey);
  pending.delete(mapKey);
  return i;
}

/** In a map's World view: run `apply` for every request made for this map. */
export function useWorldIntent(mapKey: string, apply: (i: WorldIntent) => void): void {
  const fn = useRef(apply);
  fn.current = apply;
  useEffect(() => {
    const run = (k: string) => {
      if (k !== mapKey) return;
      const i = takeWorldIntent(k);
      if (i) fn.current(i);
    };
    run(mapKey);
    listeners.add(run);
    return () => {
      listeners.delete(run);
    };
  }, [mapKey]);
}
