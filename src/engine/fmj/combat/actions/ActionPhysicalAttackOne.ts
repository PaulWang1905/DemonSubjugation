// Port of fmj/combat/actions/ActionPhysicalAttackOne.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Monster } from "../../characters/Monster";
import { Player } from "../../characters/Player";
import { EngineSettings } from "../../config/EngineSettings";
import type { Canvas } from "../../../graphics";
import { random } from "../../../java";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionSingleTarget } from "./ActionSingleTarget";
import { CalcDamage } from "./CalcDamage";

const TOTAL_FRAME = 5;

export class ActionPhysicalAttackOne extends ActionSingleTarget {
  private dx = 0;
  private dy = 0;
  private ox = 0;
  private oy = 0;
  private mTotalMark = true;

  constructor(attacker: FightingCharacter, target: FightingCharacter) {
    super(attacker, target);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    const t = this.mTarget;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.dx = (t.combatX - a.combatX) / TOTAL_FRAME;
    this.dy = (t.combatY - a.combatY) / TOTAL_FRAME;
    let damage: number;
    if (EngineSettings.originalDamageFormula) {
      damage = CalcDamage.originalPhysicalDamage(a.attack, t.defend, t instanceof Player);
    } else {
      damage = a.attack - t.defend;
      if (damage <= 0) damage = 1;
      if (a instanceof Player) damage *= 10;
      damage += Math.trunc(random() * 10);
    }
    t.hp = t.hp - damage;
    this.mRaiseAni = new RaiseAnimation(t.combatLeft, t.combatTop, -damage, 0);
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    const t = this.mTarget;
    if (this.mCurrentFrame < TOTAL_FRAME) {
      a.setCombatPos(Math.trunc(this.ox + this.dx * this.mCurrentFrame), Math.trunc(this.oy + this.dy * this.mCurrentFrame));
      const fs = a.fightingSprite!;
      if (a instanceof Monster) fs.currentFrame = Math.trunc((fs.frameCnt * this.mCurrentFrame) / TOTAL_FRAME) + 1;
      else if (a instanceof Player) fs.currentFrame = Math.trunc((5 * this.mCurrentFrame) / TOTAL_FRAME) + 1;
    } else if (this.mCurrentFrame > TOTAL_FRAME) {
      if (!this.updateRaiseAnimation(delta)) {
        if (t instanceof Player) t.setFrameByState();
        else t.fightingSprite!.move(-2, -2);
        return false;
      }
    } else if (this.mTotalMark) {
      this.mTotalMark = false;
      a.setCombatPos(this.ox, this.oy);
      if (a instanceof Monster) a.fightingSprite!.currentFrame = 1;
      else if (a instanceof Player) a.setFrameByState();
      if (t instanceof Player) t.fightingSprite!.currentFrame = 10;
      else t.fightingSprite!.move(2, 2);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mCurrentFrame >= TOTAL_FRAME) this.drawRaiseAnimation(canvas);
  }
}
