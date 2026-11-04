// Port of fmj/goods/IEatMedicine.kt
import type { Player } from "../characters/Player";

export interface IEatMedicine {
  eat(player: Player): void;
}

export function isEatMedicine(g: unknown): g is IEatMedicine {
  return g != null && typeof (g as IEatMedicine).eat === "function";
}
