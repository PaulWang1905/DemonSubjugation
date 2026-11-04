// Port of fmj/combat/ActionExecutor.kt — runs one round's action queue.
import type { Canvas } from "../../graphics";
import type { Action } from "./actions/Action";
import { ActionFlee } from "./actions/ActionFlee";
import { ActionSingleTarget } from "./actions/ActionSingleTarget";
import type { Combat } from "./Combat";
import { EngineSettings } from "../config/EngineSettings";

export class ActionExecutor {
  private mCurrentAction: Action | null = null;
  private mIsNewAction = true;

  constructor(
    private readonly mActionQueue: Action[],
    private readonly mCombat: Combat,
  ) {}

  private pop(): Action | null {
    return this.mActionQueue.length === 0 ? null : (this.mActionQueue.shift() as Action);
  }

  reset(): void {
    this.mCurrentAction = null;
    this.mIsNewAction = true;
  }

  /** @returns false when all actions have run */
  update(delta: number): boolean {
    if (EngineSettings.originalDamageFormula) return this.updateOriginal(delta);
    if (this.mCurrentAction == null) {
      this.mCurrentAction = this.pop();
      if (this.mCurrentAction == null) return false;
      this.mCurrentAction.preproccess();
      this.mIsNewAction = false;
    }

    if (this.mIsNewAction) {
      // skip actions of dead characters
      if (!this.fixAction()) return false;
      this.mCurrentAction!.preproccess();
      this.mIsNewAction = false;
    }

    if (!this.mCurrentAction!.update(delta)) {
      this.mCurrentAction!.postExecute();
      this.mCurrentAction = this.pop();
      if (this.mCurrentAction == null) return false;
      this.mIsNewAction = true;
    }
    return true;
  }

  /** One fighter's turn after another, with the original's turn rules. */
  private updateOriginal(delta: number): boolean {
    while (this.mCurrentAction == null) {
      const next = this.pop();
      if (next == null) return false;
      const a = this.mCombat.startTurn(next);
      if (a == null) continue;
      if (!a.aux && !this.retarget(a)) continue;
      this.mCurrentAction = a;
      a.preproccess();
    }
    if (!this.mCurrentAction.update(delta)) {
      const done = this.mCurrentAction;
      done.postExecute();
      this.mCurrentAction = this.mCombat.finishTurn(done);
      this.mCurrentAction?.preproccess();
    }
    return true;
  }

  /** Point a single-target action at another fighter if its target fell. */
  private retarget(a: Action): boolean {
    if (a.isTargetAlive) return true;
    const t = a.targetIsMonster() ? this.mCombat.firstAliveMonster : this.mCombat.randomAlivePlayer;
    if (t == null) return false;
    if (!(a instanceof ActionFlee) && a instanceof ActionSingleTarget) a.setTarget(t);
    return true;
  }

  private fixAction(): boolean {
    while (!this.mCurrentAction!.isAttackerAlive) {
      this.mCurrentAction = this.pop();
      if (this.mCurrentAction == null) return false;
    }
    const a = this.mCurrentAction!;
    if (!a.isTargetAlive) {
      if (a.isSingleTarget) return false;
      const newTarget = a.targetIsMonster() ? this.mCombat.firstAliveMonster : this.mCombat.randomAlivePlayer;
      if (newTarget == null) return false;
      if (!(a instanceof ActionFlee) && a instanceof ActionSingleTarget) a.setTarget(newTarget);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    this.mCurrentAction?.draw(canvas);
  }
}
