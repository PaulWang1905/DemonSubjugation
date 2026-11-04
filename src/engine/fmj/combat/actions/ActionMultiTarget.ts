// Port of fmj/combat/actions/ActionMultiTarget.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Monster } from "../../characters/Monster";
import type { Canvas } from "../../../graphics";
import type { RaiseAnimation } from "../anim/RaiseAnimation";
import { Action } from "./Action";

export class ActionMultiTarget extends Action {
  protected readonly mTargets: FightingCharacter[] = [];
  protected mRaiseAnis: RaiseAnimation[] = [];

  constructor(attacker: FightingCharacter, targets: FightingCharacter[]) {
    super();
    this.mAttacker = attacker;
    this.mTargets.push(...targets);
  }

  get isTargetAlive(): boolean {
    return this.mTargets.some((t) => t.isAlive);
  }

  get isSingleTarget(): boolean {
    return false;
  }

  postExecute(): void {
    for (const fc of this.mTargets) fc.isVisiable = fc.isAlive;
  }

  protected updateRaiseAnimation(delta: number): boolean {
    this.mRaiseAnis = this.mRaiseAnis.filter((a) => a.update(delta));
    return this.mRaiseAnis.length > 0;
  }

  protected drawRaiseAnimation(canvas: Canvas): void {
    for (const a of this.mRaiseAnis) a.draw(canvas);
  }

  draw(_canvas: Canvas): void {}

  targetIsMonster(): boolean {
    return this.mTargets[0] instanceof Monster;
  }
}
