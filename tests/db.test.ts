// The IndexedDB store: a write is done only once its transaction commits.
// A request can succeed and its transaction still abort (a full disk); the
// write must then reject, and what was stored before must stay readable.
import { describe, expect, it } from "vitest";

/** A minimal IndexedDB: one database of key-value stores; `abortNext` makes the next readwrite transaction abort after its request succeeded. */
const fake = { abortNext: false, stores: new Map<string, Map<unknown, unknown>>() };

function request<T>(get: () => T) {
  const req: { result?: T; error: DOMException | null; onsuccess: (() => void) | null; onerror: (() => void) | null } = { error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    req.result = get();
    req.onsuccess?.();
  });
  return req;
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: DOMException | null = null;
  private writes: (() => void)[] = [];
  constructor(private mode: string) {
    // after the request's success: commit, or abort and drop its writes
    setTimeout(() => {
      if (this.mode === "readwrite" && fake.abortNext) {
        fake.abortNext = false;
        this.error = new DOMException("The quota has been exceeded.", "QuotaExceededError");
        this.onabort?.();
      } else {
        this.writes.forEach((w) => w());
        this.oncomplete?.();
      }
    }, 0);
  }
  objectStore(name: string) {
    if (!fake.stores.has(name)) fake.stores.set(name, new Map());
    const store = fake.stores.get(name)!, writes = this.writes;
    return {
      put(value: { id?: string }, key?: unknown) {
        return request(() => (writes.push(() => store.set(key ?? value.id, value)), undefined));
      },
      delete(key: unknown) {
        return request(() => (writes.push(() => store.delete(key)), undefined));
      },
      get: (key: unknown) => request(() => store.get(key)),
      getAll: () => request(() => [...store.values()]),
      getAllKeys: () => request(() => [...store.keys()]),
    };
  }
}

(globalThis as { indexedDB?: unknown }).indexedDB = {
  open() {
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: (_store: string, mode = "readonly") => new FakeTransaction(mode),
    };
    return request(() => db);
  },
};

const { getDevice, isPersistent, listGames, putDevice, putGame } = await import("../src/storage/db");

const device = (savedAt: number) => ({ id: "gam:x", os: "fulu-1", state: {} as never, flash: new ArrayBuffer(4), savedAt });
const game = (name: string) => ({ id: "g1", name, fileName: `${name}.lib`, size: 1, addedAt: 1, data: new ArrayBuffer(1) });

describe("the IndexedDB store", () => {
  it("resolves a write once it is committed", async () => {
    await putDevice(device(1));
    expect((await getDevice("gam:x"))?.savedAt).toBe(1);
    expect(isPersistent()).toBe(true);
  });

  it("rejects a write whose transaction aborts after its request succeeded, keeping what was stored", async () => {
    fake.abortNext = true;
    await expect(putDevice(device(2))).rejects.toThrow(/quota/i);
    expect((await getDevice("gam:x"))?.savedAt).toBe(1);
    // and does not fall back to keeping it in memory, where no read would find it
    expect(isPersistent()).toBe(true);
  });

  it("does the same for games", async () => {
    await putGame(game("first"));
    fake.abortNext = true;
    await expect(putGame(game("second"))).rejects.toThrow();
    expect((await listGames()).map((g) => g.name)).toEqual(["first"]);
  });
});
