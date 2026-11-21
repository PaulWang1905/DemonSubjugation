// The world on a map, for the World view (src/editor/ui/WorldView.tsx):
// what to draw over a map (who stands where, as which sprite frame; the
// player's start and the arrivals from other maps; event cells and what
// handles them; exits), what each thing is in plain words, and the edits the
// view makes to the scripts that set the map up (move, add a person, a chest,
// an exit, start the game here, delete), plus the layout of the world map
// (every map as a box, exits as arrows).
//
// Everything here is pure: it reads a WorldIndex (world.ts) and script models
// (scriptModel.ts) and returns new script text through the model's edits,
// which leave the lines they are not about exactly as they were.
//
// Engine facts used (src/engine/fmj):
// - createnpc / createbox put a person / object at a MAP tile; it is drawn with
//   its walking sprite (ACP 2-n for people, 4-n for objects, byte 0x16 of the
//   resource), frame `offset + [0,1,2,1][step]` where offset is 1 (north),
//   4 (east), 7 (south), 10 (west) from the resource's facing (byte 2; objects
//   always face north) and step is byte 3 — bottom-aligned on its tile.
//   boxopen sets step 1: an object's second frame (an open chest).
// - Facing a person / object and pressing OK runs event `id` of the running
//   script; walking into (or facing) a map cell with event n runs event 40 + n.
// - The leader keeps its place on the screen: loadmap only moves the view, so
//   an exit that lands on map tile x, y loads the map with the view at
//   (x, y) - the leader's screen place (4, 3 in practice: createactor at the
//   start sets it). createactor ADDS a party member, so exits must not use it.
// - The player can only stand 4 tiles in from the left and right edges, 3 from
//   the top and 2 from the bottom (ResMap.canPlayerWalk).
// - startchapter starts another script at its first instruction; people and
//   objects are cleared, the party and the view stay, variables 0-199 stay.
import { sentence, type NameResolver } from "./commands";
import { playerStart, SCREEN_TILES } from "./scriptHelp";
import {
  addEvent,
  addPlacement,
  deleteSteps,
  entryStep,
  eventGroup,
  insertLines,
  instructionLine,
  labelTarget,
  successors,
  parseScript,
  setOperand,
  startPlacement,
  toSource,
  uniqueLabel,
  usedIds,
  type EventGroup,
  type InstructionStep,
  type Position,
  type ScriptModel,
  type Step,
} from "./scriptModel";
import { findEntry, type LibArchive } from "./lib";
import { resKey, type Exit, type MapInfo, type Placement, type PlayerStart, type Where, type WorldIndex } from "./world";
import { SAY_PLAIN, SAY_WITH_PORTRAIT, wrapForBox, wrapMessage } from "./text";

// ---------------------------------------------------------------------------
// Sprites

/** frame = offset + STEP_OFFSET[step], offset by facing (engine WalkingSprite). */
const STEP_OFFSET = [0, 1, 2, 1];
const FACING_OFFSET: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };

/** The sprite (ACP key) and 0-based frame the engine draws a character resource with, standing. */
export function standingSprite(archive: LibArchive, resource: string): { sprite: string; frame: number } | null {
  const [rt, type, index] = resource.split("-").map(Number);
  if (rt !== 3 || (type !== 1 && type !== 2 && type !== 4)) return null;
  const e = findEntry(archive, 3, type, index);
  if (!e || e.data.length <= 0x16) return null;
  const sprite = e.data[0x16];
  if (!sprite) return null;
  // objects always face north; others as stored (an odd value: north)
  const facing = type === 4 ? 1 : (FACING_OFFSET[e.data[2]] ? e.data[2] : 1);
  const step = e.data[3] % 4;
  return { sprite: resKey(8, type, sprite), frame: FACING_OFFSET[facing] - 1 + STEP_OFFSET[step] };
}

// ---------------------------------------------------------------------------
// Positions

/** Whether the player can stand on map tile x, y at all (the engine keeps the leader off the edges). */
export function inPlayerBand(x: number, y: number, w: number, h: number): boolean {
  return x >= 4 && x < w - 4 && y >= 3 && y < h - 2;
}

/** The view (loadmap's camera) that puts the leader on map tile x, y, the leader keeping its screen place. */
export function arrivalCamera(x: number, y: number, screen: { x: number; y: number }): { x: number; y: number } {
  return { x: x - screen.x, y: y - screen.y };
}

/**
 * Where a new game's loadmap / createactor should put the view and the leader
 * so the leader starts on tile x, y: the leader keeps its screen place when
 * the view stays inside the map, else (playerStart) near the screen's middle.
 */
export function startPosition(start: Pick<PlayerStart, "screenX" | "screenY">, x: number, y: number, w: number, h: number): { cameraX: number; cameraY: number; actorX: number; actorY: number } {
  const cx = x - start.screenX;
  const cy = y - start.screenY;
  if (cx >= 0 && cy >= 0 && cx <= Math.max(0, w - SCREEN_TILES.w) && cy <= Math.max(0, h - SCREEN_TILES.h)) return { cameraX: cx, cameraY: cy, actorX: start.screenX, actorY: start.screenY };
  const p = playerStart(x, y, w, h);
  return { cameraX: p.screenX, cameraY: p.screenY, actorX: p.actorX, actorY: p.actorY };
}

// ---------------------------------------------------------------------------
// What is on a map

/** A script that sets a map up (shows it and places its people). */
export interface MapSetup {
  script: string;
  /** "Bellhaven (script 1-1)" */
  label: string;
  /** "when it starts", "in @door" */
  where: string;
  /** The loadmap lines of this script that show the map. */
  loads: Where[];
}

/** The scripts that set a map up: the start's script first, then those that load it when they start. */
export function mapSetups(world: WorldIndex, mapKey: string): MapSetup[] {
  const map = world.maps.get(mapKey);
  if (!map) return [];
  const by = new Map<string, Where[]>();
  for (const l of map.loadedBy) by.set(l.script, [...(by.get(l.script) ?? []), l]);
  for (const p of map.people) if (!by.has(p.script)) by.set(p.script, []);
  const out = [...by].map(([script, loads]): MapSetup => {
    const info = world.scripts.get(script);
    const name = info?.model.header.desc?.trim() || "";
    const [, type, index] = script.split("-");
    const groups = [...new Set(loads.map((l) => (l.start ? "when it starts" : l.group ? `in @${l.group}` : "")))].filter(Boolean);
    return { script, label: `${name || "Script"} (script ${type}-${index})`, where: groups.join(", ") || "when it runs", loads };
  });
  const rank = (s: MapSetup) => (world.start?.load.script === s.script && world.start.map === mapKey ? 0 : s.loads.some((l) => l.start) ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** What an event's code does, in a word or two ("→ WHISPERWOOD", "shop", "message"). */
export function handlerPhrase(model: ScriptModel, label: string | null, exit?: Exit, mapName?: (key: string) => string): string {
  if (exit) {
    const names = [...new Set(exit.targets.map((t) => (mapName ? mapName(t.map) : t.map)))];
    return `→ ${names.join(" / ")}${exit.targets.length === 1 && exit.targets[0].certain ? "" : "?"}`;
  }
  const steps = eventInstructions(model, label);
  const has = (...names: string[]) => steps.some((s) => names.includes(s.op.name));
  if (has("buy", "sale")) return "shop";
  if (has("enterfight")) return "battle";
  if (has("gaingoods", "gainmoney")) return "gives something";
  if (has("startchapter", "callchapter")) return "next scene";
  if (has("say", "message", "timemsg", "choice")) return "message";
  return "script";
}

/** The instructions an event can run, from its label, within its group (in text order). */
export function eventInstructions(model: ScriptModel, label: string | null): InstructionStep[] {
  if (!label) return [];
  const t = labelTarget(model, label);
  if (t < 0) return [];
  const g = model.groups.find((x) => t >= x.from && t < x.to);
  const from = g ? g.from : 0;
  const end = g ? g.to : model.steps.length;
  const seen = new Set<number>([t]);
  const stack = [t];
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of successors(model, i)) if (n >= from && n < end && !seen.has(n)) (seen.add(n), stack.push(n));
  }
  return [...seen]
    .sort((a, b) => a - b)
    .map((i) => model.steps[i])
    .filter((s): s is InstructionStep => s.kind === "instruction");
}

/** The first line said in an event (say / message), for "Talking to her: …" and editing it in place. */
export function firstLine(model: ScriptModel, label: string | null): { stepId: number; line: number; text: string; portrait: number; kind: "say" | "message" } | null {
  for (const s of eventInstructions(model, label)) {
    if (s.op.name === "say") return { stepId: s.id, line: s.line, text: collapse(String(s.values[1])), portrait: s.values[0] as number, kind: "say" };
    if (s.op.name === "message") return { stepId: s.id, line: s.line, text: collapse(String(s.values[0])), portrait: 0, kind: "message" };
  }
  return null;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** The first few steps of an event in words. */
export function eventSummary(model: ScriptModel, label: string | null, names: NameResolver = {}, max = 4): { lines: string[]; more: number } {
  const steps = eventInstructions(model, label);
  const lines = steps.slice(0, max).map((s) => sentence(s.op.name, s.values, names).text);
  return { lines, more: Math.max(0, steps.length - max) };
}

/** The line of a label's definition (1-based), or 0. */
export function labelLine(model: ScriptModel, label: string | null): number {
  if (!label) return 0;
  const at = model.labels.get(label);
  return at === undefined ? 0 : model.steps[at].line;
}

/** Why a placement happens only on some paths: the last branch before it in its event, in words. */
export function placementCondition(model: ScriptModel, p: Placement, names: NameResolver = {}): string | null {
  if (!p.conditional) return null;
  const i = model.steps.findIndex((s) => s.id === p.stepId);
  const g = model.groups.find((x) => i >= x.from && i < x.to);
  for (let j = i - 1; j >= (g?.from ?? 0); j--) {
    const s = model.steps[j];
    if (s.kind === "instruction" && s.command.flow === "branch") return `${sentence(s.op.name, s.values, names).text} (line ${s.line})`;
  }
  return "it depends on the way the script gets here";
}

export interface OverlayPerson {
  placement: Placement;
  /** The sprite (ACP key) and frame drawn for it. */
  sprite: { sprite: string; frame: number } | null;
  /** The event run when talked to (its label), if the script has one. */
  label: string | null;
}

export interface OverlayCell {
  mapEvent: number;
  cells: { x: number; y: number }[];
  /** This setup's handler (its label), or null when none handles it. */
  label: string | null;
  exit?: Exit;
  phrase: string;
}

export interface Arrival {
  x: number;
  y: number;
  /** The map the exit is on, and the exit. */
  from: string;
  exit: Exit;
  certain: boolean;
}

export interface Overlay {
  people: OverlayPerson[];
  /** The new game's start, when it is on this map. */
  start: PlayerStart | null;
  arrivals: Arrival[];
  cells: OverlayCell[];
  exits: Exit[];
}

/** What to draw over a map for one setup (null: every script's). */
export function mapOverlay(world: WorldIndex, archive: LibArchive, mapKey: string, setup: string | null): Overlay {
  const map = world.maps.get(mapKey);
  if (!map) return { people: [], start: null, arrivals: [], cells: [], exits: [] };
  const mine = (script: string) => setup === null || script === setup;
  const model = setup ? world.scripts.get(setup)?.model : undefined;
  const people = map.people
    .filter((p) => mine(p.script))
    .map((p) => {
      const m = world.scripts.get(p.script)?.model;
      return { placement: p, sprite: standingSprite(archive, p.resource), label: m?.events.find((e) => e.number === p.id)?.label ?? null };
    });
  const exits = map.exits.filter((e) => mine(e.script) && e.trigger.kind === "tile");
  const name = (k: string) => world.maps.get(k)?.name || k;
  const cells = map.eventCells.map((c): OverlayCell => {
    const h = c.handlers.find((x) => mine(x.script)) ?? null;
    const exit = h ? exits.find((e) => e.script === h.script && e.event === c.mapEvent + 40) : undefined;
    const m = h ? world.scripts.get(h.script)?.model : model;
    return { mapEvent: c.mapEvent, cells: c.cells, label: h?.label ?? null, exit, phrase: h && m ? handlerPhrase(m, h.label, exit, name) : "nothing handles it" };
  });
  const arrivals: Arrival[] = [];
  for (const e of map.entrances) for (const t of e.targets) if (t.map === mapKey && t.x !== null && t.y !== null && !arrivals.some((a) => a.x === t.x && a.y === t.y && a.from === e.from)) arrivals.push({ x: t.x, y: t.y!, from: e.from, exit: e, certain: t.certain });
  const start = world.start && world.start.map === mapKey ? world.start : null;
  return { people, start, arrivals, cells, exits };
}

// ---------------------------------------------------------------------------
// Edits on script texts

/** Script texts by key. */
export type Texts = Record<string, string>;

function edit(texts: Texts, key: string, fn: (m: ScriptModel) => ScriptModel): Texts {
  const src = texts[key];
  if (src === undefined) throw new Error(`script ${key} is not open for editing`);
  return { ...texts, [key]: toSource(fn(parseScript(src))) };
}

/** Move the person / object placed on line `stepId` to map tile x, y. */
export function movePlacement(model: ScriptModel, stepId: number, x: number, y: number): ScriptModel {
  const s = model.steps.find((t) => t.id === stepId);
  if (!s || s.kind !== "instruction" || (s.op.name !== "createnpc" && s.op.name !== "createbox")) throw new Error("that line no longer places anyone");
  let m = setOperand(model, stepId, 2, x);
  m = setOperand(m, stepId, 3, y);
  return m;
}

/** Start a new game on map tile x, y of the start's map: its loadmap's view and its createactor's screen place. */
export function moveStart(texts: Texts, start: PlayerStart, x: number, y: number, w: number, h: number): Texts {
  const p = startPosition(start, x, y, w, h);
  let out = edit(texts, start.load.script, (m) => setOperand(setOperand(m, start.load.stepId, 2, p.cameraX), start.load.stepId, 3, p.cameraY));
  if (start.actor) out = edit(out, start.actor.script, (m) => setOperand(setOperand(m, start.actor!.stepId, 1, p.actorX), start.actor!.stepId, 2, p.actorY));
  else if (p.actorX !== 4 || p.actorY !== 3) throw new Error("there is no createactor to put the leader on the screen");
  return out;
}

/**
 * Where a new person / object goes in a script so they stand on the map it
 * shows at `load`: after the last unconditional placement of that map in the
 * same code, else where startPlacement says (start code), else just after
 * the loadmap (and the createactor lines that follow it).
 */
export function placementPosition(model: ScriptModel, world: WorldIndex | null, mapKey: string, load: Where | null): Position {
  const map = world?.maps.get(mapKey);
  const script = load?.script;
  const same = map?.people.filter((p) => p.script === script && !p.conditional && p.group === load?.group && model.steps.some((s) => s.id === p.stepId)) ?? [];
  if (same.length) {
    const last = same.reduce((a, b) => (b.line > a.line ? b : a));
    return { after: last.stepId };
  }
  if (!load || load.start) return startPlacement(model);
  let i = model.steps.findIndex((s) => s.id === load.stepId);
  if (i < 0) return startPlacement(model);
  for (let j = i + 1; j < model.steps.length; j++) {
    const s = model.steps[j];
    if (s.kind === "instruction" && s.op.name === "createactor" && !s.label) i = j;
    else if (s.kind === "instruction" || s.label) break;
  }
  return { after: model.steps[i].id };
}

/** A label-friendly word from a name ("Old man" → old_man). */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "x"
  );
}

/** A say line's text wrapped for the box (11 then 15 letters with a portrait, 15 without). */
export function sayText(text: string, portrait: number): string {
  return wrapForBox(collapse(text), portrait ? SAY_WITH_PORTRAIT : SAY_PLAIN);
}

/** Change the text of a say / message line (wrapped for its box). */
export function setLineText(model: ScriptModel, stepId: number, text: string): ScriptModel {
  const s = model.steps.find((t) => t.id === stepId);
  if (!s || s.kind !== "instruction") throw new Error("that line is gone");
  if (s.op.name === "say") return setOperand(model, stepId, 1, sayText(text, s.values[0] as number));
  if (s.op.name === "message") return setOperand(model, stepId, 0, wrapMessage(collapse(text)));
  throw new Error("that line says nothing");
}

/** Add a person who talks: createnpc and an event that turns them to the player and says `text`. */
export function addPerson(model: ScriptModel, o: { npc: number; name: string; x: number; y: number; at: Position; text: string }): { model: ScriptModel; id: number; label: string } {
  const id = freeId40(model);
  const label = uniqueLabel(model, `talk_${slug(o.name)}`);
  const body = [instructionLine("facetoface", [0, id]), instructionLine("say", [0, sayText(o.text, 0)]), "  callback"];
  return addPlacement(model, { kind: "person", resource: o.npc, x: o.x, y: o.y, id, label, body, at: o.at });
}

function freeId40(model: ScriptModel): number {
  const used = usedIds(model);
  for (let i = 1; i <= 40; i++) if (!used.has(i) && !model.events.some((e) => e.number === i)) return i;
  throw new Error("this script already places 40 people and objects (ids 1-40)");
}

/**
 * Add a chest (or another object): createbox, shown open again when `flag`
 * is set; facing it and pressing OK opens it once, gives the item (the game
 * shows "Got: …") and sets the flag; afterwards it is empty. Without an item
 * it shows `text` (a sign, a lamp).
 */
export function addChest(
  model: ScriptModel,
  o: { box: number; name: string; x: number; y: number; at: Position; item: { type: number; index: number } | null; flag: number; text?: string },
): { model: ScriptModel; id: number; label: string } {
  const id = freeId40(model);
  const base = uniqueLabel(model, `${o.item ? "chest" : "look"}_${slug(o.name)}`);
  if (!o.item) {
    const body = [instructionLine("message", [wrapMessage(collapse(o.text || `It's a ${o.name.toLowerCase() || "thing"}.`))]), "  callback"];
    return addPlacement(model, { kind: "object", resource: o.box, x: o.x, y: o.y, id, label: base, body, at: o.at });
  }
  const empty = `${base}_empty`;
  const body = [
    instructionLine("if", [o.flag, empty]),
    instructionLine("boxopen", [id]),
    instructionLine("gaingoods", [o.item.type, o.item.index]),
    instructionLine("setevent", [o.flag]),
    "  callback",
    `@${empty}:`,
    instructionLine("message", [wrapMessage("The chest is empty.")]),
    "  callback",
  ];
  const r = addPlacement(model, { kind: "object", resource: o.box, x: o.x, y: o.y, id, label: base, body, at: o.at });
  // shown open when the script starts again after it was opened
  const box = r.model.steps.find((s) => s.kind === "instruction" && s.op.name === "createbox" && s.values[0] === id)!;
  const open = uniqueLabel(r.model, `${base}_open`);
  const shut = uniqueLabel(r.model, `${base}_shut`);
  const m = insertLines(r.model, { after: box.id }, [instructionLine("if", [o.flag, open]), instructionLine("goto", [shut]), `@${open}:`, instructionLine("boxopen", [id]), `@${shut}:`]).model;
  return { model: m, id, label: base };
}

/** A story flag nothing uses yet (and the notes do not name). */
export function freeFlag(world: WorldIndex, named: Iterable<string> = []): number {
  const taken = new Set([...world.flags.keys(), ...[...named].map(Number)]);
  for (let f = 1; f <= 2400; f++) if (!taken.has(f)) return f;
  throw new Error("every story flag is used");
}

/** A map event number free on a map: no cell uses it and no script showing the map has event 40 + n. */
export function freeCellEvent(models: ScriptModel[], cellsInUse: Iterable<number | undefined>): number {
  const used = new Set(cellsInUse);
  for (let n = 1; n <= 215; n++) if (!used.has(n) && models.every((m) => !m.events.some((e) => e.number === 40 + n))) return n;
  throw new Error("no free map event number");
}

/** A handler for a map event that does `body` (a tile that only shows a message, say). */
export function addCellHandler(model: ScriptModel, mapEvent: number, label: string, body: readonly string[]): ScriptModel {
  return addEvent(model, 40 + mapEvent, uniqueLabel(model, label), body);
}

// --- exits ------------------------------------------------------------------

/** A new script that sets a map up: it shows the map with the view at camera. */
export function newMapScript(index: number, map: { type: number; index: number; name: string }, camera: { x: number; y: number }): string {
  const desc = map.name.replace(/["\\]/g, "").slice(0, 20) || `map ${map.index}`;
  return [`.gut 1 ${index}`, `.desc "${desc}"`, ".events 40", "", "@start:", instructionLine("loadmap", [map.type, map.index, camera.x, camera.y]), "  callback", ""].join("\n");
}

/** The start code's first loadmap of a map (step index), or -1. */
function startLoad(model: ScriptModel, map: { type: number; index: number }): number {
  const g = model.groups.find((x) => x.start);
  if (!g) return -1;
  for (let i = g.from; i < g.to; i++) {
    const s = model.steps[i];
    if (s.kind === "instruction" && s.op.name === "loadmap" && s.values[0] === map.type && s.values[1] === map.index) return i;
  }
  return -1;
}

/** Whether a script's start code shows a map. */
export function loadsWhenStarting(model: ScriptModel, map: { type: number; index: number }): boolean {
  return startLoad(model, map) >= 0;
}

/**
 * How a script's start code tells arrivals apart: the variable compared
 * (`ifcmp v, k, @from_x`) before it shows the map, and the next free value;
 * else the lowest variable nothing uses, value 1.
 */
export function arrivalVariable(model: ScriptModel, map: { type: number; index: number }, used: ReadonlySet<number>): { variable: number; value: number } {
  const at = startLoad(model, map);
  const entry = entryStep(model);
  if (at >= 0 && entry >= 0) {
    const cmp = model.steps.slice(entry, at).filter((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "ifcmp");
    if (cmp.length) {
      const v = cmp[0].values[0] as number;
      const taken = model.steps.filter((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "ifcmp" && s.values[0] === v).map((s) => s.values[1] as number);
      return { variable: v, value: Math.max(0, ...taken) + 1 };
    }
  }
  for (let v = 0; v < 200; v++) if (!used.has(v)) return { variable: v, value: 1 };
  throw new Error("no free variable");
}

/**
 * Make a script's start code put the view at `camera` when variable v = k on
 * arrival: `ifcmp v, k, @arrive` before its first decision (or its loadmap),
 * and at the end `@arrive: loadmap …; set v, 0; goto @join`, where join is
 * where the usual way goes on after showing the map (after its createactor
 * lines, which a new game needs and an arrival must not repeat).
 */
export function addArrival(model: ScriptModel, map: { type: number; index: number }, camera: { x: number; y: number }, v: { variable: number; value: number }, name: string): { model: ScriptModel; label: string } {
  let m = model;
  let at = startLoad(m, map);
  if (at < 0) throw new Error("this script does not show the map when it starts");
  const label = uniqueLabel(m, `arrive_${slug(name)}`);
  // where the usual way goes on
  let j = at + 1;
  while (j < m.steps.length) {
    const s = m.steps[j];
    if (s.label) break;
    if (s.kind === "instruction" && s.op.name === "createactor") j++;
    else if (s.kind === "instruction" || s.kind === "data" || s.kind === "raw") break;
    else j++;
  }
  let join: string;
  const next = m.steps[j];
  if (next && next.label) join = next.label;
  else if (next && next.kind === "instruction" && next.op.name === "goto" && typeof next.values[0] === "string") join = next.values[0] as string;
  else {
    join = uniqueLabel(m, `${label}_join`);
    m = next ? insertLines(m, { before: next.id }, [`@${join}:`]).model : insertLines(m, "end", [`@${join}:`, "  callback"]).model;
  }
  // the decision, before the first branch (or the loadmap) of the start code
  at = startLoad(m, map);
  const entry = entryStep(m);
  let first = at;
  for (let i = entry; i >= 0 && i < at; i++) {
    const s = m.steps[i];
    if (s.kind === "instruction" && (s.command.flow === "branch" || s.command.flow === "jump")) {
      first = i;
      break;
    }
  }
  m = insertLines(m, { before: m.steps[first].id }, [instructionLine("ifcmp", [v.variable, v.value, label])]).model;
  // the arrival's own code: at the end of the start code (so it stays part of
  // it), else, when the start code runs on into the first event, at the end
  const code = [`@${label}:`, instructionLine("loadmap", [map.type, map.index, camera.x, camera.y]), instructionLine("set", [v.variable, 0]), instructionLine("goto", [join])];
  const sg = m.groups.find((g) => g.start);
  const lastIn = (from: number, to: number) => {
    for (let i = to - 1; i >= from; i--) if (m.steps[i].kind === "instruction" || m.steps[i].kind === "data") return m.steps[i];
    return undefined;
  };
  const endsHere = (s: Step | undefined) => !s || s.kind !== "instruction" || !(s.command.flow === "next" || s.command.flow === "branch" || s.command.flow === "call");
  if (sg && sg.to < m.steps.length && !sg.fallsInto && endsHere(lastIn(sg.from, sg.to))) {
    m = insertLines(m, { before: m.steps[sg.to].id }, [...code, ""]).model;
  } else {
    const tail: string[] = [];
    if (!endsHere(lastIn(0, m.steps.length))) tail.push("  callback");
    if (m.steps.length && m.steps[m.steps.length - 1].kind !== "blank") tail.push("");
    m = insertLines(m, "end", [...tail, ...code]).model;
  }
  return { model: m, label };
}

export interface ExitSpec {
  /** The script that handles the exit cell's event. */
  fromScript: string;
  /** The map event number painted on the exit cell (event 40 + n). */
  mapEvent: number;
  toMap: { type: number; index: number; name: string };
  /** Where the leader lands: the view that puts it there (arrivalCamera). */
  camera: { x: number; y: number };
  /**
   * The script that sets the target map up: an existing one (which learns the
   * arrival), a new one (`exists: false`, its text made here), or null when
   * the exit stays on the same map (only the view moves).
   */
  toScript: { key: string; exists: boolean } | null;
  /** Variables any script uses (for the arrival's variable). */
  usedVariables: ReadonlySet<number>;
  /** The name of the map the exit is on (for the arrival's label). */
  fromName?: string;
}

/** Add an exit: the cell's handler in fromScript and, for another map, the arrival in its script. */
export function addExit(texts: Texts, spec: ExitSpec): { texts: Texts; label: string; arrival?: string; variable?: { variable: number; value: number } } {
  const from = parseScript(texts[spec.fromScript] ?? "");
  if (texts[spec.fromScript] === undefined) throw new Error(`script ${spec.fromScript} is not open for editing`);
  const label = uniqueLabel(from, `to_${slug(spec.toMap.name)}`);
  const { type, index } = spec.toMap;
  if (!spec.toScript) {
    const body = [instructionLine("loadmap", [type, index, spec.camera.x, spec.camera.y]), "  callback"];
    return { texts: { ...texts, [spec.fromScript]: toSource(addEvent(from, 40 + spec.mapEvent, label, body)) }, label };
  }
  const [, st, si] = spec.toScript.key.split("-").map(Number);
  if (!spec.toScript.exists) {
    const body = [instructionLine("startchapter", [st, si])];
    return {
      texts: { ...texts, [spec.fromScript]: toSource(addEvent(from, 40 + spec.mapEvent, label, body)), [spec.toScript.key]: newMapScript(si, spec.toMap, spec.camera) },
      label,
    };
  }
  const target = texts[spec.toScript.key];
  if (target === undefined) throw new Error(`script ${spec.toScript.key} is not open for editing`);
  const v = arrivalVariable(parseScript(target), spec.toMap, spec.usedVariables);
  const body = [instructionLine("set", [v.variable, v.value]), instructionLine("startchapter", [st, si])];
  let out: Texts = { ...texts, [spec.fromScript]: toSource(addEvent(from, 40 + spec.mapEvent, label, body)) };
  // (the same script may set both maps up)
  const arrive = addArrival(parseScript(out[spec.toScript.key]), spec.toMap, spec.camera, v, `from_${slug(spec.fromName ?? "elsewhere")}`);
  out = { ...out, [spec.toScript.key]: toSource(arrive.model) };
  return { texts: out, label, arrival: arrive.label, variable: v };
}

/** A tile next to (x, y) the player can stand on, for arriving beside an exit (else the tile itself). */
export function besideExit(x: number, y: number, w: number, h: number, walkable: (x: number, y: number) => boolean): { x: number; y: number } {
  const order = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [dx, dy] of order) {
    const nx = x + dx;
    const ny = y + dy;
    if (inPlayerBand(nx, ny, w, h) && walkable(nx, ny)) return { x: nx, y: ny };
  }
  for (let r = 2; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (inPlayerBand(nx, ny, w, h) && walkable(nx, ny)) return { x: nx, y: ny };
      }
  return { x: Math.max(4, Math.min(w - 5, x)), y: Math.max(3, Math.min(h - 3, y)) };
}

// --- deleting -----------------------------------------------------------------

export interface PlacementUses {
  /** Lines that only act on this person here (npcmovemod, boxopen…), removed with it. */
  followUps: number[];
  /** The event run when talking to them, its label and its lines. */
  event: { number: number; label: string | null; steps: number[]; lines: [number, number] } | null;
  /** The event cannot go with it: why (another placement uses the id, other code jumps into it…). */
  keepEvent: string | null;
}

const ACTS_ON_ID = new Set(["npcmovemod", "boxopen", "npcstep", "move"]);

/** What goes with a placement when it is deleted. */
export function placementUses(model: ScriptModel, stepId: number): PlacementUses {
  const i = model.steps.findIndex((s) => s.id === stepId);
  const s = model.steps[i];
  if (!s || s.kind !== "instruction" || (s.op.name !== "createnpc" && s.op.name !== "createbox")) throw new Error("that line no longer places anyone");
  const id = s.values[0] as number;
  const g = model.groups.find((x) => i >= x.from && i < x.to);
  const placements = model.steps.filter((t) => t.kind === "instruction" && (t.op.name === "createnpc" || t.op.name === "createbox") && t.values[0] === id);
  const othersHere = placements.filter((t) => t.id !== stepId && g && model.steps.indexOf(t) >= g.from && model.steps.indexOf(t) < g.to);
  const followUps = othersHere.length
    ? []
    : model.steps
        .slice(g?.from ?? 0, g?.to ?? 0)
        .filter((t): t is InstructionStep => t.kind === "instruction" && !t.label && ACTS_ON_ID.has(t.op.name) && t.values[0] === id)
        .map((t) => t.id);
  const ev = model.events.find((e) => e.number === id);
  if (!ev) return { followUps, event: null, keepEvent: null };
  const eg: EventGroup | undefined = eventGroup(model, id);
  const at = (k: number) => model.steps[k].line;
  let keep: string | null = null;
  if (placements.length > 1) keep = `another line also places #${id} (line ${placements.find((t) => t.id !== stepId)!.line})`;
  else if (!eg || eg.start) keep = "its code is part of the start";
  else if (eg.events.length > 1) keep = `the same code also runs for event ${eg.events.filter((n) => n !== id).join(", ")}`;
  else if (eg.sharedLabels.length) keep = `other code jumps into it (@${eg.sharedLabels[0]})`;
  else if (model.groups.some((x) => x.fallsInto === eg.label)) keep = "the code above it runs on into it";
  else if (model.steps.some((t) => t.kind === "instruction" && (t.op.name === "event" || t.op.name === "seteventtimer") && t.values[0] === id)) keep = "another line runs it";
  const steps = eg && !keep ? model.steps.slice(eg.from, eg.to).map((t) => t.id) : [];
  return { followUps, event: { number: id, label: ev.label, steps, lines: eg ? [at(eg.from), at(eg.to - 1)] : [0, 0] }, keepEvent: keep };
}

/** Delete a placement (and what only it uses); with `withEvent`, also its event when nothing else needs it. */
export function deletePlacement(model: ScriptModel, stepId: number, withEvent: boolean): { model: ScriptModel; removed: number } {
  const u = placementUses(model, stepId);
  const ids = [stepId, ...u.followUps];
  if (withEvent && u.event && !u.keepEvent) {
    const ev = model.events.find((e) => e.number === u.event!.number)!;
    ids.push(ev.stepId, ...u.event.steps);
  }
  const set = new Set(ids);
  return { model: deleteSteps(model, [...set]), removed: set.size };
}

// ---------------------------------------------------------------------------
// The world map

export interface WorldNode {
  key: string;
  name: string;
  col: number;
  row: number;
  start: boolean;
}

export interface WorldEdge {
  from: string;
  to: string;
  /** There is an exit back too. */
  both: boolean;
}

export interface WorldLayout {
  nodes: WorldNode[];
  edges: WorldEdge[];
  cols: number;
  rows: number;
}

const DIRS: Record<string, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

/** Which side of a map an exit is on (from its cells). */
function exitSide(map: MapInfo | undefined, e: Exit): keyof typeof DIRS {
  const cells = e.trigger.kind === "tile" ? e.trigger.cells : [];
  if (!map || !cells.length) return "e";
  const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length / Math.max(1, map.width - 1) - 0.5;
  const cy = cells.reduce((a, c) => a + c.y, 0) / cells.length / Math.max(1, map.height - 1) - 0.5;
  return Math.abs(cx) >= Math.abs(cy) ? (cx >= 0 ? "e" : "w") : cy >= 0 ? "s" : "n";
}

/**
 * Lay the maps out on a grid: from the start map, each map an exit leads to
 * goes on the side of the exit (east of the map when the exit is on its east
 * edge), or the nearest free place; maps no exit reaches go on a row below.
 */
export function worldLayout(world: WorldIndex): WorldLayout {
  const keys = [...world.maps.keys()];
  const pairs = new Map<string, { from: string; to: string; side: keyof typeof DIRS }>();
  for (const e of world.exits) {
    for (const t of e.targets) {
      if (t.map === e.from || !world.maps.has(t.map) || !world.maps.has(e.from)) continue;
      const k = `${e.from}>${t.map}`;
      if (!pairs.has(k)) pairs.set(k, { from: e.from, to: t.map, side: exitSide(world.maps.get(e.from), e) });
    }
  }
  const edges: WorldEdge[] = [];
  for (const p of pairs.values()) {
    const back = pairs.has(`${p.to}>${p.from}`);
    if (back && p.from > p.to) continue;
    edges.push({ from: p.from, to: p.to, both: back });
  }
  const pos = new Map<string, [number, number]>();
  const taken = new Set<string>();
  const put = (k: string, c: number, r: number) => {
    pos.set(k, [c, r]);
    taken.add(`${c},${r}`);
  };
  const near = (c: number, r: number): [number, number] => {
    if (!taken.has(`${c},${r}`)) return [c, r];
    for (let d = 1; d < 50; d++)
      for (const [dc, dr] of [
        [0, d],
        [d, 0],
        [0, -d],
        [-d, 0],
        [d, d],
        [-d, d],
        [d, -d],
        [-d, -d],
      ])
        if (!taken.has(`${c + dc},${r + dr}`)) return [c + dc, r + dr];
    return [c, r + 50];
  };
  const first = world.start?.map && world.maps.has(world.start.map) ? world.start.map : keys[0];
  const queue: string[] = [];
  if (first) {
    put(first, 0, 0);
    queue.push(first);
  }
  const all = [...pairs.values()];
  while (queue.length) {
    const k = queue.shift()!;
    const [c, r] = pos.get(k)!;
    for (const p of all) {
      let other: string;
      let d: [number, number];
      if (p.from === k) {
        other = p.to;
        d = DIRS[p.side];
      } else if (p.to === k) {
        other = p.from;
        const [dc, dr] = DIRS[p.side];
        d = [-dc, -dr];
      } else continue;
      if (pos.has(other)) continue;
      const [nc, nr] = near(c + d[0], r + d[1]);
      put(other, nc, nr);
      queue.push(other);
    }
  }
  // normalise, then the maps no exit reaches on rows below
  const placed = [...pos.values()];
  const minC = Math.min(0, ...placed.map((p) => p[0]));
  const minR = Math.min(0, ...placed.map((p) => p[1]));
  for (const [k, [c, r]] of pos) pos.set(k, [c - minC, r - minR]);
  let rows = pos.size ? Math.max(...[...pos.values()].map((p) => p[1])) + 1 : 0;
  let cols = pos.size ? Math.max(...[...pos.values()].map((p) => p[0])) + 1 : 0;
  const rest = keys.filter((k) => !pos.has(k));
  const per = Math.max(cols, 4);
  rest.forEach((k, i) => pos.set(k, [i % per, rows + Math.floor(i / per)]));
  if (rest.length) {
    rows += Math.ceil(rest.length / per);
    cols = Math.max(cols, Math.min(per, rest.length));
  }
  const nodes = keys.map((k) => ({ key: k, name: world.maps.get(k)!.name, col: pos.get(k)![0], row: pos.get(k)![1], start: k === world.start?.map }));
  return { nodes, edges, cols, rows };
}
