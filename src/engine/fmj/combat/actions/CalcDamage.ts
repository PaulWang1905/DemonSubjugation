// Port of fmj/combat/actions/CalcDamage.kt (+ the fork's original-engine formula).
import { random } from "../../../java";

export const CalcDamage = {
  calcBaseDamage(attack: number, defense: number): number {
    if (attack > defense) return Math.trunc(attack * 2 - defense * 1.6 + 0.5);
    if (attack > defense * 0.6) return Math.trunc(attack - defense * 0.6 + 0.5);
    return 0;
  },

  /**
   * Physical damage as computed by the original engine:
   *  - on players:  attack / ((def >> 2) + 1) + rand % ((attack >> 4) + 1)
   *  - on enemies:  attack / ((def >> 3) + 1) + rand % ((attack >> 2) + 1)
   */
  originalPhysicalDamage(attack: number, defense: number, targetIsPlayer: boolean): number {
    const base = targetIsPlayer
      ? Math.trunc(attack / ((defense >> 2) + 1))
      : Math.trunc(attack / ((defense >> 3) + 1));
    let rnd = 0;
    if (attack > 0) {
      rnd = targetIsPlayer
        ? Math.trunc(random() * ((attack >> 4) + 1))
        : Math.trunc(random() * ((attack >> 2) + 1));
    }
    return Math.max(base + rnd, 1);
  },
};
