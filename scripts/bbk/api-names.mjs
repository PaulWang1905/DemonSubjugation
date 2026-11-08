// Map OS table addresses to SDK names by aligning, per function, the ordered OS far calls in
// fmj-engine's disassembly (assemble/<flash> <cpu>.txt) with the ordered SDK calls in its C reconstruction.
// Usage: node scripts/bbk/api-names.mjs <BA4988/fmj-engine checkout> <out.json>
import fs from "node:fs";
const root = process.argv[2];
const api = new Set();
for (const h of ["middle.h", "engine_api.h", "font.h", "dictsys.h"]) {
  if (!fs.existsSync(root + "/" + h)) continue;
  for (const m of fs.readFileSync(root + "/" + h, "utf8").matchAll(/\b((?:Sys|Gui|File|Data|Get|Flash)[A-Za-z0-9_]*)\s*\(/g)) api.add(m[1]);
}
const csrc = fs.readdirSync(root).filter((f) => f.endsWith(".c") && f.startsWith("engine")).map((f) => fs.readFileSync(root + "/" + f, "utf8")).join("\n");
// split C into functions named _00XXXXXX
const fnBodies = new Map();
const re = /\n[^\n;]*\b_(00[0-9A-F]{6})\s*\([^;{]*\)\s*\{/g; let m; const starts = [];
while ((m = re.exec(csrc))) starts.push([m[1], m.index]);
starts.forEach(([n, s], i) => fnBodies.set(n, csrc.slice(s, i + 1 < starts.length ? starts[i + 1][1] : csrc.length)));
const extra = new Set(["sprintf", "SysMemset", "memset", "memcpy", "strlen", "strcpy", "strcat", "strcmp"]);
const votes = new Map(); let aligned = 0, mism = 0;
for (const f of fs.readdirSync(root + "/assemble")) {
  const flash = f.split(" ")[0]; const body = fnBodies.get(flash); if (!body) continue;
  const asm = fs.readFileSync(root + "/assemble/" + f, "utf8").split("\n");
  const calls = [];
  for (let i = 0; i < asm.length; i++) if (/JSR \$D2F6/i.test(asm[i])) {
    let lo = null, hi = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) { const a = asm[j].match(/STX \$26 = #\$([0-9A-F]{2})/i), b = asm[j].match(/STX \$27 = #\$([0-9A-F]{2})/i); if (a && lo == null) lo = a[1]; if (b && hi == null) hi = b[1]; }
    if (lo && hi && parseInt(hi, 16) >= 0xe0) calls.push((hi + lo).toLowerCase());
  }
  const names = [...body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((x) => x[1]).filter((n) => api.has(n) || extra.has(n));
  if (calls.length && calls.length === names.length) { aligned++; calls.forEach((c, k) => { const v = votes.get(c) || new Map(); v.set(names[k], (v.get(names[k]) || 0) + 1); votes.set(c, v); }); }
  else if (calls.length) mism++;
}
const out = {}; for (const [c, v] of votes) { const best = [...v].sort((a, b) => b[1] - a[1]); out[c] = best[0][0] + (best.length > 1 ? " (also " + best.slice(1).map((x) => x[0] + "×" + x[1]).join(",") + ")" : "") + " ×" + best[0][1]; }
console.log("API names in headers:", api.size, "| functions aligned:", aligned, "| count mismatch:", mism, "| table entries named:", Object.keys(out).length);
console.log(Object.entries(out).sort().map(([c, n]) => c + " " + n).join("\n"));
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
