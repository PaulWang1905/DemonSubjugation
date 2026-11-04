// Battle rules of the original BBK engine (RpgA100.eng), taken from the C
// reconstruction at gitee.com/BA4988/fmj-engine (function addresses in the
// comments). fmj.kt used simpler stand-ins; these are used while
// EngineSettings.originalDamageFormula ("original battle rules") is on.
//
// The originals use one 16-bit random number per decision and 8/16-bit
// unsigned arithmetic; both are kept so results match the device.
import type { FightingCharacter } from "../characters/FightingCharacter";
import type { Monster } from "../characters/Monster";
import type { Player } from "../characters/Player";
import { random } from "../../java";

/** A hit that missed (the original shows its MISS picture). */
export const MISS = -1;

const u8 = (v: number) => v & 0xff;
const u16 = (v: number) => v & 0xffff;
const mod = (a: number, b: number) => (b === 0 ? 0 : a % b);

export function rand16(): number {
  return Math.floor(random() * 0x10000) & 0xffff;
}

/** A player's normal attack on an enemy (_0022726A). */
export function physicalOnEnemy(attacker: FightingCharacter, target: FightingCharacter): number {
  const r = rand16();
  let evade = u8(target.speed + 50);
  const agi = u8(attacker.speed);
  evade = evade > agi ? evade - agi : 10;
  if (r % 200 < evade) return MISS;
  const div = target.defend >> 3 || 1;
  let damage = Math.trunc(attacker.attack / div);
  damage += mod(r, attacker.attack >> 2 || 10);
  return u16(damage);
}

/** An enemy's normal attack on a player (_002264FA); guarded halves it. */
export function physicalOnPlayer(attacker: FightingCharacter, target: FightingCharacter, guarded: boolean): number {
  const r = rand16();
  let evade = u8(target.speed + 50);
  const agi = u8(attacker.speed);
  evade = evade > agi ? evade - agi : 10;
  if (r % 200 < evade) return MISS;
  let damage = Math.trunc(attacker.attack / ((target.defend >> 3) + 1));
  damage += mod(r, (attacker.attack >> 4) + 1);
  if (guarded) damage >>= 1;
  return u16(damage);
}

/**
 * Whether a player braces this turn (_002277CD): 9% for players who are not
 * defending and have no status ailment. Defending always counts as guarded.
 */
export function guarded(target: FightingCharacter, defending: boolean, hasAilment: boolean): boolean {
  if (defending) return true;
  if (hasAilment) return false;
  return rand16() % 100 > 90;
}

/**
 * Spell damage (_0023ECA9 players casting, _00242399 enemies casting).
 * `power` is the spell's base value (magnitude); returns HP and MP losses or
 * MISS. Spirit (lingli) of the caster raises it, the target's lowers it, by
 * 1/64 of the value per point, in 16-bit arithmetic like the original.
 */
export function spellDamage(
  caster: FightingCharacter,
  target: FightingCharacter,
  hpPower: number,
  mpPower: number,
  targetGuarded: boolean,
): { hp: number; mp: number } {
  const r = rand16();
  // the target dodges with speed + 20 against the caster's speed, out of 100
  let evade = u16(target.speed + 20);
  const agi = caster.speed;
  evade = evade > agi ? evade - agi : 0;
  if (r % 100 < evade) return { hp: hpPower ? MISS : 0, mp: mpPower ? MISS : 0 };
  const scale = (p: number, isMp: boolean) => {
    if (p === 0) return 0;
    let d = p;
    // the MP line of the original lacks the parentheses of the HP line
    d = u16(d + (isMp ? (caster.lingli * d) >> 6 : caster.lingli * (d >> 6)));
    d = u16(d - (isMp ? (target.lingli * d) >> 6 : target.lingli * (d >> 6)));
    d = u16(d + (mod(r, d) >> 4));
    if (targetGuarded) d = u16(d - (d >> 2));
    return d;
  };
  return {
    hp: Math.min(scale(hpPower, false), Math.max(0, target.hp)),
    mp: Math.min(scale(mpPower, true), Math.max(0, target.mp)),
  };
}

/** Escaping a random battle (_0023CFE5): luck and speed against the first enemy's. */
export function fleeSucceeds(p: FightingCharacter, firstEnemy: FightingCharacter | undefined): boolean {
  const r = rand16();
  const mine = mod(r, u8(p.luck) + 1) + mod(r, u8(p.speed) + 1);
  const theirs = firstEnemy ? mod(r, u8(firstEnemy.luck) + 1) + mod(r, u8(firstEnemy.speed) + 1) : 0;
  return mine > theirs;
}

/** A random encounter on a step (_002167B3): 4 in 100. */
export function encounter(): boolean {
  return rand16() % 100 <= 3;
}

/** Whether an enemy leaves its item (_002435CB), judged by the party leader's luck. */
export function drops(leader: FightingCharacter | undefined, enemy: Monster): boolean {
  const r = rand16();
  const mine = u8(mod(r, u8(leader?.luck ?? 0)) + 1);
  const theirs = mod(r, u8(enemy.luck));
  return mine > theirs && r % 4 !== 0;
}

/**
 * After a won battle (_0022C000): fallen members get 1 HP, the others
 * recover 15-24% of their missing HP and MP. Returns the members that
 * take part in the experience share.
 */
export function recoverAfterVictory(party: Player[]): Player[] {
  const pct = (rand16() % 10) + 15;
  const alive: Player[] = [];
  for (const p of party) {
    if (p.hp <= 0) {
      p.hp = 1;
      continue;
    }
    p.hp = p.hp + Math.trunc(((p.maxHP - p.hp) * pct) / 100);
    p.mp = p.mp + Math.trunc(((p.maxMP - p.mp) * pct) / 100);
    alive.push(p);
  }
  return alive;
}

/**
 * Add experience and level up as the original does (_0022F05D, _0022D9E8,
 * _0022E655): several levels at once while the experience exceeds the next
 * level's requirement, stats follow the level table, HP/MP maximums get a
 * random bonus of up to 1/8 of their increase, and HP/MP are refilled.
 * Like the original, only the last level's requirement is subtracted.
 * @returns whether the member levelled up
 */
export function gainExperience(p: Player, exp: number): boolean {
  const c = p.levelupChain;
  p.currentExp = u16(p.currentExp + exp);
  const need = c.getNextLevelExp(p.level);
  if (need === 0 || p.level >= c.maxLevel || !(p.currentExp > need)) return false;

  const from = p.level;
  let level = from;
  let left = p.currentExp;
  let consumed = 0;
  while (left > c.getNextLevelExp(level) && level < c.maxLevel) {
    left -= c.getNextLevelExp(level);
    consumed = c.getNextLevelExp(level);
    level++;
  }
  if (level === from) return false;

  const r = rand16();
  p.levelBefore = { hp: p.hp, maxHP: p.maxHP, mp: p.mp, maxMP: p.maxMP, attack: p.attack, defend: p.defend, speed: p.speed, lingli: p.lingli, luck: p.luck };
  const oldMaxHP = p.maxHP;
  const oldMaxMP = p.maxMP;
  p.maxHP = p.maxHP + c.getMaxHP(level) - c.getMaxHP(from);
  p.maxMP = p.maxMP + c.getMaxMP(level) - c.getMaxMP(from);
  p.attack = p.attack + c.getAttack(level) - c.getAttack(from);
  p.defend = p.defend + c.getDefend(level) - c.getDefend(from);
  p.speed = p.speed + c.getSpeed(level) - c.getSpeed(from);
  p.lingli = p.lingli + c.getLingli(level) - c.getLingli(from);
  p.luck = p.luck + c.getLuck(level) - c.getLuck(from);
  p.currentExp = u16(p.currentExp - consumed);
  p.level = level;
  p.maxHP = p.maxHP + (mod(r, p.maxHP - oldMaxHP) >> 3);
  p.maxMP = p.maxMP + (mod(r, p.maxMP - oldMaxMP) >> 3);
  p.hp = p.maxHP;
  p.mp = p.maxMP;
  const learnt = c.getLearnMagicNum(level);
  if (p.magicChain && learnt > p.magicChain.learnNum) p.magicChain.learnNum = learnt;
  return true;
}
