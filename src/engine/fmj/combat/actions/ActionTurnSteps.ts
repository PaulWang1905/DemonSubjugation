// Small actions for the original battle rules: numbers shown between turns
// (poison, accessories), a skipped turn (sleep), a confused fighter hitting
// itself, and an enemy's turn that is decided only when it comes.
import type { FightingCharacter } from "../../characters/FightingCharacter";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { confusedSelfHit, turnPriority } from "../OriginalRules";
import { Action } from "./Action";

abstract class SimpleAction extends Action {
  protected mRaiseAni: RaiseAnimation | null = null;

  constructor(fc: FightingCharacter) {
    super();
    this.mAttacker = fc;
  }
  get isTargetAlive(): boolean {
    return true;
  }
  get isSingleTarget(): boolean {
    return false;
  }
  postExecute(): void {
    const a = this.mAttacker!;
    a.isVisiable = a.isPlayer || a.isAlive;
  }
  targetIsMonster(): boolean {
    return false;
  }
  protected updateRaiseAnimation(delta: number): boolean {
    return this.mRaiseAni?.update(delta) ?? false;
  }
  protected drawRaiseAnimation(canvas: Canvas): void {
    this.mRaiseAni?.draw(canvas);
  }
  update(delta: number): boolean {
    super.update(delta);
    return this.updateRaiseAnimation(delta);
  }
  draw(canvas: Canvas): void {
    this.drawRaiseAnimation(canvas);
  }
}

/** Shows an HP change (and status icons) on a fighter. */
export class ActionTurnNumbers extends SimpleAction {
  constructor(fc: FightingCharacter, hpChange: number, statusMask = 0) {
    super(fc);
    this.aux = true;
    this.mRaiseAni = new RaiseAnimation(fc.combatX, fc.combatTop, hpChange, statusMask);
  }
}

/** An asleep fighter's turn: nothing happens (statuses still count down). */
export class ActionSkipTurn extends SimpleAction {
  update(_delta: number): boolean {
    return false;
  }
}

/** A confused fighter hits itself (_0023DAA7). */
export class ActionConfused extends SimpleAction {
  preproccess(): void {
    const a = this.mAttacker!;
    const damage = confusedSelfHit(a);
    a.hp = Math.max(0, a.hp - damage);
    this.mRaiseAni = new RaiseAnimation(a.combatX, a.combatTop, -damage, 0);
  }
}

/** An enemy's place in the turn order; Combat decides its action on its turn. */
export class ActionMonsterTurn extends SimpleAction {
  get priority(): number {
    return turnPriority(this.mAttacker!, false);
  }
  update(_delta: number): boolean {
    return false;
  }
}
