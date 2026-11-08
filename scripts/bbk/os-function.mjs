// Disassemble OS functions by their API table entry: node scripts/bbk/os-function.mjs <0E00.DAT> [--size] <entry hex>...
// Follows branches, JSR and JMP inside the function's segment and the resident banks D-F;
// a far call (STX $26 / STX $27 / JSR $D2F6) is shown with its target's table entry.
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
const args = process.argv.slice(2), file = args.shift(), size = args[0] === "--size" && args.shift();
const g = fs.readFileSync(file);
const resident = (pc) => 0x88000 + pc - 0xd000;
const entryOf = (e) => { const o = resident(e); return [g[o] | (g[o + 1] << 8), g[o + 2]]; };
for (const e of args.map((s) => parseInt(s, 16))) {
  const [target, seg] = entryOf(e);
  const off = (pc) => (pc >= 0xd000 ? resident(pc) : pc >= 0x5000 && pc < 0x9000 ? (0x80 + 4 * seg) * 0x1000 + pc - 0x5000 : -1);
  const seen = new Map(), todo = [target], far = new Set();
  while (todo.length) {
    let pc = todo.pop();
    while (!seen.has(pc) && off(pc) >= 0) {
      const o = off(pc), op = g[o], [m, a] = M[op] || ["???", "imp"], l = LEN[a];
      const b1 = g[o + 1], w = g[o + 1] | (g[o + 2] << 8), h = (v, d) => "$" + v.toString(16).padStart(d, "0");
      const rel = (pc + 2 + ((b1 << 24) >> 24)) & 0xffff;
      let txt = m + " " + { imp: "", imm: "#" + h(b1, 2), zp: h(b1, 2), zpx: h(b1, 2) + ",x", zpy: h(b1, 2) + ",y", izx: "(" + h(b1, 2) + ",x)", izy: "(" + h(b1, 2) + "),y", izp: "(" + h(b1, 2) + ")", rel: h(rel, 4), abs: h(w, 4), abx: h(w, 4) + ",x", aby: h(w, 4) + ",y", ind: "(" + h(w, 4) + ")", iax: "(" + h(w, 4) + ",x)" }[a];
      if (m === "JSR" && w === 0xd2f6) {
        // look back for LDX #lo STX $26 LDX #hi STX $27
        const b = g.subarray(o - 8, o);
        if (b[0] === 0xa2 && b[2] === 0x86 && b[3] === 0x26 && b[4] === 0xa2 && b[6] === 0x86 && b[7] === 0x27) {
          const t = b[1] | (b[5] << 8); far.add(t); txt += `  ; far ${t.toString(16)}`;
        }
      }
      seen.set(pc, pc.toString(16).padStart(4, "0") + "  " + txt);
      if (a === "rel") todo.push(rel);
      if (m === "JSR" && w !== 0xd2f6) todo.push(w);
      if (m === "JMP" && a === "abs") { pc = w; continue; }
      if (["RTS", "RTI", "JMP", "BRA", "???", "BRK"].includes(m)) break;
      pc += l;
    }
  }
  const lines = [...seen.keys()].sort((x, y) => x - y);
  console.log(`=== ${e.toString(16)} -> ${seg.toString(16)}:${target.toString(16)}  ${lines.length} instructions, far calls: ${[...far].map((t) => t.toString(16)).join(" ")}`);
  if (!size) { let last = -1; for (const pc of lines) { if (last >= 0 && pc - last > 3) console.log("----"); console.log(seen.get(pc)); last = pc; } }
}
