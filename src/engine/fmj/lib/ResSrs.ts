// Port of fmj/lib/ResSrs.kt — special-effect animation resource.
import { Canvas } from "../../graphics";
import { ResBase } from "./ResBase";
import { ResImage } from "./ResImage";

class Key {
  show: number;
  nshow: number;
  constructor(
    readonly index: number,
    header: number[][],
  ) {
    this.show = header[index][2];
    this.nshow = header[index][3];
  }
}

export class ResSrs extends ResBase {
  private mFrameNum = 0;
  private mImageNum = 0;
  public mStartFrame = 0;
  public mEndFrame = 0;
  /** Per frame: x, y, show, nShow, imgIndex */
  private mFrameHeader: number[][] = [];
  private mImage: ResImage[] = [];
  private ITERATOR = 1;
  private mShowList: Key[] = [];

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset];
    this.index = buf[offset + 1] & 0xff;
    this.mFrameNum = buf[offset + 2] & 0xff;
    this.mImageNum = buf[offset + 3] & 0xff;
    this.mStartFrame = buf[offset + 4] & 0xff;
    this.mEndFrame = buf[offset + 5] & 0xff;

    let ptr = offset + 6;
    this.mFrameHeader = [];
    for (let i = 0; i < this.mFrameNum; i++) {
      const h: number[] = [];
      for (let k = 0; k < 5; k++) h.push(buf[ptr++] & 0xff);
      this.mFrameHeader.push(h);
    }
    this.mImage = [];
    for (let i = 0; i < this.mImageNum; i++) {
      const img = new ResImage();
      img.setData(buf, ptr);
      ptr += img.bytesCount;
      this.mImage.push(img);
    }
  }

  start(): void {
    this.mShowList = this.mFrameNum > 0 ? [new Key(0, this.mFrameHeader)] : [];
  }

  /** An animation with no frames, standing in for a missing resource. */
  static placeholder(type: number, index: number): ResSrs {
    const s = new ResSrs();
    s.type = type;
    s.index = index;
    return s;
  }

  /** @returns false once the animation has finished */
  update(_delta: number): boolean {
    for (let j = 0; j < this.ITERATOR; j++) {
      // Mirrors Kotlin's ListIterator.add(): the new key is inserted right
      // after the current one and is not visited in this pass.
      const next: Key[] = [];
      for (const k of this.mShowList) {
        --k.show;
        --k.nshow;
        next.push(k);
        if (k.nshow === 0 && k.index + 1 < this.mFrameNum) {
          next.push(new Key(k.index + 1, this.mFrameHeader));
        }
      }
      this.mShowList = next.filter((k) => k.show > 0);
      if (this.mShowList.length === 0) return false;
    }
    return true;
  }

  draw(canvas: Canvas, dx: number, dy: number): void {
    for (const k of this.mShowList) {
      const h = this.mFrameHeader[k.index];
      this.mImage[h[4]]?.draw(canvas, 1, h[0] + dx, h[1] + dy);
    }
  }

  drawAbsolutely(canvas: Canvas, x: number, y: number): void {
    if (this.mShowList.length === 0) return;
    const h0 = this.mFrameHeader[0];
    for (const k of this.mShowList) {
      const h = this.mFrameHeader[k.index];
      this.mImage[h[4]]?.draw(canvas, 1, h[0] - h0[0] + x, h[1] - h0[1] + y);
    }
  }

  /** Indexes of the frames currently on screen (used by the editor preview). */
  visibleFrames(): number[] {
    return this.mShowList.map((k) => k.index);
  }

  setIteratorNum(n: number): void {
    this.ITERATOR = n < 1 ? 1 : n;
  }
}
