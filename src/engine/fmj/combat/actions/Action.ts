// Port of fmj/combat/actions/Action.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import type { Canvas } from "../../../graphics";

const DELTA = Math.trunc(1000 / 20);

export abstract class Action {
  /** Who performs the action. */
  protected mAttacker: FightingCharacter | null = null;
  private mTimeCnt = 0;
  protected mCurrentFrame = 0;

  /** The performer's agility. */
  get priority(): number {
    return this.mAttacker!.speed;
  }

  get isAttackerAlive(): boolean {
    return this.mAttacker!.isAlive;
  }

  abstract get isTargetAlive(): boolean;
  abstract get isSingleTarget(): boolean;

  /** Apply the action's effect, once, before its animation plays. */
  preproccess(): void {}

  /** Hide characters that died. */
  abstract postExecute(): void;

  protected abstract updateRaiseAnimation(delta: number): boolean;
  protected abstract drawRaiseAnimation(canvas: Canvas): void;

  /** @returns false when finished */
  update(delta: number): boolean {
    this.mTimeCnt += delta;
    if (this.mTimeCnt >= DELTA) {
      ++this.mCurrentFrame;
      this.mTimeCnt = 0;
    }
    return true;
  }

  draw(_canvas: Canvas): void {}

  abstract targetIsMonster(): boolean;
}
