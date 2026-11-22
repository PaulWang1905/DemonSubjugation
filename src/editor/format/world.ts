// The world of a project, as a player meets it, read from its scripts and
// resources: for every map the scripts that show it and where they put the
// view, who stands on it (createnpc / createbox, with the line that does it),
// which cells have events and what handles them, where its exits lead; the
// player's start; the story flags and variables used and where; and who
// refers to what, with a renumbering that updates every reference.
//
// How the engine runs scripts (src/engine/fmj/scene/ScreenMainGame.ts,
// script/ScriptVM.ts), which the index follows:
// - A new game clears every flag and variable and starts script 1-1 at its
//   first instruction (not at an event).
// - startchapter starts another script at its first instruction; the map,
//   the view and the party stay, people and objects are cleared, and so are
//   variables 200-239.
// - Talking to (or pressing OK facing) person / object n runs event n of the
//   running script; walking into, or facing, a map cell with event number n
//   runs event 40 + n of whichever script is running, which is often not the
//   one that showed the map: 伏魔记's doors show the next map and switch to
//   that map's own script (runningMaps, MapInfo.runBy).
// - The leader keeps its place on the screen: loadmap moves the view, and the
//   view follows the leader, so the leader stands on map tile view + its
//   screen place, set by the first createactor of the game (usually 4, 3).
import { decodeMap, resourceName, subTypeName } from "./decode";
import { assemble, scriptSource } from "./gut";
import { findEntry, type LibArchive, type LibEntry } from "./lib";
import { fieldsFor, readField, readMagicChain, writeField, type Field } from "./schema";
import { operandRefs, type NameResolver, type ResourceRef } from "./commands";
import {
  entryStep,
  labelTarget,
  parseScript,
  replaceSpan,
  successors,
  toSource,
  type EventGroup,
  type ScriptModel,
  type Span,
} from "./scriptModel";
import { flagName, moveResourceNote, resourceNote, variableName, type ProjectNotes } from "./notes";
import { Lru, projectMemo } from "./memo";

// ---------------------------------------------------------------------------
// Types

/** "resType-type-index", as the editor keys resources. */
export const resKey = (resType: number, type: number, index: number): string => `${resType}-${type}-${index}`;

/** Split a resource key. */
export function parseKey(key: string): { resType: number; type: number; index: number } {
  const [resType, type, index] = key.split("-").map(Number);
  return { resType, type, index };
}

/** A line of a script. */
export interface Where {
  /** The script's key ("1-1-2"). */
  script: string;
  stepId: number;
  /** 1-based line of the script's text. */
  line: number;
  /** The entry label of the event group the line is in (null: start code without a label). */
  group: string | null;
  /** The events that group runs (empty for the start code). */
  events: number[];
  /** The line is in the code run when the script starts. */
  start: boolean;
}

export interface ScriptInfo {
  key: string;
  entry: LibEntry;
  /** The text the editor shows (the author's, else a disassembly). */
  source: string;
  model: ScriptModel;
  /** The source is the author's own (not a disassembly). */
  authored: boolean;
  /** The maps this script shows (loadmap). */
  maps: string[];
  /** The maps it can be the running script on (its events run there; see MapInfo.runBy). */
  runsOn: string[];
}

/** Someone a script puts on a map. */
export interface Placement extends Where {
  kind: "person" | "object";
  /** The number 1-40 it is placed as (talking to it runs event `id`). */
  id: number;
  /** The NPC (3-2-n) or object (3-4-n) resource. */
  resource: string;
  name: string;
  x: number;
  y: number;
  /** The map it is placed on (null when the script loads none). */
  map: string | null;
  /** Not on every path of its code (it depends on a flag, a variable…). */
  conditional: boolean;
}

/** A loadmap: a script showing a map. */
export interface MapLoad extends Where {
  map: string;
  cameraX: number;
  cameraY: number;
}

/** Where a path through the scripts leaves the player. */
export interface Arrival {
  map: string;
  cameraX: number;
  cameraY: number;
  /** The leader's map tile (null when its screen place is unknown). */
  x: number | null;
  y: number | null;
  /** The loadmap that shows the map. */
  load: Where;
  /** The only place the event leads: every way through it ends here (no flag, choice or fight decides). */
  certain: boolean;
}

/** What makes an event run. */
export type Trigger = { kind: "tile"; mapEvent: number; cells: { x: number; y: number }[] } | { kind: "person"; id: number };

/** An event that takes the player to a map (or elsewhere on the same one). */
export interface Exit {
  /** The map the event is on. */
  from: string;
  trigger: Trigger;
  /** The script and event that run. */
  script: string;
  event: number;
  label: string | null;
  /** Where it can lead (several when flags or choices decide). */
  targets: Arrival[];
  /**
   * Some way through it leads where the index cannot follow: a switch to a
   * script that does not exist, or paths too many or too long to walk (the
   * map is then known only at run time). Such an exit may have no targets.
   */
  unknown?: boolean;
}

/** Map cells with one event number, and what runs there. */
export interface CellEvent {
  mapEvent: number;
  cells: { x: number; y: number }[];
  /** Scripts that can be running on the map (runBy) and handle event 40 + n. */
  handlers: { script: string; label: string | null; line: number }[];
}

export interface MapInfo {
  key: string;
  type: number;
  index: number;
  name: string;
  width: number;
  height: number;
  tileset: number;
  loadedBy: MapLoad[];
  /**
   * The scripts that can be the running one while the player walks here: those
   * whose code ends with the map shown (often not the one that loads it: a door
   * loads the map and switches to the map's own script). Their events handle
   * the map's cells.
   */
  runBy: string[];
  people: Placement[];
  /** deletenpc / deletebox lines while the map is shown. */
  removals: (Where & { id: number })[];
  eventCells: CellEvent[];
  exits: Exit[];
  /** Exits of other maps (and this one) that lead here. */
  entrances: Exit[];
}

/** Where a new game puts the player. */
export interface PlayerStart {
  /** The script running when the player first gets control. */
  script: string;
  map: string;
  cameraX: number;
  cameraY: number;
  screenX: number;
  screenY: number;
  /** The leader's map tile. */
  x: number;
  y: number;
  load: Where;
  /** The createactor that set the leader's screen place (null: none, 4, 3 assumed). */
  actor: Where | null;
  /** Flags set on the way (known set afterwards). */
  flagsSet: number[];
}

export interface FlagUse extends Partial<Where> {
  flag: number;
  access: "read" | "set" | "clear";
  /** A resource that uses it (an item that sets it while worn). */
  resource?: string;
}

export interface VariableUse extends Where {
  variable: number;
  access: "read" | "write" | "modify";
}

/** One place that refers to a resource. */
export interface Reference {
  /** The resource that refers ("1-1-2" a script, "3-3-4" a monster…). */
  from: string;
  /** The resource referred to (it may not exist). */
  target: string;
  /** script: an operand; field: a record field; tileset: a map's tileset; spellList: an entry of a spell list; implicit: by number (a party member's portrait). */
  via: "script" | "field" | "tileset" | "spellList" | "implicit";
  /** Script references: the line, operand and (shop lists) the pair. */
  where?: Where;
  operand?: number;
  pair?: number;
  /** Field references: the field. */
  field?: Field;
  /** Spell list references: the position. */
  position?: number;
  /** Implicit references: what it is ("portrait"). */
  note?: string;
}

export interface WorldIndex {
  scripts: Map<string, ScriptInfo>;
  maps: Map<string, MapInfo>;
  /** The player's start, or null when script 1-1 shows no map. */
  start: PlayerStart | null;
  /** All placements, in script order. */
  placements: Placement[];
  exits: Exit[];
  flags: Map<number, FlagUse[]>;
  variables: Map<number, VariableUse[]>;
  /** References by target key. */
  refsTo: Map<string, Reference[]>;
  /** References by referring key. */
  refsFrom: Map<string, Reference[]>;
  /** The leader's screen place assumed for exits (from the start). */
  playerScreen: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Building

const num = (v: unknown) => v as number;

const groupIndex = new WeakMap<ScriptModel, (EventGroup | undefined)[]>();
function groupAt(model: ScriptModel, i: number): EventGroup | undefined {
  let at = groupIndex.get(model);
  if (!at) {
    at = new Array(model.steps.length);
    for (const g of model.groups) for (let k = g.from; k < g.to; k++) at[k] = g;
    groupIndex.set(model, at);
  }
  return at[i];
}

function whereOf(script: string, model: ScriptModel, i: number): Where {
  const g = groupAt(model, i);
  const s = model.steps[i];
  return { script, stepId: s.id, line: s.line, group: g?.label ?? null, events: g?.events ?? [], start: g?.start ?? false };
}

/**
 * The maps current at each instruction: from the start (inherited: null) and
 * from each event (the maps the start code leaves). `inherited`: the maps the
 * script can be started on (see runningMaps); events of a script whose start
 * code shows no map run on those (else, failing all, on any map it shows).
 */
function mapsAtSteps(model: ScriptModel, inherited?: ReadonlySet<string>): Map<number, Set<string | null>> {
  const at = new Map<number, Set<string | null>>();
  const run = (entry: number, initial: Set<string | null>) => {
    const work: [number, string | null][] = [...initial].map((m) => [entry, m]);
    while (work.length) {
      const [i, m] = work.pop()!;
      let set = at.get(i);
      if (!set) at.set(i, (set = new Set()));
      if (set.has(m)) continue;
      set.add(m);
      const s = model.steps[i];
      const out = s.kind === "instruction" && s.op.name === "loadmap" ? resKey(2, num(s.values[0]), num(s.values[1])) : m;
      for (const n of successors(model, i)) work.push([n, out]);
    }
  };
  const entry = entryStep(model);
  // the start code runs on the map the script is started on (unknown: null)
  if (entry >= 0) run(entry, new Set([null, ...(inherited ?? [])]));
  // events run on the map the start code left (or, failing that, any map the script shows)
  const ends = new Set<string | null>();
  for (const [i, set] of at) if (successors(model, i).length === 0) for (const m of set) ends.add(m);
  const loaded = new Set<string>();
  for (const s of model.steps) if (s.kind === "instruction" && s.op.name === "loadmap") loaded.add(resKey(2, num(s.values[0]), num(s.values[1])));
  const endMaps = new Set([...ends].filter((m): m is string => m !== null));
  let initial: Set<string | null>;
  if (inherited) {
    // the start code leaves the map it was started on where it shows none
    const on = new Set<string | null>([...endMaps, ...(ends.has(null) || !ends.size ? inherited : [])]);
    initial = on.size ? on : new Set([null]);
  } else initial = endMaps.size ? endMaps : loaded.size ? new Set(loaded) : new Set([null]);
  for (const e of model.events) {
    if (!e.label) continue;
    const t = labelTarget(model, e.label);
    if (t >= 0) run(t, initial);
  }
  return at;
}

/**
 * The maps each script runs on, for its events: a script started by
 * startchapter / callchapter keeps the map shown when it was started (the
 * hub script of a town is started right after the town's loadmap, by the
 * script of the house the player leaves), so its events happen there and not
 * on the maps its own exits show. Worked out to a fixed point over the
 * scripts; maps a script's start code shows itself come from mapsAtSteps.
 */
function runningMaps(scripts: Map<string, ScriptInfo>): { inherited: Map<string, Set<string>>; mapsAt: Map<string, Map<number, Set<string | null>>> } {
  const inherited = new Map<string, Set<string>>([...scripts.keys()].map((k) => [k, new Set<string>()]));
  const mapsAt = new Map<string, Map<number, Set<string | null>>>();
  // scripts to (re)visit: all at first, then those started on more maps than before
  let dirty = new Set(scripts.keys());
  for (let round = 0; dirty.size && round < 200; round++) {
    const next = new Set<string>();
    for (const key of dirty) {
      const info = scripts.get(key)!;
      const at = mapsAtSteps(info.model, inherited.get(key)!);
      mapsAt.set(key, at);
      info.model.steps.forEach((s, i) => {
        if (s.kind !== "instruction" || (s.op.name !== "startchapter" && s.op.name !== "callchapter")) return;
        const target = resKey(1, num(s.values[0]), num(s.values[1]));
        const into = inherited.get(target);
        if (!into) return;
        for (const m of at.get(i) ?? [])
          for (const k of m === null ? inherited.get(key)! : [m])
            if (!into.has(k)) {
              into.add(k);
              next.add(target);
            }
      });
    }
    dirty = next;
  }
  return { inherited, mapsAt };
}

/**
 * The maps a script can leave the player in control on, while it is the
 * running script (so its events handle those maps' cells): where its start
 * code ends (callback, return, the end; not a switch to another script), and
 * then where its events end, run from those maps, until nothing new turns up.
 * `inherited`: the maps it is started on (runningMaps).
 */
function controlMaps(model: ScriptModel, inherited: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const work: [number, string | null][] = [];
  const enter = (i: number, m: string | null) => {
    const k = `${i}|${m}`;
    if (i < 0 || seen.has(k)) return;
    seen.add(k);
    work.push([i, m]);
  };
  const entry = entryStep(model);
  for (const m of [null, ...inherited]) enter(entry, m);
  const targets = model.events.flatMap((e) => (e.label ? [labelTarget(model, e.label)] : []));
  while (work.length) {
    const [i, m] = work.pop()!;
    const s = model.steps[i];
    const next = successors(model, i);
    const here = s.kind === "instruction" && s.op.name === "loadmap" ? resKey(2, num(s.values[0]), num(s.values[1])) : m;
    for (const n of next) enter(n, here);
    if (next.length || (s.kind === "instruction" && (s.op.name === "startchapter" || s.op.name === "gameover")) || here === null || out.has(here)) continue;
    // the player has control on `here`: any of the script's events can run there
    out.add(here);
    for (const t of targets) enter(t, here);
  }
  return out;
}

/** Scripts in number order ("1-1-2" before "1-1-10"). */
const byScript = (a: string, b: string) => {
  const x = parseKey(a);
  const y = parseKey(b);
  return x.type - y.type || x.index - y.index;
};

/** Whether some path from `entry` to an end avoids step `avoid`. */
function avoidable(model: ScriptModel, entry: number, avoid: number): boolean {
  if (entry === avoid) return false;
  const seen = new Set<number>([entry]);
  const stack = [entry];
  while (stack.length) {
    const i = stack.pop()!;
    const next = successors(model, i);
    if (!next.length) return true;
    for (const n of next) if (n !== avoid && !seen.has(n)) (seen.add(n), stack.push(n));
  }
  return false;
}

/** The entry instruction of a group. */
function groupEntry(model: ScriptModel, g: EventGroup): number {
  if (g.start) return entryStep(model);
  return g.label ? labelTarget(model, g.label) : -1;
}

// --- paths through the scripts ----------------------------------------------

interface PathState {
  script: string;
  i: number;
  map: string | null;
  cam: [number, number] | null;
  /** The leader's screen place (null: unknown). */
  screen: [number, number] | null;
  /** Party members (null: unknown). */
  party: number | null;
  vars: Map<number, number>;
  flags: Map<number, boolean>;
  /** Flags not in `flags` are clear (a new game) rather than unknown. */
  flagsClear: boolean;
  load: Where | null;
  actor: Where | null;
  certain: boolean;
  switches: number;
  /** Where scripts run by callchapter go back to on return (innermost last). */
  calls?: { script: string; i: number }[];
  flagsSet: number[];
  /** Variables not in `vars` are 0: all of them (a new game), or only 200-239 (another script started). */
  zero: "all" | "locals" | "none";
  /** `vars` and `flags` as text, for telling states apart. */
  vk: string;
  fk: string;
}

/** A variable's value on a path, or undefined when unknown. */
function getVar(st: PathState, k: number): number | undefined {
  const v = st.vars.get(k);
  if (v !== undefined) return Number.isNaN(v) ? undefined : v;
  return st.zero === "all" || (st.zero === "locals" && k >= 200) ? 0 : undefined;
}

interface PathEnd {
  state: PathState;
  /** How the path ended: callback / return (the player gets control), gameover, or lost (budget, unknown jump). */
  how: "control" | "gameover" | "lost";
  /** Lost at a script switch (to a missing script, or one switch too many). */
  switching?: boolean;
}

const b8 = (v: number) => v & 0xff;

/**
 * Walk the scripts from a state, following startchapter into other scripts,
 * deciding branches whose flags / variables are known and taking both ways
 * of the others. `firstOnly`: stop at the first end (fallthrough first).
 */
function walk(scripts: Map<string, ScriptInfo>, from: PathState, firstOnly: boolean, memo?: Map<string, PathEnd[]>, budget = 4000): PathEnd[] {
  const ends: PathEnd[] = [];
  const stack: PathState[] = [from];
  const seen = new Set<string>();
  // maps are shared between states and copied when changed
  const clone = (s: PathState, i: number, patch: Partial<PathState> = {}): PathState => ({ ...s, i, ...patch });
  while (stack.length && budget-- > 0) {
    const st = stack.pop()!;
    const info = scripts.get(st.script);
    const model = info?.model;
    if (!model || st.i < 0 || st.i >= model.steps.length) {
      ends.push({ state: st, how: "lost" });
      if (firstOnly) break;
      continue;
    }
    const key = `${st.script}|${st.i}|${st.map}|${st.cam}|${st.screen}|${st.zero}|${st.vk}|${st.fk}|${st.calls?.map((c) => `${c.script}:${c.i}`) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = model.steps[st.i];
    if (s.kind !== "instruction") {
      ends.push({ state: st, how: "lost" });
      if (firstOnly) break;
      continue;
    }
    const v = s.values;
    const fall = () => {
      // the next instruction in the text
      for (let j = st.i + 1; j < model.steps.length; j++) if (model.steps[j].kind === "instruction" || model.steps[j].kind === "data") return j;
      return -1;
    };
    const go = (j: number, patch: Partial<PathState> = {}) => (j >= 0 ? clone(st, j, patch) : null);
    const push = (...xs: (PathState | null)[]) => {
      // pushed last = explored first
      for (const x of xs.reverse()) if (x) stack.push(x);
    };
    const label = (k: number) => (typeof v[k] === "string" ? labelTarget(model, v[k] as string) : -1);
    const where = () => whereOf(st.script, model, st.i);
    switch (s.op.name) {
      case "return":
        if (st.calls?.length) {
          // a script run by callchapter hands back to its caller
          const back = st.calls[st.calls.length - 1];
          push(clone(st, back.i, { script: back.script, calls: st.calls.slice(0, -1) }));
          continue;
        }
        ends.push({ state: st, how: "control" });
        if (firstOnly) return ends;
        continue;
      case "callback":
        ends.push({ state: st, how: "control" });
        if (firstOnly) return ends;
        continue;
      case "callchapter": {
        // runs another script from its start (the map, people and variables stay), then goes on here
        const m = scripts.get(resKey(1, num(v[0]), num(v[1])))?.model;
        if (!m || (st.calls?.length ?? 0) > 4) {
          ends.push({ state: st, how: "lost", switching: true });
          if (firstOnly) return ends;
          continue;
        }
        push(clone(st, entryStep(m), { script: resKey(1, num(v[0]), num(v[1])), calls: [...(st.calls ?? []), { script: st.script, i: fall() }] }));
        continue;
      }
      case "gameover":
        ends.push({ state: st, how: "gameover" });
        if (firstOnly) return ends;
        continue;
      case "loadmap": {
        const cam: [number, number] = [num(v[2]), num(v[3])];
        push(go(fall(), { map: resKey(2, num(v[0]), num(v[1])), cam, load: where() }));
        continue;
      }
      case "createactor": {
        const first = st.party === 0;
        push(go(fall(), { party: st.party === null ? null : st.party + 1, ...(first ? { screen: [num(v[1]), num(v[2])] as [number, number], actor: where() } : {}) }));
        continue;
      }
      case "screens": {
        const cam: [number, number] = [num(v[0]), num(v[1])];
        const screen: [number, number] | null = st.screen && st.cam ? [st.screen[0] + st.cam[0] - cam[0], st.screen[1] + st.cam[1] - cam[1]] : st.screen;
        push(go(fall(), { cam, screen }));
        continue;
      }
      case "startchapter": {
        const target = resKey(1, num(v[0]), num(v[1]));
        const m = scripts.get(target)?.model;
        if (!m || st.switches > 8) {
          ends.push({ state: st, how: "lost", switching: true });
          if (firstOnly) return ends;
          continue;
        }
        const vars = new Map([...st.vars].filter(([k]) => k < 200));
        const n = clone(st, entryStep(m), { script: target, switches: st.switches + 1, calls: undefined, vars, vk: String([...vars]), zero: st.zero === "all" ? "all" : "locals" });
        if (!memo || firstOnly) {
          push(n);
          continue;
        }
        // the rest of the path runs in the other script: walk it once for each way in
        const mk = `${target}|${n.map}|${n.cam}|${n.screen}|${n.party}|${n.load?.script}:${n.load?.stepId}|${n.zero}|${n.vk}|${n.fk}`;
        let sub = memo.get(mk);
        if (!sub) {
          memo.set(mk, []); // a loop of script switches ends here
          sub = walk(scripts, { ...n, certain: true }, false, memo, budget);
          memo.set(mk, sub);
        }
        for (const e of sub) ends.push({ how: e.how, switching: e.switching, state: { ...e.state, certain: e.state.certain && st.certain } });
        continue;
      }
      case "set":
      case "add":
      case "sub": {
        const old = getVar(st, b8(num(v[0])));
        const val = s.op.name === "set" ? b8(num(v[1])) : old === undefined ? undefined : b8(s.op.name === "add" ? old + num(v[1]) : old - num(v[1]));
        push(go(fall(), withVar(st, b8(num(v[0])), val)));
        continue;
      }
      case "setto": {
        push(go(fall(), withVar(st, b8(num(v[1])), getVar(st, b8(num(v[0]))))));
        continue;
      }
      case "menu": {
        push(go(fall(), withVar(st, b8(num(v[0])), undefined)));
        continue;
      }
      case "setevent":
      case "clrevent": {
        const set = s.op.name === "setevent";
        const flags = new Map(st.flags).set(num(v[0]), set);
        push(go(fall(), { flags, fk: String([...flags]), ...(set ? { flagsSet: [...st.flagsSet, num(v[0])] } : {}) }));
        continue;
      }
      case "if": {
        const known = st.flags.get(num(v[0])) ?? (st.flagsClear ? false : undefined);
        if (known === true) push(go(label(1)));
        else if (known === false) push(go(fall()));
        else push(go(fall(), { certain: false }), go(label(1), { certain: false }));
        continue;
      }
      case "ifcmp": {
        const known = getVar(st, b8(num(v[0])));
        if (known !== undefined) push(go(known === b8(num(v[1])) ? label(2) : fall()));
        else push(go(fall(), { certain: false }), go(label(2), { certain: false }));
        continue;
      }
      case "discmp": {
        const known = getVar(st, b8(num(v[0])));
        const value = b8(num(v[1]));
        if (known !== undefined) push(go(known < value ? label(2) : known > value ? label(3) : fall()));
        else push(go(fall(), { certain: false }), go(label(2), { certain: false }), go(label(3), { certain: false }));
        continue;
      }
      case "enterfight":
        push(go(label(14), { certain: false }), go(label(13), { certain: false }));
        continue;
      default: {
        if (s.command.flow === "branch") {
          push(go(fall(), { certain: false }), ...s.op.args.map((k, a) => (k === "addr" ? go(label(a), { certain: false }) : null)));
          continue;
        }
        const succ = successors(model, st.i);
        if (!succ.length) {
          ends.push({ state: st, how: "lost" });
          if (firstOnly) return ends;
          continue;
        }
        push(...succ.map((n) => clone(st, n)));
      }
    }
  }
  // out of budget: the ways not walked lead somewhere unknown
  for (const st of stack) ends.push({ state: st, how: "lost" });
  return ends;
}

/** A path's variables with one changed (undefined: now unknown); the old map is left alone. */
function withVar(st: PathState, k: number, v: number | undefined): { vars: Map<number, number>; vk: string } {
  const out = new Map(st.vars);
  if (v === undefined) {
    out.delete(k);
    // unknown, though `zero` would say 0: keep it unknown by marking it
    if (st.zero === "all" || (st.zero === "locals" && k >= 200)) out.set(k, NaN);
  } else out.set(k, v);
  return { vars: out, vk: String([...out]) };
}

/** A new path state at a script's step. */
function pathAt(script: string, i: number, o: Partial<PathState> = {}): PathState {
  return { script, i, map: null, cam: null, screen: null, party: null, vars: new Map(), flags: new Map(), flagsClear: false, load: null, actor: null, certain: true, switches: 0, flagsSet: [], zero: "none", vk: "", fk: "", ...o };
}

/** Script 1-1 from a new game: every flag clear, every variable 0, no party. */
function findStart(scripts: Map<string, ScriptInfo>): PlayerStart | null {
  const first = scripts.get("1-1-1");
  if (!first) return null;
  const ends = walk(scripts, pathAt("1-1-1", entryStep(first.model), { zero: "all", party: 0, flagsClear: true }), true);
  const end = ends.find((e) => e.how === "control") ?? ends[0];
  if (!end || !end.state.map || !end.state.cam || !end.state.load) return null;
  const screen = end.state.screen ?? [4, 3];
  const s = end.state;
  return {
    script: s.script,
    map: s.map!,
    cameraX: s.cam![0],
    cameraY: s.cam![1],
    screenX: screen[0],
    screenY: screen[1],
    x: s.cam![0] + screen[0],
    y: s.cam![1] + screen[1],
    load: s.load!,
    actor: s.actor,
    flagsSet: [...new Set(s.flagsSet)],
  };
}

/**
 * Index a project. `sources` are the authors' script texts by key (the text
 * the editor shows is the author's while it assembles to the stored bytes,
 * else a disassembly).
 */
export function buildWorld(archive: LibArchive, sources: Record<string, string> = {}): WorldIndex {
  return worldMemo(archive, sources);
}

// (the editor asks for the same project's index from many places: it is
// built once per content, memo.ts; its readers never change it)
const worldMemo = projectMemo(buildWorldUncached, 6);
// (and each script's model by its text: the index with the authors' texts
// and the one with every script's text read the same scripts; models are
// never changed, edits make new ones)
const models = new Lru<string, ScriptModel>(2000);
function modelOf(source: string): ScriptModel {
  let m = models.get(source);
  if (!m) models.set(source, (m = parseScript(source)));
  return m;
}

function buildWorldUncached(archive: LibArchive, sources: Record<string, string>): WorldIndex {
  const scripts = new Map<string, ScriptInfo>();
  for (const e of archive.entries) {
    if (e.resType !== 1) continue;
    const key = resKey(1, e.type, e.index);
    const source = scriptSource(e.data, sources[key]);
    const model = modelOf(source);
    const maps = new Set<string>();
    for (const s of model.steps) if (s.kind === "instruction" && s.op.name === "loadmap") maps.add(resKey(2, num(s.values[0]), num(s.values[1])));
    scripts.set(key, { key, entry: e, source, model, authored: source === sources[key], maps: [...maps], runsOn: [] });
  }

  const maps = new Map<string, MapInfo>();
  const cellsOf = new Map<string, Map<number, { x: number; y: number }[]>>();
  for (const e of archive.entries) {
    if (e.resType !== 2) continue;
    const key = resKey(2, e.type, e.index);
    let m;
    try {
      m = decodeMap(e.data);
    } catch {
      continue;
    }
    const cells = new Map<number, { x: number; y: number }[]>();
    m.cells.forEach((c, i) => {
      if (!c.event) return;
      const list = cells.get(c.event) ?? [];
      list.push({ x: i % m.width, y: Math.floor(i / m.width) });
      cells.set(c.event, list);
    });
    cellsOf.set(key, cells);
    maps.set(key, { key, type: e.type, index: e.index, name: m.name, width: m.width, height: m.height, tileset: m.tileset, loadedBy: [], runBy: [], people: [], removals: [], eventCells: [], exits: [], entrances: [] });
  }

  const placements: Placement[] = [];
  const flags = new Map<number, FlagUse[]>();
  const variables = new Map<number, VariableUse[]>();
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  const addFlag = (u: FlagUse) => push(flags, u.flag, u);
  const addVar = (u: VariableUse) => push(variables, u.variable, u);
  const refsTo = new Map<string, Reference[]>();
  const refsFrom = new Map<string, Reference[]>();
  const addRef = (r: Reference) => {
    push(refsTo, r.target, r);
    push(refsFrom, r.from, r);
  };
  const nameOf = (resType: number, type: number, index: number) => {
    const e = findEntry(archive, resType, type, index);
    return e ? resourceName(resType, type, e.data) : "";
  };

  // the maps each script runs on (a hub script on the map it is started on)
  const running = runningMaps(scripts);
  const runsOn = new Map<string, Set<string>>();
  for (const [key, inherited] of running.inherited) {
    for (const m of controlMaps(scripts.get(key)!.model, inherited)) runsOn.set(m, new Set([...(runsOn.get(m) ?? []), key]));
  }
  const mapsAtOf = new Map<string, Map<number, Set<string | null>>>();
  for (const info of scripts.values()) {
    const { model, key } = info;
    const mapsAt = running.mapsAt.get(key) ?? new Map<number, Set<string | null>>();
    mapsAtOf.set(key, mapsAt);
    const entries = new Map(model.groups.map((g) => [g, groupEntry(model, g)]));
    model.steps.forEach((s, i) => {
      if (s.kind !== "instruction") return;
      const where = () => whereOf(key, model, i);
      const v = s.values;
      const here = [...(mapsAt.get(i) ?? new Set<string | null>())];
      const map = here.find((m) => m !== null) ?? (info.maps.length === 1 ? info.maps[0] : null);
      switch (s.op.name) {
        case "loadmap": {
          const mk = resKey(2, num(v[0]), num(v[1]));
          maps.get(mk)?.loadedBy.push({ ...where(), map: mk, cameraX: num(v[2]), cameraY: num(v[3]) });
          break;
        }
        case "createnpc":
        case "createbox": {
          const person = s.op.name === "createnpc";
          const g = groupAt(model, i);
          const entry = g ? entries.get(g) ?? -1 : -1;
          const p: Placement = {
            ...where(),
            kind: person ? "person" : "object",
            id: num(v[0]),
            resource: resKey(3, person ? 2 : 4, num(v[1])),
            name: nameOf(3, person ? 2 : 4, num(v[1])),
            x: num(v[2]),
            y: num(v[3]),
            map,
            conditional: entry < 0 || avoidable(model, entry, i),
          };
          placements.push(p);
          const on = here.filter((x): x is string => x !== null);
          for (const m of new Set(on.length ? on : map ? [map] : [])) maps.get(m)?.people.push(m === map ? p : { ...p, map: m });
          break;
        }
        case "deletenpc":
        case "deletebox":
          if (map) maps.get(map)?.removals.push({ ...where(), id: num(v[0]) });
          break;
        case "if":
          addFlag({ ...where(), flag: num(v[0]), access: "read" });
          break;
        case "setevent":
          addFlag({ ...where(), flag: num(v[0]), access: "set" });
          break;
        case "clrevent":
          addFlag({ ...where(), flag: num(v[0]), access: "clear" });
          break;
        case "set":
        case "menu":
          addVar({ ...where(), variable: num(v[0]), access: "write" });
          break;
        case "add":
        case "sub":
          addVar({ ...where(), variable: num(v[0]), access: "modify" });
          break;
        case "setto":
          addVar({ ...where(), variable: num(v[0]), access: "read" });
          addVar({ ...where(), variable: num(v[1]), access: "write" });
          break;
        case "ifcmp":
        case "discmp":
          addVar({ ...where(), variable: num(v[0]), access: "read" });
          break;
      }
      for (const r of operandRefs(s.op.name, v)) addRef({ from: key, target: resKey(r.resType, r.type, r.index), via: "script", where: where(), operand: r.operand, ...(r.pair !== undefined ? { pair: r.pair } : {}) });
    });
  }

  // resources: fields, tilesets, spell lists, by-number links
  for (const e of archive.entries) {
    const from = resKey(e.resType, e.type, e.index);
    if (e.resType === 2) {
      if (e.data.length > 2) addRef({ from, target: resKey(7, 1, e.data[2]), via: "tileset" });
      continue;
    }
    if (e.resType === 12 && e.type === 1) {
      try {
        readMagicChain(e.data).forEach((s, position) => addRef({ from, target: resKey(4, s.type, s.index), via: "spellList", position }));
      } catch {
        /* a damaged list */
      }
      continue;
    }
    const fields = fieldsFor(e.resType, e.type);
    if (fields) {
      for (const f of fields) {
        if (f.key === "event" && e.resType === 6) {
          const n = Number(readField(e.data, f));
          if (n) addFlag({ flag: n, access: "set", resource: from });
        }
        if (!f.ref) continue;
        const v = Number(readField(e.data, f));
        const type = typeof f.ref.type === "number" ? f.ref.type : e.data[f.ref.type.at];
        if (!v || !type) continue;
        addRef({ from, target: resKey(f.ref.resType, type, v), via: "field", field: f });
      }
    }
    if (e.resType === 3 && e.type === 1) {
      addRef({ from, target: resKey(11, 1, e.index), via: "implicit", note: "portrait" });
      addRef({ from, target: resKey(11, 3, e.index), via: "implicit", note: "battle sprite" });
      addRef({ from, target: resKey(12, 2, e.index), via: "implicit", note: "level table" });
    }
  }

  const start = findStart(scripts);
  const playerScreen = start ? { x: start.screenX, y: start.screenY } : { x: 4, y: 3 };
  // flags the start sets stay set for exits, unless some script clears them
  // again (the first quest's flag is cleared once it is done, and the way it
  // blocked opens)
  const startFlags = new Map((start?.flagsSet ?? []).filter((f) => !flags.get(f)?.some((u) => u.access === "clear")).map((f) => [f, true]));

  // cell events and exits
  const exits: Exit[] = [];
  const memo = new Map<string, PathEnd[]>();
  for (const info of scripts.values()) {
    const { model, key } = info;
    const mapsAt = running.mapsAt.get(key)!;
    for (const ev of model.events) {
      if (!ev.label) continue;
      const t = labelTarget(model, ev.label);
      if (t < 0) continue;
      // the maps the event happens on: those shown when it starts, else the
      // ones the script is started on, else (never started) any it shows
      const on = [...(mapsAt.get(t) ?? [])].filter((m): m is string => m !== null);
      const inherited = [...running.inherited.get(key)!];
      let froms = on.length ? on : inherited.length ? inherited : info.maps;
      // a map cell event can only happen on maps that have such cells
      if (ev.number > 40) {
        const withCells = froms.filter((m) => cellsOf.get(m)?.get(ev.number - 40)?.length);
        if (withCells.length) froms = withCells;
      }
      for (const from of froms) {
        const map = maps.get(from);
        let trigger: Trigger;
        if (ev.number > 40) {
          const cells = cellsOf.get(from)?.get(ev.number - 40) ?? [];
          trigger = { kind: "tile", mapEvent: ev.number - 40, cells };
        } else trigger = { kind: "person", id: ev.number };
        const ends = walk(scripts, pathAt(key, t, { map: from, screen: [playerScreen.x, playerScreen.y], flags: startFlags, fk: String([...startFlags]) }), false, memo);
        const targets: Arrival[] = [];
        const seen = new Set<string>();
        let stays = false;
        let unknown = false;
        for (const e of ends) {
          const s = e.state;
          // lost after showing a map or switching script: it goes somewhere the index cannot tell
          if (e.how === "lost" && (s.load || s.switches > 0 || e.switching)) unknown = true;
          if (e.how !== "control") continue;
          if (!s.load || !s.map || !s.cam) {
            stays = true;
            continue;
          }
          const k = `${s.map}|${s.cam}|${s.screen}`;
          if (seen.has(k)) continue;
          seen.add(k);
          targets.push({ map: s.map, cameraX: s.cam[0], cameraY: s.cam[1], x: s.screen ? s.cam[0] + s.screen[0] : null, y: s.screen ? s.cam[1] + s.screen[1] : null, load: s.load, certain: false });
        }
        // certain: every way through the event ends there
        if (targets.length === 1 && !stays && !unknown) targets[0].certain = true;
        if (targets.length || unknown) {
          const exit: Exit = { from, trigger, script: key, event: ev.number, label: ev.label, targets, ...(unknown ? { unknown } : {}) };
          exits.push(exit);
          map?.exits.push(exit);
          for (const tk of new Set(targets.map((x) => x.map))) maps.get(tk)?.entrances.push(exit);
        }
      }
    }
  }
  for (const [mk, map] of maps) {
    const cells = cellsOf.get(mk) ?? new Map();
    // the scripts that can be running while the player walks here handle its cells
    map.runBy = [...(runsOn.get(mk) ?? [])].sort(byScript);
    for (const s of map.runBy) scripts.get(s)?.runsOn.push(mk);
    for (const [n, list] of [...cells].sort((a, b) => a[0] - b[0])) {
      const handlers = map.runBy.flatMap((s) => {
        const m = scripts.get(s)!.model;
        const e = m.events.find((x) => x.number === n + 40);
        if (!e) return [];
        const line = m.steps.find((x) => x.id === e.stepId)?.line ?? 0;
        return [{ script: s, label: e.label, line }];
      });
      map.eventCells.push({ mapEvent: n, cells: list, handlers });
    }
  }

  return { scripts, maps, start, placements, exits, flags, variables, refsTo, refsFrom, playerScreen };
}

// ---------------------------------------------------------------------------
// Names

/** Names for sentences (commands.ts): resources by their own names (or the notes'), flags and variables by the notes. */
export function projectNames(archive: LibArchive, notes?: ProjectNotes): NameResolver {
  return {
    resource(resType, type, index) {
      const e = findEntry(archive, resType, type, index);
      const noted = resourceNote(notes, resKey(resType, type, index))?.name;
      if (!e) return null;
      return noted ?? resourceName(resType, type, e.data);
    },
    flag: (n) => flagName(notes, n),
    variable: (n) => variableName(notes, n),
  };
}

/** Names for one script's sentences: also who stands under each person / object number, and what each event is. */
export function scriptNames(world: WorldIndex, archive: LibArchive, script: string, notes?: ProjectNotes): NameResolver {
  const base = projectNames(archive, notes);
  const byId = new Map<number, Set<string>>();
  for (const p of world.placements) if (p.script === script) byId.set(p.id, new Set([...(byId.get(p.id) ?? []), p.name || `${p.kind} ${parseKey(p.resource).index}`]));
  const who = (id: number) => {
    const s = byId.get(id);
    return s && s.size === 1 ? [...s][0] : undefined;
  };
  return {
    ...base,
    npcId: (id) => who(id),
    event: (n) => {
      if (n > 40) return `map event ${n - 40}`;
      const w = who(n);
      return w ? `talking to ${w}` : `person or object #${n}`;
    },
  };
}

/** "Map 1-2 GLADE", "Item 9-1 Herb": a resource for lists. */
export function describeKey(archive: LibArchive, key: string): string {
  const { resType, type, index } = parseKey(key);
  const e = findEntry(archive, resType, type, index);
  const kind = resType === 3 ? (["Character", "Party member", "Person", "Monster", "Object"][type] ?? "Character") : ({ 1: "Script", 2: "Map", 4: "Spell", 5: "Animation", 6: "Item", 7: "Tileset", 8: "Sprite", 9: "Item icon", 10: "Effect image", 11: "Picture", 12: "Table" } as Record<number, string>)[resType] ?? "Resource";
  const name = e && resType !== 5 ? resourceName(resType, type, e.data) : "";
  const sub = resType === 6 || resType === 11 || resType === 8 ? ` (${subTypeName(resType, type).toLowerCase()})` : "";
  return `${kind} ${type}-${index}${name ? ` ${name}` : ""}${sub}${e ? "" : " (missing)"}`;
}

// ---------------------------------------------------------------------------
// Map cells

/** A map's bytes with the event number of cell x, y set (0 = none). */
export function withCellEvent(mapData: Uint8Array, x: number, y: number, event: number): Uint8Array {
  const w = mapData[0x10];
  const h = mapData[0x11];
  if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`cell ${x}, ${y} is outside the ${w}×${h} map`);
  if (!Number.isInteger(event) || event < 0 || event > 255) throw new Error("map events are 0-255");
  const out = mapData.slice();
  out[0x13 + (y * w + x) * 2] = event;
  return out;
}

// ---------------------------------------------------------------------------
// Renumbering

export interface RenumberResult {
  archive: LibArchive;
  sources: Record<string, string>;
  notes?: ProjectNotes;
  /** Keys of the resources changed (the moved one under its new key). */
  changed: string[];
  warnings: string[];
}

export interface RenumberOptions {
  /** Party members: also move their portrait (11-1-n), battle sprite (11-3-n) and level table (12-2-n). Default true. */
  companions?: boolean;
  /** Notes to move with the resource. */
  notes?: ProjectNotes;
}

/**
 * Give a resource another number and update every reference to it: script
 * operands (scripts' text, reassembled), record fields, maps' tilesets and
 * spell lists. The archive, sources and notes passed in are not changed.
 */
export function renumberResource(archive: LibArchive, sources: Record<string, string>, target: { resType: number; type: number; index: number }, to: number, opts: RenumberOptions = {}): RenumberResult {
  const { resType, type, index: from } = target;
  if (!Number.isInteger(to) || to < 1 || to > 255) throw new Error("Numbers are 1-255.");
  const entry = findEntry(archive, resType, type, from);
  if (!entry) throw new Error(`${resKey(resType, type, from)} does not exist`);
  if (to === from) return { archive, sources, notes: opts.notes, changed: [], warnings: [] };
  if (findEntry(archive, resType, type, to)) throw new Error(`${type}-${to} is already used`);

  const warnings: string[] = [];
  const changed = new Set<string>();
  let entries = archive.entries.map((e) => e);
  let srcs = { ...sources };
  const oldKey = resKey(resType, type, from);
  const newKey = resKey(resType, type, to);

  // the resource itself (resources store their own number in byte 1)
  const moved = entry.data.slice();
  if (moved.length > 1) moved[1] = to;
  entries = entries.map((e) => (e === entry ? { ...e, index: to, data: moved } : e));
  changed.add(newKey);
  if (resType === 1) {
    const text = srcs[oldKey];
    delete srcs[oldKey];
    if (text !== undefined) srcs[newKey] = text.replace(/^(\s*\.gut\s+\d+\s+)\d+/m, `$1${to}`);
    if (oldKey === "1-1-1") warnings.push("Script 1-1 starts the game: a new game now needs another script 1-1.");
  }

  // scripts: operands that refer to it
  const matches = (r: ResourceRef) => r.resType === resType && r.type === type && r.index === from;
  for (let k = 0; k < entries.length; k++) {
    const e = entries[k];
    if (e.resType !== 1) continue;
    const key = resKey(1, e.type, e.index);
    const source = scriptSource(e.data, srcs[key]);
    let model = parseScript(source);
    const edits: { id: number; span: Span }[] = [];
    for (const s of model.steps) {
      if (s.kind !== "instruction") continue;
      for (const r of operandRefs(s.op.name, s.values)) {
        if (!matches(r)) continue;
        const a = r.pair !== undefined ? s.args[r.pair] : s.args[r.operand];
        if (!a) continue;
        edits.push({ id: s.id, span: a.kind === "pair" ? a.indexSpan : a.span });
      }
    }
    if (!edits.length) continue;
    // right to left within a line, so earlier spans stay put
    edits.sort((x, y) => x.id - y.id || y.span.start - x.span.start);
    for (const ed of edits) model = replaceSpan(model, ed.id, ed.span, String(to));
    const text = toSource(model);
    entries[k] = { ...e, data: assemble(text) };
    srcs = { ...srcs, [key]: text };
    changed.add(key);
  }

  // record fields, maps' tilesets, spell lists
  entries = entries.map((e) => {
    let data = e.data;
    const fields = fieldsFor(e.resType, e.type);
    if (fields) {
      for (const f of fields) {
        if (!f.ref || f.ref.resType !== resType) continue;
        const t = typeof f.ref.type === "number" ? f.ref.type : data[f.ref.type.at];
        if (t !== type || Number(readField(data, f)) !== from) continue;
        data = writeField(data, f, to);
      }
      // equipment: who may use it is a bit per party member 1-4
      if (resType === 3 && type === 1 && e.resType === 6) {
        const users = fields.find((f) => f.key === "users");
        if (users && from <= 8 && to <= 8) {
          const v = data[users.at];
          const bit = (n: number) => 1 << (n - 1);
          if (v !== 0xff && v & bit(from)) {
            data = data.slice();
            data[users.at] = (v & ~bit(from)) | bit(to);
          }
        }
      }
    }
    if (resType === 7 && type === 1 && e.resType === 2 && data[2] === from) {
      data = data.slice();
      data[2] = to;
    }
    if (resType === 4 && e.resType === 12 && e.type === 1) {
      const n = data[2] ?? 0;
      for (let i = 0; i < n; i++) {
        if (data[3 + i * 2] === type && data[4 + i * 2] === from) {
          if (data === e.data) data = data.slice();
          data[4 + i * 2] = to;
        }
      }
    }
    if (data === e.data) return e;
    changed.add(resKey(e.resType, e.type, e.index));
    return { ...e, data };
  });

  let notes = opts.notes ? moveResourceNote(opts.notes, oldKey, newKey) : undefined;
  let result: RenumberResult = { archive: { ...archive, entries }, sources: srcs, notes, changed: [...changed], warnings };

  if (resType === 3 && type === 1) {
    if (to > 4) warnings.push(`Party member ${to}: only members 1-4 can use equipment.`);
    if (opts.companions !== false) {
      for (const [rt, t, what] of [
        [11, 1, "portrait"],
        [11, 3, "battle sprite"],
        [12, 2, "level table"],
      ] as const) {
        if (!findEntry(result.archive, rt, t, from)) continue;
        if (findEntry(result.archive, rt, t, to)) {
          warnings.push(`The ${what} ${t}-${to} already exists, so ${t}-${from} was not moved: party member ${to} uses ${t}-${to}.`);
          continue;
        }
        const r = renumberResource(result.archive, result.sources, { resType: rt, type: t, index: from }, to, { notes });
        notes = r.notes;
        result = { archive: r.archive, sources: r.sources, notes, changed: [...new Set([...result.changed, ...r.changed])], warnings: [...warnings, ...r.warnings] };
      }
    } else warnings.push(`Party member ${to} now uses portrait 1-${to}, battle sprite 3-${to} and level table 2-${to}.`);
  }
  return { ...result, warnings: [...new Set([...warnings, ...result.warnings])] };
}

/** Every reference to a resource, with the places (an index built by buildWorld). */
export function referencesTo(world: WorldIndex, key: string): Reference[] {
  return world.refsTo.get(key) ?? [];
}

/** Keys of resources nothing refers to (scripts 1-1 and system pictures excepted), for "unused" lists. */
export function unreferenced(world: WorldIndex, archive: LibArchive): string[] {
  return archive.entries
    .map((e) => resKey(e.resType, e.type, e.index))
    .filter((k) => k !== "1-1-1" && !k.startsWith("11-2-") && !k.startsWith("10-") && !(world.refsTo.get(k)?.length));
}

