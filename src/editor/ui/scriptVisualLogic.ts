// The pure logic of the Visual script view (ScriptVisual.tsx): what each
// event is called, which control edits each operand, where new steps go,
// how blocks move, duplicate and delete as one, and the commit of an edit
// (the model's text, assembled; refused when it does not assemble).
//
// Nothing here touches the DOM; every edit goes through the script model
// (format/scriptModel.ts), which keeps the lines it does not change.
import { AsmError, assemble } from "../format/gut";
import { commandInfo, type CommandInfo, type NameResolver, type OperandInfo, type OperandValue } from "../format/commands";
import {
  deleteSteps,
  insertLines,
  instructionLine,
  labelRefCounts,
  moveSteps,
  outline,
  outlineSteps,
  parseScript,
  replaceSpan,
  setOperand,
  toSource,
  uniqueLabel,
  type Arm,
  type EventGroup,
  type InstructionStep,
  type OutlineNode,
  type Position,
  type ScriptModel,
  type Step,
} from "../format/scriptModel";
import { parseKey, type WorldIndex } from "../format/world";
import { splitWords, wrapDialogue } from "../format/scriptHelp";
import { MESSAGE_BOX, wrapMessage } from "../format/text";

// ---------------------------------------------------------------------------
// Events

export interface EventEntry {
  /** A stable key for the list ("start", "event-3", "group-<label>"). */
  key: string;
  /** The group of code it runs (null: an event that jumps to a raw address). */
  group: EventGroup | null;
  kind: "start" | "person" | "object" | "tile" | "raw";
  title: string;
  /** More about it ("not painted on the map yet"). */
  detail?: string;
  /** The event numbers it runs for. */
  events: number[];
  /** Instructions in its code. */
  steps: number;
  /** Problems on its lines. */
  problems: number;
}

export interface EventContext {
  /** The script's key ("1-1-1"). */
  script: string;
  world?: WorldIndex;
  names?: NameResolver;
  /** Lines with problems (model's and the project check's). */
  problemLines?: ReadonlySet<number>;
}

/** What starts a script's first code: a new game (script 1-1) or the script being started. */
export function startTitle(script: string): string {
  const k = parseKey(script);
  return k.type === 1 && k.index === 1 ? "When the game starts" : "When this script begins";
}

/** An event number in words: "Talking to Wen (#1)", "Stepping on tile event 3 (map BELLHAVEN 13,4)". */
export function eventTitle(n: number, ctx: EventContext): { kind: "person" | "object" | "tile"; title: string; detail?: string } {
  if (n > 40) {
    const m = n - 40;
    const where = tileWhere(m, ctx);
    return { kind: "tile", title: `Stepping on tile event ${m}${where.text ? ` (${where.text})` : ""}`, detail: where.detail };
  }
  const placed = ctx.world?.placements.filter((p) => p.script === ctx.script && p.id === n) ?? [];
  const kinds = new Set(placed.map((p) => p.kind));
  const names = [...new Set(placed.map((p) => p.name.trim() || `${p.kind} ${parseKey(p.resource).index}`))];
  const name = names.length === 1 ? names[0] : names.length > 1 ? names.join(" or ") : null;
  if (!name) return { kind: "person", title: `Talking to person or object #${n}`, detail: `nobody is placed as #${n} by this script` };
  if (kinds.size === 1 && kinds.has("object")) return { kind: "object", title: `Examining ${name} (#${n})` };
  return { kind: "person", title: `Talking to ${name} (#${n})` };
}

/** Where map event m is painted on the maps this script shows. */
function tileWhere(m: number, ctx: EventContext): { text: string; detail?: string } {
  const info = ctx.world?.scripts.get(ctx.script);
  const maps = (info?.maps ?? []).map((k) => ctx.world!.maps.get(k)).filter((x): x is NonNullable<typeof x> => !!x);
  for (const map of maps) {
    const ce = map.eventCells.find((c) => c.mapEvent === m);
    if (!ce || !ce.cells.length) continue;
    const c = ce.cells[0];
    const more = ce.cells.length > 1 ? ` and ${ce.cells.length - 1} more` : "";
    return { text: `map ${map.name.trim() || `${map.type}-${map.index}`} ${c.x},${c.y}${more}` };
  }
  if (!maps.length) return { text: "", detail: "this script shows no map" };
  return { text: "not on the map yet", detail: `paint map event ${m} on cells of ${maps[0].name.trim() || "the map"}` };
}

/** The script's events for the list: the start code first, then the events in number order. */
export function eventEntries(model: ScriptModel, ctx: EventContext): EventEntry[] {
  const out: EventEntry[] = [];
  const count = (g: EventGroup) => {
    let steps = 0;
    let problems = 0;
    for (let i = g.from; i < g.to; i++) {
      const s = model.steps[i];
      if (s.kind === "instruction") steps++;
      if (ctx.problemLines?.has(s.line)) problems++;
    }
    return { steps, problems };
  };
  const seen = new Set<EventGroup>();
  for (const g of model.groups) {
    if (!g.start) continue;
    seen.add(g);
    const extra = g.events.map((n) => eventTitle(n, ctx).title);
    out.push({ key: "start", group: g, kind: "start", title: startTitle(ctx.script), detail: extra.length ? `also ${extra.join(", ")}` : undefined, events: g.events, ...count(g) });
  }
  for (const e of model.events) {
    const g = e.label ? model.groups.find((x) => x.label === e.label) : undefined;
    if (g && seen.has(g)) continue;
    const t = eventTitle(e.number, ctx);
    if (!g) {
      out.push({
        key: `event-${e.number}`,
        group: null,
        kind: "raw",
        title: t.title,
        detail: e.label ? `the label ${e.label} does not exist` : "jumps to a raw address: edit it in the Text view",
        events: [e.number],
        steps: 0,
        problems: 1,
      });
      continue;
    }
    seen.add(g);
    // several events can share one label
    const titles = g.events.map((n) => eventTitle(n, ctx).title);
    out.push({ key: `group-${g.label}`, group: g, kind: t.kind, title: titles.join(" / "), detail: t.detail, events: g.events, ...count(g) });
  }
  // code no event runs (cannot happen with the model's groups, but kept visible)
  for (const g of model.groups) {
    if (seen.has(g)) continue;
    out.push({ key: `group-${g.label ?? g.from}`, group: g, kind: "start", title: g.label ? `◆ ${g.label}` : "Code", events: g.events, ...count(g) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Operand controls

export type Control =
  /** A resource: `pair` when the type is another operand (maps, items, spells…). */
  | { kind: "resource"; resType: number; types?: number[]; allowNone: boolean; pairType?: number }
  /** The type half of a pair: edited with its index half. */
  | { kind: "hidden" }
  | { kind: "flag" }
  | { kind: "variable" }
  | { kind: "label" }
  | { kind: "select"; options: readonly (readonly [number, string])[] }
  | { kind: "npc"; allowPlayer: boolean }
  | { kind: "event" }
  | { kind: "number"; min: number; max: number; unit?: string; zero?: string }
  | { kind: "text"; multiline: boolean }
  | { kind: "shop" };

/** Which control edits operand k of an instruction. */
export function controlFor(c: CommandInfo, k: number): Control {
  const o = c.operands[k];
  if (!o) return { kind: "number", min: 0, max: 65535 };
  if (o.pair?.role === "type") return { kind: "hidden" };
  if (o.ref) {
    const t = o.ref.type;
    if (typeof t === "number") return { kind: "resource", resType: o.ref.resType, types: [t], allowNone: o.ref.zeroNone };
    return { kind: "resource", resType: o.ref.resType, allowNone: o.ref.zeroNone, pairType: t.operand };
  }
  switch (o.kind) {
    case "flag":
      return { kind: "flag" };
    case "variable":
      return { kind: "variable" };
    case "label":
      return { kind: "label" };
    case "npcId":
      return { kind: "npc", allowPlayer: (o.min ?? 1) === 0 };
    case "event":
      return { kind: "event" };
    case "text":
      return { kind: "text", multiline: c.name !== "choice" && c.name !== "setscenename" && c.name !== "menu" };
    case "shopList":
      return { kind: "shop" };
    case "direction":
    case "enum":
    case "attribute":
      if (o.values?.length) return { kind: "select", options: o.values };
      break;
  }
  return { kind: "number", min: o.min ?? 0, max: o.max ?? 65535, unit: o.unit, zero: o.zero };
}

/** The range an operand's number must be in. */
export function operandRange(o: OperandInfo | undefined): { min: number; max: number } {
  return { min: o?.min ?? 0, max: o?.max ?? 65535 };
}

/** A number typed for an operand, or why it cannot be used. */
export function parseOperandNumber(text: string, o: OperandInfo | undefined): { value: number } | { error: string } {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return { error: `${o?.label ?? "The value"} must be a whole number` };
  const v = Number(t);
  const { min, max } = operandRange(o);
  if (v < min || v > max) return { error: `${o?.label ?? "The value"} must be ${min}-${max}` };
  return { value: v };
}

// ---------------------------------------------------------------------------
// The outline: finding nodes, blocks as one

/** Every step a node shows (a block: its instruction, its other lines, its arms' labels and steps). */
export function nodeSteps(node: OutlineNode): Step[] {
  return outlineSteps([node]);
}

/** The node whose own card is this step (a step node, or a block whose instruction it is), with its list. */
export function findNode(nodes: OutlineNode[], id: number): { node: OutlineNode; list: OutlineNode[] } | null {
  for (const n of nodes) {
    if (n.step.id === id) return { node: n, list: nodes };
    if (n.kind === "block") {
      for (const a of n.arms) {
        if (a.nodes) {
          const r = findNode(a.nodes, id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

/**
 * The labels where an if's two ways meet again (an if-then's, or a skip's)
 * that nothing else jumps to: the Visual view says it in words and does not
 * show them.
 */
export function joinLabels(nodes: OutlineNode[], refs: ReadonlyMap<string, number>, out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind !== "block") continue;
    if (n.joinLabel && (refs.get(n.joinLabel) ?? 0) === 1) out.add(n.joinLabel);
    for (const a of n.arms) if (a.nodes) joinLabels(a.nodes, refs, out);
  }
  return out;
}

/** Steps shown as cards, in order (blank lines are not shown). */
export function visibleSteps(nodes: OutlineNode[]): Step[] {
  return outlineSteps(nodes).filter((s) => s.kind !== "blank");
}

const indexOf = (model: ScriptModel, id: number) => model.steps.findIndex((s) => s.id === id);

/** The lines of a node that follow its first line without a gap in the text: what moves with it. */
export function contiguousRun(model: ScriptModel, node: OutlineNode): Step[] {
  const mine = new Set(nodeSteps(node).map((s) => s.id));
  const at = indexOf(model, node.step.id);
  const out: Step[] = [];
  for (let i = at; i < model.steps.length && mine.has(model.steps[i].id); i++) out.push(model.steps[i]);
  return out;
}

const goesOnStep = (s: Step) => s.kind !== "instruction" || s.command.flow === "next" || s.command.flow === "branch" || s.command.flow === "call";
const shown = (n: OutlineNode) => n.step.kind !== "blank";

/** Whether a node starts its group (the event's own label and the comments above it): steps never move before it. */
export function isEntryNode(group: EventGroup, list: OutlineNode[], node: OutlineNode): boolean {
  if (!group.label) return false;
  const k = list.indexOf(node);
  const entry = list.findIndex((n) => n.step.label === group.label && n.step.kind === "label");
  return entry >= 0 && k >= 0 && k <= entry;
}

// ---------------------------------------------------------------------------
// Where new steps go

/** The end of a list of nodes (an event's or an arm's): before its last step when that ends the code, else after it. */
export function listEnd(nodes: OutlineNode[], fallback: Position): Position {
  const vis = nodes.filter(shown).filter((n) => n.step.kind !== "comment");
  const last = vis[vis.length - 1];
  if (!last) return fallback;
  if (last.kind === "block") {
    // an if with an "otherwise" that ends the event: its end is the event's end
    const other = last.arms.find((a) => a.key === "otherwise" && !a.skip && a.nodes?.length && !a.continuesAt);
    if (other) return listEnd(other.nodes!, { before: last.step.id });
    return { before: last.step.id };
  }
  if (last.step.kind === "label") return { after: last.step.id };
  return goesOnStep(last.step) ? { after: last.step.id } : { before: last.step.id };
}

/** The end of an event's code (for "add a step" with nothing selected). */
export function eventEnd(model: ScriptModel, group: EventGroup): Position {
  const nodes = outline(model, group);
  const lastStep = model.steps[group.to - 1];
  return listEnd(nodes, lastStep ? { after: lastStep.id } : "end");
}

/** Where a step added "after the selected one" goes: after it when the code goes on from it, else before it (so it runs). */
export function insertionPoint(model: ScriptModel, group: EventGroup, selected: number | null): Position {
  const nodes = outline(model, group);
  const found = selected !== null ? findNode(nodes, selected) : null;
  if (!found) {
    // a step inside a block (an arm's label line, an extra line)
    const s = selected !== null ? model.steps.find((x) => x.id === selected) : undefined;
    const i = s ? indexOf(model, s.id) : -1;
    if (s && i >= group.from && i < group.to) return s.kind === "label" || goesOnStep(s) ? { after: s.id } : { before: s.id };
    return eventEnd(model, group);
  }
  const { node } = found;
  if (node.kind === "block") {
    // an if (flag, money, an item…): after it, the way it goes on when it does
    // not jump (its "otherwise"), never into the branch it jumps to
    if (node.block === "branch" && goesOnStep(node.step)) return { after: node.step.id };
    if (node.block === "ifThen" && node.joinLabel) {
      const at = model.labels.get(node.joinLabel);
      const join = at !== undefined ? model.steps[at] : undefined;
      if (join?.kind === "label") return { after: join.id };
    }
    // a choice: its first answer; a battle: if won; a menu: its first choice
    const arm = node.arms.find((a) => a.nodes);
    if (node.block === "choice") return { after: node.step.id };
    if (arm?.labelStep) return { after: arm.labelStep.id };
    if (arm?.nodes?.length) return { before: arm.nodes[0].step.id };
    return goesOnStep(node.step) ? { after: (node.extra[node.extra.length - 1] ?? node.step).id } : { before: node.step.id };
  }
  const s = node.step;
  if (isEntryNode(group, found.list, node)) return { after: groupEntryStep(model, group)?.id ?? s.id };
  return s.kind === "label" || goesOnStep(s) ? { after: s.id } : { before: s.id };
}

function groupEntryStep(model: ScriptModel, group: EventGroup): Step | undefined {
  for (let i = group.from; i < group.to; i++) if (model.steps[i].label === group.label) return model.steps[i];
  return undefined;
}

/** The position after a group's last line (lines added to the end of an event), keeping a fall into the next group. */
function groupTail(model: ScriptModel, group: EventGroup): { model: ScriptModel; pos: Position } {
  let last = -1;
  for (let i = group.to - 1; i >= group.from; i--) {
    if (model.steps[i].kind !== "blank") {
      last = i;
      break;
    }
  }
  if (last < 0) return { model, pos: group.from < model.steps.length ? { before: model.steps[group.from].id } : "end" };
  let m = model;
  let pos: Position = { after: model.steps[last].id };
  // the code went on into the next group: keep it going there
  if (group.fallsInto) {
    const r = insertLines(m, pos, [instructionLine("goto", [group.fallsInto])]);
    m = r.model;
    pos = { after: r.ids[0] };
  }
  return { model: m, pos };
}

// ---------------------------------------------------------------------------
// New steps

/**
 * Starting values for a new instruction: its catalog example when it has one
 * without labels, else defaults. With `has` (whether a resource exists), a
 * battle's background is a picture the project has (not "none").
 */
export function startingValues(name: string, has?: (resType: number, type: number, index: number) => boolean): OperandValue[] {
  if (has && (name === "enterfight" || name === "initfight")) {
    const v = startingValues(name);
    const k = commandInfo(name)!.operands.findIndex((o) => o.key === "background");
    let bg = 0;
    for (let i = 1; i < 256 && !bg; i++) if (has(11, 4, i)) bg = i;
    if (k >= 0 && (!v[k] || !has(11, 4, v[k] as number))) v[k] = bg;
    return v;
  }
  if (has && name === "buy") {
    // a new shop sells the project's own items (not the catalog's example), story items left out
    const items: [number, number][] = [];
    for (let t = 1; t <= 13; t++) for (let i = 1; i < 256 && items.length < 6; i++) if (has(6, t, i)) items.push([t, i]);
    if (items.length) return [items];
  }
  const c = commandInfo(name)!;
  // new dialogue: short and neutral, so it fits its box without a warning
  if (name === "say") return [0, "Hello!"];
  if (name === "message") return ["..."];
  if (name === "timemsg") return [200, "..."];
  if (c.example && !c.operands.some((o) => o.kind === "label")) {
    const m = parseScript(`  ${c.example}`);
    const s = m.steps[0];
    if (s?.kind === "instruction" && s.op.name === name) return [...s.values];
  }
  const firstMonster = c.operands.findIndex((o) => o.kind === "monster");
  return c.operands.map((o, k) => {
    if (k === firstMonster) return 1; // a battle with one monster
    // answers that say what they do: the question has closed when they appear
    if (o.kind === "text") return o.key === "first" ? "Go ahead" : o.key === "second" ? "Not now" : "";
    if (o.kind === "label") return "label";
    return o.min !== undefined && o.min > 0 ? o.min : 0;
  });
}

const LABEL_BASE: Record<string, string> = {
  ifSecond: "answer_2",
  ifWon: "won",
  ifLost: "lost",
  ifSet: "flag_set",
  ifEqual: "equal",
  ifMore: "more",
  ifLess: "less",
  ifGreater: "greater",
  ifMissing: "missing",
  ifLucky: "lucky",
  target: "next",
};

/**
 * Add an instruction at a position, with the code its labels jump to: a new
 * arm at the end of the event for each label (`@label:` and `callback`);
 * a battle's win arm right after it (the rest of the event) and its lose arm
 * ending the game; a menu with an arm per choice. Returns the new model and
 * the id of the instruction's line.
 */
export function insertCommand(model: ScriptModel, group: EventGroup, name: string, pos: Position, values?: OperandValue[]): { model: ScriptModel; id: number } {
  const c = commandInfo(name);
  if (!c) throw new Error(`unknown instruction ${name}`);
  const vals = values ? [...values] : startingValues(name);
  let m = model;
  const taken = new Set<string>();
  const fresh = (base: string) => {
    let l = uniqueLabel(m, base);
    for (let n = 2; taken.has(l); n++) l = uniqueLabel(m, `${base}_${n}`);
    taken.add(l);
    return l;
  };
  const tails: string[][] = [];
  const lines: string[] = [];
  if (name === "menu") {
    const v = typeof vals[0] === "number" && values ? (vals[0] as number) : freeTempVariable(m);
    vals[0] = v;
    if (!values) vals[1] = "Yes No";
    const words = String(vals[1]).split(" ").filter(Boolean);
    lines.push(instructionLine("menu", vals));
    words.forEach((w, k) => {
      const l = fresh(`menu_${w.toLowerCase().replace(/\W+/g, "_") || k}`);
      lines.push(instructionLine("ifcmp", [v, k, l]));
      tails.push([`@${l}:`, "  callback"]);
    });
  } else {
    let after: string[] = [];
    c.operands.forEach((o, k) => {
      if (o.kind !== "label" || (values && typeof vals[k] === "string" && m.labels.has(vals[k] as string))) return;
      const l = fresh(LABEL_BASE[o.key] ?? o.key);
      vals[k] = l;
      if (name === "enterfight" && o.key === "ifWon") after = [`@${l}:`];
      else if (name === "enterfight" && o.key === "ifLost") tails.push([`@${l}:`, "  gameover"]);
      else tails.push([`@${l}:`, "  callback"]);
    });
    lines.push(instructionLine(name, vals), ...after);
  }
  // the arms first (at the event's end), then the line (positions are by line id)
  if (tails.length) {
    const t = groupTail(m, group);
    m = t.model;
    let p = t.pos;
    for (const tail of tails) {
      const r = insertLines(m, p, tail);
      m = r.model;
      p = { after: r.ids[r.ids.length - 1] };
    }
  }
  const r = insertLines(m, pos, lines);
  return { model: r.model, id: r.ids[0] };
}

/** A variable for a menu's answer: the lowest of 200-239 (cleared when another script starts) this script does not use. */
export function freeTempVariable(model: ScriptModel): number {
  const used = new Set<number>();
  for (const s of model.steps) {
    if (s.kind !== "instruction") continue;
    s.command.operands.forEach((o, k) => o.kind === "variable" && typeof s.values[k] === "number" && used.add(s.values[k] as number));
  }
  for (let v = 200; v <= 239; v++) if (!used.has(v)) return v;
  return 239;
}

// ---------------------------------------------------------------------------
// Editing nodes

/** Move a node (a block with the lines that follow it) one place up or down among the cards beside it. Null when it cannot. */
export function moveNode(model: ScriptModel, group: EventGroup, id: number, dir: -1 | 1): ScriptModel | null {
  const nodes = outline(model, group);
  const found = findNode(nodes, id);
  if (!found) return null;
  const { node, list } = found;
  if (isEntryNode(group, list, node)) return null;
  const vis = list.filter(shown);
  const k = vis.indexOf(node);
  const other = vis[k + dir];
  if (!other || (dir < 0 && isEntryNode(group, list, other))) return null;
  const ids = contiguousRun(model, node).map((s) => s.id);
  const run = contiguousRun(model, other);
  const pos: Position = dir < 0 ? { before: run[0].id } : { after: run[run.length - 1].id };
  return moveSteps(model, ids, pos);
}

/** Drop a node before or after another card of the same event. Null when it cannot go there. */
export function dropNode(model: ScriptModel, group: EventGroup, id: number, target: number, where: "before" | "after"): ScriptModel | null {
  if (id === target) return null;
  const nodes = outline(model, group);
  const found = findNode(nodes, id);
  const onto = findNode(nodes, target);
  if (!found || !onto || isEntryNode(group, found.list, found.node)) return null;
  const mine = new Set(nodeSteps(found.node).map((s) => s.id));
  if (mine.has(target)) return null;
  if (where === "before" && isEntryNode(group, onto.list, onto.node)) return null;
  const ids = contiguousRun(model, found.node).map((s) => s.id);
  const run = contiguousRun(model, onto.node);
  const pos: Position = where === "before" ? { before: run[0].id } : onto.node.kind === "block" ? { after: run[run.length - 1].id } : { after: target };
  return moveSteps(model, ids, pos);
}

/** The labels a set of steps defines. */
function definedLabels(steps: Step[]): string[] {
  return steps.flatMap((s) => (s.label ? [s.label] : []));
}

/** A line's text with labels renamed (definitions and jumps), by their places in the line. */
function renamed(s: Step, names: Map<string, string>): string {
  const spans: { start: number; end: number; to: string }[] = [];
  if (s.label && s.labelSpan && names.has(s.label)) spans.push({ start: s.labelSpan.start + 1, end: s.labelSpan.end - 1, to: names.get(s.label)! });
  const args = s.kind === "instruction" || s.kind === "directive" ? s.args : [];
  for (const a of args) if (a.kind === "label" && names.has(a.name)) spans.push({ start: a.span.start + 1, end: a.span.end, to: names.get(a.name)! });
  let t = s.text;
  for (const sp of spans.sort((a, b) => b.start - a.start)) t = t.slice(0, sp.start) + sp.to + t.slice(sp.end);
  return t.replace(/\r$/, "");
}

/** Copy a node after itself: a block with its arms, their labels renamed. Returns the model and the copy's first line id. */
export function duplicateNode(model: ScriptModel, group: EventGroup, id: number): { model: ScriptModel; id: number } | null {
  const nodes = outline(model, group);
  const found = findNode(nodes, id);
  if (!found || isEntryNode(group, found.list, found.node)) return null;
  const all = nodeSteps(found.node);
  const run = contiguousRun(model, found.node);
  const runIds = new Set(run.map((s) => s.id));
  const far = all.filter((s) => !runIds.has(s.id)).sort((a, b) => indexOf(model, a.id) - indexOf(model, b.id));
  const names = new Map<string, string>();
  let m = model;
  for (const l of definedLabels(all)) {
    let n = uniqueLabel(m, l);
    for (let k = 2; [...names.values()].includes(n); k++) n = uniqueLabel(m, `${l}_${k}`);
    names.set(l, n);
  }
  if (far.length) {
    const t = groupTail(m, group);
    m = t.model;
    m = insertLines(m, t.pos, far.map((s) => renamed(s, names))).model;
  }
  const r = insertLines(m, { after: run[run.length - 1].id }, run.map((s) => renamed(s, names)));
  return { model: r.model, id: r.ids[0] };
}

/**
 * The arm of a block whose code comes right after it and runs next when the
 * block goes away: a choice's first answer, a battle's win right after it.
 */
export function continuationArm(model: ScriptModel, node: Extract<OutlineNode, { kind: "block" }>): Arm | null {
  const last = node.extra.length ? node.extra[node.extra.length - 1] : node.step;
  const isBattle = node.block === "battle";
  if (!isBattle && !goesOnStep(last)) return null;
  let i = indexOf(model, last.id) + 1;
  while (i < model.steps.length && model.steps[i].kind === "blank") i++;
  const next = model.steps[i];
  if (!next) return null;
  return node.arms.find((a) => a.nodes && (a.labelStep ? a.labelStep.id === next.id : a.nodes[0]?.step.id === next.id)) ?? null;
}

/** Remove a node (a block with its arms). Refused (with a reason) for an event's own label and labels other code jumps to. */
export function deleteNode(model: ScriptModel, group: EventGroup, id: number): { model: ScriptModel } | { error: string } {
  const nodes = outline(model, group);
  const found = findNode(nodes, id);
  let steps = found ? nodeSteps(found.node) : model.steps.filter((s) => s.id === id);
  if (found?.node.kind === "block") {
    // the code that runs next anyway (a choice's first answer, a battle's win) stays
    const keep = continuationArm(model, found.node);
    if (keep?.nodes) {
      const kept = new Set(outlineSteps(keep.nodes).map((s) => s.id));
      steps = steps.filter((s) => !kept.has(s.id));
    }
  }
  // blank lines stay (they belong to the layout of the text around)
  if (steps.length > 1) steps = steps.filter((s) => s.kind !== "blank");
  if (!steps.length) return { error: "Nothing to delete." };
  if (found && isEntryNode(group, found.list, found.node) && found.node.step.label === group.label) return { error: `The label ${group.label} starts this event; remove the event in the Text view.` };
  const ids = new Set(steps.map((s) => s.id));
  const refs = labelRefCounts(model);
  // jumps from lines that stay
  const inside = new Map<string, number>();
  for (const s of steps) {
    if (s.kind !== "instruction") continue;
    s.command.operands.forEach((o, k) => {
      if (o.kind === "label" && typeof s.values[k] === "string") inside.set(s.values[k] as string, (inside.get(s.values[k] as string) ?? 0) + 1);
    });
  }
  for (const l of definedLabels(steps)) {
    if ((refs.get(l) ?? 0) > (inside.get(l) ?? 0)) return { error: `Other steps go to the label ${l}; change them first (or delete in the Text view).` };
  }
  return { model: keepArms(model, deleteSteps(model, [...ids]), group) };
}

/** The labels of the arms an outline shows nested (their code under the block). */
function nestedArmLabels(nodes: OutlineNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind !== "block") continue;
    for (const a of n.arms) {
      if (a.label && a.nodes) out.add(a.label);
      if (a.nodes) nestedArmLabels(a.nodes, out);
    }
  }
  return out;
}

/**
 * Keep the shape of the event's branches after a deletion: when removing the
 * last step of an "otherwise" left the code before an arm going on into it
 * (so the arm would show as a plain jump, and both ways would run it), end
 * that code there with "End" — the "otherwise" that was there did nothing
 * more either, and the If keeps its If set / Otherwise shape.
 */
export function keepArms(before: ScriptModel, after: ScriptModel, group: EventGroup): ScriptModel {
  const was = nestedArmLabels(outline(before, group));
  const g = after.groups.find((x) => x.label === group.label && x.start === group.start) ?? after.groups.find((x) => x.from === group.from);
  if (!g || !was.size) return after;
  const now = nestedArmLabels(outline(after, g));
  let m = after;
  for (const l of was) {
    if (now.has(l)) continue;
    const at = m.labels.get(l);
    if (at === undefined) continue;
    // the code just above the arm's label: does it now run on into it?
    let j = at - 1;
    while (j >= 0 && (m.steps[j].kind === "blank" || m.steps[j].kind === "comment" || m.steps[j].kind === "label")) j--;
    const above = m.steps[j];
    if (!above || !goesOnStep(above)) continue;
    m = insertLines(m, { after: above.id }, ["  callback"]).model;
  }
  return m;
}

/** Set several operands of one instruction (a pair's type and index). */
export function setOperands(model: ScriptModel, id: number, changes: readonly (readonly [number, OperandValue])[]): ScriptModel {
  let m = model;
  for (const [k, v] of changes) m = setOperand(m, id, k, v);
  return m;
}

/** A new label for a jump: `@name:` and `callback` at the end of the event. Returns the model and the label. */
export function addArmLabel(model: ScriptModel, group: EventGroup, base: string): { model: ScriptModel; label: string } {
  const label = uniqueLabel(model, base || "label");
  const t = groupTail(model, group);
  const r = insertLines(t.model, t.pos, [`@${label}:`, "  callback"]);
  return { model: r.model, label };
}

/** Replace a raw line's whole text (kept exactly as typed). */
export function setLineText(model: ScriptModel, id: number, text: string): ScriptModel {
  const s = model.steps.find((x) => x.id === id);
  if (!s) return model;
  return replaceSpan(model, id, { start: 0, end: s.text.replace(/\r$/, "").length }, text);
}

// ---------------------------------------------------------------------------
// Committing

export type Commit = { ok: true; text: string; bin: Uint8Array } | { ok: false; message: string; line?: number };

/** The model's text and its bytes, or why it does not assemble (the edit is then refused). */
export function commitModel(model: ScriptModel, type: number, index: number): Commit {
  const text = toSource(model);
  try {
    const bin = assemble(text);
    if (bin[0] !== type || bin[1] !== index) return { ok: false, message: `the .gut line must stay "${type} ${index}"` };
    return { ok: true, text, bin };
  } catch (e) {
    const line = e instanceof AsmError && e.line > 0 ? e.line : undefined;
    return { ok: false, message: (e as Error).message, line };
  }
}

// ---------------------------------------------------------------------------
// Dialogue steps

/** Steps whose text the player reads in a box. */
export const DIALOGUE = new Set(["say", "message", "timemsg", "choice", "showgut"]);

export function isDialogue(s: Step | undefined): s is InstructionStep {
  return !!s && s.kind === "instruction" && DIALOGUE.has(s.op.name);
}

/** The operand holding a dialogue step's main text. */
export function textOperand(s: InstructionStep): number {
  return s.command.operands.findIndex((o) => o.kind === "text");
}

/**
 * Re-wrap one dialogue step's text so no word is split across the box's
 * lines (as the text view's Wrap dialogue does for say and message lines;
 * timed messages use the message box's wrapping). Null when nothing changes.
 */
export function wrapStep(model: ScriptModel, id: number): ScriptModel | null {
  const s = model.steps.find((x) => x.id === id);
  if (!s || s.kind !== "instruction") return null;
  if (s.op.name === "say" || s.op.name === "message") {
    const body = s.text.replace(/\r$/, "");
    const r = wrapDialogue(body);
    return r.changed ? setLineText(model, id, r.text) : null;
  }
  if (s.op.name === "timemsg") {
    const text = String(s.values[1]);
    if (/\\x/.test(text) || !splitWords(text, MESSAGE_BOX).length) return null;
    return setOperand(model, id, 1, wrapMessage(text.trim().replace(/\s+/g, " ")));
  }
  return null;
}
