// Port of fmj/combat/actions/ActionMagicAttackOne.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { T } from "../../i18n";
import { Player } from "../../characters/Player";
import { Util } from "../../graphics/Util";
import type { ResSrs } from "../../lib/ResSrs";
import type { BaseMagic } from "../../magic/BaseMagic";
import { MagicAttack } from "../../magic/MagicAttack";
import { MagicSpecial } from "../../magic/MagicSpecial";
import type { Canvas } from "../../../graphics";
import type { Animation } from "../anim/Animation";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { raiseMask } from "../OriginalRules";
import { ActionSingleTarget } from "./ActionSingleTarget";
import { EngineSettings } from "../../config/EngineSettings";

const STATE_PRE = 1; // wind-up
const STATE_ANI = 2; // spell animation
const STATE_AFT = 3; // damage numbers
const STATE_TIP = 4; // message

export class ActionMagicAttackOne extends ActionSingleTarget {
  private mState = STATE_PRE;
  private mAni: ResSrs | null = null;
  private mAniX = 0;
  private mAniY = 0;
  private ox = 0;
  private oy = 0;
  private tip: Animation | null = null;

  constructor(
    attacker: FightingCharacter,
    target: FightingCharacter,
    private readonly magic: BaseMagic,
  ) {
    super(attacker, target);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    const t = this.mTarget;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.mAni = this.magic.magicAni;
    this.mAni!.start();
    this.mAni!.setIteratorNum(2);
    const ohp = t.hp;
    if (this.magic instanceof MagicAttack) this.magic.use(a, t);
    this.mAniX = t.combatX;
    this.mAniY = t.combatY - Math.trunc(t.fightingSprite!.height / 2);
    const res = this.magic.lastResults.get(t);
    this.mRaiseAni = new RaiseAnimation(t.combatX, t.combatY, t.hp - ohp, raiseMask(res?.bits ?? 0), res?.miss);

    if (this.magic instanceof MagicSpecial) {
      // the original pays for special spells too, and only spell 1 steals
      if (EngineSettings.originalDamageFormula) a.mp = a.mp - this.magic.costByte;
      const it = !EngineSettings.originalDamageFormula || this.magic.index === 1 ? this.steal(a) : null;
      if (it) {
        Player.sGoodsList.addGoods(it.type, it.index);
        let countdown = 1000;
        const text = T.got + it.name;
        this.tip = {
          update(delta: number): boolean {
            countdown -= delta;
            return countdown > 0;
          },
          draw(canvas: Canvas) {
            Util.showMessage(canvas, text);
          },
        };
      }
    }
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    const t = this.mTarget;
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
          if (t instanceof Player) t.fightingSprite!.currentFrame = 10;
          else t.fightingSprite!.move(2, 2);
        }
        break;
      case STATE_AFT:
        if (!this.mRaiseAni!.update(delta)) {
          if (t instanceof Player) t.setFrameByState();
          else t.fightingSprite!.move(-2, -2);
          this.mState = STATE_TIP;
        }
        break;
      case STATE_TIP:
        if (this.tip?.update(delta) !== true) return false;
        break;
    }
    return true;
  }

  draw(canvas: Canvas): void {
    switch (this.mState) {
      case STATE_ANI: this.mAni?.drawAbsolutely(canvas, this.mAniX, this.mAniY); break;
      case STATE_AFT: this.mRaiseAni?.draw(canvas); break;
      case STATE_TIP: this.tip?.draw(canvas); break;
    }
  }
}
