// A code-flow scan of the collection's programs, beside fulu-coverage.mts's
// byte search: what each program's code reaches that Fulu does not answer.
//   npx tsx scripts/bbk/fulu-flow.mts <folder of .gam> [--json out.json]
// It follows the code from the program's entry and from every compiled C
// function's prologue (PHP / SEI / SEC / LDA $28 / SBC #n): branches, jumps,
// JSRs into its own code, far calls (STX/STA, zero page or absolute, to $26 /
// $27, then JSR $D2F6) into the OS or its own segments, the compiled C's
// switches ($DB5C) and calls through $D572 with a known pointer; far-call
// records (lo, hi, $E0 + segment) in its data are followed too. It reports
// for each program: how much of its code (00 / FF padding left out) the flow
// reached; the OS functions and resident routines reached that Fulu lacks,
// with their sites (segment:address); how many places it cannot follow
// (targets worked out while running: only play covers those); and, as a
// check, any block of 1 KB or more it did not reach that holds a far call or
// a function prologue (code it missed; none means those blocks are data).
// (A site the flow reaches through data taken for code shows as an odd
// target, e.g. $F1BB in 宠物精灵's text: look at it with d65.mjs.)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTIONS } from "../../src/fulu/os";
import { HELPERS } from "../../src/fulu/runtime";

const has = (a: number) => !!FUNCTIONS[a] || !!HELPERS[a] || a === 0xd2f6 || a === 0xd313;
const hex = (n: number, d = 4) => "$" + n.toString(16).toUpperCase().padStart(d, "0");

// ---- 65C02 opcode lengths and kinds ----
type Mode = "imp" | "imm" | "zp" | "abs" | "rel" | "ind" | "iax" | "zprel";
const OPS: Record<number, [string, Mode]> = {};
const def = (s: string) =>
  s.trim().split(/\s+/).forEach((t) => {
    const [o, mn, a] = t.split(":");
    OPS[parseInt(o, 16)] = [mn, (a as Mode) ?? "imp"];
  });
// modes collapsed by length: zp = any 2-byte operand, abs = any 3-byte
def(`00:BRK 01:ORA:zp 04:TSB:zp 05:ORA:zp 06:ASL:zp 08:PHP 09:ORA:imm 0a:ASL 0c:TSB:abs 0d:ORA:abs 0e:ASL:abs 10:BPL:rel 11:ORA:zp 12:ORA:zp 14:TRB:zp 15:ORA:zp 16:ASL:zp 18:CLC 19:ORA:abs 1a:INC 1c:TRB:abs 1d:ORA:abs 1e:ASL:abs
20:JSR:abs 21:AND:zp 24:BIT:zp 25:AND:zp 26:ROL:zp 28:PLP 29:AND:imm 2a:ROL 2c:BIT:abs 2d:AND:abs 2e:ROL:abs 30:BMI:rel 31:AND:zp 32:AND:zp 34:BIT:zp 35:AND:zp 36:ROL:zp 38:SEC 39:AND:abs 3a:DEC 3c:BIT:abs 3d:AND:abs 3e:ROL:abs
40:RTI 41:EOR:zp 45:EOR:zp 46:LSR:zp 48:PHA 49:EOR:imm 4a:LSR 4c:JMP:abs 4d:EOR:abs 4e:LSR:abs 50:BVC:rel 51:EOR:zp 52:EOR:zp 55:EOR:zp 56:LSR:zp 58:CLI 59:EOR:abs 5a:PHY 5d:EOR:abs 5e:LSR:abs
60:RTS 61:ADC:zp 64:STZ:zp 65:ADC:zp 66:ROR:zp 68:PLA 69:ADC:imm 6a:ROR 6c:JMP:ind 6d:ADC:abs 6e:ROR:abs 70:BVS:rel 71:ADC:zp 72:ADC:zp 74:STZ:zp 75:ADC:zp 76:ROR:zp 78:SEI 79:ADC:abs 7a:PLY 7c:JMP:iax 7d:ADC:abs 7e:ROR:abs
80:BRA:rel 81:STA:zp 84:STY:zp 85:STA:zp 86:STX:zp 88:DEY 89:BIT:imm 8a:TXA 8c:STY:abs 8d:STA:abs 8e:STX:abs 90:BCC:rel 91:STA:zp 92:STA:zp 94:STY:zp 95:STA:zp 96:STX:zp 98:TYA 99:STA:abs 9a:TXS 9c:STZ:abs 9d:STA:abs 9e:STZ:abs
a0:LDY:imm a1:LDA:zp a2:LDX:imm a4:LDY:zp a5:LDA:zp a6:LDX:zp a8:TAY a9:LDA:imm aa:TAX ac:LDY:abs ad:LDA:abs ae:LDX:abs b0:BCS:rel b1:LDA:zp b2:LDA:zp b4:LDY:zp b5:LDA:zp b6:LDX:zp b8:CLV b9:LDA:abs ba:TSX bc:LDY:abs bd:LDA:abs be:LDX:abs
c0:CPY:imm c1:CMP:zp c4:CPY:zp c5:CMP:zp c6:DEC:zp c8:INY c9:CMP:imm ca:DEX cb:WAI cc:CPY:abs cd:CMP:abs ce:DEC:abs d0:BNE:rel d1:CMP:zp d2:CMP:zp d5:CMP:zp d6:DEC:zp d8:CLD d9:CMP:abs da:PHX db:STP dd:CMP:abs de:DEC:abs
e0:CPX:imm e1:SBC:zp e4:CPX:zp e5:SBC:zp e6:INC:zp e8:INX e9:SBC:imm ea:NOP ec:CPX:abs ed:SBC:abs ee:INC:abs f0:BEQ:rel f1:SBC:zp f2:SBC:zp f5:SBC:zp f6:INC:zp f8:SED f9:SBC:abs fa:PLX fd:SBC:abs fe:INC:abs`);
for (let i = 0; i < 16; i++) {
  OPS[0x07 + i * 16] = [i < 8 ? "RMB" : "SMB", "zp"];
  OPS[0x0f + i * 16] = [i < 8 ? "BBR" : "BBS", "zprel"];
}
const LEN: Record<Mode, number> = { imp: 1, imm: 2, zp: 2, rel: 2, abs: 3, ind: 3, iax: 3, zprel: 3 };

interface Found {
  api: Map<number, Set<string>>; // OS API entry -> sites
  resident: Map<number, Set<string>>; // resident routine -> sites
  indirect: string[]; // places the flow is lost
  bad: string[]; // undefined opcodes met (data taken for code)
  covered: number; // code bytes reached (padding left out)
  codeBytes: number; // code bytes, padding left out
  missed: string[]; // unreached blocks of 1 KB or more that look like code
  seeds: number;
}

function scan(g: Uint8Array): Found {
  const data = g[0x42] | (g[0x43] << 8) | (g[0x44] << 16);
  const entry = g[0x40] | (g[0x41] << 8);
  const segs = Math.ceil(data / 0x4000);
  const f: Found = { api: new Map(), resident: new Map(), indirect: [], bad: [], covered: 0, codeBytes: 0, missed: [], seeds: 0 };
  const seen = new Uint8Array(g.length);
  /** The file offset of `addr` with segment `seg` (0-based program segment) mapped, or -1. */
  const at = (seg: number, addr: number) => {
    if (addr >= 0x5000 && addr < 0x9000) {
      const o = seg * 0x4000 + (addr - 0x5000);
      return o < data ? o : -1;
    }
    if (addr >= 0x9000 && addr < 0xd000) {
      const o = data + (addr - 0x9000);
      return o < g.length ? o : -1;
    }
    return -1;
  };
  const rd = (seg: number, addr: number) => {
    const o = at(seg, addr);
    return o < 0 ? -1 : g[o];
  };
  const add = (m: Map<number, Set<string>>, k: number, site: string) => m.set(k, (m.get(k) ?? new Set()).add(site));
  const work: [number, number][] = [[0, entry]];
  // seeds: far-call records in the data area naming a program segment
  for (let o = data; o + 3 <= g.length; o++) {
    const t = g[o] | (g[o + 1] << 8), s = g[o + 2];
    if (s >= 0xe0 && s - 0xe0 < segs && t >= 0x5000 && t < 0x9000) {
      // only records that point at a plausible start (an opcode with a known meaning, not BRK)
      const b = g[(s - 0xe0) * 0x4000 + (t - 0x5000)];
      if (b !== undefined && b !== 0 && OPS[b]) {
        work.push([s - 0xe0, t]);
        f.seeds++;
      }
    }
  }
  // seeds: every compiled C function's prologue in the code segments
  for (let o = 0; o + 6 <= data; o++) {
    if (g[o] === 0x08 && g[o + 1] === 0x78 && g[o + 2] === 0x38 && g[o + 3] === 0xa5 && g[o + 4] === 0x28 && g[o + 5] === 0xe9) {
      work.push([Math.floor(o / 0x4000), 0x5000 + (o % 0x4000)]);
      f.seeds++;
    }
  }
  const site = (seg: number, pc: number) => `${seg}:${pc.toString(16)}`;
  while (work.length) {
    let [seg, pc] = work.pop()!;
    // immediates known in this run of code: registers and zero page $20/$21/$26/$27
    const reg: Record<string, number | null> = { a: null, x: null, y: null };
    const zp: Record<number, number | null> = {};
    for (;;) {
      const o = at(seg, pc);
      if (o < 0) {
        f.indirect.push(`${site(seg, pc)} outside the program`);
        break;
      }
      if (seen[o]) break;
      const op = g[o], d = OPS[op];
      if (!d) {
        f.bad.push(site(seg, pc));
        break;
      }
      const [mn, mode] = d, len = LEN[mode];
      for (let k = 0; k < len; k++) if (o + k < g.length) seen[o + k] = 1;
      const b1 = g[o + 1], w = g[o + 1] | (g[o + 2] << 8), next = (pc + len) & 0xffff;
      // track immediates
      if (mn === "LDA" || mn === "LDX" || mn === "LDY") reg[mn[2].toLowerCase()] = mode === "imm" ? b1 : null;
      else if (mn === "TAX") reg.x = reg.a;
      else if (mn === "TAY") reg.y = reg.a;
      else if (mn === "TXA") reg.a = reg.x;
      else if (mn === "TYA") reg.a = reg.y;
      else if (["INX", "DEX"].includes(mn)) reg.x = null;
      else if (["INY", "DEY"].includes(mn)) reg.y = null;
      else if (["ADC", "SBC", "AND", "ORA", "EOR", "ASL", "LSR", "ROL", "ROR", "PLA", "INC", "DEC"].includes(mn) && (mode === "imp" || mode === "imm" || true)) {
        if (mn === "INC" || mn === "DEC" || mn === "ASL" || mn === "LSR" || mn === "ROL" || mn === "ROR") {
          if (mode === "imp") reg.a = null;
          else zp[mode === "zp" ? b1 : w] = null;
        } else reg.a = null;
      } else if (mn === "PLX") reg.x = null;
      else if (mn === "PLY") reg.y = null;
      if (mn === "STA" || mn === "STX" || mn === "STY" || mn === "STZ") {
        const addr = mode === "zp" && (op === 0x85 || op === 0x86 || op === 0x84 || op === 0x64) ? b1 : mode === "abs" && (op === 0x8d || op === 0x8e || op === 0x8c || op === 0x9c) ? w : -1;
        const v = mn === "STZ" ? 0 : reg[mn[2].toLowerCase()];
        if (addr >= 0) zp[addr] = v;
      }
      // flow
      if (mode === "rel" || mode === "zprel") {
        const off = mode === "rel" ? b1 : g[o + 2];
        const t = (pc + len + ((off << 24) >> 24)) & 0xffff;
        work.push([seg, t]);
        if (mn === "BRA") break;
        pc = next;
        continue;
      }
      if (mn === "RTS" || mn === "RTI" || mn === "BRK" || mn === "STP") break;
      if (mn === "JMP" && mode !== "abs") {
        f.indirect.push(`${site(seg, pc)} JMP (${hex(w)}${mode === "iax" ? ",X" : ""})`);
        break;
      }
      if (mn === "JSR" || mn === "JMP") {
        const t = w;
        if (t === 0xd2f6) {
          const lo = zp[0x26], hi = zp[0x27];
          if (lo == null || hi == null) f.indirect.push(`${site(seg, pc)} far call, entry not known`);
          else {
            const e = lo | (hi << 8);
            if (e >= 0xe700 && e < 0xeb00) add(f.api, e, site(seg, pc));
            else if (e >= 0xd000) add(f.api, e, site(seg, pc) + " (OS entry outside the API table)");
            else {
              const tl = rd(seg, e), th = rd(seg, e + 1), ts = rd(seg, e + 2);
              if (tl < 0 || th < 0 || ts < 0) f.indirect.push(`${site(seg, pc)} far call through ${hex(e)}, a record not in the program`);
              else if (ts >= 0xe0) work.push([ts - 0xe0, tl | (th << 8)]);
              else f.indirect.push(`${site(seg, pc)} far call through ${hex(e)} naming OS segment ${ts}`);
            }
          }
        } else if (t === 0xdb5c && mn === "JMP") {
          // switch: table at ($26), X/Y entries: keys then addresses; default ($20)
          const tab = (zp[0x26] ?? -1) | ((zp[0x27] ?? -1) << 8), n = (reg.x ?? -1) | ((reg.y ?? 0) << 8);
          const dl = zp[0x20], dh = zp[0x21];
          if (zp[0x26] == null || zp[0x27] == null || reg.x == null) f.indirect.push(`${site(seg, pc)} switch with an unknown table`);
          else {
            for (let i = 0; i < n; i++) {
              const l = rd(seg, tab + 2 * n + 2 * i), h = rd(seg, tab + 2 * n + 2 * i + 1);
              if (l >= 0 && h >= 0) work.push([seg, l | (h << 8)]);
            }
          }
          if (dl != null && dh != null) work.push([seg, dl | (dh << 8)]);
          else f.indirect.push(`${site(seg, pc)} switch with an unknown default`);
          add(f.resident, t, site(seg, pc));
          break;
        } else if (t === 0xd572) {
          add(f.resident, t, site(seg, pc));
          const lo = zp[0x26], hi = zp[0x27];
          if (lo == null || hi == null) f.indirect.push(`${site(seg, pc)} call through a pointer ($D572)`);
          else work.push([seg, lo | (hi << 8)]);
        } else if (t >= 0xd000) add(f.resident, t, site(seg, pc));
        else if (t >= 0x5000 && t < 0xd000) work.push([seg, t]);
        else f.indirect.push(`${site(seg, pc)} ${mn} ${hex(t)} (RAM)`);
        if (mn === "JMP") break;
        // after a call, registers and zero page are unknown
        reg.a = reg.x = reg.y = null;
        for (const k of Object.keys(zp)) zp[+k] = null;
        pc = next;
        continue;
      }
      pc = next;
    }
  }
  // coverage without padding; unreached blocks of 1 KB or more checked for code
  const pad = (o: number) => g[o] === 0 || g[o] === 0xff;
  let start = -1, solid = 0;
  for (let o = 0; o <= data; o++) {
    if (o < data && !pad(o)) {
      f.codeBytes++;
      f.covered += seen[o];
    }
    const un = o < data && !seen[o];
    if (un && start < 0) (start = o), (solid = 0);
    if (un && !pad(o)) solid++;
    if (!un && start >= 0) {
      if (solid >= 1024) {
        let far = 0, prologues = 0;
        for (let k = start; k + 6 < o; k++) {
          if (g[k] === 0x20 && g[k + 1] === 0xf6 && g[k + 2] === 0xd2) far++;
          if (g[k] === 0x08 && g[k + 1] === 0x78 && g[k + 2] === 0x38 && g[k + 3] === 0xa5 && g[k + 4] === 0x28) prologues++;
        }
        if (far || prologues) f.missed.push(`file $${start.toString(16)}+${o - start}: ${far} far calls, ${prologues} prologues`);
      }
      start = -1;
    }
  }
  return f;
}

const args = process.argv.slice(2);
const folder = args[0];
const out: Record<string, unknown> = {};
const lacks = new Map<number, string[]>();
const rows: string[] = [];
for (const file of readdirSync(folder).filter((x) => /\.gam$/i.test(x)).sort()) {
  const name = file.replace(/\.gam$/i, "");
  const f = scan(new Uint8Array(readFileSync(join(folder, file))));
  const missingApi = [...f.api.keys()].filter((e) => !has(e));
  const missingRes = [...f.resident.keys()].filter((e) => !has(e));
  for (const e of [...missingApi, ...missingRes]) lacks.set(e, [...(lacks.get(e) ?? []), name]);
  out[name] = {
    coverage: +(f.covered / Math.max(1, f.codeBytes)).toFixed(3),
    missedCode: f.missed,
    seeds: f.seeds,
    missing: [...missingApi, ...missingRes].map((e) => ({ entry: hex(e), sites: [...(f.api.get(e) ?? f.resident.get(e) ?? [])] })),
    api: [...f.api.keys()].sort().map((e) => hex(e)),
    indirect: f.indirect,
    bad: f.bad.length,
  };
  rows.push(`${name}\tcode reached ${((100 * f.covered) / Math.max(1, f.codeBytes)).toFixed(0)}%\tlacks ${[...missingApi, ...missingRes].map((e) => hex(e)).join(" ") || "-"}\tnot followed ${f.indirect.length}${f.missed.length ? `\tMISSED CODE: ${f.missed.join("; ")}` : ""}`);
}
console.log(rows.join("\n"));
console.log("\nlacking, with the programs:");
for (const [e, ps] of [...lacks].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${hex(e)}\t${ps.length}\t${ps.join(" ")}`);
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify(out, null, 1));
