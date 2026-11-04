// Save slots live in localStorage, namespaced per game so different
// archives never overwrite each other's progress.
import type { SaveStorage } from "../engine/java";

const PREFIX = "fmj-react:save:";
const memory = new Map<string, string>();

function key(gameId: string, path: string): string {
  return `${PREFIX}${gameId}:${path}`;
}

export function savesFor(gameId: string): SaveStorage {
  return {
    get(path) {
      try {
        return localStorage.getItem(key(gameId, path));
      } catch {
        return memory.get(key(gameId, path)) ?? null;
      }
    },
    set(path, value) {
      const k = key(gameId, path);
      try {
        if (value == null) localStorage.removeItem(k);
        else localStorage.setItem(k, value);
      } catch {
        if (value == null) memory.delete(k);
        else memory.set(k, value);
      }
    },
    has(path) {
      try {
        return localStorage.getItem(key(gameId, path)) != null;
      } catch {
        return memory.has(key(gameId, path));
      }
    },
  };
}

export function deleteSavesFor(gameId: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}${gameId}:`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** All save slots of a game as a JSON blob (for backup / moving devices). */
export function exportSaves(gameId: string): string {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}${gameId}:`)) out[k.slice(`${PREFIX}${gameId}:`.length)] = localStorage.getItem(k)!;
    }
  } catch {
    /* ignore */
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
