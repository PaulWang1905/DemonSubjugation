// Port of fmj/combat/actions/ActionThrowItemOne.kt
//
// fmj.kt left the effect as a TODO (it showed a fixed "10"); the thrown
// weapon's HP/MP values are applied here and one item is used up.
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { GoodsHiddenWeapon } from "../../goods/GoodsHiddenWeapon";
import type { ResSrs } from "../../lib/ResSrs";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionSingleTarget } from "./ActionSingleTarget";
import { EngineSettings } from "../../config/EngineSettings";
import { throwItem } from "../OriginalRules";
import { STATE_AFT, STATE_ANI, STATE_PRE, applyHiddenWeapon, fallbackAni, windDown, windUp } from "./ItemActionBase";

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
    this.mAni = (this.hiddenWeapon as { ani?: ResSrs | null }).ani ?? fallbackAni();
    this.mAni.start();
    this.mAni.setIteratorNum(2);
    this.mAniX = t.combatX;
    this.mAniY = t.combatY;
    if (EngineSettings.originalDamageFormula) {
      const lost = throwItem(a, this.hiddenWeapon, t);
      this.mRaiseAni = new RaiseAnimation(this.mAniX, t.combatTop, -(lost.get(t) ?? 0), 0);
      return;
    }
    Player.sGoodsList.deleteGoods(this.hiddenWeapon.type, this.hiddenWeapon.index);
    const diff = applyHiddenWeapon(a, t, this.hiddenWeapon.affectHp, this.hiddenWeapon.affectMp);
    this.mRaiseAni = new RaiseAnimation(this.mAniX, t.combatTop, diff, 0);
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    const t = this.mTarget;
    switch (this.mState) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) windUp(a, this.mCurrentFrame, this.ox, this.oy);
        else this.mState = STATE_ANI;
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) {
          this.mState = STATE_AFT;
          windDown(a);
          if (t instanceof Player) t.fightingSprite!.currentFrame = 10;
          else t.fightingSprite!.move(2, 2);
        }
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
