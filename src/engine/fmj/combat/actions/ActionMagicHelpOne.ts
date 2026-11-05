// Port of fmj/combat/actions/ActionMagicHelpOne.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { ResSrs } from "../../lib/ResSrs";
import type { BaseMagic } from "../../magic/BaseMagic";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { raiseMask } from "../OriginalRules";
import { ActionSingleTarget } from "./ActionSingleTarget";

const STATE_PRE = 1;
const STATE_ANI = 2;
const STATE_AFT = 3;

export class ActionMagicHelpOne extends ActionSingleTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private mAnix = 0;
  private mAniy = 0;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    target: FightingCharacter,
    private readonly magic: BaseMagic,
  ) {
    super(attacker, target);
  }

  get quick(): boolean {
    return this.magic.type === 3 || this.magic.type === 4;
  }

  preproccess(): void {
    const t = this.mTarget;
    // where the caster stands; enemies shake from here while casting
    this.ox = this.mAttacker!.combatX;
    this.oy = this.mAttacker!.combatY;
    this.mAni = this.magic.magicAni!;
    this.mAni.start();
    this.mAni.setIteratorNum(2);
    this.mAnix = t.combatX;
    this.mAniy = t.combatY;
    const ohp = t.hp;
    this.magic.use(this.mAttacker!, t);
    const res = this.magic.lastResults.get(t);
    this.mRaiseAni = new RaiseAnimation(t.combatX, t.combatTop, t.hp - ohp, raiseMask(res?.bits ?? 0));
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
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
          else a.setCombatPos(this.ox, this.oy);
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
