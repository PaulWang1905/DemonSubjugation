// Port of fmj/combat/actions/ActionThrowItemOne.kt
//
// fmj.kt left the effect as a TODO (it showed a fixed "10"); the thrown
// item's values are applied here. As in the original (_00240841), only a
// thrown weapon (type 8) with an effect of its own plays one, over the
// target as a spell's does; a sword thrown, or a thrown weapon without one,
// goes straight to the hit and its number.
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { GoodsHiddenWeapon } from "../../goods/GoodsHiddenWeapon";
import type { ResSrs } from "../../lib/ResSrs";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionSingleTarget } from "./ActionSingleTarget";
import { EngineSettings } from "../../config/EngineSettings";
import { throwItem } from "../OriginalRules";
import { STATE_AFT, STATE_ANI, STATE_PRE, applyHiddenWeapon, effectAt, throwAni, windDown, windUp } from "./ItemActionBase";

export class ActionThrowItemOne extends ActionSingleTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private mAniX = 0;
  private mAniY = 0;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    target: FightingCharacter,
    private readonly hiddenWeapon: GoodsHiddenWeapon,
  ) {
    super(attacker, target);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    const t = this.mTarget;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.mAni = throwAni(this.hiddenWeapon);
    this.mAni?.start();
    this.mAni?.setIteratorNum(2);
    [this.mAniX, this.mAniY] = effectAt(t);
    let lost: number;
    if (EngineSettings.originalDamageFormula) lost = -(throwItem(a, this.hiddenWeapon, t).get(t) ?? 0);
    else {
      Player.sGoodsList.deleteGoods(this.hiddenWeapon.type, this.hiddenWeapon.index);
      lost = applyHiddenWeapon(a, t, this.hiddenWeapon.affectHp, this.hiddenWeapon.affectMp);
    }
    this.mRaiseAni = new RaiseAnimation(t.combatX, t.combatY, lost, 0);
  }

  /** The thrower is done; the target takes the hit and the numbers show. */
  private hit(): void {
    const t = this.mTarget;
    this.mState = STATE_AFT;
    windDown(this.mAttacker!);
    if (t instanceof Player) t.fightingSprite!.currentFrame = 10;
    else t.fightingSprite!.move(2, 2);
  }

  update(delta: number): boolean {
    super.update(delta);
    const t = this.mTarget;
    switch (this.mState) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) windUp(this.mAttacker!, this.mCurrentFrame, this.ox, this.oy);
        else if (this.mAni) this.mState = STATE_ANI;
        else this.hit();
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) this.hit();
        break;
      case STATE_AFT:
        if (!this.mRaiseAni!.update(delta)) {
          if (t instanceof Player) t.setFrameByState();
          else t.fightingSprite!.move(-2, -2);
          return false;
        }
        break;
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mState === STATE_ANI) this.mAni!.drawAbsolutely(canvas, this.mAniX, this.mAniY);
    else if (this.mState === STATE_AFT) this.mRaiseAni!.draw(canvas);
  }
}
