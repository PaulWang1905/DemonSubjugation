// Port of fmj/characters/FightingSprite.kt
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import type { Canvas } from "../../graphics";

export class FightingSprite {
  private readonly mImage: ResImage;
  /** 1-based frame number. */
  currentFrame = 1;
  combatX = 0;
  combatY = 0;

  constructor(resType: ResType, index: number) {
    if (resType === ResType.ACP) {
      this.mImage = DatLib.getRes(ResType.ACP, 3, index) as ResImage; // monsters
    } else if (resType === ResType.PIC) {
      this.mImage = DatLib.getRes(ResType.PIC, 3, index) as ResImage; // players
    } else {
      throw new Error("resType Error. resType=" + resType);
    }
  }

  get width(): number { return this.mImage.width; }
  get height(): number { return this.mImage.height; }
  get frameCnt(): number { return this.mImage.number; }

  draw(canvas: Canvas, x?: number, y?: number): void {
    if (x === undefined || y === undefined) {
      this.mImage.draw(
        canvas,
        this.currentFrame,
        this.combatX - Math.trunc(this.mImage.width / 2),
        this.combatY - Math.trunc(this.mImage.height / 2),
      );
    } else {
      this.mImage.draw(canvas, this.currentFrame, x, y);
    }
  }

  setCombatPos(x: number, y: number): void {
    this.combatX = x;
    this.combatY = y;
  }

  move(dx: number, dy: number): void {
    this.combatX += dx;
    this.combatY += dy;
  }
}
