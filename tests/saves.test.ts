// Save slots when the browser's storage refuses a write (full or blocked):
// the latest save must still be the one read back.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteSavesFor, exportSaves, savesFor, savesStored } from "../src/storage/saves";

/** A localStorage that throws on writes while `full` is set, as a full one does. */
class FakeStorage {
  full = false;
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.items.set(k, v);
  }
  removeItem(k: string) {
    if (this.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.items.delete(k);
  }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("save slots", () => {
  it("read back the latest save when storage refused it, not the older one stored", () => {
    const s = savesFor("full-1");
    s.set("sav/r0.sav", "AAAA");
    storage.full = true;
    s.set("sav/r0.sav", "BBBB");
    expect(s.get("sav/r0.sav")).toBe("BBBB");
    expect(s.has("sav/r0.sav")).toBe(true);
    expect(savesStored()).toBe(false);
    expect(JSON.parse(exportSaves("full-1")).saves).toEqual({ "sav/r0.sav": "BBBB" });
  });

  it("go to storage again once it takes them", () => {
    const s = savesFor("full-2");
    storage.full = true;
    s.set("sav/r1.sav", "CCCC");
    storage.full = false;
    s.set("sav/r1.sav", "DDDD");
    expect(storage.getItem("fmj-react:save:full-2:sav/r1.sav")).toBe("DDDD");
    expect(s.get("sav/r1.sav")).toBe("DDDD");
  });

  it("stay removed when storage refused the removal", () => {
    const s = savesFor("full-3");
    s.set("sav/r2.sav", "EEEE");
    storage.full = true;
    s.set("sav/r2.sav", null);
    expect(s.get("sav/r2.sav")).toBeNull();
    expect(s.has("sav/r2.sav")).toBe(false);
    expect(JSON.parse(exportSaves("full-3")).saves).toEqual({});
  });

  it("are all removed with their game, the stored and the refused", () => {
    const s = savesFor("full-4");
    s.set("sav/r0.sav", "AAAA");
    storage.full = true;
    s.set("sav/r1.sav", "BBBB");
    storage.full = false;
    deleteSavesFor("full-4");
    expect(s.has("sav/r0.sav")).toBe(false);
    expect(s.has("sav/r1.sav")).toBe(false);
    expect(storage.length).toBe(0);
  });
});
