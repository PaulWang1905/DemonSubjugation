// A script's text as a model the visual editor works on: its header, its
// event table, and its code as steps (instructions with typed operands,
// labels, comments and blank lines), grouped into events and outlined into
// blocks (a choice with its two answers, a battle with its win / lose
// branches, "if flag … then …", menus).
//
// The text stays the source of truth. The model keeps every line's text as
// it is: `toSource(parseScript(src)) === src`, character for character, and
// an edit changes only the lines it is about (an operand edit only the
// operand's characters). Lines the model cannot read (a misspelt
// instruction, the wrong operands) are kept as "raw" steps, never rewritten.
//
// Edits return a new model (the old one is not changed); steps keep their
// `id` across edits, so a UI can use it as a key.
import { opByName, type OpSpec } from "./gut";
import { commandInfo, formatInstruction, quoteText, type CommandInfo, type Flow, type OperandValue } from "./commands";
import { gbkBytes } from "../../engine/java";

// ---------------------------------------------------------------------------
// Types

/** Characters [start, end) of a line's text. */
export interface Span {
  start: number;
  end: number;
}

/** An operand as written. */
export type Arg =
  | { kind: "num"; value: number; span: Span }
  | { kind: "label"; name: string; span: Span }
  /** `#123`: a jump to a raw address (kept by the disassembler for odd targets). */
  | { kind: "address"; value: number; span: Span }
  /** A "string". `rawBytes`: it has \xHH escapes, kept as written in `value`. */
  | { kind: "str"; value: string; span: Span; rawBytes: boolean }
  /** `type:index` (shop lists); `indexSpan` is the part after the colon. */
  | { kind: "pair"; type: number; index: number; span: Span; typeSpan: Span; indexSpan: Span }
  | { kind: "hex"; bytes: Uint8Array; span: Span };

interface StepBase {
  /** Stable across edits (a key for the UI). */
  id: number;
  /** 1-based line number in the text. */
  line: number;
  /** The line as written (without the line break). */
  text: string;
  /** A label defined on this line (`@name:`), with or without an instruction after it. */
  label?: string;
  labelSpan?: Span;
  /** A comment at the end of the line, from its `;`. */
  comment?: string;
}

export interface BlankStep extends StepBase {
  kind: "blank";
}
export interface CommentStep extends StepBase {
  kind: "comment";
  comment: string;
}
/** A line with only a label (`@done:`, maybe a comment). */
export interface LabelStep extends StepBase {
  kind: "label";
  label: string;
}
export interface InstructionStep extends StepBase {
  kind: "instruction";
  op: OpSpec;
  command: CommandInfo;
  args: Arg[];
  /** Operand values, one per operand of the instruction (see commands.ts). */
  values: OperandValue[];
}
export type DirectiveName = "gut" | "desc" | "header" | "events" | "event";
export interface DirectiveStep extends StepBase {
  kind: "directive";
  directive: DirectiveName;
  args: Arg[];
}
/** `.raw x"…"`: bytes the disassembler could not decode, kept as they are. */
export interface DataStep extends StepBase {
  kind: "data";
  bytes: Uint8Array;
}
/** A line the model cannot read (it is kept exactly). */
export interface RawStep extends StepBase {
  kind: "raw";
  reason: string;
}

export type Step = BlankStep | CommentStep | LabelStep | InstructionStep | DirectiveStep | DataStep | RawStep;

export interface ScriptHeader {
  /** From `.gut type index` (1, 1 when missing, as the assembler). */
  type: number;
  index: number;
  /** From `.desc "…"`. */
  desc: string | null;
  /** From `.header x"…"` (22 bytes). */
  headerBytes: Uint8Array | null;
  /** The `.events` count, or null when there is none (the assembler then uses the highest `.event`). */
  eventCount: number | null;
}

/** An entry of the event table (`.event n @label`). */
export interface ScriptEvent {
  number: number;
  /** The label it runs, or null for a raw address (`#123`). */
  label: string | null;
  /** The `.event` line. */
  stepId: number;
}

/**
 * An event's code: from its entry label to the next entry label (or the end).
 * The start group runs when the script starts (from its first instruction).
 */
export interface EventGroup {
  /** The code from the script's first instruction (runs when the script starts). */
  start: boolean;
  /** Event numbers whose entry is this group's label (several may share one). */
  events: number[];
  /** The entry label (null for a start group without a label). */
  label: string | null;
  /** Steps [from, to) of `model.steps`. */
  from: number;
  to: number;
  /** The next group's label when its last instruction goes on into it. */
  fallsInto: string | null;
  /** Labels in other groups this group jumps to (shared tails such as `@done: callback`). */
  jumpsOut: string[];
  /** Labels in this group other groups jump to. */
  sharedLabels: string[];
}

export interface ModelProblem {
  stepId: number;
  line: number;
  message: string;
}

export interface ScriptModel {
  readonly steps: readonly Step[];
  readonly header: ScriptHeader;
  readonly events: readonly ScriptEvent[];
  /** Label → index in `steps` of the line defining it (the first, if defined twice). */
  readonly labels: ReadonlyMap<string, number>;
  readonly groups: readonly EventGroup[];
  /** The `steps` index after the header (the first line of code or of a comment above it). */
  readonly codeFrom: number;
  /** Line break used by the text, and whether it ends with one. */
  readonly eol: "\n" | "\r\n";
  readonly finalNewline: boolean;
  /** The next free step id. */
  readonly nextId: number;
}

// ---------------------------------------------------------------------------
// Reading a line

const LABEL_DEF = /^(\s*)@([A-Za-z_]\w*):/;

interface Lexed {
  args: Arg[];
  /** Index of the comment's `;`, or -1. */
  commentAt: number;
  error?: string;
}

/** The operands of a line from character `from`, as the assembler's tokenizer reads them, with their places. */
function lexArgs(s: string, from: number): Lexed {
  const args: Arg[] = [];
  let i = from;
  const skip = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  skip();
  while (i < s.length) {
    const c = s[i];
    if (c === ";") return { args, commentAt: i };
    if (c === '"') {
      let j = i + 1;
      let value = "";
      let rawBytes = false;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") {
          const n = s[j + 1];
          if (n === "n") value += "\n";
          else if (n === '"' || n === "\\") value += n;
          else if (n === "x" && /^[0-9a-fA-F]{2}$/.test(s.substr(j + 2, 2))) {
            value += s.substr(j, 4);
            rawBytes = true;
            j += 2;
          } else return { args, commentAt: -1, error: `unknown escape \\${n ?? ""}` };
          j += 2;
        } else value += s[j++];
      }
      if (j >= s.length) return { args, commentAt: -1, error: "unterminated string" };
      args.push({ kind: "str", value, span: { start: i, end: j + 1 }, rawBytes });
      i = j + 1;
    } else if (c === "x" && s[i + 1] === '"') {
      const j = s.indexOf('"', i + 2);
      if (j < 0) return { args, commentAt: -1, error: "unterminated hex string" };
      const h = s.slice(i + 2, j);
      if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) return { args, commentAt: -1, error: "bad hex string" };
      args.push({ kind: "hex", bytes: Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)), span: { start: i, end: j + 1 } });
      i = j + 1;
    } else if (c === "@") {
      const m = /^@([A-Za-z_]\w*)/.exec(s.slice(i));
      if (!m) return { args, commentAt: -1, error: "bad label" };
      args.push({ kind: "label", name: m[1], span: { start: i, end: i + m[0].length } });
      i += m[0].length;
    } else if (c === "#") {
      const m = /^#(\d+)/.exec(s.slice(i));
      if (!m) return { args, commentAt: -1, error: "bad raw address" };
      args.push({ kind: "address", value: Number(m[1]), span: { start: i, end: i + m[0].length } });
      i += m[0].length;
    } else {
      const m = /^(-?(?:0x[0-9a-fA-F]+|\d+))(?::(\d+))?/.exec(s.slice(i));
      if (!m) return { args, commentAt: -1, error: `unexpected "${s.slice(i, i + 10)}"` };
      const v = Number(m[1]);
      const span = { start: i, end: i + m[0].length };
      if (m[2] !== undefined) {
        const colon = i + m[1].length;
        args.push({ kind: "pair", type: v, index: Number(m[2]), span, typeSpan: { start: i, end: colon }, indexSpan: { start: colon + 1, end: span.end } });
      } else args.push({ kind: "num", value: v, span });
      i += m[0].length;
    }
    skip();
  }
  return { args, commentAt: -1 };
}

/** Operand values for an instruction, or a reason the operands do not fit it (as the assembler would say). */
function checkOperands(op: OpSpec, args: Arg[]): { values: OperandValue[] } | { error: string } {
  if (op.args[0] === "buy") {
    if (args.length === 1 && args[0].kind === "hex") return { values: [[]] };
    const pairs: [number, number][] = [];
    for (const a of args) {
      if (a.kind !== "pair") return { error: "buy expects type:index pairs" };
      if (a.type < 1 || a.type > 255 || a.index < 1 || a.index > 255) return { error: "buy item numbers must be 1-255" };
      pairs.push([a.type, a.index]);
    }
    return { values: [pairs] };
  }
  if (args.length !== op.args.length) return { error: `${op.name} takes ${op.args.length} operand(s), got ${args.length}` };
  const values: OperandValue[] = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    switch (op.args[k]) {
      case "u8":
      case "u32":
        if (a.kind !== "num") return { error: "expected a number" };
        values.push(a.value);
        break;
      case "u16":
        if (a.kind !== "num") return { error: "expected a number" };
        if (a.value < 0 || a.value > 0xffff) return { error: `${a.value} does not fit in 16 bits` };
        values.push(a.value);
        break;
      case "addr":
        if (a.kind === "label") values.push(a.name);
        else if (a.kind === "address") values.push(a.value);
        else return { error: "expected @label" };
        break;
      case "str":
        if (a.kind !== "str") return { error: "expected a string" };
        values.push(a.value);
        break;
      default:
        return { error: "unexpected operand" };
    }
  }
  return { values };
}

function readLine(id: number, line: number, text: string): Step {
  const base = { id, line, text };
  const trimmed = text.trim();
  if (!trimmed) return { ...base, kind: "blank" };
  if (trimmed.startsWith(";")) return { ...base, kind: "comment", comment: trimmed };
  let at = 0;
  let label: string | undefined;
  let labelSpan: Span | undefined;
  const lm = LABEL_DEF.exec(text);
  if (lm) {
    label = lm[2];
    labelSpan = { start: lm[1].length, end: lm[0].length };
    at = lm[0].length;
  }
  const withLabel = label ? { ...base, label, labelSpan } : base;
  while (at < text.length && /\s/.test(text[at])) at++;
  if (at >= text.length || text[at] === ";") {
    if (!label) return { ...base, kind: "raw", reason: "cannot parse" };
    const comment = at < text.length ? text.slice(at).trimEnd() : undefined;
    return { ...withLabel, label, kind: "label", ...(comment ? { comment } : {}) };
  }
  const wm = /^(\.?[A-Za-z_]\w*)/.exec(text.slice(at));
  if (!wm) return { ...withLabel, kind: "raw", reason: `cannot parse "${trimmed}"` };
  const word = wm[1].toLowerCase();
  const lexed = lexArgs(text, at + wm[1].length);
  if (lexed.error) return { ...withLabel, kind: "raw", reason: lexed.error };
  const comment = lexed.commentAt >= 0 ? text.slice(lexed.commentAt).trimEnd() : undefined;
  const extra = comment ? { comment } : {};
  const { args } = lexed;
  if (word.startsWith(".")) {
    const isNum = (k: number) => args[k]?.kind === "num";
    switch (word) {
      case ".gut":
        if (!isNum(0) || !isNum(1)) return { ...withLabel, kind: "raw", reason: ".gut expects two numbers" };
        return { ...withLabel, ...extra, kind: "directive", directive: "gut", args };
      case ".desc": {
        const a = args[0];
        if (!a || a.kind !== "str") return { ...withLabel, kind: "raw", reason: ".desc expects a string" };
        if (descBytes(a.value).length > 21) return { ...withLabel, kind: "raw", reason: "description too long (max 21 bytes)" };
        return { ...withLabel, ...extra, kind: "directive", directive: "desc", args };
      }
      case ".header": {
        const a = args[0];
        if (!a || a.kind !== "hex" || a.bytes.length !== 22) return { ...withLabel, kind: "raw", reason: '.header expects x"…" of 22 bytes' };
        return { ...withLabel, ...extra, kind: "directive", directive: "header", args };
      }
      case ".events": {
        const a = args[0];
        if (!a || a.kind !== "num" || a.value < 0 || a.value > 255) return { ...withLabel, kind: "raw", reason: "event count must be 0-255" };
        return { ...withLabel, ...extra, kind: "directive", directive: "events", args };
      }
      case ".event":
        if (!isNum(0) || !args[1] || (args[1].kind !== "label" && args[1].kind !== "address")) return { ...withLabel, kind: "raw", reason: ".event expects a number and @label" };
        return { ...withLabel, ...extra, kind: "directive", directive: "event", args };
      case ".raw": {
        const a = args[0];
        if (!a || a.kind !== "hex") return { ...withLabel, kind: "raw", reason: '.raw expects x"…"' };
        return { ...withLabel, ...extra, kind: "data", bytes: a.bytes };
      }
      default:
        return { ...withLabel, kind: "raw", reason: `unknown directive ${word}` };
    }
  }
  const op = opByName(word);
  if (!op) return { ...withLabel, kind: "raw", reason: `unknown instruction "${word}"` };
  const checked = checkOperands(op, args);
  if ("error" in checked) return { ...withLabel, kind: "raw", reason: checked.error };
  return { ...withLabel, ...extra, kind: "instruction", op, command: commandInfo(op.name)!, args, values: checked.values };
}

/** A .desc string's bytes (\xHH escapes count one). */
function descBytes(value: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && value[i + 1] === "x") {
      out.push(0);
      i += 3;
    } else for (const b of gbkBytes(value[i])) out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Building the model

interface SourceLine {
  id: number;
  text: string;
}

/** Read a script's text into a model. */
export function parseScript(src: string): ScriptModel {
  const finalNewline = src.endsWith("\n");
  const body = finalNewline ? src.slice(0, -1) : src;
  const texts = src.length ? body.split("\n") : [];
  const eol = texts.length && texts[0].endsWith("\r") ? "\r\n" : "\n";
  return build(
    texts.map((text, i) => ({ id: i + 1, text })),
    eol,
    finalNewline,
    texts.length + 1,
  );
}

/** The model's text: the original text when nothing was changed. */
export function toSource(model: ScriptModel): string {
  return model.steps.map((s) => s.text).join("\n") + (model.finalNewline ? "\n" : "");
}

const isCode = (s: Step): s is InstructionStep | DataStep => s.kind === "instruction" || s.kind === "data";

function build(lines: SourceLine[], eol: "\n" | "\r\n", finalNewline: boolean, nextId: number): ScriptModel {
  const steps = lines.map((l, i) => readLine(l.id, i + 1, l.text));
  const header: ScriptHeader = { type: 1, index: 1, desc: null, headerBytes: null, eventCount: null };
  const eventMap = new Map<number, ScriptEvent>();
  const labels = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.label && !labels.has(s.label)) labels.set(s.label, i);
    if (s.kind !== "directive") return;
    const a = s.args;
    switch (s.directive) {
      case "gut":
        header.type = (a[0] as { value: number }).value;
        header.index = (a[1] as { value: number }).value;
        break;
      case "desc":
        header.desc = (a[0] as { value: string }).value;
        header.headerBytes = null;
        break;
      case "header":
        header.headerBytes = (a[0] as { bytes: Uint8Array }).bytes;
        header.desc = null;
        break;
      case "events":
        header.eventCount = (a[0] as { value: number }).value;
        break;
      case "event": {
        const n = (a[0] as { value: number }).value;
        eventMap.set(n, { number: n, label: a[1].kind === "label" ? a[1].name : null, stepId: s.id });
        break;
      }
    }
  });
  const events = [...eventMap.values()].sort((x, y) => x.number - y.number);
  // the header: the directives (and blank lines and comments among them) before the code
  let firstCode = steps.findIndex((s) => s.kind !== "directive" && s.kind !== "blank" && s.kind !== "comment");
  if (firstCode < 0) firstCode = steps.length;
  let codeFrom = firstCode;
  while (codeFrom > 0 && steps[codeFrom - 1].kind === "comment") codeFrom--;
  const model: ScriptModel = { steps, header, events, labels, groups: [], codeFrom, eol, finalNewline, nextId };
  (model as unknown as { groups: EventGroup[] }).groups = buildGroups(model);
  return model;
}

// ---------------------------------------------------------------------------
// Flow

/** The step index where a label's code starts (the first instruction at or after it), or -1. */
export function labelTarget(model: ScriptModel, label: string): number {
  const at = model.labels.get(label);
  if (at === undefined) return -1;
  for (let i = at; i < model.steps.length; i++) if (isCode(model.steps[i])) return i;
  return -1;
}

const flowOf = (s: Step): Flow => (s.kind === "instruction" ? s.command.flow : "end");

/** Labels an instruction may jump to (its label operands). */
export function jumpLabels(s: Step): string[] {
  if (s.kind !== "instruction") return [];
  const out: string[] = [];
  s.op.args.forEach((k, i) => {
    if (k === "addr" && typeof s.values[i] === "string") out.push(s.values[i] as string);
  });
  return out;
}

/** Whether the line after this one runs next (no callback, goto, script switch or battle in between). */
export function goesOn(s: Step): boolean {
  const f = flowOf(s);
  return f === "next" || f === "branch" || f === "call";
}

/**
 * The instruction-level flow graph: for each code step (index into
 * `model.steps`), the code steps that can run next. `event n` goes on at
 * event n's second instruction, as the engine does; jumps to raw addresses
 * are not followed.
 */
export function successors(model: ScriptModel, i: number): number[] {
  let cache = succCache.get(model);
  if (!cache) succCache.set(model, (cache = []));
  return (cache[i] ??= computeSuccessors(model, i));
}

/** Models never change, so their flow graphs are kept. */
const succCache = new WeakMap<ScriptModel, number[][]>();

function computeSuccessors(model: ScriptModel, i: number): number[] {
  const s = model.steps[i];
  if (!isCode(s)) return [];
  const out: number[] = [];
  if (goesOn(s)) {
    const n = nextCode(model, i + 1);
    if (n >= 0) out.push(n);
  }
  for (const l of jumpLabels(s)) {
    const t = labelTarget(model, l);
    if (t >= 0 && !out.includes(t)) out.push(t);
  }
  if (s.kind === "instruction" && s.op.name === "event") {
    // the engine goes on at the event's second instruction (see commands.ts)
    const ev = model.events.find((e) => e.number === s.values[0]);
    const t = ev?.label ? labelTarget(model, ev.label) : -1;
    const t2 = t >= 0 ? nextCode(model, t + 1) : -1;
    if (t2 >= 0) out.push(t2);
  }
  return out;
}

function nextCode(model: ScriptModel, from: number): number {
  for (let i = from; i < model.steps.length; i++) if (isCode(model.steps[i])) return i;
  return -1;
}

/** The first instruction of the script (where it starts), or -1. */
export function entryStep(model: ScriptModel): number {
  return nextCode(model, 0);
}

/**
 * Dominators from an entry: for each code step reachable from `entry`, the
 * steps every path from the entry passes through to reach it (itself
 * included). Small scripts, so the simple iterative algorithm.
 */
export function dominators(model: ScriptModel, entry: number): Map<number, Set<number>> {
  const order: number[] = [];
  const seen = new Set<number>([entry]);
  const stack = [entry];
  while (stack.length) {
    const n = stack.pop()!;
    order.push(n);
    for (const m of successors(model, n)) if (!seen.has(m)) (seen.add(m), stack.push(m));
  }
  const preds = new Map<number, number[]>(order.map((n) => [n, []]));
  for (const n of order) for (const m of successors(model, n)) preds.get(m)!.push(n);
  const all = new Set(order);
  const dom = new Map<number, Set<number>>(order.map((n) => [n, n === entry ? new Set([entry]) : new Set(all)]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of order) {
      if (n === entry) continue;
      let inter = null as Set<number> | null;
      for (const p of preds.get(n)!) {
        const d = dom.get(p)!;
        inter = inter ? new Set([...inter].filter((x) => d.has(x))) : new Set(d);
      }
      const next = inter ?? new Set<number>();
      next.add(n);
      const cur = dom.get(n)!;
      if (next.size !== cur.size || [...next].some((x) => !cur.has(x))) {
        dom.set(n, next);
        changed = true;
      }
    }
  }
  return dom;
}

// ---------------------------------------------------------------------------
// Groups

function buildGroups(model: ScriptModel): EventGroup[] {
  const { steps } = model;
  const entryLabels = new Map<string, number[]>();
  for (const e of model.events) if (e.label) entryLabels.set(e.label, [...(entryLabels.get(e.label) ?? []), e.number]);
  // boundaries: entry labels (with the comment lines just above them)
  const starts: { at: number; label: string }[] = [];
  for (const [label, at] of model.labels) {
    if (!entryLabels.has(label) || at < model.codeFrom) continue;
    let from = at;
    while (from > model.codeFrom && steps[from - 1].kind === "comment") from--;
    starts.push({ at: from, label });
  }
  starts.sort((a, b) => a.at - b.at);
  const groups: EventGroup[] = [];
  const first = entryStep(model);
  const mk = (from: number, to: number, label: string | null): EventGroup => ({
    start: first >= from && first < to,
    events: label ? [...(entryLabels.get(label) ?? [])].sort((a, b) => a - b) : [],
    label,
    from,
    to,
    fallsInto: null,
    jumpsOut: [],
    sharedLabels: [],
  });
  if (!starts.length || starts[0].at > model.codeFrom) {
    // the start code, before the first event
    const to = starts.length ? starts[0].at : steps.length;
    const firstLabel = steps.slice(model.codeFrom, to).find((s) => s.label)?.label ?? null;
    if (to > model.codeFrom || !starts.length) groups.push(mk(model.codeFrom, to, firstLabel));
  }
  starts.forEach((s, k) => groups.push(mk(s.at, k + 1 < starts.length ? starts[k + 1].at : steps.length, s.label)));
  // links between groups
  const groupOf = (i: number) => groups.findIndex((g) => i >= g.from && i < g.to);
  groups.forEach((g, gi) => {
    let last = -1;
    for (let i = g.from; i < g.to; i++) {
      const s = steps[i];
      if (isCode(s)) last = i;
      for (const l of jumpLabels(s)) {
        const at = model.labels.get(l);
        if (at === undefined) continue;
        const tg = groupOf(at);
        if (tg !== gi && tg >= 0) {
          if (!g.jumpsOut.includes(l)) g.jumpsOut.push(l);
          if (!groups[tg].sharedLabels.includes(l)) groups[tg].sharedLabels.push(l);
        }
      }
    }
    if (last >= 0 && goesOn(steps[last]) && gi + 1 < groups.length && nextCode(model, g.to) >= 0) g.fallsInto = groups[gi + 1].label;
  });
  return groups;
}

/** The group a step is in. */
export function groupOfStep(model: ScriptModel, id: number): EventGroup | undefined {
  const i = model.steps.findIndex((s) => s.id === id);
  return model.groups.find((g) => i >= g.from && i < g.to);
}

/** The group an event runs (by event number). */
export function eventGroup(model: ScriptModel, n: number): EventGroup | undefined {
  return model.groups.find((g) => g.events.includes(n));
}

/** The start group (the code run when the script starts). */
export function startGroup(model: ScriptModel): EventGroup | undefined {
  return model.groups.find((g) => g.start);
}

/** What an event number means: 1-40 talking to the person or object placed as that number, 41+ a map event. */
export function eventMeaning(n: number): { kind: "person"; id: number } | { kind: "tile"; mapEvent: number } {
  return n <= 40 ? { kind: "person", id: n } : { kind: "tile", mapEvent: n - 40 };
}

// ---------------------------------------------------------------------------
// Outline: blocks

/** A branch of a block: its steps nested here, or a jump to a label elsewhere. */
export interface Arm {
  /** The operand key it comes from ("ifSet", "ifWon"…), "first" for a choice's first answer, or the menu choice's number. */
  key: string;
  /** "If set", "If won", "“Rest”"… */
  title: string;
  /** The label it jumps to (null for code that follows directly). */
  label: string | null;
  /** The label's own line, when it has one and the arm is nested. */
  labelStep: Step | null;
  /** The arm's steps, or null when it only jumps to the label (shared, or before the branch). */
  nodes: OutlineNode[] | null;
  /** Where the arm's code goes on when it does not end (the next label), or null. */
  continuesAt: string | null;
  /**
   * An "if … is set: skip these" arm: nothing of its own, it goes on at the
   * label (the block's joinLabel) the other way also reaches.
   */
  skip?: boolean;
}

export type BlockKind = "choice" | "battle" | "menu" | "ifThen" | "branch";

export type OutlineNode =
  | { kind: "step"; step: Step }
  | {
      kind: "block";
      block: BlockKind;
      /** The branching instruction. */
      step: InstructionStep;
      /** Other lines that belong to the block (the goto of an if-then, the comparisons after a menu). */
      extra: Step[];
      arms: Arm[];
      /** if-then, or a branch that skips steps: the label both ways meet at. */
      joinLabel?: string;
    };

interface Segment {
  label: string | null;
  from: number;
  to: number;
}

/** How many places jump to each label (operands and the event table). */
export function labelRefCounts(model: ScriptModel): Map<string, number> {
  const out = new Map<string, number>();
  const add = (l: string) => out.set(l, (out.get(l) ?? 0) + 1);
  for (const s of model.steps) {
    for (const l of jumpLabels(s)) add(l);
    if (s.kind === "directive" && s.directive === "event" && s.args[1].kind === "label") add(s.args[1].name);
  }
  return out;
}

/**
 * A group's steps as an outline: steps in order, with branches as blocks
 * whose arms hold the code they jump to when that code is only reached from
 * there (it follows the branch, is not an event's entry, is not fallen into
 * from the line above, and nothing else jumps to it). Every step of the
 * group appears exactly once (see `outlineSteps`).
 */
export function outline(model: ScriptModel, group: EventGroup): OutlineNode[] {
  const { steps } = model;
  const refs = labelRefCounts(model);
  const entry = new Set(model.events.flatMap((e) => (e.label ? [e.label] : [])));
  // segments: a label starts one
  const segs: Segment[] = [];
  for (let i = group.from; i < group.to; i++) {
    if (i === group.from || steps[i].label) segs.push({ label: steps[i].label ?? null, from: i, to: i + 1 });
    else segs[segs.length - 1].to = i + 1;
  }
  const segByLabel = new Map(segs.filter((s) => s.label).map((s) => [s.label!, s]));
  const consumed = new Set<Segment>();

  const prevCode = (i: number) => {
    for (let j = i - 1; j >= group.from; j--) if (isCode(steps[j])) return steps[j];
    return null;
  };
  const lastCode = (seg: Segment) => {
    for (let j = seg.to - 1; j >= seg.from; j--) if (isCode(steps[j])) return steps[j];
    return null;
  };
  const nestable = (label: string, after: number): Segment | null => {
    const seg = segByLabel.get(label);
    if (!seg || consumed.has(seg) || seg.from <= after || entry.has(label) || (refs.get(label) ?? 0) !== 1) return null;
    const p = prevCode(seg.from);
    if (p && goesOn(p)) return null;
    return seg;
  };
  /** The segment that follows `seg` (for an arm that goes on into the next label). */
  const nextSeg = (seg: Segment) => segs[segs.indexOf(seg) + 1] ?? null;
  /** Segments shown inline in a choice's first answer (an if-then's join it goes on with). */
  const inlined = new Set<Segment>();
  /**
   * The join of an if-then whose `goto` is at k (branch @A; goto @B; @A: …
   * going on into @B:), when only that goto jumps to @B: the segment of @B.
   */
  const ifThenJoin = (k: number): Segment | null => {
    const g = steps[k];
    if (g.kind !== "instruction" || g.op.name !== "goto" || g.label || typeof g.values[0] !== "string") return null;
    const b = steps[k - 1];
    if (!b || b.kind !== "instruction" || b.command.flow !== "branch") return null;
    const labs = jumpLabels(b);
    if (labs.length !== 1) return null;
    const segA = segByLabel.get(labs[0]);
    const join = g.values[0] as string;
    if (!segA || segA.from !== k + 1 || entry.has(labs[0]) || (refs.get(labs[0]) ?? 0) !== 1) return null;
    const last = lastCode(segA);
    const segB = nextSeg(segA);
    if (!last || !goesOn(last) || !segB || segB.label !== join || entry.has(join) || (refs.get(join) ?? 0) !== 1) return null;
    return segB;
  };

  /** Nodes for steps [from, to), nesting what branches there take. */
  const nodesOf = (from: number, to: number): OutlineNode[] => {
    const out: OutlineNode[] = [];
    for (let i = from; i < to; i++) {
      const s = steps[i];
      // (a range that spans labels: the segments nested elsewhere are shown there)
      if (i > from && s.label) {
        const seg = segByLabel.get(s.label);
        if (seg && seg.from === i && consumed.has(seg)) {
          i = seg.to - 1;
          continue;
        }
      }
      const branches = s.kind === "instruction" && (s.command.flow === "branch" || s.command.flow === "battle" || s.op.name === "menu");
      if (!branches) {
        out.push({ kind: "step", step: s });
        continue;
      }
      const r = blockAt(i, to);
      out.push(r.node);
      i = r.last;
    }
    return out;
  };

  const nestedArm = (key: string, title: string, label: string, after: number): Arm => {
    const seg = nestable(label, after);
    if (!seg) return { key, title, label, labelStep: null, nodes: null, continuesAt: null };
    consumed.add(seg);
    const first = steps[seg.from];
    const labelStep = first.kind === "label" ? first : null;
    const nodes = nodesOf(labelStep ? seg.from + 1 : seg.from, seg.to);
    const last = lastCode(seg);
    const cont = last && goesOn(last) ? (nextSeg(seg)?.label ?? null) : null;
    return { key, title, label, labelStep, nodes, continuesAt: cont };
  };

  /** A block for the branching instruction at i (segment end `to`); `last` = its last step index here. */
  const blockAt = (i: number, to: number): { node: OutlineNode; last: number } => {
    const s = steps[i] as InstructionStep;
    const c = s.command;
    const labelArgs = c.operands.flatMap((o, k) => (o.kind === "label" && typeof s.values[k] === "string" ? [{ o, k, label: s.values[k] as string }] : []));
    const title = (o: (typeof labelArgs)[number]["o"]) => o.label;
    if (c.name === "choice" && labelArgs.length === 1) {
      // first answer: the lines after it up to the end of the flow (past an
      // if-then's join, whose code the answer goes on with)
      let end = i + 1;
      let limit = to;
      for (;;) {
        while (end < limit && !(isCode(steps[end]) && !goesOn(steps[end]))) end++;
        const join = end < limit ? ifThenJoin(end) : null;
        if (!join) break;
        inlined.add(join);
        limit = Math.max(limit, join.to);
        end = join.from + 1;
      }
      const firstTo = Math.min(end + 1, limit);
      const firstLast = (() => {
        for (let j = firstTo - 1; j > i; j--) if (isCode(steps[j])) return steps[j];
        return null;
      })();
      const second = labelArgs[0];
      const armSecond = nestedArm(second.o.key, `“${String(s.values[1]).trim()}”`, second.label, i);
      const firstArm: Arm = {
        key: "first",
        title: `“${String(s.values[0]).trim()}”`,
        label: null,
        labelStep: null,
        nodes: nodesOf(i + 1, firstTo),
        // it runs on into the next label only when it does not end
        continuesAt: !firstLast || goesOn(firstLast) ? (steps[firstTo]?.label ?? null) : null,
      };
      return { node: { kind: "block", block: "choice", step: s, extra: [], arms: [firstArm, armSecond] }, last: firstTo - 1 };
    }
    if (c.name === "menu") {
      // the comparisons that follow: ifcmp var, k, @label
      const extra: InstructionStep[] = [];
      let j = i + 1;
      for (; j < to; j++) {
        const t = steps[j];
        if (t.kind === "instruction" && t.op.name === "ifcmp" && t.values[0] === s.values[0] && typeof t.values[2] === "string" && !t.label) extra.push(t);
        else break;
      }
      const words = String(s.values[1]).split(" ");
      const arms = extra.map((t) => {
        const k = t.values[1] as number;
        return nestedArm(String(k), `“${words[k] ?? `choice ${k}`}”`, t.values[2] as string, j - 1);
      });
      return { node: { kind: "block", block: "menu", step: s, extra, arms }, last: j - 1 };
    }
    if (c.name === "enterfight" && labelArgs.length === 2) {
      const won = labelArgs.find((a) => a.o.key === "ifWon")!;
      const lost = labelArgs.find((a) => a.o.key === "ifLost")!;
      const arms = [nestedArm(won.o.key, "If won", won.label, i), nestedArm(lost.o.key, "If lost", lost.label, i)];
      return { node: { kind: "block", block: "battle", step: s, extra: [], arms }, last: i };
    }
    if (labelArgs.length === 1 && c.flow === "branch") {
      const a = labelArgs[0];
      // a skip: branch @L; steps that go on into @L (they run only when it does not jump)
      const j = model.labels.get(a.label) ?? -1;
      if (j > i + 1 && j <= to && !entry.has(a.label) && (refs.get(a.label) ?? 0) === 1 && steps[j].kind === "label") {
        let plain = true;
        for (let k = i + 1; k < j && plain; k++) if (steps[k].label || (isCode(steps[k]) && !goesOn(steps[k]))) plain = false;
        if (plain && steps.slice(i + 1, j).some(isCode)) {
          const arms: Arm[] = [
            { key: a.o.key, title: title(a.o), label: a.label, labelStep: null, nodes: [], continuesAt: a.label, skip: true },
            { key: "otherwise", title: "Otherwise", label: null, labelStep: null, nodes: nodesOf(i + 1, j), continuesAt: a.label },
          ];
          return { node: { kind: "block", block: "branch", step: s, extra: [], arms, joinLabel: a.label }, last: j - 1 };
        }
      }
      // if-else: branch @A; steps that end; @A: … (the steps are the "otherwise")
      const segA = segByLabel.get(a.label);
      if (segA && segA.from === to && i + 1 < to && nestable(a.label, i)) {
        let lastStep: Step | null = null;
        for (let k = to - 1; k > i; k--)
          if (isCode(steps[k])) {
            lastStep = steps[k];
            break;
          }
        if (lastStep && flowOf(lastStep) === "end") {
          const then = nestedArm(a.o.key, title(a.o), a.label, i);
          const otherwise: Arm = { key: "otherwise", title: "Otherwise", label: null, labelStep: null, nodes: nodesOf(i + 1, to), continuesAt: null };
          return { node: { kind: "block", block: "branch", step: s, extra: [], arms: [then, otherwise] }, last: to - 1 };
        }
      }
    }
    // if-then: branch @A; goto @B; @A: … (goes on into) @B:
    if (labelArgs.length === 1 && c.flow === "branch") {
      const g = steps[i + 1];
      const a = labelArgs[0].label;
      if (g && i + 1 < to && g.kind === "instruction" && g.op.name === "goto" && !g.label && typeof g.values[0] === "string") {
        const segA = segByLabel.get(a);
        const join = g.values[0] as string;
        if (segA && segA.from === i + 2 && nestable(a, i)) {
          const last = lastCode(segA);
          if (last && goesOn(last) && nextSeg(segA)?.label === join) {
            const arm = nestedArm(labelArgs[0].o.key, title(labelArgs[0].o), a, i);
            return { node: { kind: "block", block: "ifThen", step: s, extra: [g], arms: [arm], joinLabel: join }, last: i + 1 };
          }
        }
      }
    }
    const arms = labelArgs.map((x) => nestedArm(x.o.key, title(x.o), x.label, i));
    return { node: { kind: "block", block: "branch", step: s, extra: [], arms }, last: i };
  };

  const out: OutlineNode[] = [];
  for (const seg of segs) {
    if (consumed.has(seg) || inlined.has(seg)) continue;
    out.push(...nodesOf(seg.from, seg.to));
  }
  return out;
}

/** Every step of an outline, in the order shown. */
export function outlineSteps(nodes: OutlineNode[]): Step[] {
  const out: Step[] = [];
  const walk = (ns: OutlineNode[]) => {
    for (const n of ns) {
      if (n.kind === "step") out.push(n.step);
      else {
        out.push(n.step, ...n.extra);
        for (const a of n.arms) {
          if (a.labelStep) out.push(a.labelStep);
          if (a.nodes) walk(a.nodes);
        }
      }
    }
  };
  walk(nodes);
  return out;
}

// ---------------------------------------------------------------------------
// Problems

/** What would stop the text assembling, or is likely a mistake: lines not understood, unknown or duplicate labels, events out of range. */
export function modelProblems(model: ScriptModel): ModelProblem[] {
  const out: ModelProblem[] = [];
  const seen = new Set<string>();
  const count = model.header.eventCount ?? Math.max(0, ...model.events.map((e) => e.number));
  for (const s of model.steps) {
    const at = (message: string) => out.push({ stepId: s.id, line: s.line, message });
    if (s.kind === "raw") at(s.reason);
    if (s.label) {
      if (seen.has(s.label)) at(`duplicate label @${s.label}`);
      seen.add(s.label);
    }
    for (const l of jumpLabels(s)) if (!model.labels.has(l)) at(`unknown label @${l}`);
    if (s.kind === "directive" && s.directive === "event") {
      const n = (s.args[0] as { value: number }).value;
      if (s.args[1].kind === "label" && !model.labels.has(s.args[1].name)) at(`unknown label @${s.args[1].name}`);
      if (n < 1 || n > count) at(`event ${n} is outside 1..${count} (raise the .events count)`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edits

/** Where to put new lines: before or after a step, or at the end of the text. */
export type Position = { before: number } | { after: number } | "end";

function linesOf(model: ScriptModel): SourceLine[] {
  return model.steps.map((s) => ({ id: s.id, text: s.text }));
}
function rebuild(model: ScriptModel, lines: SourceLine[], nextId = model.nextId): ScriptModel {
  return build(lines, model.eol, model.finalNewline, nextId);
}
function indexOfId(model: ScriptModel, id: number): number {
  const i = model.steps.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no step ${id}`);
  return i;
}
function positionIndex(model: ScriptModel, pos: Position): number {
  if (pos === "end") return model.steps.length;
  return "before" in pos ? indexOfId(model, pos.before) : indexOfId(model, pos.after) + 1;
}
const withEol = (model: ScriptModel, text: string) => (model.eol === "\r\n" && !text.endsWith("\r") ? text + "\r" : text);

/** Insert lines (text without line breaks). Returns the new model and the new steps' ids. */
export function insertLines(model: ScriptModel, pos: Position, texts: readonly string[]): { model: ScriptModel; ids: number[] } {
  const lines = linesOf(model);
  const at = positionIndex(model, pos);
  let next = model.nextId;
  const added = texts.map((t) => ({ id: next++, text: withEol(model, t) }));
  lines.splice(at, 0, ...added);
  return { model: rebuild(model, lines, next), ids: added.map((a) => a.id) };
}

/** Remove steps. References to labels they defined are left as they are (see modelProblems). */
export function deleteSteps(model: ScriptModel, ids: readonly number[]): ScriptModel {
  const gone = new Set(ids);
  return rebuild(
    model,
    linesOf(model).filter((l) => !gone.has(l.id)),
  );
}

/** Move steps (kept in their order) to a position. */
export function moveSteps(model: ScriptModel, ids: readonly number[], pos: Position): ScriptModel {
  const set = new Set(ids);
  const lines = linesOf(model);
  const moving = lines.filter((l) => set.has(l.id));
  if (pos !== "end" && set.has("before" in pos ? pos.before : pos.after)) return model;
  const rest = lines.filter((l) => !set.has(l.id));
  const at = pos === "end" ? rest.length : "before" in pos ? rest.findIndex((l) => l.id === pos.before) : rest.findIndex((l) => l.id === pos.after) + 1;
  rest.splice(at, 0, ...moving);
  return rebuild(model, rest);
}

/** Replace a step's whole line. */
export function replaceLine(model: ScriptModel, id: number, text: string): ScriptModel {
  const lines = linesOf(model);
  const i = indexOfId(model, id);
  lines[i] = { id, text: withEol(model, text) };
  return rebuild(model, lines);
}

/** Replace characters [start, end) of a step's line. */
export function replaceSpan(model: ScriptModel, id: number, span: Span, text: string): ScriptModel {
  const s = model.steps[indexOfId(model, id)];
  return replaceLine(model, id, s.text.slice(0, span.start) + text + s.text.slice(span.end));
}

/** Text for an instruction line: two spaces of indent, then the instruction. */
export function instructionLine(name: string, values: readonly OperandValue[], indent = "  "): string {
  return indent + formatInstruction(name, values);
}

/**
 * Change one operand of an instruction (operand k as in commands.ts), only
 * its characters: numbers as numbers, text quoted, labels with @, a shop list
 * as type:index pairs.
 */
export function setOperand(model: ScriptModel, id: number, k: number, value: OperandValue): ScriptModel {
  const s = model.steps[indexOfId(model, id)];
  if (s.kind !== "instruction") throw new Error("not an instruction");
  const kind = s.op.args[k] ?? s.op.args[0];
  if (kind === "buy") {
    const pairs = value as readonly (readonly [number, number])[];
    const text = pairs.map(([t, i]) => `${t}:${i}`).join(", ");
    if (!s.args.length) {
      const end = s.labelSpan ? s.text.indexOf("buy", s.labelSpan.end) + 3 : s.text.toLowerCase().indexOf("buy") + 3;
      return replaceSpan(model, id, { start: end, end }, text ? " " + text : "");
    }
    return replaceSpan(model, id, { start: s.args[0].span.start, end: s.args[s.args.length - 1].span.end }, text);
  }
  const arg = s.args[k];
  let text: string;
  if (kind === "addr") text = typeof value === "number" ? `#${value}` : `@${value}`;
  else if (kind === "str") text = quoteText(String(value));
  else {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`operand ${k} of ${s.op.name} is a number`);
    text = String(value);
  }
  return replaceSpan(model, id, arg.span, text);
}

/** Rename a label everywhere: its definition, jumps to it and the event table. */
export function renameLabel(model: ScriptModel, from: string, to: string): ScriptModel {
  if (!/^[A-Za-z_]\w*$/.test(to)) throw new Error(`"${to}" is not a label name`);
  if (model.labels.has(to)) throw new Error(`@${to} already exists`);
  const lines = linesOf(model);
  model.steps.forEach((s, i) => {
    const spans: Span[] = [];
    if (s.label === from && s.labelSpan) spans.push({ start: s.labelSpan.start + 1, end: s.labelSpan.end - 1 });
    const args = s.kind === "instruction" || s.kind === "directive" ? s.args : [];
    for (const a of args) if (a.kind === "label" && a.name === from) spans.push({ start: a.span.start + 1, end: a.span.end });
    if (!spans.length) return;
    let t = s.text;
    for (const sp of spans.sort((a, b) => b.start - a.start)) t = t.slice(0, sp.start) + to + t.slice(sp.end);
    lines[i] = { id: s.id, text: t };
  });
  return rebuild(model, lines);
}

/** A label name not used yet: base, base_2, base_3… */
export function uniqueLabel(model: ScriptModel, base: string): string {
  const clean = base.replace(/\W+/g, "_").replace(/^(\d)/, "_$1") || "label";
  if (!model.labels.has(clean)) return clean;
  for (let n = 2; ; n++) if (!model.labels.has(`${clean}_${n}`)) return `${clean}_${n}`;
}

/** Person / object numbers (1-40) the script places or has events for. */
export function usedIds(model: ScriptModel): Set<number> {
  const out = new Set<number>(model.events.filter((e) => e.number <= 40).map((e) => e.number));
  for (const s of model.steps) if (s.kind === "instruction" && (s.op.name === "createnpc" || s.op.name === "createbox")) out.add(s.values[0] as number);
  return out;
}

/** The lowest person / object number (1-40) the script does not use, or null. */
export function freeId(model: ScriptModel): number | null {
  const used = usedIds(model);
  for (let i = 1; i <= 40; i++) if (!used.has(i)) return i;
  return null;
}

/** The lowest map event n (event 40 + n) without an entry in the event table. */
export function freeMapEvent(model: ScriptModel): number {
  const used = new Set(model.events.map((e) => e.number));
  for (let n = 1; n <= 215; n++) if (!used.has(40 + n)) return n;
  throw new Error("no free map event");
}

/**
 * Add an entry to the event table: `.event n @label` after the last `.event`
 * line (or `.events`), with the `.events` count raised when needed, and, when
 * the label does not exist yet, its code at the end of the text: a blank
 * line, `@label:` and `body` (default: callback).
 */
export function addEvent(model: ScriptModel, n: number, label: string, body: readonly string[] = ["  callback"]): ScriptModel {
  if (!Number.isInteger(n) || n < 1 || n > 255) throw new Error("events are 1-255");
  if (model.events.some((e) => e.number === n)) throw new Error(`event ${n} already has an entry`);
  if (!/^[A-Za-z_]\w*$/.test(label)) throw new Error(`"${label}" is not a label name`);
  let m = model;
  if (!m.labels.has(label)) {
    const tail = [...(m.steps.length && m.steps[m.steps.length - 1].kind !== "blank" ? [""] : []), `@${label}:`, ...body];
    m = insertLines(m, "end", tail).model;
  }
  m = setEventCount(m, n);
  // after the .event lines (kept in number order where they are), else after .events / the header
  const evSteps = m.steps.filter((s) => s.kind === "directive" && s.directive === "event") as DirectiveStep[];
  const line = `.event ${n} @${label}`;
  if (evSteps.length) {
    const after = [...evSteps].reverse().find((s) => (s.args[0] as { value: number }).value < n);
    const pos: Position = after ? { after: after.id } : { before: evSteps[0].id };
    return insertLines(m, pos, [line]).model;
  }
  const anchor = [...m.steps.slice(0, m.codeFrom)].reverse().find((s) => s.kind === "directive");
  return insertLines(m, anchor ? { after: anchor.id } : m.steps.length ? { before: m.steps[0].id } : "end", [line]).model;
}

/** Raise the `.events` count to at least n (no change when it is already enough or there is no `.events` line). */
export function setEventCount(model: ScriptModel, n: number): ScriptModel {
  const ev = model.steps.find((s) => s.kind === "directive" && s.directive === "events") as DirectiveStep | undefined;
  if (!ev) return model;
  const a = ev.args[0] as { value: number; span: Span };
  return a.value >= n ? model : replaceSpan(model, ev.id, a.span, String(n));
}

/** Point an event at another label. */
export function setEventLabel(model: ScriptModel, n: number, label: string): ScriptModel {
  const e = model.events.find((x) => x.number === n);
  if (!e) throw new Error(`event ${n} has no entry`);
  const s = model.steps[indexOfId(model, e.stepId)] as DirectiveStep;
  return replaceSpan(model, e.stepId, s.args[1].span, `@${label}`);
}

/** Remove an event's entry (its code stays). */
export function removeEvent(model: ScriptModel, n: number): ScriptModel {
  const e = model.events.find((x) => x.number === n);
  return e ? deleteSteps(model, [e.stepId]) : model;
}

/**
 * Where the start code should place someone so they are there every time
 * the script starts: after the last createnpc / createbox that runs on every
 * path, else after the last loadmap / createactor that does, else at the
 * start. Returns a position for insertLines.
 */
export function startPlacement(model: ScriptModel): Position {
  const entry = entryStep(model);
  if (entry < 0) return "end";
  const dom = dominators(model, entry);
  // steps on every path to every end of the start code
  const ends = [...dom.keys()].filter((i) => successors(model, i).length === 0);
  let always = null as Set<number> | null;
  for (const e of ends) {
    const d = dom.get(e)!;
    always = always ? new Set([...always].filter((x) => d.has(x))) : new Set(d);
  }
  const sorted = [...(always ?? new Set<number>())].sort((a, b) => a - b);
  const pick = (names: string[]) => [...sorted].reverse().find((i) => {
    const s = model.steps[i];
    return s.kind === "instruction" && names.includes(s.op.name);
  });
  const at = pick(["createnpc", "createbox"]) ?? pick(["loadmap", "createactor"]);
  if (at !== undefined) return { after: model.steps[at].id };
  // no loadmap runs on every path (an arrival shows the map its own way):
  // where the ways meet after showing the map (a join label)
  const g = model.groups.find((x) => x.start);
  let firstLoad = -1;
  for (let i = entry; g && i < g.to; i++) {
    const s = model.steps[i];
    if (s.kind === "instruction" && s.op.name === "loadmap") {
      firstLoad = i;
      break;
    }
  }
  // (the first code on every path after it; label lines stay above the new line)
  const join = firstLoad >= 0 ? sorted.find((i) => i > firstLoad) : undefined;
  if (join !== undefined && !model.steps[join].label) return { before: model.steps[join].id };
  return { before: model.steps[entry].id };
}

/** The lines that make a person or object talk / react (a `say` per line of `lines`, wrapped by the caller). */
export interface PlaceOptions {
  /** createnpc (a person) or createbox (an object). */
  kind: "person" | "object";
  /** The NPC (3-2-n) or object (3-4-n) resource. */
  resource: number;
  x: number;
  y: number;
  /** Its number 1-40 (default: the lowest free one). */
  id?: number;
  /** The event's code (default: turn to the player, then end). */
  body?: readonly string[];
  /** Label for the event (default: talk_<id> / use_<id>). */
  label?: string;
  /** Where to put the createnpc / createbox line (default: startPlacement). */
  at?: Position;
}

/**
 * Put a person or object on the script's map and give them an event: the
 * createnpc / createbox line in the start code, `.event id @label` and the
 * event's code at the end.
 */
export function addPlacement(model: ScriptModel, o: PlaceOptions): { model: ScriptModel; id: number; label: string } {
  const id = o.id ?? freeId(model);
  if (id === null || id < 1 || id > 40) throw new Error("no free person / object number (1-40)");
  if (model.events.some((e) => e.number === id)) throw new Error(`event ${id} already has an entry`);
  const name = o.kind === "person" ? "createnpc" : "createbox";
  let m = insertLines(model, o.at ?? startPlacement(model), [instructionLine(name, [id, o.resource, o.x, o.y])]).model;
  const label = o.label ?? uniqueLabel(m, `${o.kind === "person" ? "talk" : "use"}_${id}`);
  const body = o.body ?? (o.kind === "person" ? [instructionLine("facetoface", [0, id]), "  callback"] : ["  callback"]);
  m = addEvent(m, id, label, body);
  return { model: m, id, label };
}

/**
 * Give a map event (the number painted on map cells) code in this script:
 * `.event 40+n @label` and the code at the end. Returns the map event number
 * to put on the cells.
 */
export function addTileEvent(model: ScriptModel, o: { mapEvent?: number; body?: readonly string[]; label?: string } = {}): { model: ScriptModel; mapEvent: number; label: string } {
  const n = o.mapEvent ?? freeMapEvent(model);
  const label = o.label ?? uniqueLabel(model, `tile_${n}`);
  return { model: addEvent(model, 40 + n, label, o.body ?? ["  callback"]), mapEvent: n, label };
}

/** The step with an id. */
export function stepById(model: ScriptModel, id: number): Step | undefined {
  return model.steps.find((s) => s.id === id);
}

/** Instruction steps, in order. */
export function instructions(model: ScriptModel): InstructionStep[] {
  return model.steps.filter((s): s is InstructionStep => s.kind === "instruction");
}
