// Checks a project before it is played or exported: references to resources
// that do not exist (the engine stops, or shows a blank stand-in), map events
// no script handles, out-of-range ids and dialogue that breaks in its box.
import { decodeImage, decodeMap, resourceName } from "./decode";
import { parseGut, scriptSource, statements, type Tok } from "./gut";
import { findEntry, type LibArchive, type LibEntry } from "./lib";
import { fieldsFor, readField, readMagicChain } from "./schema";
import { checkDialogue, checkSpeakers } from "./scriptHelp";
import { unreachable } from "./reach";
import { buildWorld } from "./world";

export interface Problem {
  /** error: the game is likely to stop or misbehave; warning: it runs, but not as meant. */
  level: "error" | "warning";
  /** The resource it is in, as "resType-type-index". */
  key: string;
  /** "Script 1-2 Whisperwood" */
  where: string;
  message: string;
  /** Line of the script's text, for scripts. */
  line?: number;
  /** The map tile it is about, for maps (the World view shows it). */
  tile?: { x: number; y: number };
}

const KIND: Record<number, string> = {
  1: "Script",
  2: "Map",
  4: "Spell",
  5: "Animation",
  6: "Item",
  7: "Tileset",
  8: "Sprite",
  9: "Item icon",
  10: "Effect image",
  11: "Picture",
  12: "Table",
};

/** A short name for a resource kind and number: "map 1-3", "monster 3-2". */
export function refName(resType: number, type: number, index: number): string {
  if (resType === 3) return `${["character", "party member", "NPC", "monster", "object"][type] ?? "character"} ${type}-${index}`;
  if (resType === 11) return `picture ${type}-${index}`;
  return `${(KIND[resType] ?? "resource").toLowerCase()} ${type}-${index}`;
}

export function describeEntry(e: LibEntry): string {
  const name = resourceName(e.resType, e.type, e.data);
  const kind = e.resType === 3 ? ({ 1: "Party member", 2: "NPC", 3: "Monster", 4: "Object" } as Record<number, string>)[e.type] ?? "Character" : (KIND[e.resType] ?? "Resource");
  return `${kind} ${e.type}-${e.index}${name && e.resType !== 5 ? ` ${name}` : ""}`;
}

/** Images and animations have blank stand-ins when missing, tables are optional; anything else stops the game. */
const severity = (resType: number): Problem["level"] => ([5, 7, 8, 9, 10, 11, 12].includes(resType) ? "warning" : "error");

const num = (t: Tok | undefined): number | null => (t && t.kind === "num" ? t.v : null);

/** Which resources an instruction's operands refer to: [operand index → resType, type (number or operand index)]. */
export type RefSpec = { arg: number; resType: number; type: number | { arg: number }; zeroOk?: boolean };
const R = (arg: number, resType: number, type: number | { arg: number }, zeroOk = true): RefSpec => ({ arg, resType, type, zeroOk });
export const SCRIPT_REFS: Record<string, RefSpec[]> = {
  loadmap: [R(1, 2, { arg: 0 }, false)],
  createactor: [R(0, 3, 1, false)],
  createnpc: [R(1, 3, 2, false)],
  createbox: [R(1, 3, 4, false)],
  say: [R(0, 11, 1)],
  startchapter: [R(1, 1, { arg: 0 }, false)],
  callchapter: [R(1, 1, { arg: 0 }, false)],
  gutevent: [R(0, 1, 1, false)],
  gaingoods: [R(1, 6, { arg: 0 }, false)],
  deletegoods: [R(1, 6, { arg: 0 }, false)],
  usegoods: [R(1, 6, { arg: 0 }, false)],
  usegoodsnum: [R(1, 6, { arg: 0 }, false)],
  testgoodsnum: [R(1, 6, { arg: 0 }, false)],
  learnmagic: [R(2, 4, { arg: 1 }, false)],
  movie: [R(1, 5, { arg: 0 }, false)],
  showgut: [R(0, 11, 5), R(1, 11, 5)],
  enterfight: [R(1, 3, 3), R(2, 3, 3), R(3, 3, 3), R(4, 11, 4), R(5, 11, 4), R(6, 11, 4)],
  initfight: [...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => R(i, 3, 3)), R(8, 11, 4), R(9, 11, 4), R(10, 11, 4)],
};

/**
 * Check a project. `sources` are the authors' script texts (by key); line
 * numbers refer to the text the script editor shows.
 */
export function checkProject(a: LibArchive, sources: Record<string, string> = {}): Problem[] {
  const out: Problem[] = [];
  const has = (resType: number, type: number, index: number) => !!findEntry(a, resType, type, index);
  const scripts = a.entries.filter((e) => e.resType === 1);

  if (!has(1, 1, 1)) out.push({ level: "error", key: "", where: "Project", message: "There is no script 1-1: the game starts with it." });

  // maps loaded by each script, and the events each script handles
  const loads = new Map<string, Set<string>>(); // map key -> script keys
  const handled = new Map<string, Set<number>>(); // script key -> events
  const key = (e: { resType: number; type: number; index: number }) => `${e.resType}-${e.type}-${e.index}`;

  for (const e of scripts) {
    const k = key(e);
    const where = describeEntry(e);
    try {
      handled.set(k, new Set(parseGut(e.data).events.flatMap((addr, i) => (addr ? [i + 1] : []))));
    } catch (err) {
      out.push({ level: "error", key: k, where, message: `cannot be read: ${(err as Error).message}` });
      continue;
    }
    const text = scriptSource(e.data, sources[k]);
    for (const s of statements(text)) {
      const at = (msg: string, level: Problem["level"] = "error") => out.push({ level, key: k, where, line: s.line, message: `${s.op.name}: ${msg}` });
      if (s.op.name === "loadmap") {
        const [t, i] = [num(s.toks[0]), num(s.toks[1])];
        if (t !== null && i !== null) {
          const mk = `2-${t}-${i}`;
          if (!loads.has(mk)) loads.set(mk, new Set());
          loads.get(mk)!.add(k);
        }
      }
      if ((s.op.name === "createnpc" || s.op.name === "createbox") && s.toks[0]?.kind === "num" && (s.toks[0].v < 1 || s.toks[0].v > 40)) {
        at(`id ${s.toks[0].v} is outside 1-40`);
      }
      if (s.op.name === "buy") {
        for (const t of s.toks) if (t.kind === "pair" && !has(6, t.v[0], t.v[1])) at(`item ${t.v[0]}-${t.v[1]} does not exist`);
        continue;
      }
      for (const r of SCRIPT_REFS[s.op.name] ?? []) {
        const index = num(s.toks[r.arg]);
        const type = typeof r.type === "number" ? r.type : num(s.toks[r.type.arg]);
        if (index === null || type === null) continue;
        if (index === 0 && r.zeroOk) continue;
        if (!has(r.resType, type, index)) {
          const level = severity(r.resType);
          at(`${refName(r.resType, type, index)} does not exist${level === "warning" ? " (a blank stand-in is shown)" : ""}`, level);
        }
      }
    }
    for (const d of [...checkDialogue(text), ...checkSpeakers(text)]) out.push({ level: "warning", key: k, where, line: d.line, message: d.message });
  }

  // maps: tileset, tiles, and their events
  for (const e of a.entries.filter((x) => x.resType === 2)) {
    const k = key(e);
    const where = describeEntry(e);
    let m;
    try {
      m = decodeMap(e.data);
    } catch (err) {
      out.push({ level: "error", key: k, where, message: `cannot be read: ${(err as Error).message}` });
      continue;
    }
    const ts = findEntry(a, 7, 1, m.tileset);
    if (!ts) out.push({ level: "warning", key: k, where, message: `tileset ${m.tileset} does not exist (the map is blank)` });
    else {
      let count = 0;
      try {
        count = decodeImage(ts.data).frames.length;
      } catch {
        /* reported with the tileset */
      }
      const over = new Set(m.cells.filter((c) => c.tile >= count).map((c) => c.tile));
      if (count && over.size) out.push({ level: "warning", key: k, where, message: `uses tile${over.size > 1 ? "s" : ""} ${[...over].sort((x, y) => x - y).join(", ")}, but tileset ${m.tileset} has tiles 0-${count - 1}` });
    }
    const by = loads.get(k);
    if (!by) {
      out.push({ level: "warning", key: k, where, message: "no script shows this map: no exit or start leads here" });
      continue;
    }
    const events = [...new Set(m.cells.map((c) => c.event ?? 0).filter((v) => v > 0))].sort((x, y) => x - y);
    for (const ev of events) {
      if (![...by].some((s) => handled.get(s)?.has(ev + 40))) {
        out.push({ level: "warning", key: k, where, message: `map event ${ev} does nothing: no script that shows this map says what happens there` });
      }
    }
  }

  // forms: what records refer to
  for (const e of a.entries.filter((x) => x.resType === 3 || x.resType === 4 || x.resType === 6)) {
    const fields = fieldsFor(e.resType, e.type);
    if (!fields) continue;
    for (const f of fields) {
      if (!f.ref) continue;
      const v = Number(readField(e.data, f));
      const type = typeof f.ref.type === "number" ? f.ref.type : e.data[f.ref.type.at];
      if (!v || !type || has(f.ref.resType, type, v)) continue;
      const level = severity(f.ref.resType);
      out.push({ level, key: key(e), where: describeEntry(e), message: `${f.label}: ${refName(f.ref.resType, type, v)} does not exist` });
    }
    if (e.resType === 3 && e.type === 1) {
      for (const [t, what] of [
        [1, "portrait"],
        [3, "battle sprite"],
      ] as const) {
        if (!has(11, t, e.index)) out.push({ level: "warning", key: key(e), where: describeEntry(e), message: `no ${what} (picture ${t}-${e.index})` });
      }
      if (!has(12, 2, e.index)) out.push({ level: "warning", key: key(e), where: describeEntry(e), message: `no level table (table 2-${e.index}): levelling up does nothing` });
    }
  }

  // spell lists
  for (const e of a.entries.filter((x) => x.resType === 12 && x.type === 1)) {
    try {
      for (const s of readMagicChain(e.data)) {
        if (!has(4, s.type, s.index)) out.push({ level: "error", key: key(e), where: `Spell list ${e.type}-${e.index}`, message: `spell ${s.type}-${s.index} does not exist` });
      }
    } catch {
      /* the table editor reports it */
    }
  }

  // what the player can never get to (exits at the edge, people behind walls)
  try {
    const world = buildWorld(a, sources);
    const grids = new Map<string, ReturnType<typeof decodeMap>>();
    const grid = (k: string) => {
      if (!grids.has(k)) {
        const [, t, i] = k.split("-").map(Number);
        const e = findEntry(a, 2, t, i);
        try {
          if (e) grids.set(k, decodeMap(e.data));
        } catch {
          /* reported with the map */
        }
      }
      return grids.get(k) ?? null;
    };
    for (const r of unreachable(world, grid)) {
      const [, t, i] = r.map.split("-").map(Number);
      const e = findEntry(a, 2, t, i)!;
      const near = r.nearest ? ` The nearest tile that works is ${r.nearest.x}, ${r.nearest.y}.` : "";
      out.push({ level: "warning", key: r.map, where: describeEntry(e), tile: { x: r.x, y: r.y }, message: `${cap(r.name)} at ${r.x}, ${r.y} can never be reached: ${r.reason}.${near}` });
    }
  } catch {
    /* the scripts' own problems are reported above */
  }

  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2 errors, 1 warning" */
export function problemSummary(list: Problem[]): string {
  const e = list.filter((p) => p.level === "error").length;
  const w = list.length - e;
  const part = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (!list.length) return "No problems";
  return [e && part(e, "error"), w && part(w, "warning")].filter(Boolean).join(", ");
}
