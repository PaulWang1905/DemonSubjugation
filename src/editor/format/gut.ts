// Disassembler / assembler for GUT story scripts.
//
// Text form:
//
//   .gut 1 1                 ; resource type and index
//   .desc "intro"            ; description (or .header x"..." for odd headers)
//   .events 40               ; number of event slots
//   .event 1 @talk_elder     ; event 1 jumps to a label
//
//   @talk_elder:
//     say 3, "Hello!"
//     if 12, @done           ; jump if global event 12 is set
//     setevent 12
//   @done:
//     callback
//
// Operands: numbers (decimal or 0x), @labels for jump targets, "strings"
// (GBK; \xHH escapes for odd bytes), and for BUY a list of type:index pairs.
// Bytes the disassembler cannot decode are kept with `.raw x"..."`, so
// disassemble -> assemble reproduces the original bytes exactly.
import { gbkBytes } from "../../engine/java";

export type Operand = "u8" | "u16" | "u32" | "str" | "addr" | "buy";

export interface OpSpec {
  code: number;
  name: string;
  args: Operand[];
  doc: string;
}

const u = (n: number): Operand[] => new Array(n).fill("u16");

export const OPS: OpSpec[] = [
  { code: 0, name: "music", args: u(2), doc: "music type, index (not implemented by the engine)" },
  { code: 1, name: "loadmap", args: u(4), doc: "loadmap type, index, screenX, screenY" },
  { code: 2, name: "createactor", args: u(3), doc: "createactor actor, x, y (screen tile)" },
  { code: 3, name: "deletenpc", args: u(1), doc: "deletenpc id" },
  { code: 4, name: "mapevent", args: u(1), doc: "mapevent n (no-op)" },
  { code: 5, name: "actorevent", args: u(2), doc: "actorevent actor, event (no-op)" },
  { code: 6, name: "move", args: u(3), doc: "move npc, x, y (walks there)" },
  { code: 7, name: "actormove", args: u(3), doc: "actormove actor, x, y (no-op)" },
  { code: 8, name: "actorspeed", args: u(2), doc: "actorspeed actor, speed (no-op)" },
  { code: 9, name: "callback", args: [], doc: "callback: end the script" },
  { code: 10, name: "goto", args: ["addr"], doc: "goto @label" },
  { code: 11, name: "if", args: ["u16", "addr"], doc: "if event, @label: jump when the global event is set" },
  { code: 12, name: "set", args: u(2), doc: "set var, value" },
  { code: 13, name: "say", args: ["u16", "str"], doc: 'say portrait, "text" (portrait 0 = none)' },
  { code: 14, name: "startchapter", args: u(2), doc: "startchapter type, index: switch to another script" },
  { code: 15, name: "screenr", args: ["u8"], doc: "screenr value (no-op)" },
  { code: 16, name: "screens", args: u(2), doc: "screens x, y: move the camera" },
  { code: 17, name: "screena", args: ["u8"], doc: "screena value (no-op)" },
  { code: 18, name: "event", args: u(1), doc: "event n: trigger an event of this script" },
  { code: 19, name: "money", args: ["u32"], doc: "money amount: set money" },
  { code: 20, name: "gameover", args: [], doc: "gameover" },
  { code: 21, name: "ifcmp", args: ["u16", "u16", "addr"], doc: "ifcmp var, value, @label: jump when equal" },
  { code: 22, name: "add", args: u(2), doc: "add var, value" },
  { code: 23, name: "sub", args: u(2), doc: "sub var, value" },
  { code: 24, name: "setcontrolid", args: u(1), doc: "setcontrolid actor: make this actor the leader" },
  { code: 25, name: "gutevent", args: u(2), doc: "gutevent script, event: call a script's event" },
  { code: 26, name: "setevent", args: u(1), doc: "setevent n: set global event flag" },
  { code: 27, name: "clrevent", args: u(1), doc: "clrevent n: clear global event flag" },
  { code: 28, name: "buy", args: ["buy"], doc: "buy type:index, ...: open a shop" },
  { code: 29, name: "facetoface", args: u(2), doc: "facetoface a, b: b turns to a (0 = player)" },
  { code: 30, name: "movie", args: u(5), doc: "movie type, index, x, y, mode" },
  { code: 31, name: "choice", args: ["str", "str", "addr"], doc: 'choice "yes", "no", @label: jump if the second is picked' },
  { code: 32, name: "createbox", args: u(4), doc: "createbox id, box, x, y" },
  { code: 33, name: "deletebox", args: u(1), doc: "deletebox id" },
  { code: 34, name: "gaingoods", args: u(2), doc: "gaingoods type, index" },
  { code: 35, name: "initfight", args: u(11), doc: "initfight m1..m8, background, bottomLeft, topRight: random battles" },
  { code: 36, name: "fightenable", args: [], doc: "fightenable" },
  { code: 37, name: "fightdisenable", args: [], doc: "fightdisenable" },
  { code: 38, name: "createnpc", args: u(4), doc: "createnpc id, npc, x, y" },
  {
    code: 39,
    name: "enterfight",
    args: [...u(13), "addr", "addr"],
    doc: "enterfight rounds, m1, m2, m3, bg, bl, tr, r1, r2, r3, e1, e2, e3, @lose, @win",
  },
  { code: 40, name: "deleteactor", args: u(1), doc: "deleteactor actor" },
  { code: 41, name: "gainmoney", args: ["u32"], doc: "gainmoney amount" },
  { code: 42, name: "usemoney", args: ["u32"], doc: "usemoney amount" },
  { code: 43, name: "setmoney", args: ["u32"], doc: "setmoney amount" },
  { code: 44, name: "learnmagic", args: u(3), doc: "learnmagic actor, type, index" },
  { code: 45, name: "sale", args: [], doc: "sale: open the pawn shop" },
  { code: 46, name: "npcmovemod", args: u(2), doc: "npcmovemod npc, state (0 stop 1 forced 2 walk 3 pause 4 active)" },
  { code: 47, name: "message", args: ["str"], doc: 'message "text"' },
  { code: 48, name: "deletegoods", args: ["u16", "u16", "addr"], doc: "deletegoods type, index, @ifMissing" },
  { code: 49, name: "resumeactorhp", args: u(2), doc: "resumeactorhp actor, percent" },
  { code: 50, name: "actorlayerup", args: u(2), doc: "actorlayerup actor, level" },
  { code: 51, name: "boxopen", args: u(1), doc: "boxopen id" },
  { code: 52, name: "delallnpc", args: [], doc: "delallnpc" },
  { code: 53, name: "npcstep", args: u(3), doc: "npcstep id, facing (0 N 1 E 2 S 3 W), step" },
  { code: 54, name: "setscenename", args: ["str"], doc: 'setscenename "name"' },
  { code: 55, name: "showscenename", args: [], doc: "showscenename" },
  { code: 56, name: "showscreen", args: [], doc: "showscreen" },
  { code: 57, name: "usegoods", args: ["u16", "u16", "addr"], doc: "usegoods type, index, @ifMissing" },
  { code: 58, name: "attribtest", args: ["u16", "u16", "u16", "addr", "addr"], doc: "attribtest actor, attr, value, @less, @greater" },
  { code: 59, name: "attribset", args: u(3), doc: "attribset actor, attr, value" },
  { code: 60, name: "attribadd", args: u(3), doc: "attribadd actor, attr, value" },
  { code: 61, name: "showgut", args: ["u16", "u16", "str"], doc: 'showgut topImage, bottomImage, "scrolling text"' },
  { code: 62, name: "usegoodsnum", args: ["u16", "u16", "u16", "addr"], doc: "usegoodsnum type, index, count, @ifMissing" },
  { code: 63, name: "randrade", args: ["u16", "addr"], doc: "randrade permille, @label: random jump" },
  { code: 64, name: "menu", args: ["u16", "str"], doc: 'menu var, "item1 item2 ...": result stored in var' },
  { code: 65, name: "testmoney", args: ["u32", "addr"], doc: "testmoney amount, @ifLess" },
  { code: 66, name: "callchapter", args: u(2), doc: "callchapter type, index: run a sub-script" },
  { code: 67, name: "discmp", args: ["u16", "u16", "addr", "addr"], doc: "discmp var, value, @less, @greater" },
  { code: 68, name: "return", args: [], doc: "return from callchapter" },
  { code: 69, name: "timemsg", args: ["u16", "str"], doc: 'timemsg time, "text"' },
  { code: 70, name: "disablesave", args: [], doc: "disablesave" },
  { code: 71, name: "enablesave", args: [], doc: "enablesave" },
  { code: 72, name: "gamesave", args: [], doc: "gamesave: open the save screen" },
  { code: 73, name: "seteventtimer", args: u(2), doc: "seteventtimer event, halfSeconds" },
  { code: 74, name: "enableshowpos", args: [], doc: "enableshowpos (no-op)" },
  { code: 75, name: "disableshowpos", args: [], doc: "disableshowpos (no-op)" },
  { code: 76, name: "setto", args: u(2), doc: "setto from, to: copy a variable" },
  { code: 77, name: "testgoodsnum", args: ["u16", "u16", "u16", "addr", "addr"], doc: "testgoodsnum type, index, count, @equal, @greater" },
  { code: 78, name: "setfightmiss", args: u(1), doc: "setfightmiss n (no-op)" },
  { code: 79, name: "setarmstoss", args: u(1), doc: "setarmstoss n (no-op)" },
];

const BY_CODE = new Map(OPS.map((o) => [o.code, o]));
const BY_NAME = new Map(OPS.map((o) => [o.name, o]));

// ---------------------------------------------------------------------------
// String escaping

let decoder: TextDecoder | null = null;
function gbkPair(a: number, b: number): string | null {
  decoder ??= new TextDecoder("gbk", { fatal: true });
  try {
    const ch = decoder.decode(new Uint8Array([a, b]));
    if (ch.length !== 1) return null;
    const back = gbkBytes(ch);
    return back.length === 2 && (back[0] & 0xff) === a && (back[1] & 0xff) === b ? ch : null;
  } catch {
    return null;
  }
}

const hex2 = (b: number) => b.toString(16).padStart(2, "0");

export function quoteBytes(bytes: Uint8Array): string {
  let s = '"';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x81 && i + 1 < bytes.length) {
      const ch = gbkPair(b, bytes[i + 1]);
      if (ch) {
        s += ch;
        i++;
        continue;
      }
    }
    if (b === 0x22) s += '\\"';
    else if (b === 0x5c) s += "\\\\";
    else if (b === 0x0a) s += "\\n";
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else s += "\\x" + hex2(b);
  }
  return s + '"';
}

// ---------------------------------------------------------------------------
// Disassembler

export interface GutHeader {
  type: number;
  index: number;
  /** Bytes 2..0x17 of the resource (description field). */
  header: Uint8Array;
  events: number[];
}

/** Split a GUT resource into header, events and code. */
export function parseGut(data: Uint8Array): GutHeader & { code: Uint8Array } {
  if (data.length < 0x1b) throw new Error("GUT resource too short");
  const length = data[0x18] | (data[0x19] << 8);
  const n = data[0x1a];
  const events: number[] = [];
  for (let i = 0; i < n; i++) events.push(data[0x1b + i * 2] | (data[0x1c + i * 2] << 8));
  const codeStart = 0x1b + n * 2;
  const codeEnd = Math.min(0x18 + length, data.length);
  if (codeEnd < codeStart) throw new Error("GUT length field is inconsistent");
  return { type: data[0], index: data[1], header: data.slice(2, 0x18), events, code: data.slice(codeStart, codeEnd) };
}

interface Decoded {
  offset: number;
  op: OpSpec;
  args: (number | Uint8Array | [number, number][])[];
  size: number;
}

function decodeAt(code: Uint8Array, offset: number): Decoded | null {
  const op = BY_CODE.get(code[offset]);
  if (!op) return null;
  let p = offset + 1;
  const args: Decoded["args"] = [];
  for (const kind of op.args) {
    switch (kind) {
      case "u8":
        if (p + 1 > code.length) return null;
        args.push(code[p]);
        p += 1;
        break;
      case "u16":
      case "addr":
        if (p + 2 > code.length) return null;
        args.push(code[p] | (code[p + 1] << 8));
        p += 2;
        break;
      case "u32":
        if (p + 4 > code.length) return null;
        args.push((code[p] | (code[p + 1] << 8) | (code[p + 2] << 16) | (code[p + 3] << 24)) >>> 0);
        p += 4;
        break;
      case "str": {
        let e = p;
        while (e < code.length && code[e] !== 0) e++;
        if (e >= code.length) return null;
        args.push(code.slice(p, e));
        p = e + 1;
        break;
      }
      case "buy": {
        // Like the engine: the list runs to the first NUL byte.
        let e = p;
        while (e < code.length && code[e] !== 0) e++;
        if (e >= code.length) return null;
        const bytes = code.slice(p, e);
        if (bytes.length % 2 === 0) {
          const pairs: [number, number][] = [];
          for (let k = 0; k < bytes.length; k += 2) pairs.push([bytes[k + 1], bytes[k]]); // stored index, type
          args.push(pairs);
        } else {
          args.push(bytes); // odd length: keep as hex
        }
        p = e + 1;
        break;
      }
    }
  }
  return { offset, op, args, size: p - offset };
}

export function disassemble(data: Uint8Array): string {
  const g = parseGut(data);
  const headerCnt = g.events.length * 2 + 3;
  const code = g.code;

  const ins: Decoded[] = [];
  let p = 0;
  let rawFrom = -1;
  while (p < code.length) {
    const d = decodeAt(code, p);
    if (!d) {
      rawFrom = p;
      break;
    }
    ins.push(d);
    p += d.size;
  }
  const starts = new Set(ins.map((d) => d.offset));

  // Labels for every jump target that lands on an instruction.
  const labels = new Map<number, string>();
  const eventOf = new Map<number, number>();
  g.events.forEach((addr, i) => {
    const off = addr - headerCnt;
    if (addr !== 0 && starts.has(off) && !eventOf.has(off)) eventOf.set(off, i + 1);
  });
  for (const [off, ev] of eventOf) labels.set(off, `event${ev}`);
  for (const d of ins) {
    d.op.args.forEach((kind, k) => {
      if (kind !== "addr") return;
      const off = (d.args[k] as number) - headerCnt;
      if (starts.has(off) && !labels.has(off)) labels.set(off, `L${off}`);
    });
  }

  const target = (addr: number) => {
    const l = labels.get(addr - headerCnt);
    return l ? "@" + l : "#" + addr;
  };

  const out: string[] = [];
  out.push(`.gut ${g.type} ${g.index}`);
  const nul = g.header.indexOf(0);
  const descEnd = nul === -1 ? g.header.length : nul;
  if (g.header.subarray(descEnd).every((b) => b === 0)) out.push(`.desc ${quoteBytes(g.header.subarray(0, descEnd))}`);
  else out.push(`.header x"${[...g.header].map(hex2).join("")}"`);
  out.push(`.events ${g.events.length}`);
  g.events.forEach((addr, i) => {
    if (addr !== 0) out.push(`.event ${i + 1} ${target(addr)}`);
  });
  out.push("");
  for (const d of ins) {
    const l = labels.get(d.offset);
    if (l) out.push(`@${l}:`);
    const parts = d.op.args.map((kind, k) => {
      const a = d.args[k];
      if (kind === "addr") return target(a as number);
      if (kind === "str") return quoteBytes(a as Uint8Array);
      if (kind === "buy") {
        if (a instanceof Uint8Array) return `x"${[...a].map(hex2).join("")}"`;
        return (a as [number, number][]).map(([t, i]) => `${t}:${i}`).join(", ");
      }
      return String(a);
    });
    out.push(parts.length ? `  ${d.op.name} ${parts.join(", ")}` : `  ${d.op.name}`);
  }
  if (rawFrom >= 0) {
    out.push(`  ; ${code.length - rawFrom} undecodable byte(s) (opcode ${code[rawFrom]}) kept as raw data`);
    out.push(`  .raw x"${[...code.subarray(rawFrom)].map(hex2).join("")}"`);
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Assembler

export class AsmError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

type Tok = { kind: "num"; v: number } | { kind: "label"; v: string } | { kind: "raw"; v: number } | { kind: "str"; v: Uint8Array } | { kind: "pair"; v: [number, number] } | { kind: "hex"; v: Uint8Array };

function parseString(src: string, line: number): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const n = src[++i];
      if (n === "x") {
        const h = src.substr(i + 1, 2);
        if (!/^[0-9a-fA-F]{2}$/.test(h)) throw new AsmError("bad \\x escape", line);
        out.push(parseInt(h, 16));
        i += 2;
      } else if (n === "n") out.push(0x0a);
      else if (n === '"' || n === "\\") out.push(n.charCodeAt(0));
      else throw new AsmError(`unknown escape \\${n}`, line);
    } else {
      const b = gbkBytes(c);
      for (const x of b) out.push(x & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function tokenizeArgs(s: string, line: number): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const skip = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  skip();
  while (i < s.length) {
    const c = s[i];
    if (c === ";") break;
    if (c === '"') {
      let j = i + 1;
      let body = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") {
          body += s[j] + s[j + 1];
          j += 2;
        } else body += s[j++];
      }
      if (j >= s.length) throw new AsmError("unterminated string", line);
      toks.push({ kind: "str", v: parseString(body, line) });
      i = j + 1;
    } else if (c === "x" && s[i + 1] === '"') {
      const j = s.indexOf('"', i + 2);
      if (j < 0) throw new AsmError("unterminated hex string", line);
      const h = s.slice(i + 2, j);
      if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) throw new AsmError("bad hex string", line);
      toks.push({ kind: "hex", v: Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)) });
      i = j + 1;
    } else if (c === "@") {
      const m = /^@([A-Za-z_][\w]*)/.exec(s.slice(i));
      if (!m) throw new AsmError("bad label", line);
      toks.push({ kind: "label", v: m[1] });
      i += m[0].length;
    } else if (c === "#") {
      const m = /^#(\d+)/.exec(s.slice(i));
      if (!m) throw new AsmError("bad raw address", line);
      toks.push({ kind: "raw", v: Number(m[1]) });
      i += m[0].length;
    } else {
      const m = /^(-?(?:0x[0-9a-fA-F]+|\d+))(?::(\d+))?/.exec(s.slice(i));
      if (!m) throw new AsmError(`unexpected "${s.slice(i, i + 10)}"`, line);
      const v = Number(m[1]);
      if (m[2] !== undefined) toks.push({ kind: "pair", v: [v, Number(m[2])] });
      else toks.push({ kind: "num", v });
      i += m[0].length;
    }
    skip();
  }
  return toks;
}

interface Stmt {
  line: number;
  op: OpSpec | null; // null = .raw
  toks: Tok[];
  size: number;
}

function argSize(kind: Operand, t: Tok | undefined, line: number): number {
  switch (kind) {
    case "u8":
      return 1;
    case "u16":
    case "addr":
      return 2;
    case "u32":
      return 4;
    case "str":
      if (!t || t.kind !== "str") throw new AsmError("expected a string", line);
      return t.v.length + 1;
    case "buy":
      return 0; // handled by caller
  }
}

export function assemble(src: string): Uint8Array {
  let type = 1;
  let index = 1;
  let header: Uint8Array = new Uint8Array(22);
  let eventCount = -1;
  const eventLabels = new Map<number, Tok>();
  const labels = new Map<string, number>();
  const stmts: Stmt[] = [];
  let offset = 0;

  src.split(/\r?\n/).forEach((rawLine, li) => {
    const line = li + 1;
    let text = rawLine.trim();
    if (!text || text.startsWith(";")) return;
    const lm = /^@([A-Za-z_]\w*):\s*(.*)$/.exec(text);
    if (lm) {
      if (labels.has(lm[1])) throw new AsmError(`duplicate label @${lm[1]}`, line);
      labels.set(lm[1], offset);
      text = lm[2].trim();
      if (!text || text.startsWith(";")) return;
    }
    const m = /^(\.?[A-Za-z_]\w*)\s*(.*)$/.exec(text);
    if (!m) throw new AsmError(`cannot parse "${text}"`, line);
    const word = m[1].toLowerCase();
    const toks = tokenizeArgs(m[2], line);
    if (word.startsWith(".")) {
      const num = (k: number) => {
        const t = toks[k];
        if (!t || t.kind !== "num") throw new AsmError(`${word} expects a number`, line);
        return t.v;
      };
      switch (word) {
        case ".gut":
          type = num(0);
          index = num(1);
          break;
        case ".desc": {
          const t = toks[0];
          if (!t || t.kind !== "str") throw new AsmError(".desc expects a string", line);
          if (t.v.length > 21) throw new AsmError("description too long (max 21 bytes)", line);
          header = new Uint8Array(22);
          header.set(t.v);
          break;
        }
        case ".header": {
          const t = toks[0];
          if (!t || t.kind !== "hex" || t.v.length !== 22) throw new AsmError('.header expects x"…" of 22 bytes', line);
          header = t.v;
          break;
        }
        case ".events":
          eventCount = num(0);
          if (eventCount < 0 || eventCount > 255) throw new AsmError("event count must be 0-255", line);
          break;
        case ".event": {
          const n = num(0);
          if (!toks[1] || (toks[1].kind !== "label" && toks[1].kind !== "raw")) throw new AsmError(".event expects @label", line);
          eventLabels.set(n, toks[1]);
          break;
        }
        case ".raw": {
          const t = toks[0];
          if (!t || t.kind !== "hex") throw new AsmError('.raw expects x"…"', line);
          stmts.push({ line, op: null, toks, size: t.v.length });
          offset += t.v.length;
          break;
        }
        default:
          throw new AsmError(`unknown directive ${word}`, line);
      }
      return;
    }
    const op = BY_NAME.get(word);
    if (!op) throw new AsmError(`unknown instruction "${word}"`, line);
    let size = 1;
    if (op.args.length === 1 && op.args[0] === "buy") {
      if (toks.length === 1 && toks[0].kind === "hex") {
        size += toks[0].v.length + 1;
      } else {
        for (const t of toks) {
          if (t.kind !== "pair") throw new AsmError("buy expects type:index pairs", line);
          if (t.v[0] < 1 || t.v[0] > 255 || t.v[1] < 1 || t.v[1] > 255) throw new AsmError("buy item numbers must be 1-255", line);
        }
        size += toks.length * 2 + 1;
      }
    } else {
      if (toks.length !== op.args.length) {
        throw new AsmError(`${op.name} takes ${op.args.length} operand(s), got ${toks.length} — ${op.doc}`, line);
      }
      op.args.forEach((kind, k) => (size += argSize(kind, toks[k], line)));
    }
    stmts.push({ line, op, toks, size });
    offset += size;
  });

  if (eventCount < 0) eventCount = Math.max(0, ...eventLabels.keys());
  for (const n of eventLabels.keys()) {
    if (n < 1 || n > eventCount) throw new AsmError(`event ${n} is outside 1..${eventCount}`, 0);
  }
  const headerCnt = eventCount * 2 + 3;
  const resolve = (t: Tok, line: number): number => {
    if (t.kind === "raw") return t.v;
    if (t.kind === "label") {
      const off = labels.get(t.v);
      if (off === undefined) throw new AsmError(`unknown label @${t.v}`, line);
      return off + headerCnt;
    }
    throw new AsmError("expected @label", line);
  };

  const code: number[] = [];
  const u16 = (v: number) => code.push(v & 0xff, (v >> 8) & 0xff);
  for (const s of stmts) {
    if (!s.op) {
      for (const b of (s.toks[0] as { v: Uint8Array }).v) code.push(b);
      continue;
    }
    code.push(s.op.code);
    if (s.op.args[0] === "buy") {
      if (s.toks[0]?.kind === "hex") {
        for (const b of s.toks[0].v) code.push(b);
        code.push(0);
        continue;
      }
      for (const t of s.toks) {
        const [ty, ix] = (t as { v: [number, number] }).v;
        code.push(ix & 0xff, ty & 0xff);
      }
      code.push(0);
      continue;
    }
    s.op.args.forEach((kind, k) => {
      const t = s.toks[k];
      switch (kind) {
        case "u8":
          if (t.kind !== "num") throw new AsmError("expected a number", s.line);
          code.push(t.v & 0xff);
          break;
        case "u16":
          if (t.kind !== "num") throw new AsmError("expected a number", s.line);
          if (t.v < 0 || t.v > 0xffff) throw new AsmError(`${t.v} does not fit in 16 bits`, s.line);
          u16(t.v);
          break;
        case "u32":
          if (t.kind !== "num") throw new AsmError("expected a number", s.line);
          code.push(t.v & 0xff, (t.v >>> 8) & 0xff, (t.v >>> 16) & 0xff, (t.v >>> 24) & 0xff);
          break;
        case "addr":
          u16(resolve(t, s.line));
          break;
        case "str":
          for (const b of (t as { v: Uint8Array }).v) code.push(b);
          code.push(0);
          break;
      }
    });
  }

  const length = headerCnt + code.length;
  if (length > 0xffff) throw new Error("script too long");
  const out = new Uint8Array(0x18 + length);
  out[0] = type;
  out[1] = index;
  out.set(header.subarray(0, 22), 2);
  out[0x18] = length & 0xff;
  out[0x19] = length >> 8;
  out[0x1a] = eventCount;
  for (let i = 1; i <= eventCount; i++) {
    const t = eventLabels.get(i);
    const addr = t ? resolve(t, 0) : 0;
    out[0x1b + (i - 1) * 2] = addr & 0xff;
    out[0x1c + (i - 1) * 2] = addr >> 8;
  }
  out.set(code, 0x1b + eventCount * 2);
  return out;
}

export function opByName(name: string): OpSpec | undefined {
  return BY_NAME.get(name);
}
