// Party members as the engine sees them, for the companion and inn wizards
// and the cards (format/wizards.ts, ui/CardView.tsx):
//
// - a member's record (3-1-n): its walk sprite (byte 0x16, ACP 1-n), its
//   spell list (byte 0x17, MLR 1-n), how many of the list's spells it knows
//   at a new game (byte 9) and its level (byte 0x20);
// - what the engine finds by the member's own NUMBER (Player.setData): the
//   portrait 11-1-n, the battle sprite 11-3-n and the level table 12-2-n;
//   battle shows the portraits of members 1-3 only (CombatUI.mHeadsImg) and
//   only members 1-4 use equipment;
// - spells: a member knows the first `learnNum` spells of its list; a new
//   game starts with byte 9 and every level-up makes it the level table's
//   "spells known" for the new level when that is more (Player.levelUp,
//   OriginalRules.gainExperience); `learnmagic` teaches one from a script;
// - who joins: `createactor n` adds member n (the party holds 3 in the
//   original: G_PLAYER_ACTOR 0-2); a talk event that adds a member, removes
//   the person and sets a flag is a companion who joins (The Silent Bell's
//   Bram: deletenpc, createactor 2, setevent 12);
// - who is in the party at a point of the story: the members script 1-1's
//   start code adds, and those whose join sets a story flag (in the party
//   exactly when the flag is set, unless something removes them). Restoring
//   a member who is not in the party stops the original with "RunErr" (its
//   attribute instructions look the member up among the three in the party
//   and fail), so an inn must only touch members known to be there.
import { resourceName } from "./decode";
import { encodeMagicChain } from "./encode";
import { findEntry, type LibArchive } from "./lib";
import { readLevels, readMagicChain, writeLevels } from "./schema";
import { parseScript, startGroup, type InstructionStep, type ScriptModel } from "./scriptModel";
import { resKey, type Placement, type WorldIndex } from "./world";

/** A resource to store (as wizards.ts's Change). */
export interface ResChange {
  key: string;
  data: Uint8Array;
  source?: string;
}

export interface Member {
  index: number;
  name: string;
  /** Walk sprite (8-1-n). */
  walk: number;
  /** Spell list (12-1-n), 0 for none. */
  list: number;
  /** Spells of the list known at a new game. */
  known: number;
  level: number;
}

/** A party member's record (3-1-n), or null. */
export function memberRecord(archive: LibArchive, index: number): Member | null {
  const e = findEntry(archive, 3, 1, index);
  if (!e) return null;
  const d = e.data;
  return { index, name: resourceName(3, 1, d).trim() || `Member ${index}`, walk: d[0x16] ?? 0, list: d[0x17] ?? 0, known: d[9] ?? 0, level: d[0x20] || 1 };
}

/** Every party member record, by number. */
export function partyMembers(archive: LibArchive): Member[] {
  return archive.entries
    .filter((e) => e.resType === 3 && e.type === 1)
    .sort((a, b) => a.index - b.index)
    .map((e) => memberRecord(archive, e.index)!)
    .filter(Boolean);
}

/** A copy of an image (or a table) as another kind and number (bytes 0 and 1 are its own type and number). */
export function copyAs(data: Uint8Array, type: number, index: number): Uint8Array {
  const out = data.slice();
  if (out.length > 1) {
    out[0] = type;
    out[1] = index;
  }
  return out;
}

/** The lowest free number of a kind (from `from`). */
export function freeNumber(a: LibArchive, resType: number, type: number, taken: Iterable<number> = [], from = 1): number {
  const t = new Set(taken);
  for (let i = from; i < 256; i++) if (!t.has(i) && !findEntry(a, resType, type, i)) return i;
  throw new Error("No free number left");
}

/**
 * The art and table the engine finds by a member's number that are missing,
 * as copies of another member's (the first member's, by default): portrait
 * 11-1-n, battle sprite 11-3-n, level table 12-2-n. Copies to draw over.
 */
export function memberByNumber(a: LibArchive, index: number, like?: number): ResChange[] {
  const from = like ?? partyMembers(a).find((m) => m.index !== index)?.index ?? 1;
  const out: ResChange[] = [];
  for (const [rt, t] of [
    [11, 1],
    [11, 3],
    [12, 2],
  ] as const) {
    if (findEntry(a, rt, t, index)) continue;
    const src = findEntry(a, rt, t, from) ?? a.entries.find((e) => e.resType === rt && e.type === t);
    if (src) out.push({ key: resKey(rt, t, index), data: copyAs(src.data, t, index) });
  }
  return out;
}

/** Whether two resources hold the same picture (a copy nobody drew over yet). */
export function sameArt(a: LibArchive, k1: string, k2: string): boolean {
  const [r1, t1, i1] = k1.split("-").map(Number);
  const [r2, t2, i2] = k2.split("-").map(Number);
  const x = findEntry(a, r1, t1, i1);
  const y = findEntry(a, r2, t2, i2);
  if (!x || !y || x.data.length !== y.data.length) return false;
  for (let i = 2; i < x.data.length; i++) if (x.data[i] !== y.data[i]) return false;
  return true;
}

/**
 * The member's art that is still another member's picture: a copy nobody
 * drew over yet, or (`shared`) the very same walk sprite, which drawing on
 * changes for both.
 */
export function stillCopies(a: LibArchive, index: number): { what: "portrait" | "battle sprite" | "walk sprite"; of: string; shared: boolean }[] {
  const me = memberRecord(a, index);
  if (!me) return [];
  const out: { what: "portrait" | "battle sprite" | "walk sprite"; of: string; shared: boolean }[] = [];
  const add = (what: (typeof out)[number]["what"], of: string, shared = false) => {
    if (!out.some((o) => o.what === what)) out.push({ what, of, shared });
  };
  for (const m of partyMembers(a)) {
    if (m.index === index) continue;
    if (sameArt(a, resKey(11, 1, index), resKey(11, 1, m.index))) add("portrait", m.name);
    if (sameArt(a, resKey(11, 3, index), resKey(11, 3, m.index))) add("battle sprite", m.name);
    if (me.walk === m.walk) add("walk sprite", m.name, true);
    else if (sameArt(a, resKey(8, 1, me.walk), resKey(8, 1, m.walk))) add("walk sprite", m.name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Who joins

/** A `createactor` outside the start of a new game: a member joining. */
export interface Join {
  member: number;
  script: string;
  stepId: number;
  line: number;
  /** The event group's label (null: a script's start code). */
  group: string | null;
  /** A flag the same code sets (it remembers the join), or null. */
  flag: number | null;
  /** The person whose talk event it is (they join from the map), or null. */
  person: Placement | null;
}

const isOp = (s: unknown, name: string): s is InstructionStep => !!s && (s as InstructionStep).kind === "instruction" && (s as InstructionStep).op.name === name;

/** Every place a member joins the party (script 1-1's start code, a new game's party, left out). */
export function joins(world: WorldIndex): Join[] {
  const out: Join[] = [];
  for (const [key, info] of world.scripts) {
    const m = info.model;
    for (const g of m.groups) {
      if (g.start && key === "1-1-1") continue;
      const steps = m.steps.slice(g.from, g.to);
      const flag = (steps.find((s) => isOp(s, "setevent")) as InstructionStep | undefined)?.values[0];
      for (const s of steps) {
        if (!isOp(s, "createactor") || typeof s.values[0] !== "number") continue;
        const person = world.placements.find((p) => p.kind === "person" && p.script === key && g.events.includes(p.id)) ?? null;
        out.push({ member: s.values[0], script: key, stepId: s.id, line: s.line, group: g.label, flag: typeof flag === "number" ? flag : null, person });
      }
    }
  }
  return out;
}

/** The members a new game starts with (script 1-1's start code). */
export function startMembers(startText: string | undefined): number[] {
  if (startText === undefined) return [];
  try {
    const m = parseScript(startText);
    const g = startGroup(m);
    if (!g) return [];
    const ids: number[] = [];
    for (const s of m.steps.slice(g.from, g.to)) if (isOp(s, "createactor") && typeof s.values[0] === "number" && !ids.includes(s.values[0])) ids.push(s.values[0]);
    return ids;
  } catch {
    return [];
  }
}

/** Members something takes out of the party (`deleteactor`). */
function removedMembers(world: WorldIndex): Set<number> {
  const out = new Set<number>();
  for (const info of world.scripts.values()) for (const s of info.model.steps) if (isOp(s, "deleteactor") && typeof s.values[0] === "number") out.add(s.values[0]);
  return out;
}

/** Who is in the party for an inn: always, while a flag is set, or not known (left out, with why). */
export interface InnParty {
  always: { member: number; name: string }[];
  whenFlag: { member: number; name: string; flag: number }[];
  unknown: { member: number; name: string; why: string }[];
}

export function innParty(world: WorldIndex, archive: LibArchive, startText: string | undefined): InnParty {
  const name = (n: number) => memberRecord(archive, n)?.name ?? `Member ${n}`;
  const out: InnParty = { always: [], whenFlag: [], unknown: [] };
  const removed = removedMembers(world);
  const start = startMembers(startText);
  for (const n of start) {
    if (removed.has(n)) out.unknown.push({ member: n, name: name(n), why: "leaves the party somewhere in the story" });
    else out.always.push({ member: n, name: name(n) });
  }
  const byMember = new Map<number, Join[]>();
  for (const j of joins(world)) if (!start.includes(j.member)) byMember.set(j.member, [...(byMember.get(j.member) ?? []), j]);
  for (const [n, js] of [...byMember].sort((a, b) => a[0] - b[0])) {
    const flags = [...new Set(js.map((j) => j.flag))];
    if (removed.has(n)) out.unknown.push({ member: n, name: name(n), why: "leaves the party somewhere in the story" });
    else if (flags.length === 1 && flags[0] !== null) out.whenFlag.push({ member: n, name: name(n), flag: flags[0] });
    else out.unknown.push({ member: n, name: name(n), why: flags.includes(null) ? "joins without a story flag that remembers it" : "joins in several places with different flags" });
  }
  return out;
}

/** The person on the map who joins as this member (a companion), with the flag that remembers it. */
export function companionOf(world: WorldIndex, member: number): Join | null {
  return joins(world).find((j) => j.member === member && j.person) ?? null;
}

/** The member a person (3-2-n) joins the party as, when talking to them adds one. */
export function joinsAs(world: WorldIndex, npc: string): Join | null {
  return joins(world).find((j) => j.person?.resource === npc) ?? null;
}

// ---------------------------------------------------------------------------
// Spells

/** A member who has a spell in their list, and when they know it. */
export interface Learner {
  member: Member;
  /** 1-based place in the list. */
  position: number;
  /** "start": known at a new game; a level: learnt on reaching it; null: never by levels. */
  at: "start" | number | null;
  /** Other members with the same list (they learn it too). */
  sharedWith: string[];
}

/** The level (above the start) at which a member's level table lets them know `position` spells, or null. */
export function learnLevel(archive: LibArchive, m: Member, position: number): "start" | number | null {
  if (m.known >= position) return "start";
  const t = findEntry(archive, 12, 2, m.index);
  if (!t) return null;
  const rows = readLevels(t.data);
  for (let l = m.level + 1; l <= rows.length; l++) if ((rows[l - 1]?.[8] ?? 0) >= position) return l;
  return null;
}

/** The spells of a list. */
export function listSpells(archive: LibArchive, list: number): { type: number; index: number }[] {
  const e = list ? findEntry(archive, 12, 1, list) : undefined;
  return e ? readMagicChain(e.data) : [];
}

/** Who can learn a spell (by their spell list), and the members who cannot yet. */
export function spellLearners(archive: LibArchive, spell: { type: number; index: number }): { learners: Learner[]; others: Member[] } {
  const all = partyMembers(archive);
  const learners: Learner[] = [];
  const others: Member[] = [];
  for (const m of all) {
    const k = listSpells(archive, m.list).findIndex((s) => s.type === spell.type && s.index === spell.index);
    if (k < 0) {
      others.push(m);
      continue;
    }
    learners.push({ member: m, position: k + 1, at: learnLevel(archive, m, k + 1), sharedWith: all.filter((o) => o.index !== m.index && o.list === m.list).map((o) => o.name) });
  }
  return { learners, others };
}

/**
 * Put a spell at the end of a member's spell list; a member without a list
 * (or with one another member shares, when `own`) gets a new list. Returns
 * the changes, the list and the spell's place in it.
 */
export function addSpellToMember(archive: LibArchive, member: number, spell: { type: number; index: number }, own = false): { changes: ResChange[]; list: number; position: number; created: boolean } {
  const m = memberRecord(archive, member);
  if (!m) throw new Error(`party member ${member} does not exist`);
  if (!findEntry(archive, 4, spell.type, spell.index)) throw new Error(`spell ${spell.type}-${spell.index} does not exist`);
  const current = listSpells(archive, m.list);
  if (current.some((s) => s.type === spell.type && s.index === spell.index)) throw new Error(`${m.name} already has it in their spell list`);
  const shared = partyMembers(archive).some((o) => o.index !== member && o.list === m.list);
  const hasList = !!m.list && !!findEntry(archive, 12, 1, m.list);
  const changes: ResChange[] = [];
  let list = m.list;
  let created = false;
  if (!hasList || (own && shared)) {
    list = freeNumber(archive, 12, 1);
    created = true;
    const rec = findEntry(archive, 3, 1, member)!.data.slice();
    rec[0x17] = list;
    changes.push({ key: resKey(3, 1, member), data: rec });
  }
  const spells = [...(hasList ? current : []), spell];
  if (spells.length > 255) throw new Error("a spell list holds at most 255 spells");
  changes.push({ key: resKey(12, 1, list), data: encodeMagicChain(list, spells) });
  // (a level table counting more spells than the list has stops the original on a level-up)
  const table = findEntry(archive, 12, 2, member);
  if (table) {
    const fitted = fitSpellsKnown(table.data, spells.length);
    if (fitted !== table.data) changes.push({ key: resKey(12, 2, member), data: fitted });
  }
  return { changes, list, position: spells.length, created };
}

/** A member's level table changed so they know `position` spells from `level` on (the table's "spells known"). */
export function learnFromLevel(archive: LibArchive, member: number, position: number, level: number): ResChange {
  const t = findEntry(archive, 12, 2, member);
  if (!t) throw new Error(`party member ${member} has no level table`);
  const rows = readLevels(t.data);
  if (level < 1 || level > rows.length) throw new Error(`the level table has levels 1-${rows.length}`);
  const next = rows.map((r, l) => (l + 1 >= level ? r.map((v, k) => (k === 8 ? Math.max(v, position) : v)) : r));
  return { key: resKey(12, 2, member), data: writeLevels(t.data, next) };
}

/**
 * A level table whose "spells known" never pass `count` (the spells in the
 * member's list): on a level-up the original teaches the list's spells up to
 * that number and stops ("RunErr") when the list is shorter or missing
 * (_0022F1D7). The same bytes when nothing changes.
 */
export function fitSpellsKnown(table: Uint8Array, count: number): Uint8Array {
  const rows = readLevels(table);
  if (rows.every((r) => r[8] <= count)) return table;
  return writeLevels(
    table,
    rows.map((r) => r.map((v, k) => (k === 8 ? Math.min(v, count) : v))),
  );
}

/** Whether a script model sets this flag anywhere (used by the guard checks). */
export function setsFlag(model: ScriptModel, flag: number): boolean {
  return model.steps.some((s) => isOp(s, "setevent") && s.values[0] === flag);
}
