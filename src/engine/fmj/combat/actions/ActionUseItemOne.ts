// Port of fmj/combat/actions/ActionUseItemOne.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { BaseGoods } from "../../goods/BaseGoods";
import { GoodsMedicine } from "../../goods/GoodsMedicine";
import { isEatMedicine } from "../../goods/IEatMedicine";
import type { ResSrs } from "../../lib/ResSrs";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionSingleTarget } from "./ActionSingleTarget";
import { STATE_AFT, STATE_ANI, STATE_PRE, fallbackAni, windDown, windUp } from "./ItemActionBase";

export class ActionUseItemOne extends ActionSingleTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private mAnix = 0;
  private mAniy = 0;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    target: FightingCharacter,
    private readonly goods: BaseGoods,
  ) {
    super(attacker, target);
  }

  get quick(): boolean {
    return this.goods.type === 9 || this.goods.type === 10;
  }

  preproccess(): void {
    const t = this.mTarget;
    let hp = 0;
    if (this.goods instanceof GoodsMedicine) {
      this.mAni = this.goods.ani ?? fallbackAni();
      hp = t.hp;
      this.goods.eat(t as Player);
      hp = t.hp - hp;
    } else {
      this.mAni = fallbackAni();
      // Revival medicine / elixirs (types 10, 11) were ignored in fmj.kt.
      if (isEatMedicine(this.goods) && t instanceof Player) {
        hp = t.hp;
        this.goods.eat(t);
        hp = t.hp - hp;
      }
    }
    this.mAni.start();
    this.mAni.setIteratorNum(2);
    this.mAnix = t.combatX;
    this.mAniy = t.combatY;
    this.mRaiseAni = new RaiseAnimation(t.combatX, t.combatTop, hp, 0);
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
        return this.mRaiseAni!.update(delta);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mState === STATE_ANI) this.mAni!.drawAbsolutely(canvas, this.mAnix, this.mAniy);
    else if (this.mState === STATE_AFT) this.mRaiseAni!.draw(canvas);
  }
}
