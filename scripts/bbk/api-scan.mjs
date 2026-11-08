// For every far call (LDX lo/STX $26/LDX hi/STX $27/JSR $d2f6) in every .gam:
//  - resolve the 3-byte entry (OS table in E.BIN, or the game's own table)
//  - OS target = segment < 0xe0; record arg bytes from the caller's soft-stack cleanup
//    (PHP SEI CLC LDA $28 ADC #n) and whether $20/$21 (return value) is read right after.
// Usage: node scripts/bbk/api-scan.mjs <folder of .gam>/ <OS ROM (0E00.DAT)> <out.json>
import fs from "node:fs";
const [dir, ebin, out] = process.argv.slice(2);
const E = fs.readFileSync(ebin); const EB = 0x88000 - 0xd000;
const os = new Map(); // key "seg:addr" -> {tables:Set, games:Set, args:Map, ret:0/1 counts, via:{os,game}}
let gameTableOsCalls = 0, gameTableGameCalls = 0, unresolved = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".gam"))) {
  const g = fs.readFileSync(dir + f); const data = g[0x42] | (g[0x43] << 8) | (g[0x44] << 16);
  for (let i = 0; i < g.length - 24; i++) {
    if (!(g[i] == 0xa2 && g[i + 2] == 0x86 && g[i + 3] == 0x26 && g[i + 4] == 0xa2 && g[i + 6] == 0x86 && g[i + 7] == 0x27 && g[i + 8] == 0x20 && g[i + 9] == 0xf6 && g[i + 10] == 0xd2)) continue;
    const ent = g[i + 1] | (g[i + 5] << 8);
    let b;
    if (ent >= 0xd000) b = E.subarray(EB + ent, EB + ent + 3);
    else if (ent >= 0x9000) { const o = data + ent - 0x9000; b = g.subarray(o, o + 3); }
    else if (ent >= 0x5000) { const o = (i & ~0x3fff) + ent - 0x5000; b = g.subarray(o, o + 3); }
    else { unresolved++; continue; }
    if (b.length < 3) { unresolved++; continue; }
    const seg = b[2], addr = b[0] | (b[1] << 8);
    if (seg >= 0xe0) { gameTableGameCalls++; continue; }
    if (ent < 0xd000) gameTableOsCalls++;
    const k = seg.toString(16).padStart(2, "0") + ":" + addr.toString(16).padStart(4, "0");
    let r = os.get(k); if (!r) os.set(k, (r = { tables: new Set(), games: new Set(), args: new Map(), ret: 0, calls: 0 }));
    r.tables.add(ent.toString(16)); r.games.add(f); r.calls++;
    // after the call: optional cleanup
    let j = i + 11, n = 0;
    if (g[j] == 0x08 && g[j + 1] == 0x78 && g[j + 2] == 0x18 && g[j + 3] == 0xa5 && g[j + 4] == 0x28 && g[j + 5] == 0x69) { n = g[j + 6]; j += 15; }
    r.args.set(n, (r.args.get(n) || 0) + 1);
    if ((g[j] == 0xa5 || g[j] == 0xa6 || g[j] == 0xa4) && (g[j + 1] == 0x20 || g[j + 1] == 0x21)) r.ret++;
  }
}
const rows = [...os].map(([k, r]) => ({ target: k, games: r.games.size, calls: r.calls, tables: [...r.tables].join(","), argBytes: [...r.args].sort((a, b) => b[1] - a[1]).map(([n, c]) => n + "×" + c).join(" "), retUsed: r.ret })).sort((a, b) => b.games - a.games);
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log("OS functions (distinct targets):", rows.length, "| OS calls through games' own tables:", gameTableOsCalls, "| game-internal far calls:", gameTableGameCalls, "| unresolved:", unresolved);
const segs = {}; rows.forEach((r) => { const s = r.target.slice(0, 2); segs[s] = (segs[s] || 0) + 1; }); console.log("by OS segment:", JSON.stringify(segs));
console.log(rows.slice(0, 25).map((r) => `${r.target} games=${r.games} args=[${r.argBytes}] ret=${r.retUsed}/${r.calls} via ${r.tables}`).join("\n"));
