// What a .gam's code can call in the OS, found by tracing its code from the
// entry: branches, JSR and JMP within its 16 KB segments, and far calls into
// its own segments (through their 3-byte entries) are followed; far calls
// into the OS's table, JSRs into the OS's resident code ($D000-$FFFF), and
// what cannot be followed (indirect jumps, calls into RAM) are listed.
//   node scripts/bbk/gam-calls.mjs <game.gam> [have.json]
// have.json, {"functions": [...], "helpers": [...]}, marks what Fulu has.
// Code reached only through function pointers is not found; the indirect
// jumps listed say where such pointers are used.
import fs from "node:fs";

const M = {};
const def = (s) => s.trim().split(/\s+/).forEach((t) => { const [o, m, a] = t.split(":"); M[parseInt(o, 16)] = [m, a || "imp"]; });
def(`00:BRK 01:ORA:izx 05:ORA:zp 06:ASL:zp 08:PHP 09:ORA:imm 0a:ASL 0d:ORA:abs 0e:ASL:abs 10:BPL:rel 11:ORA:izy 12:ORA:izp 15:ORA:zpx 16:ASL:zpx 18:CLC 19:ORA:aby 1a:INC 1d:ORA:abx 1e:ASL:abx
20:JSR:abs 21:AND:izx 24:BIT:zp 25:AND:zp 26:ROL:zp 28:PLP 29:AND:imm 2a:ROL 2c:BIT:abs 2d:AND:abs 2e:ROL:abs 30:BMI:rel 31:AND:izy 32:AND:izp 35:AND:zpx 38:SEC 39:AND:aby 3a:DEC 3d:AND:abx 3e:ROL:abx
40:RTI 45:EOR:zp 46:LSR:zp 48:PHA 49:EOR:imm 4a:LSR 4c:JMP:abs 4d:EOR:abs 4e:LSR:abs 50:BVC:rel 51:EOR:izy 55:EOR:zpx 58:CLI 59:EOR:aby 5a:PHY 5d:EOR:abx 5e:LSR:abx
60:RTS 64:STZ:zp 65:ADC:zp 66:ROR:zp 68:PLA 69:ADC:imm 6a:ROR 6c:JMP:ind 6d:ADC:abs 6e:ROR:abs 70:BVS:rel 71:ADC:izy 72:ADC:izp 75:ADC:zpx 78:SEI 79:ADC:aby 7a:PLY 7c:JMP:iax 7d:ADC:abx 7e:ROR:abx
80:BRA:rel 84:STY:zp 85:STA:zp 86:STX:zp 88:DEY 89:BIT:imm 8a:TXA 8c:STY:abs 8d:STA:abs 8e:STX:abs 90:BCC:rel 91:STA:izy 92:STA:izp 94:STY:zpx 95:STA:zpx 96:STX:zpy 98:TYA 99:STA:aby 9a:TXS 9c:STZ:abs 9d:STA:abx 9e:STZ:abx
a0:LDY:imm a1:LDA:izx a2:LDX:imm a4:LDY:zp a5:LDA:zp a6:LDX:zp a8:TAY a9:LDA:imm aa:TAX ac:LDY:abs ad:LDA:abs ae:LDX:abs b0:BCS:rel b1:LDA:izy b2:LDA:izp b4:LDY:zpx b5:LDA:zpx b6:LDX:zpy b9:LDA:aby ba:TSX bc:LDY:abx bd:LDA:abx be:LDX:aby
c0:CPY:imm c1:CMP:izx c4:CPY:zp c5:CMP:zp c6:DEC:zp c8:INY c9:CMP:imm ca:DEX cc:CPY:abs cd:CMP:abs ce:DEC:abs d0:BNE:rel d1:CMP:izy d5:CMP:zpx d6:DEC:zpx d8:CLD d9:CMP:aby da:PHX dd:CMP:abx de:DEC:abx
e0:CPX:imm e4:CPX:zp e5:SBC:zp e6:INC:zp e8:INX e9:SBC:imm ea:NOP ec:CPX:abs ed:SBC:abs ee:INC:abs f0:BEQ:rel f1:SBC:izy f5:SBC:zpx f6:INC:zpx f8:SED f9:SBC:aby fa:PLX fd:SBC:abx fe:INC:abx`);
const LEN = { imp: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, izx: 2, izy: 2, izp: 2, rel: 2, abs: 3, abx: 3, aby: 3, ind: 3, iax: 3 };

const [file, haveFile] = process.argv.slice(2);
const g = fs.readFileSync(file);
const have = haveFile ? JSON.parse(fs.readFileSync(haveFile, "utf8")) : null;
const hasF = new Set(have?.functions ?? []), hasH = new Set(have?.helpers ?? []);
const entry = g[0x40] | (g[0x41] << 8);
const dataOff = (g[0x42] | (g[0x43] << 8) | (g[0x44] << 16)) & ~0xfff;
/** File offset of an address while segment `seg` (0-based) is mapped; -1 outside the program. */
const off = (seg, a) => (a >= 0x5000 && a < 0x9000 ? seg * 0x4000 + a - 0x5000 : a >= 0x9000 && a < 0xd000 ? dataOff + a - 0x9000 : -1);
const segs = Math.ceil(g.length / 0x4000);

const hex = (v, n = 4) => "$" + v.toString(16).padStart(n, "0");
const os = new Map(), helpers = new Map(), odd = new Map(), farSelf = new Set();
const note = (map, k, where) => { if (!map.has(k)) map.set(k, []); map.get(k).push(where); };
const seen = new Set();
const todo = [[0, entry]];
let instructions = 0, switches = 0;
while (todo.length) {
  let [seg, pc] = todo.pop();
  // A, X, Y and zero-page bytes, as far as constants show (for far calls: $26/$27; for switches: $20, $26 and X/Y)
  const r = { A: -1, X: -1, Y: -1 };
  const zp = new Map();
  for (;;) {
    const key = seg * 0x10000 + pc;
    if (seen.has(key)) break;
    const o = off(seg, pc);
    if (o < 0 || o >= g.length) { note(odd, `runs into ${hex(pc)}`, `${seg}:${hex(pc)}`); break; }
    seen.add(key);
    instructions++;
    const op = g[o], [m, a] = M[op] ?? ["???", "imp"], l = LEN[a];
    const b1 = g[o + 1], w = g[o + 1] | (g[o + 2] << 8), where = `${seg}:${hex(pc)}`;
    if (m === "???") { note(odd, `unknown opcode $${op.toString(16)}`, where); break; }
    const reg = { LDA: "A", LDX: "X", LDY: "Y" }[m], store = { STA: "A", STX: "X", STY: "Y" }[m];
    const zpAt = a === "zp" ? b1 : a === "abs" && w < 0x100 ? w : -1;
    if (reg) r[reg] = a === "imm" ? b1 : -1;
    else if (store && zpAt >= 0) zp.set(zpAt, r[store]);
    else if (["TAX", "TAY", "TXA", "TYA", "INX", "DEX", "INY", "DEY", "PLA", "PLX", "PLY", "TSX", "ADC", "SBC", "AND", "ORA", "EOR", "ASL", "LSR", "ROL", "ROR", "INC", "DEC"].includes(m)) {
      if (["TAX", "INX", "DEX", "PLX", "TSX"].includes(m)) r.X = -1;
      else if (["TAY", "INY", "DEY", "PLY"].includes(m)) r.Y = -1;
      else if (a === "imp" || !["INC", "DEC", "ASL", "LSR", "ROL", "ROR"].includes(m)) r.A = -1;
      if (zpAt >= 0 && ["INC", "DEC", "ASL", "LSR", "ROL", "ROR"].includes(m)) zp.delete(zpAt);
    }
    const zw = (z) => (zp.has(z) && zp.get(z) >= 0 && zp.has(z + 1) && zp.get(z + 1) >= 0 ? zp.get(z) | (zp.get(z + 1) << 8) : -1);
    if (a === "rel") todo.push([seg, (pc + 2 + ((b1 << 24) >> 24)) & 0xffff]);
    if ((m === "JSR" || m === "JMP") && a === "abs" && w === 0xdb5c) {
      // a C switch: case values (X/Y words) at ($26), then their addresses; default ($20)
      const table = zw(0x26), def = zw(0x20), n = r.X >= 0 && r.Y >= 0 ? r.X | (r.Y << 8) : -1;
      if (table < 0 || def < 0 || n < 0) note(odd, "switch with its table not constant", where);
      else {
        switches++;
        todo.push([seg, def]);
        for (let i = 0; i < n; i++) {
          const p = off(seg, table + 2 * n + 2 * i);
          todo.push([seg, g[p] | (g[p + 1] << 8)]);
        }
      }
      note(helpers, w, where);
      break;
    }
    if (m === "JSR" || (m === "JMP" && a === "abs")) {
      if (w === 0xd2f6) {
        const ptr = zw(0x26);
        if (ptr < 0) note(odd, "far call with $26/$27 not constant", where);
        else if (ptr >= 0xd000) note(os, ptr, where);
        else {
          const p = off(seg, ptr);
          const t = g[p] | (g[p + 1] << 8), s = g[p + 2];
          if (p < 0) note(odd, `far call through ${hex(ptr)}`, where);
          else if (s >= 0xe0) { farSelf.add(`${hex(ptr)}→${(s - 0xe0)}:${hex(t)}`); todo.push([s - 0xe0, t]); }
          else note(odd, `far call through ${hex(ptr)} into OS segment ${s}`, where);
        }
      } else if (w >= 0xd000) note(helpers, w, where);
      else if (w >= 0x5000 && w < 0xd000) { if (m === "JMP") { pc = w; continue; } todo.push([seg, w]); }
      else note(odd, `${m} into RAM ${hex(w)}`, where);
      if (m === "JMP") break;
      (r.A = r.X = r.Y = -1), zp.clear(); // (what the callee leaves is not known)
    }
    if (m === "JMP" && a !== "abs") { note(odd, `JMP ${a === "ind" ? `(${hex(w)})` : `(${hex(w)},x)`}`, where); break; }
    if (["RTS", "RTI", "BRA", "BRK"].includes(m)) { if (m === "BRK") note(odd, "BRK", where); break; }
    pc += l;
  }
}

// coverage: far-call sites found by their byte pattern that the trace did not reach
const reachedAt = new Set([...seen].map((k) => off(Math.floor(k / 0x10000), k & 0xffff)));
const unreached = [];
for (let i = 8; i + 3 <= g.length; i++) {
  if (g[i] === 0x20 && g[i + 1] === 0xf6 && g[i + 2] === 0xd2 && g[i - 8] === 0xa2 && g[i - 6] === 0x86 && g[i - 5] === 0x26 && g[i - 4] === 0xa2 && g[i - 2] === 0x86 && g[i - 1] === 0x27 && !reachedAt.has(i)) {
    const e = g[i - 7] | (g[i - 3] << 8);
    unreached.push(`${hex(i, 5)}:${hex(e)}`);
  }
}

const list = (map, has) =>
  [...map].sort((a, b) => a[0] - b[0]).map(([k, w]) => `  ${hex(k)}${has ? (has.has(k) ? "" : "  <- Fulu lacks") : ""}  ×${w.length}  (e.g. ${w[0]})`).join("\n");
console.log(`${file.replace(/^.*\//, "")}: ${instructions} instructions reached in ${segs} segments, ${farSelf.size} entries of its own, ${switches} switches`);
console.log(`OS functions (far calls into the table):\n${list(os, have && hasF)}`);
console.log(`resident code (JSR / JMP $D000-$FFFF):\n${list(helpers, have && hasH)}`);
console.log(`not followed:\n${[...odd].map(([k, w]) => `  ${k}  ×${w.length}  (e.g. ${w.slice(0, 3).join(", ")})`).join("\n") || "  nothing"}`);
const unreachedOs = unreached.filter((u) => parseInt(u.split(":$")[1], 16) >= 0xe700);
console.log(`far-call sites found by pattern but not reached: ${unreached.length} (into the OS: ${unreachedOs.length}${unreachedOs.length ? ": " + unreachedOs.slice(0, 12).join(" ") : ""})`);
