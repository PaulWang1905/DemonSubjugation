// Port of fmj/combat/actions/ActionSingleTarget.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Monster } from "../../characters/Monster";
import type { BaseGoods } from "../../goods/BaseGoods";
import type { Canvas } from "../../../graphics";
import type { RaiseAnimation } from "../anim/RaiseAnimation";
import { Action } from "./Action";

export abstract class ActionSingleTarget extends Action {
  protected mRaiseAni: RaiseAnimation | null = null;

  constructor(
    attacker: FightingCharacter,
    protected mTarget: FightingCharacter,
  ) {
    super();
    this.mAttacker = attacker;
  }

  get isTargetAlive(): boolean {
    return this.mTarget.isAlive;
  }

  /** Always false in the original, so dead targets get re-targeted. */
  get isSingleTarget(): boolean {
    return false;
  }

  postExecute(): void {
    this.mTarget.isVisiable = this.mTarget.isAlive;
  }

  protected updateRaiseAnimation(delta: number): boolean {
    return this.mRaiseAni?.update(delta) ?? false;
  }

  protected drawRaiseAnimation(canvas: Canvas): void {
    this.mRaiseAni?.draw(canvas);
  }

  targetIsMonster(): boolean {
    return this.mTarget instanceof Monster;
  }

  setTarget(fc: FightingCharacter): void {
    this.mTarget = fc;
  }

  steal(attacker: FightingCharacter): BaseGoods | null {
    const t = this.mTarget;
    return t instanceof Monster ? t.stealGoods(attacker) : null;
  }
}
