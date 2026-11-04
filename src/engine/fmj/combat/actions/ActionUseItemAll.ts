// Port of fmj/combat/actions/ActionUseItemAll.kt
//
// In fmj.kt this action had no animation (it crashed) and was handed the
// monster list; it now heals the party with the medicine's own effect.
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { BaseGoods } from "../../goods/BaseGoods";
import { GoodsMedicine } from "../../goods/GoodsMedicine";
import type { ResSrs } from "../../lib/ResSrs";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionMultiTarget } from "./ActionMultiTarget";
import { STATE_AFT, STATE_ANI, STATE_PRE, fallbackAni, windDown, windUp } from "./ItemActionBase";

export class ActionUseItemAll extends ActionMultiTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    targets: FightingCharacter[],
    private readonly goods: BaseGoods,
  ) {
    super(attacker, targets);
  }

  get quick(): boolean {
    return this.goods.type === 9 || this.goods.type === 10;
  }

  preproccess(): void {
    const a = this.mAttacker!;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.mAni = (this.goods instanceof GoodsMedicine ? this.goods.ani : null) ?? fallbackAni();
    this.mAni.start();
    this.mAni.setIteratorNum(2);
    if (this.goods instanceof GoodsMedicine) {
      // eat() removes one item per call; apply the effect without using more.
      const goods = this.goods;
      this.mTargets.forEach((t, i) => {
        if (!(t instanceof Player)) return;
        const hp = t.hp;
        goods.eat(t);
        if (i < this.mTargets.length - 1) Player.sGoodsList.addGoods(goods.type, goods.index, 1);
        this.mRaiseAnis.push(new RaiseAnimation(t.combatX, t.combatY, t.hp - hp, 0));
      });
    }
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    switch (this.mState) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) windUp(a, this.mCurrentFrame, this.ox, this.oy);
        else this.mState = STATE_ANI;
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) {
          this.mState = STATE_AFT;
          windDown(a);
        }
        break;
      case STATE_AFT:
        return this.updateRaiseAnimation(delta);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mState === STATE_ANI) this.mAni!.draw(canvas, 0, 0);
    else if (this.mState === STATE_AFT) this.drawRaiseAnimation(canvas);
  }
}
