// How much of what a folder of .gam programs calls Fulu answers, and what
// to write next.
//   npx tsx scripts/bbk/fulu-coverage.mts <folder of .gam> [0E00.DAT] [--programs]
// (--programs also lists, for each program, what it can call that Fulu lacks:
// the scan column of src/app/fuluGames.ts)
// For each program: the OS functions it far-calls (a byte search for
// LDX/STX $26, LDX/STX $27, JSR $D2F6, as api-scan.mjs, with STX zero page
// or absolute) and the resident
// routines it JSRs or JMPs to (a byte search for the collection's 61, as
// resident-calls.mjs found them), less what Fulu has (src/fulu). This is what a
// program *can* call: a call on a path never taken counts, a call through a
// pointer does not. With the OS ROM, the missing functions' sizes
// (instructions, as os-function.mjs --size counts them) give a plan: the
// missing functions in the order that completes the most programs per
// instruction.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTIONS } from "../../src/fulu/os";
import { HELPERS } from "../../src/fulu/runtime";

const args = process.argv.slice(2);
const eachProgram = args.includes("--programs");
const [folder, rom] = args.filter((a) => a !== "--programs");
if (!folder) throw new Error("usage: npx tsx scripts/bbk/fulu-coverage.mts <folder of .gam> [0E00.DAT]");
const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;
const has = (a: number) => !!FUNCTIONS[a] || !!HELPERS[a] || a === 0xd2f6 || a === 0xd313;

/**
 * The resident routines ($D000-$FFFF) the 138 programs of the bbk-games
 * collection JSR or JMP to (resident-calls.mjs over the collection, with the
 * targets that were data, not code, left out), and $E90D / $E910 (the
 * serial port's send and receive, in 宠物精灵 and 恶龙传说: found by
 * fulu-flow.mts in code this list had taken for data), and 13 more that
 * fulu-flow.mts and the firmware log found the programs calling (76 in all,
 * with $D2F6).
 */
const RESIDENT = new Set([0xd29d, 0xd2ca, 0xd2f6, 0xd31a, 0xd340, 0xd362, 0xd3ef, 0xd435, 0xd49e, 0xd4a9, 0xd4c0, 0xd4c6, 0xd506, 0xd50c, 0xd53a, 0xd604, 0xd65b, 0xd6af, 0xd6f5, 0xd81d, 0xd85a, 0xd85f, 0xda09, 0xda1a, 0xda3d, 0xdaaa, 0xdac1, 0xdac7, 0xdaca, 0xdae6, 0xdafc, 0xdb19, 0xdb2f, 0xdb5c, 0xdbe1, 0xdbf2, 0xdc0e, 0xdc7b, 0xdc80, 0xdc83, 0xdcab, 0xdcb1, 0xdcc8, 0xdcef, 0xdcf4, 0xdcf7, 0xdd1f, 0xdd32, 0xdd38, 0xdd52, 0xdd58, 0xdd6f, 0xdd75, 0xdde4, 0xe517, 0xe520, 0xe52c, 0xe530, 0xe901, 0xe907, 0xe90a, 0xe90d, 0xe910,
  0xd519, 0xd534, 0xd572, 0xd5dc, 0xd780, 0xd7a6, 0xd7b4, 0xd7f1, 0xd825, 0xd8ae, 0xdac4, 0xdd19, 0xe904]);

interface Program {
  name: string;
  kit: boolean;
  missing: Set<number>;
}

function scan(name: string, g: Uint8Array): Program {
  const calls = new Set<number>();
  for (let i = 8; i + 3 <= g.length; i++) {
    if (g[i] !== 0x20 || g[i + 1] !== 0xf6 || g[i + 2] !== 0xd2) continue;
    // LDX #lo / STX $26 / LDX #hi / STX $27, or with STX absolute ($0026 / $0027: 87 programs' $E78E)
    if (g[i - 8] === 0xa2 && g[i - 6] === 0x86 && g[i - 5] === 0x26 && g[i - 4] === 0xa2 && g[i - 2] === 0x86 && g[i - 1] === 0x27) {
      const e = g[i - 7] | (g[i - 3] << 8);
      if (e >= 0xe700 && e < 0xeb00) calls.add(e);
    } else if (i >= 10 && g[i - 10] === 0xa2 && g[i - 8] === 0x8e && g[i - 7] === 0x26 && g[i - 6] === 0 && g[i - 5] === 0xa2 && g[i - 3] === 0x8e && g[i - 2] === 0x27 && g[i - 1] === 0) {
      const e = g[i - 9] | (g[i - 4] << 8);
      if (e >= 0xe700 && e < 0xeb00) calls.add(e);
    }
  }
  for (let i = 0; i + 3 <= g.length; i++) {
    if (g[i] === 0x20 || g[i] === 0x4c) {
      const t = g[i + 1] | (g[i + 2] << 8);
      if (RESIDENT.has(t)) calls.add(t);
    }
  }
  const data = g[0x42] | (g[0x43] << 8) | (g[0x44] << 16);
  const kit = g[data] === 0x4c && g[data + 1] === 0x49 && g[data + 2] === 0x42;
  return { name, kit, missing: new Set([...calls].filter((a) => !has(a))) };
}

const programs = readdirSync(folder)
  .filter((f) => /\.gam$/i.test(f))
  .sort()
  .map((f) => scan(f.replace(/\.gam$/i, ""), new Uint8Array(readFileSync(join(folder, f)))));
const complete = programs.filter((p) => !p.missing.size);
console.log(`${programs.length} programs; ${complete.length} call nothing Fulu lacks (${complete.filter((p) => p.kit).length} of the ${programs.filter((p) => p.kit).length} made with the RPG kit)`);

if (eachProgram) {
  console.log("\neach program, with what it can call that Fulu lacks:");
  for (const p of programs) console.log(`  ${p.name}\t${[...p.missing].sort((a, b) => a - b).map(hex).join(" ")}`);
}

const needs = new Map<number, string[]>();
for (const p of programs) for (const a of p.missing) needs.set(a, [...(needs.get(a) ?? []), p.name]);
const byCount = [...needs].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
console.log(`\nmissing (${byCount.length}), with the programs that call each:`);
for (const [a, ps] of byCount) console.log(`  ${hex(a)}  ${ps.length}  ${ps.slice(0, 8).join(" ")}${ps.length > 8 ? " …" : ""}`);

if (rom) {
  /**
   * An OS entry's size in instructions and the OS entries it far-calls (as
   * os-function.mjs --size counts them); a resident routine's size is not
   * measured: taken as 60.
   */
  const info = new Map<number, { size: number; calls: number[] }>();
  const measure = (a: number) => {
    if (info.has(a)) return info.get(a)!;
    if (a < 0xe700) return info.set(a, { size: 60, calls: [] }).get(a)!;
    const out = execFileSync("node", ["scripts/bbk/os-function.mjs", rom, "--size", a.toString(16)], { encoding: "utf8" }).split("\n")[0];
    const calls = (/far calls: (.*)$/.exec(out)?.[1] ?? "").split(" ").filter(Boolean).map((t) => parseInt(t, 16));
    return info.set(a, { size: Number(/(\d+) instructions/.exec(out)?.[1] ?? 60), calls }).get(a)!;
  };
  /** What writing `a` takes: it and every OS entry it reaches that Fulu lacks. */
  const closure = (a: number, into = new Set<number>()) => {
    if (into.has(a) || has(a)) return into;
    into.add(a);
    for (const c of measure(a).calls) closure(c, into);
    return into;
  };
  const deep = new Map(byCount.map(([a]) => [a, closure(a)]));
  const cost = (set: Iterable<number>) => [...set].reduce((n, a) => n + measure(a).size, 0);
  console.log(`\nwhat each takes, with the OS entries it calls that Fulu lacks (instructions):`);
  for (const [a, ps] of byCount) {
    const d = deep.get(a)!;
    console.log(`  ${hex(a)}  ${String(cost(d)).padStart(6)}  ${ps.length} programs${d.size > 1 ? `  (with ${[...d].filter((x) => x !== a).map(hex).join(" ")})` : ""}`);
  }
  // greedy: each time, the remainder of one program that completes the most programs per instruction
  const done = new Set<number>();
  let total = 0, count = complete.length;
  const need = (p: Program) => new Set([...p.missing].flatMap((a) => [...deep.get(a)!]));
  console.log(`\nplan (programs complete, instructions written, in all):`);
  for (;;) {
    const open = programs.filter((p) => [...need(p)].some((a) => !done.has(a)));
    if (!open.length) break;
    let best: { add: number[]; cost: number; gain: number } | null = null;
    for (const p of open) {
      const add = [...need(p)].filter((a) => !done.has(a));
      const c = cost(add);
      const gain = open.filter((q) => [...need(q)].every((a) => done.has(a) || add.includes(a))).length;
      if (!best || gain / c > best.gain / best.cost) best = { add, cost: c, gain };
    }
    best!.add.forEach((a) => done.add(a));
    total += best!.cost;
    count += best!.gain;
    console.log(`  ${String(count).padStart(4)} ${String(total).padStart(6)}  + ${best!.add.map((a) => `${hex(a)} (${measure(a).size})`).join(", ")}`);
  }
}
