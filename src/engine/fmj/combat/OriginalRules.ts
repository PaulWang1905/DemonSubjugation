// Battle rules of the original BBK engine (RpgA100.eng), taken from the C
// reconstruction at gitee.com/BA4988/fmj-engine (function addresses in the
// comments). fmj.kt used simpler stand-ins; these are used while
// EngineSettings.originalDamageFormula ("original battle rules") is on.
//
// The originals use one 16-bit random number per decision and 8/16-bit
// unsigned arithmetic; both are kept so results match the device, as are
// the original's quirks (each noted where it happens).
import type { FightingCharacter } from "../characters/FightingCharacter";
import type { Monster } from "../characters/Monster";
import type { Player } from "../characters/Player";
import { random } from "../../java";
import type { BaseGoods } from "../goods/BaseGoods";
import { addSignedByte, applyItemChange, word as rawWord } from "../goods/ItemRules";

/** A hit that missed (the original shows its MISS picture). */
export const MISS = -1;

const u8 = (v: number) => v & 0xff;
const u16 = (v: number) => v & 0xffff;
const mod = (a: number, b: number) => (b === 0 ? 0 : a % b);

export function rand16(): number {
  return Math.floor(random() * 0x10000) & 0xffff;
}

/** A player's normal attack on an enemy (_0022726A). */
export function physicalOnEnemy(attacker: FightingCharacter, target: FightingCharacter, attack = attacker.battleAttack): number {
  const r = rand16();
  let evade = u8(target.battleSpeed + 50);
  const agi = u8(attacker.battleSpeed);
  evade = evade > agi ? evade - agi : 10;
  if (r % 200 < evade) return MISS;
  const div = target.battleDefend >> 3 || 1;
  let damage = Math.trunc(attack / div);
  damage += mod(r, attack >> 2 || 10);
  return u16(damage);
}

/** An enemy's normal attack on a player (_002264FA); guarded halves it. */
export function physicalOnPlayer(attacker: FightingCharacter, target: FightingCharacter, guarded: boolean): number {
  const r = rand16();
  let evade = u8(target.battleSpeed + 50);
  const agi = u8(attacker.battleSpeed);
  evade = evade > agi ? evade - agi : 10;
  if (r % 200 < evade) return MISS;
  let damage = Math.trunc(attacker.battleAttack / ((target.battleDefend >> 3) + 1));
  damage += mod(r, (attacker.battleAttack >> 4) + 1);
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
  let evade = u16(target.battleSpeed + 20);
  const agi = caster.battleSpeed;
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

// ---------------------------------------------------------------------------
// Statuses (_0023E7A1, _0023EA2F, _0023D52A, _0023E1E4, _0024314B)

/** Status slots: attack, defence, speed change, poison, confusion, seal, sleep. */
export const SLOT = { ATTACK: 0, DEFEND: 1, SPEED: 2, POISON: 3, CONFUSE: 4, SEAL: 5, SLEEP: 6 } as const;
/** The status bit of each slot, as stored in spells and items. */
export const SLOT_BITS = [0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01];

const isOn = (fc: FightingCharacter, slot: number) => fc.ostatus[slot] !== 0xff;
export const isAsleep = (fc: FightingCharacter) => isOn(fc, SLOT.SLEEP);
export const isConfused = (fc: FightingCharacter) => isOn(fc, SLOT.CONFUSE);
export const isSealed = (fc: FightingCharacter) => isOn(fc, SLOT.SEAL);
export const isPoisoned = (fc: FightingCharacter) => isOn(fc, SLOT.POISON);

/** Whether a status lands (_0024314B): r = rand % 90; lands if luck < r or r > 60. */
export function statusLands(target: FightingCharacter): boolean {
  const r = rand16() % 90;
  return u8(target.luck) < r || r > 60;
}

/**
 * Set the slots for `bits` to `rounds`, skipping what the target is immune
 * to. Returns the bits that were set (for the status animations).
 */
export function applyStatus(target: FightingCharacter, bits: number, rounds: number): number {
  let set = 0;
  for (let i = 0; i < 7; i++) {
    if (bits & SLOT_BITS[i] && !(SLOT_BITS[i] & target.immuneBits)) {
      target.ostatus[i] = u8(rounds);
      set |= SLOT_BITS[i];
    }
  }
  return set;
}

export function clearStatus(target: FightingCharacter, bits: number): void {
  for (let i = 0; i < 7; i++) if (bits & SLOT_BITS[i]) target.ostatus[i] = 0xff;
}

/** `value * pct / 100`, negative for a reduction (_00223988). */
function change(value: number, pct: number, sign: "+" | "-"): number {
  const v = Math.trunc((value * pct) / 100);
  return sign === "-" ? -v : v;
}

/**
 * Raise or lower attack, defence and speed by percentages for `rounds`
 * rounds (_00223246 for the party, _002235D8 for enemies). Quirks kept: a
 * party member's change applies even when immune to it (and then never
 * runs out), and an enemy's unlisted changes are reset to 0.
 */
export function applyStatChange(target: FightingCharacter, pcts: [number, number, number], sign: "+" | "-", rounds: number): number {
  const [at, df, sp] = pcts;
  let bits = 0;
  const d = target.odelta;
  if (target.isPlayer) {
    if (at) { d.attack = change(target.attack, at, sign); bits |= 0x40; }
    if (df) { d.defend = change(target.defend, df, sign); bits |= 0x20; }
    if (sp) { d.speed = change(target.speed, sp, sign); bits |= 0x10; }
    return applyStatus(target, bits, rounds);
  }
  const na = at ? change(target.attack, at, sign) : 0;
  const nd = df ? change(target.defend, df, sign) : 0;
  const ns = sp ? change(target.speed, sp, sign) : 0;
  if (at) bits |= 0x40;
  if (df) bits |= 0x20;
  if (sp) bits |= 0x10;
  const set = applyStatus(target, bits, rounds);
  d.attack = na;
  d.defend = nd;
  d.speed = ns;
  return set;
}

/** Count down the slots after a fighter's turn; expired changes reset. */
export function tickStatus(fc: FightingCharacter): void {
  const s = fc.ostatus;
  for (let i = 0; i < 7; i++) {
    if (s[i] === 0xff) continue;
    s[i] = s[i] - 1;
    if (s[i] === 0) {
      if (i === SLOT.ATTACK) fc.odelta.attack = 0;
      else if (i === SLOT.DEFEND) fc.odelta.defend = 0;
      else if (i === SLOT.SPEED) fc.odelta.speed = 0;
      s[i] = 0xff;
    }
  }
}

/** Poison after a fighter's turn: a quarter of the current HP. */
export function poisonDamage(fc: FightingCharacter): number {
  if (!isPoisoned(fc) || fc.hp <= 0) return 0;
  return fc.hp >> 2;
}

/**
 * A confused fighter hits itself (_0023DAA7). The party's formula divides
 * by defence / 4 here, the enemies' by defence / 8.
 */
export function confusedSelfHit(fc: FightingCharacter): number {
  const r = rand16();
  const atk = fc.battleAttack;
  const def = fc.battleDefend;
  return fc.isPlayer
    ? u16(Math.trunc(atk / ((def >> 2) + 1)) + (r % ((atk >> 4) + 1)))
    : u16(Math.trunc(atk / ((def >> 3) + 1)) + (r % ((atk >> 2) + 1)));
}

/**
 * HP and MP a member's accessories give each turn (_0023D20C): the bytes
 * 0x17 / 0x16 of each worn accessory, added as sign-and-magnitude into
 * an unsigned byte, as equipping does in the original.
 */
export function turnRecovery(p: Player): { hp: number; mp: number } {
  const o = p.scriptOverrides;
  if (o && (o.turnHp !== undefined || o.turnMp !== undefined)) return { hp: o.turnHp ?? 0, mp: o.turnMp ?? 0 };
  let hp = 0;
  let mp = 0;
  for (const e of p.equipmentsArray) {
    if (!e || e.type !== 6) continue;
    hp = addSignedByte(hp, e.raw[1], true);
    mp = addSignedByte(mp, e.raw[0], true);
  }
  return { hp, mp };
}

// ---------------------------------------------------------------------------
// Enemy turns (_0022475F)

export type EnemyChoice =
  | { kind: "attack"; target: number }
  | { kind: "magic"; magicIndex: number; target: number | "all" };

/**
 * What an enemy does on its turn. `party` and `enemies` are the slots
 * (null when empty or fallen); `magics` the spells it knows with their MP
 * cost, type and whether they hit everyone.
 */
export function chooseEnemyAction(
  enemy: FightingCharacter & { mIQ: number },
  magics: { cost: number; type: number; forAll: boolean }[],
  party: (FightingCharacter | null)[],
  enemies: (FightingCharacter | null)[],
): EnemyChoice {
  const r = rand16() % 100;
  const attackChance = u8(100 - enemy.mIQ);
  let choice: EnemyChoice | null = null;
  let targetsParty = true;
  if (r >= attackChance && magics.length > 0) {
    const i = r % magics.length;
    const m = magics[i];
    if (!(u16(enemy.mp) < m.cost || isSealed(enemy))) {
      if (m.forAll) return { kind: "magic", magicIndex: i, target: "all" };
      choice = { kind: "magic", magicIndex: i, target: 0 };
      targetsParty = m.type === 1;
    }
  }
  const list = targetsParty ? party : enemies;
  let t = r % 3;
  if (!list[t]) {
    // the next one along (_00229452 / _00229784)
    for (let k = 1; k <= 3; k++) {
      const j = (t + k) % 3;
      if (list[j]) {
        t = j;
        break;
      }
    }
  }
  if (choice && choice.kind === "magic") return { ...choice, target: t };
  return { kind: "attack", target: t };
}

/**
 * Turn order value (_0023C000): speed with its change, 1.5x for members
 * casting restoring or reviving magic or using medicine or revival items;
 * kept to 8 bits like the original.
 */
export function turnPriority(fc: FightingCharacter, quick: boolean): number {
  const agi = fc.battleSpeed;
  return u8(quick ? (agi >> 1) + agi : agi);
}

// ---------------------------------------------------------------------------
// Casting (_00224E75 party, _002259AC enemies, _00220000 / _00220874 effects)

/** The fighters in battle by slot (set by Combat when a battle starts). */
const sides: { party: FightingCharacter[]; enemies: FightingCharacter[] } = { party: [], enemies: [] };

export function setBattleSides(party: FightingCharacter[], enemies: FightingCharacter[]): void {
  sides.party = party;
  sides.enemies = enemies;
}

export function battleSides(): { party: FightingCharacter[]; enemies: FightingCharacter[] } {
  return sides;
}

/** Bits of the original status slots as the RaiseAnimation status masks. */
export function raiseMask(bits: number): number {
  return (bits & 0x0f) | (bits & 0x40 ? 32 : 0) | (bits & 0x20 ? 64 : 0) | (bits & 0x10 ? 128 : 0);
}

export interface SpellResult {
  miss: boolean;
  /** Statuses that took hold (original slot bits). */
  bits: number;
}

interface SpellData {
  type: number;
  costByte: number;
  isForAll: boolean;
  raw: Uint8Array;
}

const word = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const slotOf = (list: FightingCharacter[], fc: FightingCharacter) => list.indexOf(fc);
/** A slot that takes part: present (and, for the party, not fallen when hit by enemy spells). */
const present = (fc: FightingCharacter | undefined) => !!fc && fc.isVisiable !== false;

/**
 * Cast `magic` as the original does: pay its MP, then apply its effect to
 * `targets` (one fighter, or a whole side for spells that hit everyone).
 */
export function castMagic(caster: FightingCharacter, magic: SpellData, targets: FightingCharacter[]): Map<FightingCharacter, SpellResult> {
  const out = new Map<FightingCharacter, SpellResult>();
  caster.mp = caster.mp - magic.costByte;
  const own = caster.isPlayer ? sides.party : sides.enemies;
  const other = caster.isPlayer ? sides.enemies : sides.party;
  const r = magic.raw;
  const turns = r[6] >> 4;
  const statusBits = r[6] & 0x0f;
  // effect bytes as the original orders them: attack %, defence %, speed %
  const pcts: [number, number, number] = [r[5], r[4], r[7]];

  if (magic.type === 1) {
    const side = other;
    let hpPow = word(r, 0);
    let mpPow = word(r, 2);
    let drain = false;
    if (hpPow > 0x8000) { hpPow = u16(-hpPow); drain = true; }
    if (mpPow > 0x8000) { mpPow = u16(-mpPow); drain = true; }
    // damage is worked out for every opponent, as on the device
    const dmg = [0, 0, 0];
    const mpd = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const t = side[i];
      if (!present(t) || (side === sides.party && t!.hp <= 0) || (side === sides.enemies && t!.hp <= 0)) continue;
      const guard = t!.isPlayer && guarded(t!, t!.defending, t!.hasAilment);
      const res = spellDamage(caster, t!, hpPow, mpPow, guard);
      dmg[i] = res.hp === MISS ? 0xffff : res.hp;
      mpd[i] = res.mp === MISS ? 0xffff : res.mp;
    }
    const all = targets.length > 1 || magic.isForAll;
    const tIdx = all ? -1 : slotOf(side, targets[0]);
    if (!all && tIdx >= 0) {
      dmg[0] = dmg[tIdx];
      mpd[0] = mpd[tIdx];
    }
    const hit = (i: number) => {
      const t = side[i];
      if (!present(t)) return;
      const miss = dmg[i] === 0xffff || mpd[i] === 0xffff;
      if (dmg[i] === 0xffff) dmg[i] = 0;
      if (mpd[i] === 0xffff) mpd[i] = 0;
      let bits = 0;
      if (t!.hp > 0) {
        t!.hp = t!.hp <= dmg[i] ? 0 : t!.hp - dmg[i];
        t!.mp = t!.mp <= mpd[i] ? 0 : t!.mp - mpd[i];
        // even a dodged spell can bring its side effects, as on the device
        if ((pcts[0] || pcts[1] || pcts[2]) && statusLands(t!)) bits |= applyStatChange(t!, pcts, "-", turns);
        if (statusBits && statusLands(t!)) bits |= applyStatus(t!, statusBits, turns);
      }
      out.set(t!, { miss, bits });
    };
    if (all) for (let i = 0; i < 3; i++) hit(i);
    else if (tIdx >= 0) hit(tIdx);
    if (drain) {
      // the caster takes the sum of the list (quirk: for one target the
      // list also holds a copy in slot 0 and the others' rolls)
      let th = 0;
      let tm = 0;
      for (let i = 0; i < 3; i++) {
        if (!present(side[i])) continue;
        th = u16(th + dmg[i]);
        tm = u16(tm + mpd[i]);
      }
      if (th) caster.hp = Math.min(caster.maxHP, caster.hp + th);
      if (tm) caster.mp = Math.min(caster.maxMP, caster.mp + tm);
    }
    return out;
  }

  // support spells work on the caster's side
  const list = magic.isForAll || targets.length > 1 ? own.filter(present) : targets;
  for (const t of list) {
    let bits = 0;
    switch (magic.type) {
      case 2: // enhancement
        if (t.hp > 0) bits = applyStatChange(t, pcts, "+", turns);
        break;
      case 3: // restoration
        if (t.hp > 0) {
          t.hp = Math.min(t.maxHP, t.hp + word(r, 0));
          if (statusBits) clearStatus(t, statusBits);
        }
        break;
      case 4: // revival: only the fallen
        if (t.hp <= 0) {
          t.hp = Math.trunc((word(r, 0) * t.maxHP) / 100);
          if (!t.isPlayer) clearStatus(t, 0xff);
        }
        break;
    }
    out.set(t, { miss: false, bits });
  }
  return out;
}

/**
 * Statuses a normal attack brings (_0024218A party, _002264FA enemies). The
 * party's use the first member's weapon whoever attacks, and land even on
 * a miss; an enemy's only when it hits. Both are original behaviour.
 */
export function attackStatuses(attacker: FightingCharacter, target: FightingCharacter, missed: boolean): number {
  const from = attacker.isPlayer ? (sides.party[0] ?? attacker) : attacker;
  if (!attacker.isPlayer && missed) return 0;
  const bits = from.attackStatusBits;
  if (!bits || target.hp <= 0) return 0;
  return statusLands(target) ? applyStatus(target, bits, from.attackStatusRounds) : 0;
}

/**
 * The attack power of a group attack (围攻, _00226D37): every member's
 * attack and attack change, halved for each step away from the attacker.
 * The loop is the original's, including how it walks past empty slots.
 */
export function groupAttackPower(actor: number, party: (FightingCharacter | undefined)[]): number {
  let total = 0;
  let j = actor;
  for (let i = 0; i < 3; i++) {
    if (j <= 2 && !party[j]) continue; // an empty slot: the original does not move on
    if (j > 2) j = 0;
    const p = party[j];
    if (p) {
      let dist = u8(j - actor);
      if (dist > 0xf0) dist = u8(3 - dist);
      total = u16(total + (p.attack >> dist));
      total = u16(total + (u16(p.odelta.attack) >> dist));
    }
    j++;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Items and stealing in battle (_002401AE, _00240841, _00241014, _0022F65A)

/**
 * Use medicine, a revival item, an elixir or a stimulant (types 9-12) on
 * party members. Quirks kept: for "everyone" it goes over every member,
 * fallen ones too, so party medicine also lifts the fallen.
 */
export function useItemOnParty(goods: BaseGoods, target: FightingCharacter | "all"): Map<FightingCharacter, number> {
  const out = new Map<FightingCharacter, number>();
  const list = target === "all" ? [2, 0, 1].map((i) => sides.party[i]).filter(Boolean) : [target];
  for (const t of list) {
    const before = t.hp;
    applyItemChange(goods.type, null, goods.raw, t);
    const cure = goods.raw[6] & 0x0f;
    if (cure) clearStatus(t, cure);
    let bits = 0;
    if (goods.type === 12) bits = applyStatChange(t, [goods.raw[3], goods.raw[2], goods.raw[5]], "+", goods.sumRound);
    out.set(t, bits);
    void before;
  }
  return out;
}

/** Take `amount` HP or MP from an enemy, stopping at 0 (_00241375). */
function subtract(t: FightingCharacter, amount: number, hp: boolean): void {
  if (hp) t.hp = t.hp < amount ? 0 : t.hp - amount;
  else t.mp = t.mp < amount ? 0 : t.mp - amount;
}

/**
 * Throw a thrown weapon (type 8) or a weapon (type 7) at enemies. A thrown
 * weapon's negative values drain, giving the thrower the amount times the
 * number of enemies hit; a weapon deals the original's flag value made of
 * its effect bytes. Statuses in byte 0x1c may land for `sumRound` rounds.
 * Returns the HP each enemy lost.
 */
export function throwItem(thrower: FightingCharacter, goods: BaseGoods, target: FightingCharacter | "all"): Map<FightingCharacter, number> {
  const out = new Map<FightingCharacter, number>();
  const list = (target === "all" ? sides.enemies : [target]).filter((t) => t && t.isVisiable !== false && t.hp > 0);
  for (const t of list) out.set(t, t.hp);
  const raw = goods.raw;
  if (goods.type === 8) {
    const deal = (amount: number, hp: boolean) => {
      if (!amount) return;
      let drain = 0;
      if (amount > 0x8000) {
        amount = u16(-amount);
        drain = amount;
      }
      for (const t of list) subtract(t, amount, hp);
      if (drain) {
        const gain = u16(drain * list.length);
        if (hp) thrower.hp = Math.min(thrower.maxHP, thrower.hp + gain);
        else thrower.mp = Math.min(thrower.maxMP, thrower.mp + gain);
      }
    };
    deal(rawWord(raw, 0), true);
    deal(rawWord(raw, 2), false);
  } else {
    const w0 = rawWord(raw, 0);
    const w1 = rawWord(raw, 2);
    const w2 = rawWord(raw, 4);
    const w3 = rawWord(raw, 6);
    let flags = 0;
    if (w3 & 0x00ff) flags |= 0x2000;
    if (w3 & 0xff00) flags |= 0x1000;
    if (w2 & 0x00ff) flags |= 0x0800;
    if (w2 & 0xff00) flags |= 0x0400;
    if (w0 & 0x00ff) flags |= 0x0200;
    if (w0 & 0xff00) flags |= 0x0100;
    if (w1 & 0x00ff) flags |= 0x0080;
    flags += (w1 & 0x7f00) >> 8;
    for (const t of list) subtract(t, flags, true);
  }
  const bits = raw[6] & 0x0f;
  if (bits) for (const t of list) if (statusLands(t)) applyStatus(t, bits, goods.sumRound);
  for (const [t, before] of out) out.set(t, before - t.hp);
  return out;
}

/**
 * Steal (special spell 1, _0022F65A): luck against luck, then 2 in 3 (or 1
 * in 2 when the thief is not luckier). Quirk kept: the enemy's luck is read
 * from the enemy slot with the thief's own number.
 */
export function stealSucceeds(thief: FightingCharacter, thiefSlot: number, target: FightingCharacter): boolean {
  const r = rand16();
  const pLuck = u8(thief.luck);
  const eLuck = u8(sides.enemies[thiefSlot]?.luck ?? target.luck);
  const rate = pLuck > eLuck ? 3 : 2;
  const mine = u8(mod(r, pLuck) + 1);
  const theirs = mod(r, eLuck);
  return mine > theirs && r % rate !== 0;
}
