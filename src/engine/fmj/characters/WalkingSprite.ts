// Port of fmj/characters/WalkingSprite.kt
import { Global } from "../Global";
import { DatLib } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import type { Canvas } from "../../graphics";
import { Direction } from "./Direction";

const OFFSET = [0, 1, 2, 1];

export class WalkingSprite {
  private readonly resImage: ResImage;
  private offset = 1;
  private _step = 0;

  constructor(type: number, id: number) {
    this.resImage = DatLib.getACP(type, id)!;
  }

  get id(): number {
    return this.resImage.index;
  }

  get step(): number {
    return this._step;
  }
  set step(s: number) {
    this._step = s % 4;
  }

  setDirection(d: Direction): void {
    switch (d) {
      case Direction.North: this.offset = 1; break;
      case Direction.East: this.offset = 4; break;
      case Direction.South: this.offset = 7; break;
      case Direction.West: this.offset = 10; break;
    }
  }

  walkTo(d: Direction): void {
    this.setDirection(d);
    this.walk();
  }

  walk(): void {
    ++this.step;
    this.step %= 4;
  }

  draw(canvas: Canvas, x: number, y: number): void {
    const img = this.resImage;
    const tmpY = y + 16 - img.height;
    if (x + img.width > 0 && x < 160 - 16 && tmpY + img.height > 0 && tmpY < 96) {
      img.draw(canvas, this.offset + OFFSET[this._step], x + Global.MAP_LEFT_OFFSET, tmpY);
    }
  }
}
