// Port of fmj/graphics/Tiles.kt
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import { Canvas } from "../../graphics";

export class Tiles {
  static readonly WIDTH = 16;
  static readonly HEIGHT = 16;

  private readonly mTileRes: ResImage;

  constructor(index: number) {
    this.mTileRes = DatLib.getRes(ResType.TIL, 1, index) as ResImage;
  }

  /** @param i tile number */
  draw(canvas: Canvas, x: number, y: number, i: number): void {
    this.mTileRes.draw(canvas, i + 1, x, y);
  }
}
