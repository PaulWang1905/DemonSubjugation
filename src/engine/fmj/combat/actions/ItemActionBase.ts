// Shared state machine for the item actions (wind-up, animation, numbers).
import { Player } from "../../characters/Player";
import type { FightingCharacter } from "../../characters/FightingCharacter";
import type { ResSrs } from "../../lib/ResSrs";

export const STATE_PRE = 1;
export const STATE_ANI = 2;
export const STATE_AFT = 3;

/**
 * The effect an item used plays (_002401AE): only medicine (type 9) has one,
 * the SRS its bytes 0x1a / 0x1b name. Revival items, fruits and the like
 * play none: their number shows straight after the wind-up.
 */
export function useAni(goods: { type: number; ani?: ResSrs | null }): ResSrs | null {
  return goods.type === 9 ? (goods.ani ?? null) : null;
}

/**
 * The effect a thrown item plays (_00240841): only a thrown weapon (type 8)
 * has one, the SRS its bytes 0x1a / 0x1b name, and only when that names one.
 * A weapon (type 7) thrown plays none: the numbers follow the throw.
 */
export function throwAni(goods: { type: number; ani?: ResSrs | null }): ResSrs | null {
  return goods.type === 8 ? (goods.ani ?? null) : null;
}

/** Where an effect plays on a fighter: the middle of its sprite, as spells do. */
export function effectAt(fc: FightingCharacter): [number, number] {
  return [fc.combatX, fc.combatY - Math.trunc((fc.fightingSprite?.height ?? 0) / 2)];
}

/** Where an effect on the party plays: the middle of their places (the original's fixed point there). */
export function partyAt(side: FightingCharacter[]): [number, number] {
  const n = Math.max(1, side.length);
  return [Math.round(side.reduce((s, p) => s + p.combatX, 0) / n), Math.round(side.reduce((s, p) => s + p.combatY, 0) / n)];
}

/** Where an effect on a whole side plays: the middle of its places (the original uses one fixed point there). */
export function effectAtAll(side: FightingCharacter[]): [number, number] {
  const at = side.map(effectAt);
  const n = Math.max(1, at.length);
  return [Math.round(at.reduce((s, p) => s + p[0], 0) / n), Math.round(at.reduce((s, p) => s + p[1], 0) / n)];
}

export function windUp(attacker: FightingCharacter, frame: number, ox: number, oy: number): void {
  if (attacker instanceof Player) attacker.fightingSprite!.currentFrame = Math.trunc((frame * 3) / 10) + 6;
  else attacker.setCombatPos(ox + 2, oy + 2);
}

export function windDown(attacker: FightingCharacter): void {
  if (attacker instanceof Player) attacker.setFrameByState();
  else attacker.fightingSprite!.move(-2, -2);
}

/**
 * Apply a thrown weapon to `target`. affectHp/affectMp > 0 damage the target;
 * < 0 drain it into the thrower. Returns the target's HP change.
 */
export function applyHiddenWeapon(
  thrower: FightingCharacter,
  target: FightingCharacter,
  affectHp: number,
  affectMp: number,
): number {
  const before = target.hp;
  if (affectHp >= 0) {
    target.hp = target.hp - affectHp;
  } else {
    const amount = Math.min(-affectHp, Math.max(0, target.hp));
    target.hp = target.hp - amount;
    thrower.hp = thrower.hp + amount;
  }
  if (affectMp >= 0) {
    target.mp = Math.max(0, target.mp - affectMp);
  } else {
    const amount = Math.min(-affectMp, Math.max(0, target.mp));
    target.mp = target.mp - amount;
    thrower.mp = thrower.mp + amount;
  }
  return target.hp - before;
}
