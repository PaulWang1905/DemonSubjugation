// Port of fmj/combat/actions/ActionMagicAttackAll.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { ResSrs } from "../../lib/ResSrs";
import type { MagicAttack } from "../../magic/MagicAttack";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { raiseMask } from "../OriginalRules";
import { ActionMultiTarget } from "./ActionMultiTarget";

const STATE_PRE = 1;
const STATE_ANI = 2;
const STATE_AFT = 3;

export class ActionMagicAttackAll extends ActionMultiTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    targets: FightingCharacter[],
    private readonly magic: MagicAttack,
  ) {
    super(attacker, targets);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.mAni = this.magic.magicAni;
    this.mAni!.start();
    this.mAni!.setIteratorNum(2);
    const before = this.mTargets.map((t) => t.hp);
    this.magic.use(a, this.mTargets);
    // fmj.kt showed two placeholder numbers here; show each target's real loss.
    this.mTargets.forEach((t, i) => {
      const res = this.magic.lastResults.get(t);
      if (t.isVisiable) this.mRaiseAnis.push(new RaiseAnimation(t.combatX, t.combatY, t.hp - before[i], raiseMask(res?.bits ?? 0), res?.miss));
    });
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    const targetsArePlayers = this.mTargets[0] instanceof Player;
    switch (this.mState) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) {
          if (a instanceof Player) a.fightingSprite!.currentFrame = Math.trunc((this.mCurrentFrame * 3) / 10) + 6;
          else a.setCombatPos(this.ox + 2, this.oy + 2);
        } else {
          this.mState = STATE_ANI;
        }
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) {
          this.mState = STATE_AFT;
          if (a instanceof Player) a.setFrameByState();
          else a.fightingSprite!.move(-2, -2);
          for (const fc of this.mTargets) {
            if (targetsArePlayers) fc.fightingSprite!.currentFrame = 10;
            else fc.fightingSprite!.move(2, 2);
          }
        }
        break;
      case STATE_AFT:
        if (!this.updateRaiseAnimation(delta)) {
          for (const fc of this.mTargets) {
            if (targetsArePlayers) (fc as Player).setFrameByState();
            else fc.fightingSprite!.move(-2, -2);
          }
          return false;
        }
        break;
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mState === STATE_ANI) this.mAni!.draw(canvas, 0, 0);
    else if (this.mState === STATE_AFT) this.drawRaiseAnimation(canvas);
  }
}
