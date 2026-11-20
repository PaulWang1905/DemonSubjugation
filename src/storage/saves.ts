// Save slots live in localStorage, namespaced per game so different
// archives never overwrite each other's progress.
import type { SaveStorage } from "../engine/java";

const PREFIX = "fmj-react:save:";

/**
 * Saves that could not go into localStorage (it is full, or blocked), by key;
 * null for one that could not be removed. They are read before localStorage,
 * so a save made after storage failed is the one loaded, not an older one
 * still there; they last as long as the page.
 */
const pending = new Map<string, string | null>();
let warned = false;

function key(gameId: string, path: string): string {
  return `${PREFIX}${gameId}:${path}`;
}

function read(k: string): string | null {
  if (pending.has(k)) return pending.get(k)!;
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(k);
    else localStorage.setItem(k, value);
    pending.delete(k);
  } catch (e) {
    pending.set(k, value);
    if (!warned) console.warn("Saves are kept for this page only: the browser's storage refused them", e);
    warned = true;
  }
}

/** Whether every save made so far is in the browser's storage (none kept for this page only). */
export function savesStored(): boolean {
  return pending.size === 0;
}

/** The keys of a game's saves: localStorage's and those kept for this page, without the removed ones. */
function keysOf(gameId: string): string[] {
  const prefix = `${PREFIX}${gameId}:`, out = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.add(k);
    }
  } catch {
    /* only the pending ones */
  }
  for (const [k, v] of pending) {
    if (!k.startsWith(prefix)) continue;
    if (v == null) out.delete(k);
    else out.add(k);
  }
  return [...out];
}

export function savesFor(gameId: string): SaveStorage {
  return {
    get: (path) => read(key(gameId, path)),
    set: (path, value) => write(key(gameId, path), value ?? null),
    has: (path) => read(key(gameId, path)) != null,
  };
}

export function deleteSavesFor(gameId: string): void {
  for (const k of keysOf(gameId)) write(k, null);
}

/** All save slots of a game as a JSON blob (for backup / moving devices). */
export function exportSaves(gameId: string): string {
  const out: Record<string, string> = {};
  for (const k of keysOf(gameId)) {
    const v = read(k);
    if (v != null) out[k.slice(`${PREFIX}${gameId}:`.length)] = v;
  }
  return JSON.stringify({ format: "fmj-react-saves", version: 1, saves: out }, null, 2);
}

export function importSaves(gameId: string, json: string): number {
  const parsed = JSON.parse(json) as { format?: string; saves?: Record<string, string> };
  if (parsed.format !== "fmj-react-saves" || !parsed.saves) throw new Error("Not a save backup file");
  const s = savesFor(gameId);
  let n = 0;
  for (const [path, value] of Object.entries(parsed.saves)) {
    if (path.startsWith("sav/") && /^[0-9A-F]*$/i.test(value)) {
      s.set(path, value);
      n++;
    }
  }
  return n;
}
