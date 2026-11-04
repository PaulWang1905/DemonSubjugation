// Port of fmj/combat/actions/ActionDefend.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import type { Canvas } from "../../../graphics";
import { ActionSingleTarget } from "./ActionSingleTarget";

export class ActionDefend extends ActionSingleTarget {
  constructor(fc: FightingCharacter) {
    super(fc, fc);
    fc.defending = true;
  }
  get isTargetAlive(): boolean {
    return true;
  }
  get isSingleTarget(): boolean {
    return false;
  }
  preproccess(): void {}
  postExecute(): void {}
  targetIsMonster(): boolean {
    return true;
  }
  update(_delta: number): boolean {
    return false;
  }
  draw(_canvas: Canvas): void {}
}
