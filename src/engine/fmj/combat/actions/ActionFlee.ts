// Port of fmj/combat/actions/ActionFlee.kt
import type { Player } from "../../characters/Player";
import type { Canvas } from "../../../graphics";
import { Action } from "./Action";

const FRAME_CNT = 5;

export class ActionFlee extends Action {
  private ox = 0;
  private oy = 0;
  private dy = 0;

  /**
   * @param player who flees
   * @param fleeSucceed whether the escape works
   * @param runAfterFlee run after a successful escape
   */
  constructor(
    private readonly player: Player,
    private readonly fleeSucceed: boolean,
    private readonly runAfterFlee: (() => void) | null,
  ) {
    super();
  }

  get priority(): number {
    return this.player.speed * 100;
  }
  get isAttackerAlive(): boolean {
    return true;
  }
  get isTargetAlive(): boolean {
    return false;
  }
  get isSingleTarget(): boolean {
    return false;
  }

  preproccess(): void {
    this.ox = this.player.combatX;
    this.oy = this.player.combatY;
    this.dy = Math.trunc((96 - this.oy) / FRAME_CNT);
    this.player.fightingSprite!.currentFrame = 1;
  }

  update(delta: number): boolean {
    super.update(delta);
    if (this.mCurrentFrame < FRAME_CNT) {
      this.player.setCombatPos(this.ox, this.oy + this.dy * this.mCurrentFrame);
      return true;
    } else if (!this.fleeSucceed && this.mCurrentFrame < FRAME_CNT + 2) {
      this.player.setCombatPos(this.ox, this.oy);
      this.player.fightingSprite!.currentFrame = 11;
    } else if (!this.fleeSucceed) {
      this.player.setFrameByState();
    }
    return false;
  }

  postExecute(): void {
    if (this.fleeSucceed && this.runAfterFlee) this.runAfterFlee();
    else this.player.setCombatPos(this.ox, this.oy);
  }

  protected updateRaiseAnimation(_delta: number): boolean {
    return false;
  }
  protected drawRaiseAnimation(_canvas: Canvas): void {}
  targetIsMonster(): boolean {
    return false;
  }
}
