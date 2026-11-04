// Port of fmj/combat/actions/ActionPhysicalAttackAll.kt
import type { FightingCharacter } from "../../characters/FightingCharacter";
import { Monster } from "../../characters/Monster";
import { Player } from "../../characters/Player";
import { EngineSettings } from "../../config/EngineSettings";
import type { Canvas } from "../../../graphics";
import { random } from "../../../java";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { ActionMultiTarget } from "./ActionMultiTarget";
import { attackStatuses, guarded, MISS, physicalOnEnemy, physicalOnPlayer, raiseMask } from "../OriginalRules";

const TOTAL_FRAME = 5;

export class ActionPhysicalAttackAll extends ActionMultiTarget {
  private dx = 0;
  private dy = 0;
  private ox = 0;
  private oy = 0;

  constructor(attacker: FightingCharacter, targets: FightingCharacter[]) {
    super(attacker, targets);
  }

  preproccess(): void {
    const a = this.mAttacker!;
    this.ox = a.combatX;
    this.oy = a.combatY;
    this.dx = (44.0 - a.combatX) / TOTAL_FRAME;
    this.dy = (14.0 - a.combatY) / TOTAL_FRAME;
    for (const fc of this.mTargets) {
      if (!fc.isAlive) continue;
      let damage: number;
      if (EngineSettings.originalDamageFormula) {
        damage =
          fc instanceof Player
            ? physicalOnPlayer(a, fc, guarded(fc, fc.defending, fc.hasAilment))
            : physicalOnEnemy(a, fc);
        const miss = damage === MISS;
        if (!miss) fc.hp = Math.max(0, fc.hp - damage);
        const bits = attackStatuses(a, fc, miss);
        this.mRaiseAnis.push(new RaiseAnimation(fc.combatX, fc.combatY, miss ? 0 : -damage, raiseMask(bits), miss));
        continue;
      } else {
        damage = a.attack - fc.defend;
        if (damage <= 0) damage = 1;
        damage += Math.trunc(random() * 3);
      }
      fc.hp = fc.hp - damage;
      this.mRaiseAnis.push(new RaiseAnimation(fc.combatX, fc.combatY, -damage, 0));
    }
  }

  update(delta: number): boolean {
    super.update(delta);
    const a = this.mAttacker!;
    if (this.mCurrentFrame < TOTAL_FRAME) {
      a.setCombatPos(Math.trunc(this.ox + this.dx * this.mCurrentFrame), Math.trunc(this.oy + this.dy * this.mCurrentFrame));
      const fs = a.fightingSprite!;
      if (a instanceof Monster) fs.currentFrame = Math.trunc((fs.frameCnt * this.mCurrentFrame) / TOTAL_FRAME) + 1;
      else if (a instanceof Player) fs.currentFrame = Math.trunc((5 * this.mCurrentFrame) / TOTAL_FRAME) + 1;
    } else if (this.mCurrentFrame > TOTAL_FRAME) {
      return this.updateRaiseAnimation(delta);
    } else {
      a.setCombatPos(this.ox, this.oy);
      if (a instanceof Monster || a instanceof Player) a.fightingSprite!.currentFrame = 1;
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mCurrentFrame >= TOTAL_FRAME) this.drawRaiseAnimation(canvas);
  }
}
