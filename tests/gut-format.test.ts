import { describe, expect, it } from "vitest";
import { assemble, disassemble, parseGut } from "../src/editor/format/gut";

const SRC = `
.gut 1 2
.desc "demo"
.events 3
.event 1 @start
.event 3 @shop

@start:
  setscenename "Mossvale"
  say 0, "Welcome, traveller!"
  choice "Rest", "Leave", @leave
  gainmoney 100000
  if 7, @done
  setevent 7
@done:
  callback
@leave:
  goto @done
@shop:
  buy 9:1, 9:2, 7:3
  callback
`;

describe("GUT assembler", () => {
  it("assembles header, events and jumps", () => {
    const bin = assemble(SRC);
    const g = parseGut(bin);
    expect([g.type, g.index]).toEqual([1, 2]);
    expect(g.events).toHaveLength(3);
    expect(g.events[1]).toBe(0);
    expect(g.events[0]).toBe(3 + 3 * 2); // first byte of code
    expect(g.code[0]).toBe(54); // setscenename
  });

  it("round-trips through the disassembler", () => {
    const bin = assemble(SRC);
    const text = disassemble(bin);
    expect(text).toContain('say 0, "Welcome, traveller!"');
    expect(text).toContain("buy 9:1, 9:2, 7:3");
    expect(text).toContain("gainmoney 100000");
    expect([...assemble(text)]).toEqual([...bin]);
  });

  it("encodes Chinese text as GBK and escapes odd bytes", () => {
    const bin = assemble('.events 0\n  message "你好\\x01"\n');
    const g = parseGut(bin);
    expect([...g.code]).toEqual([47, 0xc4, 0xe3, 0xba, 0xc3, 0x01, 0]);
    expect(disassemble(bin)).toContain('message "你好\\x01"');
  });

  it("keeps undecodable bytes as raw data", () => {
    const bin = assemble('.events 0\n  callback\n  .raw x"c8ff00"\n');
    const text = disassemble(bin);
    expect(text).toContain('.raw x"c8ff00"');
    expect([...assemble(text)]).toEqual([...bin]);
  });

  it("reports helpful errors", () => {
    expect(() => assemble("  say 1\n")).toThrow(/line 1: say takes 2 operand/);
    expect(() => assemble("  goto @nowhere\n")).toThrow(/unknown label @nowhere/);
    expect(() => assemble("  flyaway 1\n")).toThrow(/unknown instruction/);
    expect(() => assemble("  set 1, 70000\n")).toThrow(/16 bits/);
  });
});

import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
describe("demo script sources", () => {
  it("assemble to exactly the bytes in the demo archive", () => {
    const a = lanternPath();
    for (const [key, src] of Object.entries(lanternPathSources())) {
      const [rt, t, i] = key.split("-").map(Number);
      const e = a.entries.find((x) => x.resType === rt && x.type === t && x.index === i)!;
      expect([...assemble(src)]).toEqual([...e.data]);
    }
  });
});
