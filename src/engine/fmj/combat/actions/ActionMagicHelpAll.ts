// Port of fmj/combat/actions/ActionMagicHelpAll.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Player } from "../../characters/Player";
import type { ResSrs } from "../../lib/ResSrs";
import type { BaseMagic } from "../../magic/BaseMagic";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionMultiTarget } from "./ActionMultiTarget";

const STATE_PRE = 1;
const STATE_ANI = 2;
const STATE_AFT = 3;

export class ActionMagicHelpAll extends ActionMultiTarget {
  private state = STATE_PRE;
  private readonly animation: ResSrs;
  private ox = 0;
  private oy = 0;

  constructor(
    attacker: FightingCharacter,
    targets: FightingCharacter[],
    private readonly magic: BaseMagic,
  ) {
    super(attacker, targets);
    this.animation = magic.magicAni!;
  }

  preproccess(): void {
    const a = this.mAttacker!;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.animation.start();
    this.animation.setIteratorNum(2);
    for (const t of this.mTargets) {
      const hp = t.hp;
      this.magic.use(a, t);
      this.mRaiseAnis.push(new RaiseAnimation(t.combatX, t.combatY, t.hp - hp, 0));
    }
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    switch (this.state) {
      case STATE_PRE:
        if (this.mCurrentFrame < 10) {
          if (a instanceof Player) a.fightingSprite!.currentFrame = Math.trunc((this.mCurrentFrame * 3) / 10) + 6;
          else a.setCombatPos(this.ox + 2, this.oy + 2);
        } else {
          this.state = STATE_ANI;
        }
        break;
      case STATE_ANI:
        if (!this.animation.update(delta)) {
          this.state = STATE_AFT;
          if (a instanceof Player) a.setFrameByState();
          else a.fightingSprite!.move(-2, -2);
        }
        break;
      case STATE_AFT:
        return this.updateRaiseAnimation(delta);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.state === STATE_ANI) this.animation.draw(canvas, 0, 0);
    else if (this.state === STATE_AFT) this.drawRaiseAnimation(canvas);
  }
}
