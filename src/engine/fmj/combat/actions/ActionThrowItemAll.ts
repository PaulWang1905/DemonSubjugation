// Port of fmj/combat/actions/ActionThrowItemAll.kt (effect implemented; see ActionThrowItemOne).
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { GoodsHiddenWeapon } from "../../goods/GoodsHiddenWeapon";
import type { ResSrs } from "../../lib/ResSrs";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionMultiTarget } from "./ActionMultiTarget";
import { STATE_AFT, STATE_ANI, STATE_PRE, applyHiddenWeapon, fallbackAni, windDown, windUp } from "./ItemActionBase";

export class ActionThrowItemAll extends ActionMultiTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    targets: FightingCharacter[],
    private readonly hiddenWeapon: GoodsHiddenWeapon,
  ) {
    super(attacker, targets);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.mAni = this.hiddenWeapon.ani ?? fallbackAni();
    this.mAni.start();
    this.mAni.setIteratorNum(2);
    Player.sGoodsList.deleteGoods(this.hiddenWeapon.type, this.hiddenWeapon.index);
    for (const t of this.mTargets) {
      if (!t.isAlive) continue;
      const diff = applyHiddenWeapon(a, t, this.hiddenWeapon.affectHp, this.hiddenWeapon.affectMp);
      this.mRaiseAnis.push(new RaiseAnimation(t.combatX, t.combatY, diff, 0));
    }
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    const onMonsters = this.targetIsMonster();
    switch (this.mState) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) windUp(a, this.mCurrentFrame, this.ox, this.oy);
        else this.mState = STATE_ANI;
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) {
          this.mState = STATE_AFT;
          windDown(a);
          for (const fc of this.mTargets) {
            if (!onMonsters) fc.fightingSprite!.currentFrame = 10;
            else fc.fightingSprite!.move(2, 2);
          }
        }
        break;
      case STATE_AFT:
        if (!this.updateRaiseAnimation(delta)) {
          for (const fc of this.mTargets) {
            if (onMonsters) fc.fightingSprite!.move(-2, -2);
            else (fc as Player).setFrameByState();
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
