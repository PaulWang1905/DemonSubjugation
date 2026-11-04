// Port of fmj/combat/anim/FrameAnimation.kt
import type { ResImage } from "../../lib/ResImage";
import type { Canvas } from "../../../graphics";

export class FrameAnimation {
  private DELTA = Math.trunc(1000 / 5);
  private mCurFrame: number;
  private mTimeCnt = 0;
  private readonly mEndFrame: number;

  constructor(
    private readonly mImage: ResImage,
    private readonly mStartFrame = 1,
    endFrame?: number,
  ) {
    this.mEndFrame = endFrame ?? mImage.number;
    this.mCurFrame = mStartFrame;
  }

  setFPS(fps: number): void {
    this.DELTA = Math.trunc(1000 / fps);
  }

  update(delta: number): void {
    this.mTimeCnt += delta;
    if (this.mTimeCnt >= this.DELTA) {
      this.mTimeCnt = 0;
      if (++this.mCurFrame > this.mEndFrame) this.mCurFrame = this.mStartFrame;
    }
  }

  draw(canvas: Canvas, x: number, y: number): void {
    this.mImage.draw(canvas, this.mCurFrame, x, y);
  }
}
