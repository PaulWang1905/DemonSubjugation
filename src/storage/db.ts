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
  /** For a .gam exported by the editor: the engine it asks to be opened with (src/bbk/gamBuild.ts). */
  engine?: "react" | "fulu";
  /** A .gam that is the site's own container: its program only returns, so it plays on FMJ React alone. */
  reactOnly?: boolean;
  /** When it was last played. */
  playedAt?: number;
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
// Where everything is kept when IndexedDB cannot be opened (private mode,
// blocked storage): for this page only. Only then: when IndexedDB is there
// but a write fails (the disk is full), the write rejects, so that what the
// caller shows is true and the next read does not find older data.
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

/** The database, or null when IndexedDB cannot be used (then everything is kept in memory). */
async function database(): Promise<IDBDatabase | null> {
  if (useMemory) return null;
  try {
    return await open();
  } catch {
    return null;
  }
}

/**
 * One request in its own transaction. Resolves with the request's result
 * once the transaction has committed (oncomplete), not when the request
 * succeeds: a transaction can still abort after that (a full disk), and
 * then nothing was written. Rejects on an error or an abort.
 */
function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction;
    try {
      t = db.transaction(store, mode);
    } catch (e) {
      return reject(e);
    }
    let result: T;
    const req = fn(t.objectStore(store));
    req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onabort = () => reject(t.error ?? req.error ?? new DOMException("The transaction was aborted.", "AbortError"));
    t.onerror = () => reject(t.error ?? req.error);
  });
}

/** Read from a store, or from memory when IndexedDB cannot be used. */
async function read<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>, inMemory: () => T): Promise<T> {
  const db = await database();
  return db ? run(db, store, "readonly", fn) : inMemory();
}

/** Write to a store (resolving once it is committed, rejecting if it is not), or to memory when IndexedDB cannot be used. */
async function write<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>, inMemory: () => void): Promise<void> {
  const db = await database();
  if (db) await run(db, store, "readwrite", fn);
  else inMemory();
}

export async function listGames(): Promise<StoredGame[]> {
  const all = await read("games", (s) => s.getAll() as IDBRequest<StoredGame[]>, () => [...memory.games.values()]);
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export const putGame = (g: StoredGame) => write("games", (s) => s.put(g), () => void memory.games.set(g.id, g));

export const deleteGame = (id: string) => write("games", (s) => s.delete(id), () => void memory.games.delete(id));

export async function getFont(name: FontName): Promise<ArrayBuffer | null> {
  return (await read("fonts", (s) => s.get(name) as IDBRequest<ArrayBuffer | undefined>, () => memory.fonts.get(name))) ?? null;
}

export const putFont = (name: FontName, data: ArrayBuffer) => write("fonts", (s) => s.put(data, name), () => void memory.fonts.set(name, data));

export function isPersistent(): boolean {
  return !useMemory;
}

export async function listProjects(): Promise<StoredProject[]> {
  const all = await read("projects", (s) => s.getAll() as IDBRequest<StoredProject[]>, () => [...memory.projects.values()]);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const putProject = (p: StoredProject) => write("projects", (s) => s.put(p), () => void memory.projects.set(p.id, p));

export const deleteProject = (id: string) => write("projects", (s) => s.delete(id), () => void memory.projects.delete(id));

/** The firmware files added so far, by region. */
export async function getFirmware(): Promise<Partial<Record<RegionId, Uint8Array>>> {
  const out: Partial<Record<RegionId, Uint8Array>> = {};
  const db = await database();
  if (!db) {
    for (const [k, v] of memory.firmware) out[k as RegionId] = new Uint8Array(v);
    return out;
  }
  const keys = await run(db, "firmware", "readonly", (s) => s.getAllKeys());
  const values = await run(db, "firmware", "readonly", (s) => s.getAll() as IDBRequest<ArrayBuffer[]>);
  keys.forEach((k, i) => (out[k as RegionId] = new Uint8Array(values[i])));
  return out;
}

/** Which firmware files have been added. */
export async function listFirmware(): Promise<RegionId[]> {
  return (await read("firmware", (s) => s.getAllKeys(), () => [...memory.firmware.keys()])) as RegionId[];
}

export const putFirmwareFile = (region: RegionId, data: ArrayBuffer) => write("firmware", (s) => s.put(data, region), () => void memory.firmware.set(region, data));

export async function getDevice(id: string): Promise<StoredDevice | null> {
  return (await read("devices", (s) => s.get(id) as IDBRequest<StoredDevice | undefined>, () => memory.devices.get(id))) ?? null;
}

export const putDevice = (d: StoredDevice) => write("devices", (s) => s.put(d), () => void memory.devices.set(d.id, d));

export const deleteDevice = (id: string) => write("devices", (s) => s.delete(id), () => void memory.devices.delete(id));
