// What the editor's wizards make (src/editor/ui/Wizards.tsx), and "play from
// here": pure functions from a project (its archive and the scripts' texts
// as the author sees them) to the resources to write. Scripts are changed
// through the script model's edits (worldEdit.ts, scriptModel.ts), so the
// lines a wizard is not about stay exactly as they were.
//
// - newMap: a map of a size and tileset, filled with a tile (a blocked ring
//   of another tile round the edge if asked), optionally joined to another
//   map by an exit and the way back (worldEdit.addExit, as the World view's
//   Add exit does): a new script then sets the new map up.
// - newPerson: a person resource from a walk sprite (or an existing one),
//   placed on a map's tile by the script that sets the map up, with a line.
// - addShop: a person's event opens a shop (`buy`, as Tam's in The Silent
//   Bell: a greeting, then the shop; the engine shows each item's buy price).
// - newMonster: a monster from a template with numbers that fit the
//   starter party; randomBattles: `initfight` + `fightenable` in the start
//   code of the script that sets a map up (random battles stay on when the
//   party walks to another map, so other maps' scripts get `fightdisenable`
//   unless they already say what battles do); addBattle: a battle when
//   talking to someone (`enterfight`, win / lose labels).
// - playFromHere: a copy of the archive whose new game starts on a tile of
//   a map, with that map set up by its own script; the project is untouched.
import { assemble, scriptSource } from "./gut";
import { encodeMap, encodeMonster, encodeNpc, type MapCell } from "./encode";
import { decodeMap } from "./decode";
import { findEntry, putEntry, type LibArchive } from "./lib";
import { fieldsFor, readField } from "./schema";
import {
  addEvent,
  entryStep,
  eventGroup,
  insertLines,
  instructionLine,
  labelTarget,
  parseScript,
  setOperand,
  startGroup,
  startPlacement,
  toSource,
  uniqueLabel,
  type InstructionStep,
  type ScriptModel,
} from "./scriptModel";
import { buildWorld, resKey, withCellEvent, type WorldIndex } from "./world";
import {
  addArrival,
  addExit,
  addPerson,
  arrivalCamera,
  arrivalVariable,
  freeCellEvent,
  freeFlag,
  inPlayerBand,
  loadsWhenStarting,
  mapSetups,
  moveStart,
  placementPosition,
  sayText,
  slug,
  startPosition,
  type Texts,
} from "./worldEdit";
import { flagName, setFlagNote, setVariableNote, variableName, type ProjectNotes } from "./notes";
import { cells as textCells } from "./text";

/** A resource to store: bytes and, for a script, its text. */
export interface Change {
  key: string;
  data: Uint8Array;
  source?: string;
}

/** What a wizard made: the resources to store, and what to show then. */
export interface WizardResult {
  changes: Change[];
  /** Open this resource (in this view, at this line). */
  open?: { key: string; mode?: string; line?: number };
  /** Names for flags and variables the wizard used (kept in the notes). */
  notes?: (n: ProjectNotes) => ProjectNotes;
  /** One sentence for the author: what was made. */
  message: string;
}

/** A project as the wizards see it. */
export interface Project {
  archive: LibArchive;
  /** Every script's text as the author sees it. */
  texts: Texts;
  /** Story flags the author's notes name (taken, though no script uses them yet). */
  namedFlags?: readonly string[];
}

const MAP_RES = 2;

/** The archive with the scripts' texts assembled (texts that do not assemble count as stored). */
function withTexts(archive: LibArchive, texts: Texts): LibArchive {
  const entries = archive.entries.map((e) => {
    if (e.resType !== 1) return e;
    const t = texts[resKey(1, e.type, e.index)];
    if (t === undefined) return e;
    try {
      return { ...e, data: assemble(t) };
    } catch {
      return e;
    }
  });
  return { ...archive, entries };
}

/** Every script's text: the project's, else the stored source or a disassembly. */
export function fullTexts(archive: LibArchive, texts: Texts = {}, sources: Record<string, string> = {}): Texts {
  const out: Texts = {};
  for (const e of archive.entries) {
    if (e.resType !== 1) continue;
    const k = resKey(1, e.type, e.index);
    out[k] = texts[k] ?? scriptSource(e.data, sources[k]);
  }
  return out;
}

/** The world index of a project (unapplied texts included). */
export function projectWorld(p: Project): WorldIndex {
  return buildWorld(withTexts(p.archive, p.texts), p.texts);
}

/** The lowest free number of a kind. */
export function freeIndex(a: LibArchive, resType: number, type: number): number {
  for (let i = 1; i < 256; i++) if (!findEntry(a, resType, type, i)) return i;
  throw new Error("No free number left");
}

/** Script changes for edited texts (assembled: a text that does not assemble throws). */
function scriptChanges(before: Texts, after: Texts): Change[] {
  return Object.entries(after)
    .filter(([k, t]) => before[k] !== t)
    .map(([key, source]) => ({ key, data: assemble(source), source }));
}

function mapOf(a: LibArchive, key: string) {
  const [, t, i] = key.split("-").map(Number);
  const e = findEntry(a, MAP_RES, t, i);
  if (!e) throw new Error(`map ${t}-${i} does not exist`);
  return { entry: e, map: decodeMap(e.data) };
}

/** The script that sets a map up when it starts (shows it and places its people), or null. */
export function setupScript(world: WorldIndex, mapKey: string): string | null {
  const setups = mapSetups(world, mapKey);
  const [, t, i] = mapKey.split("-").map(Number);
  const starting = setups.find((s) => {
    const m = world.scripts.get(s.script)?.model;
    return m && loadsWhenStarting(m, { type: t, index: i });
  });
  return (starting ?? setups[0])?.script ?? null;
}

// ---------------------------------------------------------------------------
// A new map

export type Side = "east" | "west" | "north" | "south";
export const OPPOSITE: Record<Side, Side> = { east: "west", west: "east", north: "south", south: "north" };

/** Map sizes to choose from. */
export const MAP_SIZES = [
  { id: "small", label: "Small room", width: 14, height: 10 },
  { id: "room", label: "Room", width: 20, height: 14 },
  { id: "large", label: "Large area", width: 32, height: 22 },
  { id: "huge", label: "Huge field", width: 48, height: 32 },
] as const;

/** The smallest map the player can walk on: the screen is 9×6 tiles and the leader keeps off the edges. */
export const MIN_MAP = { width: 9, height: 6 };

/**
 * Where an exit on a side of a map goes: the cell just beyond where the
 * player can stand (walking into it runs its event) and the tile inside it,
 * where the party stands when it comes back; from the middle of the side out.
 */
export function sideExit(w: number, h: number, side: Side, ok: (out: { x: number; y: number }, inside: { x: number; y: number }) => boolean = () => true): { out: { x: number; y: number }; inside: { x: number; y: number } } {
  const vertical = side === "east" || side === "west";
  const from = vertical ? 3 : 4;
  const to = vertical ? h - 3 : w - 5;
  const mid = Math.floor((from + to) / 2);
  const order = Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  for (const v of order) {
    const c =
      side === "east" ? { out: { x: w - 4, y: v }, inside: { x: w - 5, y: v } }
      : side === "west" ? { out: { x: 3, y: v }, inside: { x: 4, y: v } }
      : side === "north" ? { out: { x: v, y: 2 }, inside: { x: v, y: 3 } }
      : { out: { x: v, y: h - 2 }, inside: { x: v, y: h - 3 } };
    if (inPlayerBand(c.inside.x, c.inside.y, w, h) && ok(c.out, c.inside)) return c;
  }
  throw new Error(`there is no free tile on the ${side} side to put an exit on`);
}

export interface NewMapOptions {
  name: string;
  width: number;
  height: number;
  tileset: number;
  /** The tile everywhere (walkable). */
  fill: number;
  /** A ring of this tile round the edge, blocked (null: none). */
  border: number | null;
  /** Join it to another map: an exit on that map's side and the way back. */
  connect?: { from: string; side: Side } | null;
}

/** Make a map (and, to join it, the exit, the way back and the script that sets it up). */
export function newMap(p: Project, o: NewMapOptions): WizardResult {
  const name = o.name.trim().toUpperCase() || "NEW MAP";
  if (textCells(name) > 12) throw new Error("a map's name holds 12 letters (6 Chinese characters)");
  if (o.width < MIN_MAP.width || o.height < MIN_MAP.height || o.width > 127 || o.height > 127) throw new Error(`a map is ${MIN_MAP.width}-127 tiles wide and ${MIN_MAP.height}-127 high`);
  const index = freeIndex(p.archive, MAP_RES, 1);
  const cells: MapCell[] = [];
  for (let y = 0; y < o.height; y++)
    for (let x = 0; x < o.width; x++) {
      const edge = o.border !== null && (x < 3 || y < 2 || x >= o.width - 3 || y >= o.height - 2);
      cells.push({ tile: edge ? o.border! : o.fill, walkable: !edge, event: 0 });
    }
  let bytes = encodeMap({ type: 1, index, tileset: o.tileset, name, width: o.width, height: o.height, cells });
  const key = resKey(MAP_RES, 1, index);
  if (!o.connect) return { changes: [{ key, data: bytes }], open: { key, mode: "map.world" }, message: `Made map 1-${index} ${name}.` };

  // the exit on the other map and the way back, as the World view's Add exit makes them
  const world = projectWorld(p);
  const from = mapOf(p.archive, o.connect.from);
  const fm = from.map;
  const fromScript = setupScript(world, o.connect.from);
  if (!fromScript) throw new Error(`no script shows ${fm.name} yet, so an exit cannot be added to it`);
  const cellFree = (m: typeof fm, c: { x: number; y: number }) => !m.cells[c.y * m.width + c.x].event;
  const walk = (m: typeof fm, c: { x: number; y: number }) => m.cells[c.y * m.width + c.x].walkable;
  const there = sideExit(fm.width, fm.height, o.connect.side, (out, inside) => cellFree(fm, out) && walk(fm, inside));
  const back = sideExit(o.width, o.height, OPPOSITE[o.connect.side], (_, inside) => !!cells[inside.y * o.width + inside.x].walkable);
  const toScript = resKey(1, 1, freeIndex(p.archive, 1, 1));
  const used = new Set(world.variables.keys());
  const loaders = [...new Set(world.maps.get(o.connect.from)?.loadedBy.map((l) => l.script) ?? [fromScript])];
  const n = freeCellEvent(loaders.map((k) => world.scripts.get(k)?.model).filter((m): m is ScriptModel => !!m), fm.cells.map((c) => c.event));
  const texts: Texts = { [fromScript]: p.texts[fromScript] };
  const first = addExit(texts, {
    fromScript,
    mapEvent: n,
    toMap: { type: 1, index, name },
    camera: arrivalCamera(back.inside.x, back.inside.y, world.playerScreen),
    toScript: { key: toScript, exists: false },
    usedVariables: used,
    fromName: fm.name,
  });
  const n2 = freeCellEvent([parseScript(first.texts[toScript])], cells.map((c) => c.event));
  // (free flags, should the way back need a new game's welcome to play only once)
  const once: number[] = [];
  for (let k = 0; k < 4; k++) once.push(freeFlag(world, [...(p.namedFlags ?? []), ...once.map(String)]));
  const r = addExit(first.texts, {
    fromScript: toScript,
    mapEvent: n2,
    toMap: { type: fm.type, index: fm.index, name: fm.name },
    camera: arrivalCamera(there.inside.x, there.inside.y, world.playerScreen),
    toScript: { key: fromScript, exists: true },
    usedVariables: used,
    fromName: name,
    onceFlags: once,
  });
  bytes = withCellEvent(bytes, back.out.x, back.out.y, n2);
  const fromBytes = withCellEvent(from.entry.data, there.out.x, there.out.y, n);
  const v = r.variable;
  return {
    changes: [{ key, data: bytes }, { key: o.connect.from, data: fromBytes }, ...scriptChanges(p.texts, r.texts)],
    open: { key, mode: "map.world" },
    notes: (nn) => {
      let out = v && !variableName(nn, v.variable) ? setVariableNote(nn, v.variable, { name: "where the party comes from" }) : nn;
      for (const f of r.onceFlags ?? []) if (!flagName(out, f)) out = setFlagNote(out, f, { name: "new game's welcome played" });
      return out;
    },
    message: `Made map 1-${index} ${name}: walking ${o.connect.side} off ${fm.name} at ${there.out.x}, ${there.out.y} leads there, and its ${OPPOSITE[o.connect.side]} edge leads back. Script 1-${toScript.split("-")[2]} sets it up.`,
  };
}

// ---------------------------------------------------------------------------
// A new person

export interface NewPersonOptions {
  /** An existing person (3-2-n), or a new one from a walk sprite (8-2-n). */
  who: { npc: number } | { sprite: number };
  name: string;
  map: string;
  /** Where they stand; null: the author picks the tile in the World view. */
  tile: { x: number; y: number } | null;
  /** The first thing they say. */
  line: string;
  /** They walk around (npcmovemod 1) instead of standing. */
  walks: boolean;
}

/** Make a person (a resource from a sprite, if asked) and put them on a map with a line. */
export function newPerson(p: Project, o: NewPersonOptions): WizardResult & { npc: number } {
  const name = o.name.trim() || "Villager";
  if (textCells(name) > 12) throw new Error("a person's name holds 12 letters (6 Chinese characters)");
  const changes: Change[] = [];
  let npc: number;
  if ("npc" in o.who) {
    npc = o.who.npc;
    if (!findEntry(p.archive, 3, 2, npc)) throw new Error(`person 2-${npc} does not exist`);
  } else {
    npc = freeIndex(p.archive, 3, 2);
    if (!findEntry(p.archive, 8, 2, o.who.sprite)) throw new Error(`walk sprite 2-${o.who.sprite} does not exist`);
    changes.push({ key: resKey(3, 2, npc), data: encodeNpc({ index: npc, name, sprite: o.who.sprite, facing: 3, step: 1 }) });
  }
  if (!o.tile) return { changes, npc, open: { key: o.map, mode: "map.world" }, message: `Made ${name}. Click a tile to put them there.` };
  const world = projectWorld(p);
  const script = setupScript(world, o.map);
  if (!script) throw new Error("no script shows this map yet: join it to another map with an exit first (New map can do it)");
  const { map } = mapOf(p.archive, o.map);
  if (o.tile.x < 0 || o.tile.y < 0 || o.tile.x >= map.width || o.tile.y >= map.height) throw new Error("that tile is outside the map");
  let m = parseScript(p.texts[script]);
  const load = mapSetups(world, o.map).find((s) => s.script === script)?.loads.find((l) => l.start) ?? null;
  const r = addPerson(m, { npc, name, x: o.tile.x, y: o.tile.y, at: placementPosition(m, world, o.map, load), text: o.line.trim() || "Hello!" });
  m = r.model;
  if (o.walks) {
    const place = m.steps.find((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "createnpc" && s.values[0] === r.id)!;
    m = insertLines(m, { after: place.id }, [instructionLine("npcmovemod", [r.id, 1])]).model;
  }
  const source = toSource(m);
  changes.push({ key: script, data: assemble(source), source });
  return { changes, npc, open: { key: o.map, mode: "map.world" }, message: `Put ${name} on ${map.name} at ${o.tile.x}, ${o.tile.y}: talking to them runs @${r.label} in script ${script.split("-").slice(1).join("-")}.` };
}

// ---------------------------------------------------------------------------
// Shops

/** An item's buy price (what the shop asks). */
export function buyPrice(a: LibArchive, type: number, index: number): number | null {
  const e = findEntry(a, 6, type, index);
  const f = fieldsFor(6, type)?.find((x) => x.key === "buy");
  return e && f ? Number(readField(e.data, f)) : null;
}

/** Where an event's main way ends: the first instruction from its entry that ends it, jumps or fights (insert before it). */
function mainEnd(model: ScriptModel, label: string): number {
  const at = labelTarget(model, label);
  if (at < 0) throw new Error(`@${label} is not in the script`);
  for (let i = at; i < model.steps.length; i++) {
    const s = model.steps[i];
    if (i > at && s.label) return i;
    if (s.kind === "instruction" && (s.command.flow === "end" || s.command.flow === "jump" || s.command.flow === "battle")) return i;
    if (s.kind === "raw" || s.kind === "data") return i;
  }
  return model.steps.length;
}

/** Labels the script does not have yet, different from each other. */
function freshLabels(model: ScriptModel, bases: string[]): string[] {
  const taken = new Set(model.labels.keys());
  return bases.map((b) => {
    let l = uniqueLabel(model, b);
    for (let n = 2; taken.has(l); n++) l = `${b}_${n}`;
    taken.add(l);
    return l;
  });
}

/** Insert lines before step index i (or at the end). */
function insertAt(model: ScriptModel, i: number, lines: readonly string[]): ScriptModel {
  return insertLines(model, i < model.steps.length ? { before: model.steps[i].id } : "end", lines).model;
}

export interface ShopOptions {
  script: string;
  /** The person's number (their event). */
  id: number;
  name: string;
  items: { type: number; index: number }[];
  /** Said before the shop opens (empty: nothing). */
  greeting: string;
}

/** Talking to a person opens a shop: their event's `buy` list is set, or a greeting and a `buy` are added where it ends. */
export function addShop(p: Project, o: ShopOptions): WizardResult {
  if (!o.items.length) throw new Error("pick at least one item to sell");
  if (o.items.length > 16) throw new Error("a shop sells at most 16 items");
  const text = p.texts[o.script];
  if (text === undefined) throw new Error(`script ${o.script} does not exist`);
  let m = parseScript(text);
  const pairs = o.items.map((i) => [i.type, i.index] as const);
  const g = eventGroup(m, o.id);
  const greet = o.greeting.trim() ? [instructionLine("say", [0, sayText(`${o.name}: ${o.greeting.trim()}`, 0)])] : [];
  const ev = m.events.find((e) => e.number === o.id);
  let line: number;
  if (!ev || !ev.label || !g) {
    if (ev) throw new Error(`#${o.id}'s event is not code the editor can change`);
    const label = uniqueLabel(m, `shop_${slug(o.name)}`);
    m = addEvent(m, o.id, label, [instructionLine("facetoface", [0, o.id]), ...greet, instructionLine("buy", [pairs]), "  callback"]);
    line = m.steps[labelTarget(m, label)].line;
  } else {
    const existing = m.steps.slice(g.from, g.to).find((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "buy");
    if (existing) {
      m = setOperand(m, existing.id, 0, pairs);
      line = existing.line;
    } else {
      const at = mainEnd(m, ev.label);
      m = insertAt(m, at, [...greet, instructionLine("buy", [pairs])]);
      line = m.steps[at].line;
    }
  }
  const source = toSource(m);
  return {
    changes: [{ key: o.script, data: assemble(source), source }],
    open: { key: o.script, mode: "visual", line },
    message: `${o.name} now runs a shop selling ${o.items.length} item${o.items.length === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Monsters and battles

/** Monster templates: numbers that suit a starter party (a level-1 hero has about 60 HP and 10 attack). */
export const MONSTER_TEMPLATES = [
  { id: "weak", label: "Weak (first fights)", level: 1, maxHP: 20, attack: 8, defend: 2, speed: 6, money: 5, exp: 4 },
  { id: "normal", label: "Normal", level: 3, maxHP: 45, attack: 12, defend: 5, speed: 8, money: 12, exp: 10 },
  { id: "strong", label: "Strong", level: 6, maxHP: 110, attack: 18, defend: 9, speed: 10, money: 40, exp: 30 },
  { id: "boss", label: "Boss", level: 10, maxHP: 400, attack: 26, defend: 14, speed: 12, money: 200, exp: 150 },
] as const;

/** A new monster from a template. */
export function newMonster(p: Project, o: { name: string; sprite: number; template: string }): { change: Change; index: number } {
  const t = MONSTER_TEMPLATES.find((x) => x.id === o.template) ?? MONSTER_TEMPLATES[0];
  const name = o.name.trim() || "Monster";
  if (textCells(name) > 12) throw new Error("a monster's name holds 12 letters (6 Chinese characters)");
  const index = freeIndex(p.archive, 3, 3);
  const { id: _id, label: _label, ...stats } = t;
  return { index, change: { key: resKey(3, 3, index), data: encodeMonster({ index, name, sprite: o.sprite, ...stats }) } };
}

const FIGHT_OPS = new Set(["initfight", "fightenable", "fightdisenable"]);

export interface RandomBattleOptions {
  map: string;
  /** Up to 8 monsters (3-3-n). */
  monsters: number[];
  /** Battle background (picture 4-n), 0 none. */
  background: number;
  /** Turn random battles off on the maps whose scripts say nothing about them. */
  othersOff: boolean;
}

/** Random battles on a map: `initfight` and `fightenable` in the start code of the script that sets it up. */
export function randomBattles(p: Project, o: RandomBattleOptions): WizardResult {
  if (!o.monsters.length) throw new Error("pick at least one monster");
  if (o.monsters.length > 8) throw new Error("random battles take up to 8 monsters");
  const world = projectWorld(p);
  const script = setupScript(world, o.map);
  const [, mt, mi] = o.map.split("-").map(Number);
  if (!script || !loadsWhenStarting(parseScript(p.texts[script]), { type: mt, index: mi })) throw new Error("no script shows this map when it starts: join it to another map with an exit first");
  const values = [...o.monsters, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8);
  let m = parseScript(p.texts[script]);
  const sg = startGroup(m);
  const existing = sg ? m.steps.slice(sg.from, sg.to).find((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "initfight") : undefined;
  if (existing) {
    values.forEach((v, k) => (m = setOperand(m, existing.id, k, v)));
    m = setOperand(m, existing.id, 8, o.background);
  } else m = insertLines(m, startPlacement(m), [instructionLine("initfight", [...values, o.background, 0, 0]), instructionLine("fightenable", [])]).model;
  const after: Texts = { [script]: toSource(m) };
  let off = 0;
  if (o.othersOff) {
    for (const [k, info] of world.scripts) {
      if (k === script || !info.maps.length) continue;
      const om = parseScript(p.texts[k] ?? info.source);
      const g = startGroup(om);
      if (!g || !info.maps.some((mk) => loadsWhenStarting(om, { type: Number(mk.split("-")[1]), index: Number(mk.split("-")[2]) }))) continue;
      if (om.steps.some((s) => s.kind === "instruction" && FIGHT_OPS.has(s.op.name))) continue;
      const entry = entryStep(om);
      after[k] = toSource(insertLines(om, { before: om.steps[entry].id }, [instructionLine("fightdisenable", [])]).model);
      off++;
    }
  }
  return {
    changes: scriptChanges(p.texts, after),
    open: { key: o.map, mode: "map.world" },
    message: `Random battles on ${world.maps.get(o.map)?.name ?? "the map"} with ${o.monsters.length} kind${o.monsters.length === 1 ? "" : "s"} of monster${off ? `; ${off} other script${off === 1 ? " turns" : "s turn"} them off on ${off === 1 ? "its map" : "their maps"}` : ""}.`,
  };
}

export interface BattleOptions {
  script: string;
  id: number;
  name: string;
  /** Up to 3 monsters. */
  monsters: number[];
  background: number;
  /** Said after a win (empty: nothing). */
  winLine: string;
  /** Losing ends the game (else the event just ends). */
  loseEnds: boolean;
  /** Fight only once: a story flag remembers the win. */
  onceFlag: number | null;
}

/** Talking to a person starts a battle: `enterfight` where their event ends, then the win line; losing ends the game. */
export function addBattle(p: Project, o: BattleOptions): WizardResult {
  if (!o.monsters.length || o.monsters.length > 3) throw new Error("a battle has 1-3 monsters");
  const text = p.texts[o.script];
  if (text === undefined) throw new Error(`script ${o.script} does not exist`);
  let m = parseScript(text);
  const base = `fight_${slug(o.name)}`;
  const ev = m.events.find((e) => e.number === o.id);
  if (!ev) m = addEvent(m, o.id, uniqueLabel(m, `talk_${slug(o.name)}`), [instructionLine("facetoface", [0, o.id]), "  callback"]);
  const label = m.events.find((e) => e.number === o.id)!.label;
  if (!label) throw new Error(`#${o.id}'s event is not code the editor can change`);
  const [win, lose, doneLabel] = freshLabels(m, [`${base}_won`, `${base}_lost`, `${base}_done`]);
  const done = o.onceFlag !== null ? doneLabel : null;
  const mons = [...o.monsters, 0, 0, 0].slice(0, 3);
  const at = mainEnd(m, label);
  const line = m.steps[Math.min(at, m.steps.length - 1)]?.line ?? 1;
  m = insertAt(m, at, [
    ...(done ? [instructionLine("if", [o.onceFlag!, done])] : []),
    instructionLine("enterfight", [0, ...mons, o.background, 0, 0, 0, 0, 0, 0, 0, 0, lose, win]),
    `@${win}:`,
    ...(done ? [instructionLine("setevent", [o.onceFlag!])] : []),
    ...(o.winLine.trim() ? [instructionLine("say", [0, sayText(`${o.name}: ${o.winLine.trim()}`, 0)])] : []),
    ...(done ? [`@${done}:`] : []),
  ]);
  // the lose arm after the event's code
  const g = eventGroup(m, o.id)!;
  m = insertAt(m, g.to, [`@${lose}:`, o.loseEnds ? "  gameover" : "  callback"]);
  const source = toSource(m);
  return {
    changes: [{ key: o.script, data: assemble(source), source }],
    open: { key: o.script, mode: "visual", line },
    message: `Talking to ${o.name} starts a battle${o.onceFlag !== null ? " (once: a story flag remembers the win)" : ""}.`,
  };
}

// ---------------------------------------------------------------------------
// Play from here

/** A variable nothing uses (0-199 last the whole game). */
function freeVariable(used: ReadonlySet<number>): number {
  for (let v = 199; v >= 0; v--) if (!used.has(v)) return v;
  throw new Error("every variable is used");
}

/** Whether a script's last code line goes on into what follows it. */
function runsOn(model: ScriptModel): boolean {
  for (let i = model.steps.length - 1; i >= 0; i--) {
    const s = model.steps[i];
    if (s.kind === "instruction") return !(s.command.flow === "end" || s.command.flow === "jump" || s.command.flow === "battle");
    if (s.kind === "data" || s.kind === "raw") return true;
  }
  return false;
}

export interface PlayFromHere {
  archive: LibArchive;
  /** How the copy starts, for the author. */
  note: string;
}

/**
 * A copy of the archive whose new game starts with the party on map tile
 * x, y of a map, the map set up by its own script (its people are there):
 * the start (script 1-1) jumps, the first time only, to a few lines that
 * create the leader and switch to the map's script with a variable telling
 * it to show the map there (an arrival, as exits use). The start map with
 * its own start only moves the start. Flags and variables start at 0.
 */
export function playFromHere(p: Project, mapKey: string, x: number, y: number): PlayFromHere {
  const world = projectWorld(p);
  const { map } = mapOf(p.archive, mapKey);
  if (!inPlayerBand(x, y, map.width, map.height)) throw new Error("the player cannot stand that close to the edge of the map");
  const startKey = "1-1-1";
  if (p.texts[startKey] === undefined && !findEntry(p.archive, 1, 1, 1)) throw new Error("there is no script 1-1 to start the game with");
  const texts: Texts = { ...p.texts };
  const st = world.start;
  const screen = st ? { screenX: st.screenX, screenY: st.screenY } : { screenX: 4, screenY: 3 };
  const pos = startPosition(screen, x, y, map.width, map.height);
  const member = (() => {
    if (!st?.actor) return 1;
    const s = world.scripts.get(st.actor.script)?.model.steps.find((t) => t.id === st.actor!.stepId);
    return s && s.kind === "instruction" ? (s.values[0] as number) : 1;
  })();
  const mapName = map.name || `map ${map.index}`;
  let note: string;
  if (st && st.map === mapKey && st.load.script === startKey && (!st.actor || st.actor.script === startKey)) {
    // the start map: only the start moves
    const t = moveStart({ [startKey]: texts[startKey] }, st, x, y, map.width, map.height);
    texts[startKey] = t[startKey];
    note = `A new game on ${mapName} at ${x}, ${y}, as the game starts (its start script runs as usual).`;
  } else {
    const used = new Set(world.variables.keys());
    const first = freeVariable(used);
    used.add(first);
    const script = setupScript(world, mapKey);
    const sm = script ? parseScript(texts[script]) : null;
    const here: string[] = [instructionLine("set", [first, 1])];
    if (script && sm && loadsWhenStarting(sm, { type: map.type, index: map.index })) {
      const v = arrivalVariable(sm, { type: map.type, index: map.index }, used);
      texts[script] = toSource(addArrival(sm, { type: map.type, index: map.index }, { x: pos.cameraX, y: pos.cameraY }, v, "playtest_here").model);
      const [, st2, si] = script.split("-").map(Number);
      here.push(instructionLine("createactor", [member, pos.actorX, pos.actorY]), instructionLine("set", [v.variable, v.value]), instructionLine("startchapter", [st2, si]));
      note = `A new game on ${mapName} at ${x}, ${y}, set up by script ${st2}-${si} as when the party arrives there.`;
    } else {
      here.push(instructionLine("loadmap", [map.type, map.index, pos.cameraX, pos.cameraY]), instructionLine("createactor", [member, pos.actorX, pos.actorY]), "  callback");
      note = `A new game on ${mapName} at ${x}, ${y}. No script sets this map up when it starts, so nobody is placed on it.`;
    }
    // the start jumps there the first time (the variable is 0 at a new game)
    let s1 = parseScript(texts[startKey]);
    const label = uniqueLabel(s1, "playtest_here");
    const entry = entryStep(s1);
    if (entry < 0) throw new Error("script 1-1 has no code");
    s1 = insertLines(s1, { before: s1.steps[entry].id }, [instructionLine("ifcmp", [first, 0, label])]).model;
    s1 = insertLines(s1, "end", [...(runsOn(s1) ? ["  callback"] : []), "", `@${label}:`, ...here]).model;
    texts[startKey] = toSource(s1);
  }
  const out: LibArchive = { ...p.archive, entries: [...p.archive.entries] };
  for (const [k, t] of Object.entries(texts)) {
    if (t === p.texts[k]) continue;
    const [, type, index] = k.split("-").map(Number);
    putEntry(out, { resType: 1, type, index, data: assemble(t) });
  }
  return { archive: out, note: `${note} Story flags and variables start as in a new game (all clear).` };
}
