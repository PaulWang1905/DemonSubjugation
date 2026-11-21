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

// ---------------------------------------------------------------------------
// What the author is looking at, for the wizards opened from a menu (the
// sidebar's "+", the command palette, the project home): the map in the
// current tab, or the last map viewed; who is selected on it.

/** Who is selected in each map's World view: a person's script and id. */
const selected = new Map<string, { script: string; id: number }>();

/** A map's World view: remember who is selected there (null: no one). */
export function noteWorldSelection(mapKey: string, who: { script: string; id: number } | null): void {
  if (who) selected.set(mapKey, who);
  else selected.delete(mapKey);
}

/** Who is selected in a map's World view, as "script#id". */
export function worldSelection(mapKey: string): string | undefined {
  const s = selected.get(mapKey);
  return s ? `${s.script}#${s.id}` : undefined;
}

/**
 * Where a wizard starts: the map in the active tab (a map, or the map a
 * script shows), else the last map viewed; the person selected on that map.
 * Nothing when nothing is known (the wizard then starts on the start map and
 * asks who).
 */
export function wizardContext(o: {
  active: string | null;
  lastMap: string | null;
  /** The maps a script shows (world.ts ScriptInfo.maps). */
  mapsOf: (script: string) => readonly string[] | undefined;
  /** Whether a map exists. */
  exists: (map: string) => boolean;
  selection?: (map: string) => string | undefined;
}): { map?: string; person?: string } {
  const { active, lastMap } = o;
  let map: string | undefined;
  if (active?.startsWith("2-") && o.exists(active)) map = active;
  else if (active?.startsWith("1-")) map = o.mapsOf(active)?.find(o.exists);
  if (!map && lastMap && o.exists(lastMap)) map = lastMap;
  if (!map) return {};
  const person = (o.selection ?? worldSelection)(map);
  return person ? { map, person } : { map };
}
