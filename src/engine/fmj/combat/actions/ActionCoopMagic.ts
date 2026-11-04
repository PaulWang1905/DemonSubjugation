// Port of fmj/combat/actions/ActionCoopMagic.kt — combined (party) attack.
//
// fmj.kt only played the animation; the damage step was a TODO. Here the
// combined magic (from the first player's decoration) is applied to the
// target(s) once the animation finishes.
import type { FightingCharacter } from "../../characters/FightingCharacter";
import type { Player } from "../../characters/Player";
import type { GoodsDecorations } from "../../goods/GoodsDecorations";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResSrs } from "../../lib/ResSrs";
import type { MagicAttack } from "../../magic/MagicAttack";
import type { Canvas } from "../../../graphics";
import { RaiseAnimation } from "../anim/RaiseAnimation";
import { Action } from "./Action";

const STATE_MOV = 0;
const STATE_PRE = 1;
const STATE_ANI = 2;
const STATE_AFT = 3;
const MOV_FRAME = 5;

export class ActionCoopMagic extends Action {
  private mState = STATE_MOV;
  private readonly mActors: Player[];
  private readonly mMonsters: FightingCharacter[];
  private readonly singleTarget: boolean;
  private readonly magic: MagicAttack | null;
  private mAni: ResSrs | null = null;
  private mRaiseAnis: RaiseAnimation[] = [];
  private dxy: number[][] = [];
  private oxy: number[][] = [];
  private mAniX = 0;
  private mAniY = 0;

  constructor(actors: Player[], target: FightingCharacter | FightingCharacter[]) {
    super();
    this.mActors = actors;
    this.mAttacker = actors[0];
    this.singleTarget = !Array.isArray(target);
    this.mMonsters = Array.isArray(target) ? [...target] : [target];
    const dc = actors[0].equipmentsArray[0] as GoodsDecorations | null;
    let m: MagicAttack | null = null;
    try {
      m = dc ? dc.coopMagic : null;
    } catch {
      m = null;
    }
    this.magic = m;
  }

  get isSingleTarget(): boolean {
    return this.singleTarget;
  }

  get priority(): number {
    return this.mActors[0].speed;
  }

  get isAttackerAlive(): boolean {
    return this.mActors[0].isAlive;
  }

  get isTargetAlive(): boolean {
    return this.singleTarget ? this.mMonsters[0].isAlive : this.mMonsters.some((m) => m.isAlive);
  }

  preproccess(): void {
    const midpos = [
      [92, 52],
      [109, 63],
      [126, 74],
    ];
    this.oxy = this.mActors.map((a) => [a.combatX, a.combatY]);
    this.dxy = this.mActors.map((_, i) => [
      (midpos[i][0] - this.oxy[i][0]) / MOV_FRAME,
      (midpos[i][1] - this.oxy[i][1]) / MOV_FRAME,
    ]);
    if (this.singleTarget) {
      const m = this.mMonsters[0];
      this.mAniX = m.combatX;
      this.mAniY = m.combatY - Math.trunc(m.fightingSprite!.height / 2);
    } else {
      this.mAniX = 0;
      this.mAniY = 0;
    }
    this.mAni = this.magic?.magicAni ?? (DatLib.getRes(ResType.SRS, 2, 240) as ResSrs);
    this.mAni.start();
  }

  private applyDamage(): void {
    if (!this.magic) return;
    const targets = this.mMonsters.filter((m) => m.isAlive);
    const before = targets.map((t) => t.hp);
    this.magic.use(this.mActors[0], targets);
    targets.forEach((t, i) => this.mRaiseAnis.push(new RaiseAnimation(t.combatX, t.combatY, t.hp - before[i], 0)));
  }

  update(delta: number): boolean {
    super.update(delta);
    switch (this.mState) {
      case STATE_MOV:
        if (this.mCurrentFrame < MOV_FRAME) {
          this.mActors.forEach((a, i) => {
            a.setCombatPos(
              Math.trunc(this.oxy[i][0] + this.dxy[i][0] * this.mCurrentFrame),
              Math.trunc(this.oxy[i][1] + this.dxy[i][1] * this.mCurrentFrame),
            );
          });
        } else {
          this.mState = STATE_PRE;
        }
        break;
      case STATE_PRE:
        if (this.mCurrentFrame < 10 + MOV_FRAME) {
          for (const a of this.mActors) {
            a.fightingSprite!.currentFrame = Math.trunc(((this.mCurrentFrame - MOV_FRAME) * 3) / 10) + 6;
          }
        } else {
          this.mState = STATE_ANI;
        }
        break;
      case STATE_ANI:
        if (!this.mAni!.update(delta)) {
          this.mState = STATE_AFT;
          this.mActors.forEach((a, i) => {
            a.setFrameByState();
            a.setCombatPos(this.oxy[i][0], this.oxy[i][1]);
          });
          this.applyDamage();
        }
        break;
      case STATE_AFT:
        return this.updateRaiseAnimation(delta);
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.mState === STATE_ANI) this.mAni!.drawAbsolutely(canvas, this.mAniX, this.mAniY);
    else if (this.mState === STATE_AFT) this.drawRaiseAnimation(canvas);
  }

  postExecute(): void {
    for (const m of this.mMonsters) m.isVisiable = m.isAlive;
  }

  protected updateRaiseAnimation(delta: number): boolean {
    this.mRaiseAnis = this.mRaiseAnis.filter((a) => a.update(delta));
    return this.mRaiseAnis.length > 0;
  }

  protected drawRaiseAnimation(canvas: Canvas): void {
    for (const a of this.mRaiseAnis) a.draw(canvas);
  }

  targetIsMonster(): boolean {
    return true;
  }
}
