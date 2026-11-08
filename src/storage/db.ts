// Tiny IndexedDB wrapper for imported game archives, fonts, the 4988
// firmware and the state of emulated devices. Everything stays in the
// player's browser; nothing is uploaded anywhere.
import type { RegionId } from "../bbk/firmware";
import type { MachineState } from "../bbk/machine";

export interface StoredGame {
  id: string;
  name: string;
  fileName: string;
  size: number;
  addedAt: number;
  data: ArrayBuffer;
  /** "gam": a program for the device (run by its firmware); otherwise an fmj archive. */
  format?: "gam";
  /** Where a program built on the fmj engine keeps its resource library, to play it remastered. */
  libOffset?: number;
}

/** A device as it was left: its machine state and its flash (gzip-compressed). */
export interface StoredDevice {
  id: string;
  /** The OS the state belongs to (a digest of its ROM). */
  os: string;
  state: MachineState;
  flash: ArrayBuffer;
  savedAt: number;
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
const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;
// Fallback when IndexedDB is unavailable (private mode, blocked storage).
const memory = {
  games: new Map<string, StoredGame>(),
  fonts: new Map<string, ArrayBuffer>(),
  projects: new Map<string, StoredProject>(),
  firmware: new Map<string, ArrayBuffer>(),
  devices: new Map<string, StoredDevice>(),
};
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
        if (!db.objectStoreNames.contains("firmware")) db.createObjectStore("firmware");
        if (!db.objectStoreNames.contains("devices")) db.createObjectStore("devices", { keyPath: "id" });
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

/** The firmware files added so far, by region. */
export async function getFirmware(): Promise<Partial<Record<RegionId, Uint8Array>>> {
  const out: Partial<Record<RegionId, Uint8Array>> = {};
  try {
    if (!useMemory) {
      await open();
      const db = await dbPromise!;
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction("firmware").objectStore("firmware").openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return resolve();
          out[c.key as RegionId] = new Uint8Array(c.value as ArrayBuffer);
          c.continue();
        };
        req.onerror = () => reject(req.error);
      });
      return out;
    }
  } catch {
    /* fall through */
  }
  for (const [k, v] of memory.firmware) out[k as RegionId] = new Uint8Array(v);
  return out;
}

/** Which firmware files have been added. */
export async function listFirmware(): Promise<RegionId[]> {
  try {
    if (!useMemory) return (await tx<IDBValidKey[]>("firmware", "readonly", (s) => s.getAllKeys())) as RegionId[];
  } catch {
    /* fall through */
  }
  return [...memory.firmware.keys()] as RegionId[];
}

export async function putFirmwareFile(region: RegionId, data: ArrayBuffer): Promise<void> {
  try {
    if (!useMemory) {
      await tx("firmware", "readwrite", (s) => s.put(data, region));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.firmware.set(region, data);
}

export async function getDevice(id: string): Promise<StoredDevice | null> {
  try {
    if (!useMemory) return (await tx<StoredDevice | undefined>("devices", "readonly", (s) => s.get(id) as IDBRequest<StoredDevice | undefined>)) ?? null;
  } catch {
    /* fall through */
  }
  return memory.devices.get(id) ?? null;
}

export async function putDevice(d: StoredDevice): Promise<void> {
  try {
    if (!useMemory) {
      await tx("devices", "readwrite", (s) => s.put(d));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.devices.set(d.id, d);
}

export async function deleteDevice(id: string): Promise<void> {
  try {
    if (!useMemory) {
      await tx("devices", "readwrite", (s) => s.delete(id));
      return;
    }
  } catch {
    /* fall through */
  }
  memory.devices.delete(id);
}
