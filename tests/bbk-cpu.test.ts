// 65C02 core against the SingleStepTests suite (wdc65c02/v1, one JSON file per
// opcode) and Klaus Dormann's functional tests. The suites are not part of the
// repository: point BBK_CPU_TESTS at a folder holding `wdc/<op>.json` (or a
// `.part` prefix of it) and the Dormann `.bin` files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Cpu } from "../src/bbk/cpu";

const DIR = process.env.BBK_CPU_TESTS ?? "";
const hasSuite = DIR !== "" && existsSync(join(DIR, "wdc"));

interface State {
  pc: number;
  s: number;
  a: number;
  x: number;
  y: number;
  p: number;
  ram: [number, number][];
}
interface Case {
  name: string;
  initial: State;
  final: State;
  cycles: unknown[];
}

/** The test cases of a suite file, one per line; a truncated last line is dropped. */
function cases(file: string): Case[] {
  const lines = readFileSync(file, "utf8").split("\n");
  if (!lines[lines.length - 1].startsWith("]")) lines.pop();
  return lines.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l.replace(/,\s*$/, "")) as Case);
}

function flatCpu(mem: Uint8Array): Cpu {
  return new Cpu({ read: (a) => mem[a], write: (a, v) => void (mem[a] = v) });
}

describe.skipIf(!hasSuite)("65C02 single-step tests", () => {
  const files = hasSuite ? readdirSync(join(DIR, "wdc")).sort() : [];
  it.each(files)("%s", (file) => {
    const mem = new Uint8Array(0x10000);
    const cpu = flatCpu(mem);
    const failures: string[] = [];
    for (const t of cases(join(DIR, "wdc", file))) {
      const { initial: i, final: f } = t;
      for (const [a, v] of i.ram) mem[a] = v;
      Object.assign(cpu, { pc: i.pc, s: i.s, a: i.a, x: i.x, y: i.y, p: i.p, waiting: false, stopped: false });
      const cycles = cpu.step();
      const got = { pc: cpu.pc, s: cpu.s, a: cpu.a, x: cpu.x, y: cpu.y, p: cpu.p, cycles };
      const want = { pc: f.pc, s: f.s, a: f.a, x: f.x, y: f.y, p: f.p, cycles: t.cycles.length };
      const ram = f.ram.filter(([a, v]) => mem[a] !== v);
      if (JSON.stringify(got) !== JSON.stringify(want) || ram.length) {
        failures.push(`${t.name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}${ram.length ? ` ram ${JSON.stringify(ram)}` : ""}`);
      }
      for (const [a] of f.ram) mem[a] = 0;
      for (const [a] of i.ram) mem[a] = 0;
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });
});

const dormann = (name: string) => join(DIR, name);

/** Run a Dormann test image until it traps (jumps to itself); returns the trap address. */
function runUntilTrap(image: string, start: number): number {
  const mem = new Uint8Array(readFileSync(image));
  const cpu = flatCpu(mem);
  cpu.pc = start;
  for (let n = 0; n < 200_000_000; n++) {
    const pc = cpu.pc;
    cpu.step();
    if (cpu.pc === pc) return pc;
  }
  throw new Error("no trap");
}

describe.skipIf(!existsSync(dormann("6502_functional_test.bin")))("Dormann functional tests", () => {
  // the success traps of the standard builds (`jmp *` after "success" in their listings)
  it("6502 functional test", () => {
    expect(runUntilTrap(dormann("6502_functional_test.bin"), 0x400).toString(16)).toBe((0x3469).toString(16));
  });
  it("65C02 extended opcodes test", () => {
    expect(runUntilTrap(dormann("65C02_extended_opcodes_test.bin"), 0x400).toString(16)).toBe((0x24f1).toString(16));
  });
});
