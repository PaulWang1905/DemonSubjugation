// How much of the firmware's OS code Fulu answers, in instructions, each
// counted once: the union, by ROM address, of what os-function.mjs follows
// from each OS entry Fulu answers (src/fulu/os.ts's FUNCTIONS: branches, JSR
// and JMP inside the entry's segment and the resident banks $D000-$FFFF; a
// far call is the other entry's, counted with it), the cases of the compiled
// C's switches in that code (JMP $DB5C with its table and default set just
// before, as for $E94D's keys at 9:$8AB6, $F262's at 25:$82C7 and
// GuiTranslateMsg's Shift at 8:$8BAC: Fulu writes their cases), and the
// runtime routines Fulu answers (src/fulu/runtime.ts's HELPERS, with the far
// call $D2F6 / $D313).
//   npx tsx scripts/bbk/fulu-size.mts <0E00.DAT> [entry hex...]
// With entries (e.g. the input bar's e913 e916 e919 e91c e91f e922 e925), it
// also counts those, and how much of their code is not in what Fulu answers.
// COVERAGE.written in src/app/fuluGames.ts is this script's total, rounded.
import { readFileSync } from "node:fs";
import { FUNCTIONS } from "../../src/fulu/os";
import { HELPERS } from "../../src/fulu/runtime";

const [rom, ...extra] = process.argv.slice(2);
if (!rom) throw new Error("usage: npx tsx scripts/bbk/fulu-size.mts <0E00.DAT> [entry hex...]");
const g = readFileSync(rom);
const hex = (n: number) => "$" + n.toString(16).toUpperCase();

// 65C02 instruction lengths and the mnemonics the flow needs (as os-function.mjs)
const LEN = new Uint8Array(256).fill(1);
const MN: Record<number, string> = {};
{
  const two = [0x01, 0x05, 0x06, 0x09, 0x10, 0x11, 0x12, 0x15, 0x16, 0x21, 0x24, 0x25, 0x26, 0x29, 0x30, 0x31, 0x32, 0x35, 0x45, 0x46, 0x49, 0x50, 0x51, 0x55, 0x64, 0x65, 0x66, 0x69, 0x70, 0x71, 0x72, 0x75, 0x80, 0x84, 0x85, 0x86, 0x89, 0x90, 0x91, 0x92, 0x94, 0x95, 0x96, 0xa0, 0xa1, 0xa2, 0xa4, 0xa5, 0xa6, 0xa9, 0xb0, 0xb1, 0xb2, 0xb4, 0xb5, 0xb6, 0xc0, 0xc4, 0xc5, 0xc6, 0xc9, 0xd0, 0xd1, 0xd5, 0xd6, 0xe0, 0xe4, 0xe5, 0xe6, 0xe9, 0xf0, 0xf1, 0xf5, 0xf6];
  const three = [0x0d, 0x0e, 0x19, 0x1d, 0x1e, 0x20, 0x2c, 0x2d, 0x2e, 0x39, 0x3d, 0x3e, 0x4c, 0x4d, 0x4e, 0x59, 0x5d, 0x5e, 0x6c, 0x6d, 0x6e, 0x79, 0x7c, 0x7d, 0x7e, 0x8c, 0x8d, 0x8e, 0x99, 0x9c, 0x9d, 0x9e, 0xac, 0xad, 0xae, 0xb9, 0xbc, 0xbd, 0xbe, 0xcc, 0xcd, 0xce, 0xd9, 0xdd, 0xde, 0xec, 0xed, 0xee, 0xf9, 0xfd, 0xfe];
  for (const o of two) LEN[o] = 2;
  for (const o of three) LEN[o] = 3;
  Object.assign(MN, { 0x00: "BRK", 0x40: "RTI", 0x60: "RTS", 0x4c: "JMP", 0x6c: "JMPI", 0x7c: "JMPI", 0x20: "JSR", 0x80: "BRA" });
  for (const o of [0x10, 0x30, 0x50, 0x70, 0x90, 0xb0, 0xd0, 0xf0]) MN[o] = "B";
}
/** Opcodes os-function.mjs knows (others it takes as the end of the code: data). */
const KNOWN = new Set(
  `00 01 05 06 08 09 0a 0d 0e 10 11 12 15 16 18 19 1a 1d 1e 20 21 24 25 26 28 29 2a 2c 2d 2e 30 31 32 35 38 39 3a 3d 3e 40 45 46 48 49 4a 4c 4d 4e 50 51 55 58 59 5a 5d 5e 60 64 65 66 68 69 6a 6c 6d 6e 70 71 72 75 78 79 7a 7c 7d 7e 80 84 85 86 88 89 8a 8c 8d 8e 90 91 92 94 95 96 98 99 9a 9c 9d 9e a0 a1 a2 a4 a5 a6 a8 a9 aa ac ad ae b0 b1 b2 b4 b5 b6 b9 ba bc bd be c0 c4 c5 c6 c8 c9 ca cc cd ce d0 d1 d5 d6 d8 d9 da dd de e0 e4 e5 e6 e8 e9 ea ec ed ee f0 f1 f5 f6 f8 f9 fa fd fe`
    .split(" ")
    .map((h) => parseInt(h, 16)),
);

const resident = (pc: number) => 0x88000 + pc - 0xd000;
/** An entry's target and segment, from its 3-byte record in the resident bank. */
const entryOf = (e: number): [number, number] => {
  const o = resident(e);
  return [g[o] | (g[o + 1] << 8), g[o + 2]];
};

/** The ROM offsets of the instructions reached from `targets` in segment `seg`; switches and jump tables seen. */
function follow(seg: number, targets: number[], into: Set<number>, notes: string[], far = new Set<number>()) {
  const off = (pc: number) => (pc >= 0xd000 ? resident(pc) : pc >= 0x5000 && pc < 0x9000 ? (0x80 + 4 * seg) * 0x1000 + pc - 0x5000 : -1);
  const seen = new Set<number>();
  const work = [...targets];
  while (work.length) {
    let pc = work.pop()!;
    // immediates known in this run of code: A, X, Y and zero page $20/$21/$26/$27
    const r: { a: number | null; x: number | null; y: number | null } = { a: null, x: null, y: null };
    const zp: Record<number, number | null> = {};
    while (!seen.has(pc) && off(pc) >= 0) {
      const o = off(pc), op = g[o];
      if (!KNOWN.has(op)) break;
      seen.add(pc);
      into.add(o);
      const b1 = g[o + 1], w = g[o + 1] | (g[o + 2] << 8), m = MN[op];
      // immediates
      if (op === 0xa9) r.a = b1;
      else if (op === 0xa2) r.x = b1;
      else if (op === 0xa0) r.y = b1;
      else if (op === 0x85 || op === 0x86 || op === 0x84 || op === 0x64) zp[b1] = op === 0x85 ? r.a : op === 0x86 ? r.x : op === 0x84 ? r.y : 0;
      else if ([0xa5, 0xad, 0xb5, 0xbd, 0xb9, 0xb1, 0xa1, 0xb2, 0x68, 0x8a, 0x98].includes(op) || (op & 0x1f) === 0x09 || [0x0a, 0x2a, 0x4a, 0x6a, 0x1a, 0x3a].includes(op) || [0x65, 0x6d, 0x75, 0x7d, 0x79, 0x71, 0x61, 0x72, 0xe5, 0xed, 0xf5, 0xfd, 0xf9, 0xf1, 0xe1, 0xf2, 0x25, 0x2d, 0x35, 0x3d, 0x39, 0x31, 0x05, 0x0d, 0x15, 0x1d, 0x19, 0x11, 0x45, 0x4d, 0x55, 0x5d, 0x59, 0x51].includes(op)) r.a = op === 0x8a ? r.x : op === 0x98 ? r.y : null;
      else if ([0xa6, 0xae, 0xb6, 0xbe, 0xaa, 0xe8, 0xca, 0xfa, 0xba].includes(op)) r.x = op === 0xaa ? r.a : null;
      else if ([0xa4, 0xac, 0xb4, 0xbc, 0xa8, 0xc8, 0x88, 0x7a].includes(op)) r.y = op === 0xa8 ? r.a : null;
      else if ([0xe6, 0xc6, 0x06, 0x26, 0x46, 0x66, 0xf6, 0xd6].includes(op)) zp[b1] = null;
      if (m === "B" || m === "BRA") {
        work.push((pc + 2 + ((b1 << 24) >> 24)) & 0xffff);
        if (m === "BRA") break;
      } else if (m === "JSR") {
        if (w !== 0xd2f6) work.push(w);
        else if (zp[0x26] != null && zp[0x27] != null) far.add(zp[0x26]! | (zp[0x27]! << 8));
        r.a = r.x = r.y = null;
        for (const k of Object.keys(zp)) zp[+k] = null;
      } else if (m === "JMP") {
        if (w === 0xdb5c) {
          // a switch: X (+ 256 Y) keys at ($26), then as many addresses; the default at ($20)
          const t = zp[0x26] != null && zp[0x27] != null ? zp[0x26]! | (zp[0x27]! << 8) : -1, n = r.x != null ? r.x + 256 * (r.y ?? 0) : -1;
          if (t < 0 || n < 0 || off(t) < 0) notes.push(`${seg.toString(16)}:${pc.toString(16)} a switch with a table not known`);
          else {
            for (let i = 0; i < n; i++) work.push(g[off(t) + 2 * n + 2 * i] | (g[off(t) + 2 * n + 2 * i + 1] << 8));
            notes.push(`${seg.toString(16)}:${pc.toString(16)} switch, table ${seg.toString(16)}:${t.toString(16)}, ${n} cases`);
          }
          if (zp[0x20] != null && zp[0x21] != null) work.push(zp[0x20]! | (zp[0x21]! << 8));
        }
        pc = w;
        continue;
      } else if (m === "JMPI") {
        // (the switch routine's own JMP ($26) is to the cases, followed above)
        if (pc < 0xd000) notes.push(`${seg.toString(16)}:${pc.toString(16)} JMP (${hex(w)}${op === 0x7c ? ",X" : ""}) not followed`);
        break;
      }
      if (m === "RTS" || m === "RTI" || m === "BRK") break;
      pc += LEN[op];
    }
  }
}

/** The instructions of `entries` and `routines`; with `known`, also of the entries they far-call that are not in it, and theirs. */
const count = (entries: number[], routines: number[], known?: Set<number>) => {
  const into = new Set<number>(), notes: string[] = [], far = new Set<number>(), done = new Set<number>();
  const todo = [...entries];
  while (todo.length) {
    const e = todo.pop()!;
    if (done.has(e)) continue;
    done.add(e);
    const [t, seg] = entryOf(e);
    follow(seg, [t], into, notes, far);
    if (known) for (const c of far) if (c >= 0xe700 && !known.has(c) && !done.has(c)) todo.push(c);
  }
  for (const a of routines) follow(0, [a], into, notes);
  return { into, notes, entries: done };
};

const entries = Object.keys(FUNCTIONS).map(Number).sort((a, b) => a - b);
const routines = [...new Set([...Object.keys(HELPERS).map(Number), 0xd2f6, 0xd313])].sort((a, b) => a - b);
const fnOnly = count(entries, []);
const all = count(entries, routines);
console.log(`OS entries Fulu answers: ${entries.length}; their code, each instruction once, with the switches' cases: ${fnOnly.into.size} instructions`);
console.log(`with the ${routines.length} runtime routines Fulu answers (the far call $D2F6 / $D313 among them): ${all.into.size} instructions`);
for (const n of [...new Set(all.notes)].sort()) console.log(`  ${n}`);
if (extra.length) {
  const more = extra.map((h) => parseInt(h, 16));
  const own = count(more, [], new Set(entries));
  const outside = [...own.into].filter((o) => !all.into.has(o)).length;
  const added = [...own.entries].filter((e) => !more.includes(e));
  console.log(`\n${more.map(hex).join(" ")}${added.length ? `, with what they far-call that Fulu does not answer (${added.map(hex).join(" ")})` : ""}: ${own.into.size} instructions, ${outside} of them not in what Fulu answers`);
  for (const n of [...new Set(own.notes)].sort()) console.log(`  ${n}`);
}
