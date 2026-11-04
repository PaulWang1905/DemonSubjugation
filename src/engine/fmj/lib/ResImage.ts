// Port of fmj/lib/ResImage.kt — 1-bit (or 2-bit with transparency) sliced images.
import { Global } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { Bitmap, Canvas } from "../../graphics";
import { ResBase } from "./ResBase";

export class ResImage extends ResBase {
  width = 0;
  height = 0;
  /** Number of slices. */
  number = 0;
  protected mTransparent = false;
  /**
   * Opaque: one bit per pixel, 0 white 1 black.
   * Transparent: two bits per pixel, high bit = transparent, low bit = colour.
   */
  protected mData: Int8Array = new Int8Array(0);
  protected mBitmaps: Bitmap[] = [];

  get bytesCount(): number {
    return this.mData.length + 6;
  }

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.width = buf[offset + 2] & 0xff;
    this.height = buf[offset + 3] & 0xff;
    this.number = buf[offset + 4] & 0xff;
    this.mTransparent = buf[offset + 5] === 2;

    const len =
      this.number * (Math.trunc(this.width / 8) + (this.width % 8 !== 0 ? 1 : 0)) * this.height * buf[offset + 5];
    this.mData = buf.slice(offset + 6, offset + 6 + Math.max(0, len));
    this.createBitmaps();
  }

  private createBitmaps(): void {
    const data = this.mData;
    const { width, height } = this;
    const W = Global.COLOR_WHITE;
    const B = Global.COLOR_BLACK;
    const T = Global.COLOR_TRANSP;
    let iOfData = 0;
    this.mBitmaps = [];
    for (let n = 0; n < this.number; n++) {
      const tmp = new Uint32Array(width * height);
      tmp.fill(W);
      if (this.mTransparent) {
        let cnt = 0;
        let iOfTmp = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const d = data[iOfData] | 0;
            if (((d << cnt) & 0x80) !== 0) {
              tmp[iOfTmp] = T;
            } else {
              tmp[iOfTmp] = ((d << cnt << 1) & 0x80) !== 0 ? B : W;
            }
            ++iOfTmp;
            cnt += 2;
            if (cnt >= 8) {
              cnt = 0;
              ++iOfData;
            }
          }
          if (cnt >= 1 && cnt <= 7) {
            cnt = 0;
            ++iOfData;
          }
          if (iOfData % 2 !== 0) ++iOfData;
        }
      } else {
        let cnt = 0;
        let iOfTmp = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const d = data[iOfData] | 0;
            tmp[iOfTmp++] = ((d << cnt) & 0x80) !== 0 ? B : W;
            if (++cnt >= 8) {
              cnt = 0;
              ++iOfData;
            }
          }
          if (cnt !== 0) {
            cnt = 0;
            ++iOfData;
          }
        }
      }
      this.mBitmaps.push(Bitmap.createBitmap(width, height, tmp));
    }
  }

  /** Draw slice `num` (1-based). */
  draw(canvas: Canvas, num: number, left: number, top: number): void {
    if (num <= this.number) {
      const bmp = this.mBitmaps[num - 1];
      if (bmp) canvas.drawBitmap(bmp, left, top);
    } else if (this.number > 0) {
      canvas.drawBitmap(this.mBitmaps[0], left, top);
    } else {
      TextRender.drawText(canvas, "烫", left, top);
    }
  }

  /** A 1x1 transparent image standing in for a missing resource. */
  static placeholder(type: number, index: number): ResImage {
    const img = new ResImage();
    img.type = type;
    img.index = index;
    img.width = 1;
    img.height = 1;
    img.number = 1;
    img.mTransparent = true;
    img.mBitmaps = [Bitmap.createBitmap(1, 1, new Uint32Array([0]))];
    return img;
  }

  getBitmap(index: number): Bitmap | null {
    return index >= this.number ? null : this.mBitmaps[index].copy();
  }
}
