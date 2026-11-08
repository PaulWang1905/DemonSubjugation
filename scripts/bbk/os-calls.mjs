// (A crude byte search; scripts/bbk/gam-calls.mjs traces the code instead.)
// Which OS functions each .gam calls, by searching its code for the far-call
// pattern (LDX #lo STX $26 LDX #hi STX $27 JSR $D2F6), and which resident
// addresses it JSRs into ($D000-$E6FF, seen 3+ times; data can look like a
// JSR, so these are only candidates). This finds what a game can call, not
// only what a shadow run happened to reach:
//   node scripts/bbk/os-calls.mjs <folder of .gam> [have.json]
// have.json, {"functions": [...], "helpers": [...]} (addresses as numbers),
// limits the lists to what is not in it (what Fulu lacks).
import fs from "node:fs";
import path from "node:path";
const [dir, known] = process.argv.slice(2);
const k = known ? JSON.parse(fs.readFileSync(known, "utf8")) : { functions: [], helpers: [] };
const have = new Set([...k.functions, ...k.helpers]);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".gam")).sort()) {
  const d = fs.readFileSync(path.join(dir, f));
  const far = new Map(), jsr = new Map();
  for (let i = 0; i + 11 <= d.length; i++) {
    if (d[i] === 0xa2 && d[i + 2] === 0x86 && d[i + 3] === 0x26 && d[i + 4] === 0xa2 && d[i + 6] === 0x86 && d[i + 7] === 0x27 && d[i + 8] === 0x20 && d[i + 9] === 0xf6 && d[i + 10] === 0xd2) {
      const e = d[i + 1] | (d[i + 5] << 8);
      if (e >= 0xe700) far.set(e, (far.get(e) ?? 0) + 1);
    }
    if (d[i] === 0x20 && d[i + 2] >= 0xd0 && d[i + 2] < 0xe7) {
      const a = d[i + 1] | (d[i + 2] << 8);
      if (a !== 0xd2f6) jsr.set(a, (jsr.get(a) ?? 0) + 1);
    }
  }
  const missingFar = [...far].filter(([e]) => !have.has(e)).map(([e, n]) => `$${e.toString(16)}×${n}`);
  // JSR targets: count only those seen 3+ times, to skip data that looks like JSR
  const missingJsr = [...jsr].filter(([a, n]) => n >= 3 && !have.has(a)).map(([a, n]) => `$${a.toString(16)}×${n}`);
  console.log(`${f}\n  OS functions: ${missingFar.join(" ") || "none"}\n  resident JSR targets (3+): ${missingJsr.join(" ") || "none"}`);
}
