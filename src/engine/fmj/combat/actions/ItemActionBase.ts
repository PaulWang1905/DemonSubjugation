// Shared state machine for the item actions (wind-up, animation, numbers).
import { Player } from "../../characters/Player";
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResSrs } from "../../lib/ResSrs";

export const STATE_PRE = 1;
export const STATE_ANI = 2;
export const STATE_AFT = 3;

export function fallbackAni(): ResSrs {
  return DatLib.getRes(ResType.SRS, 2, 1) as ResSrs;
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
