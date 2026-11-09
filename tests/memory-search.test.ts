import { describe, expect, it } from "vitest";
import { MemorySearch } from "../src/bbk/memorySearch";

describe("memory search", () => {
  it("narrows to the address of a number as it changes", () => {
    const ram = new Uint8Array(0x100);
    ram.set([0xf4, 0x01], 0x40); // 500 at $40
    ram.set([0xf4, 0x01], 0x80); // and a 500 that stays
    const s = new MemorySearch(ram, 2);
    s.narrow({ equals: 500 });
    expect(s.results(10).map((r) => r.addr)).toEqual([0x40, 0x80]);
    ram.set([0x58, 0x02], 0x40); // spent: 600
    s.narrow("up");
    expect(s.results(10)).toEqual([{ addr: 0x40, value: 600 }]);
    s.set(0x40, 9999);
    expect([ram[0x40], ram[0x41]]).toEqual([0x0f, 0x27]);
  });

  it("starts from every address, and keeps what stayed", () => {
    const ram = new Uint8Array(16).fill(7);
    const s = new MemorySearch(ram, 1);
    expect(s.count).toBe(16);
    ram[3] = 8;
    ram[5] = 6;
    s.narrow("unchanged");
    expect(s.count).toBe(14);
    ram[4] = 1;
    s.narrow("down");
    expect(s.results(5)).toEqual([{ addr: 4, value: 1 }]);
  });
});
