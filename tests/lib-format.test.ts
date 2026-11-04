import { describe, expect, it } from "vitest";
import { BLOCK, putEntry, readLib, removeEntry, writeLib, type LibArchive } from "../src/editor/format/lib";
import { inspectDatLib } from "../src/engine";
import { buildLib, gut, image } from "./fixtures";

const bytes = (n: number, v: number) => new Uint8Array(n).fill(v);

describe("LIB writer", () => {
  it("round-trips resources exactly", () => {
    const src = buildLib([
      { resType: 1, type: 1, index: 1, bytes: gut(1, 1, [9], [0]) },
      { resType: 11, type: 1, index: 1, bytes: image(1, 1, [["#.#."]]) },
    ]);
    const a = readLib(src);
    const back = readLib(writeLib(a));
    expect(back.entries.map((e) => [e.resType, e.type, e.index, [...e.data]])).toEqual(
      a.entries.map((e) => [e.resType, e.type, e.index, [...e.data]]),
    );
    expect(inspectDatLib(writeLib(a)).playable).toBe(true);
  });

  it("writes the header, block tags and used-end fields", () => {
    const a: LibArchive = {
      titleBytes: new Uint8Array([0xb2, 0xe2, 0xca, 0xd4]),
      entries: [
        { resType: 2, type: 1, index: 1, data: bytes(100, 1) },
        { resType: 11, type: 2, index: 5, data: bytes(10, 2) },
      ],
    };
    const out = writeLib(a);
    expect(String.fromCharCode(...out.slice(0, 3))).toBe("LIB");
    expect(out[12] | (out[13] << 8)).toBe(6); // two 3-byte index entries
    expect(String.fromCharCode(...out.slice(0x4000, 0x4003))).toBe("MAP");
    expect(String.fromCharCode(...out.slice(0x8000, 0x8003))).toBe("SUN");
    expect(out[0x4000 + 12] | (out[0x4000 + 13] << 8)).toBe(0x10 + 100);
    expect(out.length % BLOCK).toBe(0);
  });

  it("packs small resources into shared blocks and opens new ones when full", () => {
    const a: LibArchive = { titleBytes: new Uint8Array(), entries: [] };
    for (let i = 1; i <= 5; i++) putEntry(a, { resType: 7, type: 1, index: i, data: bytes(6000, i) });
    const out = writeLib(a);
    expect(out.length).toBe(0x4000 + 3 * BLOCK); // 2 per block (12000 of 16368 bytes)
    const back = readLib(out);
    expect(back.entries.map((e) => e.data[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it("replaces and removes entries and rejects bad archives", () => {
    const a: LibArchive = { titleBytes: new Uint8Array(), entries: [] };
    putEntry(a, { resType: 2, type: 1, index: 1, data: bytes(4, 1) });
    putEntry(a, { resType: 2, type: 1, index: 1, data: bytes(4, 9) });
    expect(a.entries).toHaveLength(1);
    expect(a.entries[0].data[0]).toBe(9);
    removeEntry(a, 2, 1, 1);
    expect(a.entries).toHaveLength(0);
    expect(() => writeLib({ titleBytes: new Uint8Array(10), entries: [] })).toThrow(/Title too long/);
    expect(() => writeLib({ titleBytes: new Uint8Array(), entries: [{ resType: 1, type: 1, index: 1, data: bytes(BLOCK, 0) }] })).toThrow(/too large/);
    expect(() => readLib(new Uint8Array(100))).toThrow(/Not a LIB/);
  });
});
