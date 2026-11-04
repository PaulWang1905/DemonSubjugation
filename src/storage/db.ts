// Tiny IndexedDB wrapper for imported game archives and fonts. Everything
// stays in the player's browser; nothing is uploaded anywhere.

export interface StoredGame {
  id: string;
  name: string;
  fileName: string;
  size: number;
  addedAt: number;
  data: ArrayBuffer;
}

export type FontName = "HZK16" | "ASC16";

/** An editor project: the archive being edited. */
export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  data: ArrayBuffer;
  /** Script source text as written in the editor (labels, comments), by resource key. */
  sources?: Record<string, string>;
}

const DB_NAME = "fmj-react";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;
// Fallback when IndexedDB is unavailable (private mode, blocked storage).
const memory = { games: new Map<string, StoredGame>(), fonts: new Map<string, ArrayBuffer>(), projects: new Map<string, StoredProject>() };
let useMemory = false;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("games")) db.createObjectStore("games", { keyPath: "id" });
        if (!db.objectStoreNames.contains("fonts")) db.createObjectStore("fonts");
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  }).catch((e) => {
    console.warn("IndexedDB unavailable, keeping files in memory only", e);
    useMemory = true;
    throw e;
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listGames(): Promise<StoredGame[]> {
  try {
    if (!useMemory) {
      const all = await tx<StoredGame[]>("games", "readonly", (s) => s.getAll() as IDBRequest<StoredGame[]>);
      return all.sort((a, b) => a.addedAt - b.addedAt);
    }
  } catch {
    /* fall through */
  }
  return [...memory.games.values()];
}

export async function putGame(g: StoredGame): Promise<void> {
  try {
    if (!useMemory) {
      await tx("games", "readwrite", (s) => s.put(g));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.games.set(g.id, g);
}

export async function deleteGame(id: string): Promise<void> {
  try {
    if (!useMemory) {
      await tx("games", "readwrite", (s) => s.delete(id));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.games.delete(id);
}

export async function getFont(name: FontName): Promise<ArrayBuffer | null> {
  try {
    if (!useMemory) {
      const v = await tx<ArrayBuffer | undefined>("fonts", "readonly", (s) => s.get(name) as IDBRequest<ArrayBuffer | undefined>);
      return v ?? null;
    }
  } catch {
    /* fall through */
  }
  return memory.fonts.get(name) ?? null;
}

export async function putFont(name: FontName, data: ArrayBuffer): Promise<void> {
  try {
    if (!useMemory) {
      await tx("fonts", "readwrite", (s) => s.put(data, name));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.fonts.set(name, data);
}

export function isPersistent(): boolean {
  return !useMemory;
}

export async function listProjects(): Promise<StoredProject[]> {
  try {
    if (!useMemory) {
      const all = await tx<StoredProject[]>("projects", "readonly", (s) => s.getAll() as IDBRequest<StoredProject[]>);
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  } catch {
    /* fall through */
  }
  return [...memory.projects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putProject(p: StoredProject): Promise<void> {
  try {
    if (!useMemory) {
      await tx("projects", "readwrite", (s) => s.put(p));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.projects.set(p.id, p);
}

export async function deleteProject(id: string): Promise<void> {
  try {
    if (!useMemory) {
      await tx("projects", "readwrite", (s) => s.delete(id));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.projects.delete(id);
}
