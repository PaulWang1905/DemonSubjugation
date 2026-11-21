// How hard a battle is for the party the player has: the starting party
// (the members script 1-1 adds when a new game starts, from their records,
// at a level from their level tables), the expected course of a fight under
// the engine's default battle rules (EngineSettings.originalDamageFormula:
// OriginalRules.physicalOnEnemy / physicalOnPlayer), monster templates
// scaled to that party, and the result in words for the battle wizard
// ("about 5 rounds for your party; it hits for ~11 of Mira's 60 HP").
//
// The estimate counts normal attacks only (no spells, items or defending):
// a party that only attacks. Monsters from the templates know no spells.
import { resourceName } from "./decode";
import { findEntry, type LibArchive } from "./lib";
import { readLevels } from "./schema";
import { parseScript, startGroup } from "./scriptModel";

/** A party member's battle numbers. */
export interface Fighter {
  index: number;
  name: string;
  level: number;
  maxHP: number;
  attack: number;
  defend: number;
  speed: number;
}

/** A monster's battle numbers (the fields a template sets). */
export interface MonsterStats {
  level: number;
  maxHP: number;
  attack: number;
  defend: number;
  speed: number;
  money: number;
  exp: number;
}

const u16 = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);

/** A party member's record (3-1-n) as a fighter, null when it is missing. */
export function memberOf(archive: LibArchive, index: number): Fighter | null {
  const e = findEntry(archive, 3, 1, index);
  if (!e) return null;
  const d = e.data;
  const name = resourceName(3, 1, d).trim() || `Member ${index}`;
  return { index, name, level: d[0x20] || 1, maxHP: u16(d, 0x26), attack: u16(d, 0x2e), defend: u16(d, 0x30), speed: d[0x36] ?? 0 };
}

/** The members a new game starts with: `createactor` in the start code of script 1-1 (else member 1). */
export function startingParty(archive: LibArchive, startText: string | undefined): Fighter[] {
  const ids: number[] = [];
  if (startText !== undefined) {
    try {
      const m = parseScript(startText);
      const g = startGroup(m);
      if (g)
        for (const s of m.steps.slice(g.from, g.to))
          if (s.kind === "instruction" && s.op.name === "createactor" && typeof s.values[0] === "number" && !ids.includes(s.values[0])) ids.push(s.values[0]);
    } catch {
      /* fall back to member 1 */
    }
  }
  const party = (ids.length ? ids : [1]).map((i) => memberOf(archive, i)).filter((f): f is Fighter => !!f);
  if (party.length) return party;
  const any = archive.entries.find((e) => e.resType === 3 && e.type === 1);
  const f = any ? memberOf(archive, any.index) : null;
  return f ? [f] : [];
}

/** The highest level a member's level table (12-2-n) has, 0 without one. */
export function maxLevel(archive: LibArchive, member: number): number {
  const t = findEntry(archive, 12, 2, member);
  return t ? readLevels(t.data).length : 0;
}

/**
 * A member at another level, as levelling up does (Player.levelUp): each
 * stat changes by the difference of its level table's rows. Without a level
 * table (or past its end) the record's own numbers stay.
 */
export function atLevel(archive: LibArchive, f: Fighter, level: number): Fighter {
  const t = findEntry(archive, 12, 2, f.index);
  if (!t || level === f.level) return f;
  const rows = readLevels(t.data);
  const to = Math.max(1, Math.min(level, rows.length));
  const from = Math.max(1, Math.min(f.level, rows.length));
  if (to === from) return f;
  const [a, b] = [rows[from - 1], rows[to - 1]];
  // LEVEL_COLUMNS: maxHP, maxMP, attack, defend, nextExp, speed, ...
  const d = (k: number) => b[k] - a[k];
  return {
    ...f,
    level: to,
    maxHP: Math.max(1, f.maxHP + d(0)),
    attack: Math.max(0, f.attack + d(2)),
    defend: Math.max(0, f.defend + d(3)),
    speed: Math.max(0, Math.min(255, f.speed + d(5))),
  };
}

/** Experience a member needs from a level to the next (0 when unknown). */
export function nextExp(archive: LibArchive, member: number, level: number): number {
  const t = findEntry(archive, 12, 2, member);
  if (!t) return 0;
  const rows = readLevels(t.data);
  return rows[Math.max(0, Math.min(level, rows.length) - 1)]?.[4] ?? 0;
}

// ---------------------------------------------------------------------------
// The engine's normal attacks, on average (OriginalRules.ts)

/** The mean of r % m for a 16-bit random r. */
const meanMod = (m: number) => (m <= 0 ? 0 : (m - 1) / 2);

/** Chance a normal attack lands: the target evades with u8(speed + 50) against the attacker's speed, out of 200. */
export function hitChance(attackerSpeed: number, targetSpeed: number): number {
  let evade = (targetSpeed + 50) & 0xff;
  const agi = attackerSpeed & 0xff;
  evade = evade > agi ? evade - agi : 10;
  return Math.max(0, 1 - Math.min(200, evade) / 200);
}

/** A party member's normal attack on a monster when it lands (physicalOnEnemy). */
export function memberHit(attack: number, monsterDefend: number): number {
  const div = monsterDefend >> 3 || 1;
  return Math.trunc(attack / div) + meanMod(attack >> 2 || 10);
}

/** A monster's normal attack on a member when it lands (physicalOnPlayer), with the 9% chance of bracing that halves it. */
export function monsterHit(attack: number, memberDefend: number): number {
  const base = Math.trunc(attack / ((memberDefend >> 3) + 1)) + meanMod((attack >> 4) + 1);
  return base * (1 - 0.09 * 0.5);
}

export interface FightEstimate {
  /** Rounds the party needs to win, attacking every round. */
  rounds: number;
  /** A monster's hit on the weakest member when it lands, on average (the strongest monster's). */
  hit: number;
  /** That member. */
  target: Fighter;
  /** The damage the party takes in the whole fight, on average, against the party's HP (1 = everyone falls). */
  taken: number;
  /** In a word. */
  level: "easy" | "fair" | "hard" | "too hard";
}

/** The expected course of a battle against monsters (one of each in the list) for a party that only attacks. */
export function estimateFight(party: Fighter[], monsters: MonsterStats[]): FightEstimate | null {
  if (!party.length || !monsters.length) return null;
  // the party attacks one monster at a time, everyone together
  let rounds = 0;
  for (const m of monsters) {
    const perRound = party.reduce((s, f) => s + hitChance(f.speed, m.speed) * memberHit(f.attack, m.defend), 0);
    rounds += perRound > 0 ? m.maxHP / perRound : Infinity;
  }
  const target = party.reduce((w, f) => (f.maxHP < w.maxHP ? f : w), party[0]);
  // every monster still standing attacks once a round; they fall in list order
  let taken = 0;
  let left = 0;
  const hpAll = party.reduce((s, f) => s + f.maxHP, 0);
  let hit = 0;
  for (const m of monsters) {
    const perRound = party.reduce((s, f) => s + hitChance(f.speed, m.speed) * memberHit(f.attack, m.defend), 0);
    left += perRound > 0 ? m.maxHP / perRound : Infinity;
    // a hit on an average member, landing as often as it does
    const avg = party.reduce((s, f) => s + hitChance(m.speed, f.speed) * monsterHit(m.attack, f.defend), 0) / party.length;
    taken += Math.ceil(left) * avg;
    hit = Math.max(hit, monsterHit(m.attack, target.defend));
  }
  const whole = Math.ceil(rounds - 1e-9);
  const share = hpAll > 0 ? taken / hpAll : Infinity;
  const level = !Number.isFinite(whole) || share >= 1 ? "too hard" : share >= 0.5 ? "hard" : share >= 0.2 ? "fair" : "easy";
  return { rounds: Number.isFinite(whole) ? Math.max(1, whole) : Infinity, hit, target, taken: share, level };
}

/** "About 5 rounds for your party; it hits for ~11 of Mira's 60 HP. Hard: bring a few potions." */
export function fightWords(est: FightEstimate | null, party: Fighter[]): string {
  if (!est) return party.length ? "" : "The game has no party member to fight with.";
  const rounds = Number.isFinite(est.rounds) ? `About ${est.rounds} round${est.rounds === 1 ? "" : "s"} for your party` : "Your party cannot hurt it";
  const hit = Math.max(1, Math.round(est.hit));
  const of = party.length === 1 ? `your ${est.target.maxHP} HP` : `${est.target.name}'s ${est.target.maxHP} HP`;
  const say = { easy: "Easy.", fair: "A fair fight.", hard: "Hard: bring a few potions.", "too hard": "Too strong for attacks alone: the party needs levels, spells or items." }[est.level];
  return `${rounds}; it hits for ~${hit} of ${of}. ${say}`;
}

// ---------------------------------------------------------------------------
// Templates scaled to the party

/** What each template aims for: rounds to win, a hit's share of the weakest member's HP, levels over the party. */
export const TEMPLATE_AIMS = {
  weak: { label: "Weak (first fights)", rounds: 2, hit: 0.07, levels: 0, speed: -3, defend: 2, exp: 0.3, money: 5 },
  normal: { label: "Normal", rounds: 3, hit: 0.1, levels: 1, speed: -1, defend: 4, exp: 0.5, money: 12 },
  strong: { label: "Strong", rounds: 4, hit: 0.12, levels: 2, speed: 1, defend: 7, exp: 1, money: 40 },
  boss: { label: "Boss", rounds: 5, hit: 0.15, levels: 3, speed: 2, defend: 10, exp: 2, money: 200 },
} as const;
export type TemplateId = keyof typeof TEMPLATE_AIMS;

/**
 * A template's numbers for a party: HP for its rounds against the party's
 * attacks, attack for its hit on the weakest member, speed near the party's.
 * `party` is the starting party at the level the fight is meant for.
 */
export function scaledMonster(id: TemplateId, party: Fighter[], archive?: LibArchive): MonsterStats {
  const aim = TEMPLATE_AIMS[id];
  const fallback: Fighter = { index: 1, name: "", level: 1, maxHP: 60, attack: 10, defend: 5, speed: 10 };
  const p = party.length ? party : [fallback];
  const level = Math.max(...p.map((f) => f.level));
  const speed = Math.max(1, Math.min(99, Math.round(p.reduce((s, f) => s + f.speed, 0) / p.length) + aim.speed));
  const defend = aim.defend;
  const perRound = p.reduce((s, f) => s + hitChance(f.speed, speed) * memberHit(f.attack, defend), 0);
  const maxHP = Math.max(5, Math.min(999, Math.round(aim.rounds * perRound - perRound / 2)));
  const target = p.reduce((w, f) => (f.maxHP < w.maxHP ? f : w), p[0]);
  const goal = Math.max(1, aim.hit * target.maxHP);
  let attack = 1;
  for (let a = 1; a <= 999; a++) {
    if (Math.abs(monsterHit(a, target.defend) - goal) < Math.abs(monsterHit(attack, target.defend) - goal)) attack = a;
    if (monsterHit(a, target.defend) > goal) break;
  }
  const next = archive ? Math.max(...p.map((f) => nextExp(archive, f.index, f.level))) : 0;
  const exp = Math.max(1, Math.round(next ? next * aim.exp : { weak: 4, normal: 10, strong: 30, boss: 150 }[id] * level));
  const money = Math.max(1, Math.round(aim.money * (1 + (level - 1) / 3)));
  return { level: Math.min(99, level + aim.levels), maxHP, attack, defend, speed, money, exp };
}

/** A monster record's (3-3-n) battle numbers. */
export function monsterStatsOf(d: Uint8Array): MonsterStats {
  return { level: d[0x12] ?? 0, maxHP: u16(d, 0x18), attack: u16(d, 0x20), defend: u16(d, 0x22), speed: d[0x13] ?? 0, money: u16(d, 0x24), exp: u16(d, 0x26) };
}
