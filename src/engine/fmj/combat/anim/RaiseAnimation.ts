// Port of fmj/combat/anim/RaiseAnimation.kt — floating damage numbers / status icons.
import { FightingCharacter } from "../../characters/FightingCharacter";
import { Util } from "../../graphics/Util";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResSrs } from "../../lib/ResSrs";
import type { Bitmap, Canvas } from "../../../graphics";

export class RaiseAnimation {
  private dy = 0;
  private dt = 0;
  private readonly raiseNum: Bitmap;
  private readonly srsList: ResSrs[] = [];
  private bShowNum: boolean;
  private cnt = 0;

  constructor(
    private readonly x: number,
    private readonly y: number,
    hitpoint: number,
    buff: number,
  ) {
    this.raiseNum = Util.getSmallSignedNumBitmap(hitpoint);
    this.bShowNum = hitpoint !== 0;
    const F = FightingCharacter;
    const table: [number, number][] = [
      [F.BUFF_MASK_DU, 243],
      [F.BUFF_MASK_LUAN, 244],
      [F.BUFF_MASK_FENG, 245],
      [F.BUFF_MASK_MIAN, 246],
      [F.BUFF_MASK_GONG, 240],
      [F.BUFF_MASK_FANG, 241],
      [F.BUFF_MASK_SU, 242],
    ];
    for (const [mask, srs] of table) {
      if ((buff & mask) === mask) {
        const r = DatLib.getRes(ResType.SRS, 1, srs) as ResSrs;
        r.start();
        this.srsList.push(r);
      }
    }
  }

  update(delta: number): boolean {
    if (this.bShowNum) {
      this.cnt += delta;
      if (this.cnt > 50) {
        this.cnt = 0;
        ++this.dt;
        this.dy -= this.dt;
        if (this.dt > 4) this.bShowNum = false;
      }
    } else {
      if (this.srsList.length === 0) return false;
      if (!this.srsList[0].update(delta)) {
        this.srsList.shift();
        return this.srsList.length > 0;
      }
    }
    return true;
  }

  draw(canvas: Canvas): void {
    if (this.bShowNum) canvas.drawBitmap(this.raiseNum, this.x, this.y + this.dy);
    else if (this.srsList.length > 0) this.srsList[0].drawAbsolutely(canvas, this.x, this.y);
  }
}
