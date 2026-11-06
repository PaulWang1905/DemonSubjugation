// Port of fmj/graphics/Util.kt — shared UI drawing helpers.
import { Global } from "../Global";
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import { TextRender } from "./TextRender";
import { Bitmap, Canvas, Paint, PaintStyle, Rect } from "../../graphics";
import { gbkBytes } from "../../java";
import { EngineSettings } from "../config/EngineSettings";

// 22x39 "wearing" figure used by the equipment screen (1 = black).
const CHUANDAI_BITS = "000000000111000000000000011001111111111111000011111000000001111100001100011100111000110000010010000000000011000001001111111111100000000000010000110000000000000011111111111111110000001100011110111111000000000111111000111000000011110011100000001111111100001110000000011110000000110000000000000000111111000000000000000001111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100001100010000000011111110110011000000011001000011010000000001111111111111111000011111111111111111000000001111111011011000000000110111101101100000000010110010010110000000001111111001111000000000111111100111000000000001111100001110000001111100001111111111000000111001101100111111100110000001000001111100000000000000000001100";

class UtilImpl {
  private bmpInformationBg: Bitmap[];
  private bmpSideFrame: Bitmap;
  private drawFramePaint = new Paint();
  private bmpTriangleCursor: Bitmap;
  private imgSmallNum: ResImage;
  bmpChuandai: Bitmap;
  sBlackPaint: Paint;

  constructor() {
    const canvas = new Canvas();
    const paint = new Paint();
    paint.color = Global.COLOR_WHITE;
    paint.style = PaintStyle.FILL_AND_STROKE;

    this.bmpInformationBg = [];
    for (let ind = 0; ind < 5; ind++) {
      const bmp = Bitmap.createBitmap(138, 23 + 16 * ind);
      canvas.setBitmap(bmp);
      canvas.drawColor(Global.COLOR_BLACK);
      canvas.drawRect(1, 1, 135, 20 + 16 * ind, paint);
      canvas.drawRect(136, 0, 138, 3, paint);
      canvas.drawLine(0, 21 + 16 * ind, 3, 21 + 16 * ind, paint);
      canvas.drawLine(0, 22 + 16 * ind, 3, 22 + 16 * ind, paint);
      this.bmpInformationBg.push(bmp);
    }

    this.bmpSideFrame = Bitmap.createBitmap(8, 96);
    canvas.setBitmap(this.bmpSideFrame);
    canvas.drawColor(Global.COLOR_WHITE);
    paint.color = Global.COLOR_BLACK;
    for (let i = 0; i <= 3; i++) canvas.drawLine(i * 2, 0, i * 2, 96, paint);

    this.bmpTriangleCursor = Bitmap.createBitmap(7, 13);
    canvas.setBitmap(this.bmpTriangleCursor);
    canvas.drawColor(Global.COLOR_WHITE);
    for (let i = 0; i <= 6; i++) canvas.drawLine(i, i, i, 13 - i, paint);

    this.imgSmallNum = DatLib.getRes(ResType.PIC, 2, 5) as ResImage;

    const px = new Uint32Array(22 * 39);
    for (let i = 0; i < px.length; i++) px[i] = CHUANDAI_BITS[i] === "1" ? Global.COLOR_BLACK : Global.COLOR_WHITE;
    this.bmpChuandai = Bitmap.createBitmap(22, 39);
    this.bmpChuandai.setPixels(px, 0, 0, 0, 22, 39);

    this.drawFramePaint.color = Global.COLOR_BLACK;
    this.drawFramePaint.style = PaintStyle.STROKE;

    this.sBlackPaint = new Paint();
    this.sBlackPaint.color = Global.COLOR_BLACK;
    this.sBlackPaint.style = PaintStyle.STROKE;
    this.sBlackPaint.strokeWidth = 1;
  }

  /** Used by SHOWSCENENAME. */
  showInformation(canvas: Canvas, msg: string): void {
    canvas.drawBitmap(this.bmpInformationBg[0], 11, 37);
    TextRender.drawText(canvas, msg, 16, 39);
  }

  /** Up to 8 Chinese characters per line, at most 5 lines. */
  showMessage(canvas: Canvas, msg: string | Int8Array): void {
    const bytes = typeof msg === "string" ? gbkBytes(msg) : msg;
    if (EngineSettings.textSize !== 16) {
      this.showMessageCompact(canvas, bytes, EngineSettings.textSize);
      return;
    }
    let lineNum = Math.trunc(bytes.length / 16);
    if (lineNum >= 5) lineNum = 4;
    const textY = 39 - lineNum * 8;
    canvas.drawBitmap(this.bmpInformationBg[lineNum], 11, textY - 2);
    TextRender.drawTextFrom(canvas, bytes, 0, new Rect(16, textY, 16 + 16 * 8, textY + 16 * lineNum + 16));
  }

  private compactFrames = new Map<number, Bitmap>();

  /** showMessage with the compact text option: wider lines, as many as fit. */
  private showMessageCompact(canvas: Canvas, bytes: Int8Array, size: number): void {
    const maxLines = Math.floor(84 / size);
    const rowsAt = (y: number) => Array.from({ length: maxLines }, (_, k) => ({ x: 16, y: y + k * size, right: 143 }));
    const device = [{ left: 16, right: 16 + 16 * 8 }]; // the device's message lines
    const lines = Math.max(1, TextRender.withSize(size, () => TextRender.drawWrapped(null, bytes, 0, rowsAt(0), device).rows));
    const h = lines * size + 7;
    let frame = this.compactFrames.get(h);
    if (!frame) this.compactFrames.set(h, (frame = this.getFrameBitmap(138, h)));
    const textY = Math.max(5, 48 - Math.round((lines * size) / 2));
    canvas.drawBitmap(frame, 11, textY - 3);
    TextRender.withSize(size, () => TextRender.drawWrapped(canvas, bytes, 0, rowsAt(textY).slice(0, lines), device));
  }

  drawSideFrame(canvas: Canvas): void {
    canvas.drawBitmap(this.bmpSideFrame, 0, 0);
    canvas.drawBitmap(this.bmpSideFrame, 152, 0);
  }

  /** The striped side borders down both edges of a canvas of any size (WideView). */
  drawSideFramesAround(canvas: Canvas): void {
    for (let y = 0; y < canvas.height; y += this.bmpSideFrame.height) {
      canvas.drawBitmap(this.bmpSideFrame, 0, y);
      canvas.drawBitmap(this.bmpSideFrame, canvas.width - this.bmpSideFrame.width, y);
    }
  }

  getFrameBitmap(w: number, h: number): Bitmap {
    const bmp = Bitmap.createBitmap(w, h);
    const tmpC = new Canvas(bmp);
    tmpC.drawColor(Global.COLOR_WHITE);
    tmpC.drawRect(1, 1, w - 2, h - 2, this.drawFramePaint);
    return bmp;
  }

  drawTriangleCursor(canvas: Canvas, x: number, y: number): void {
    canvas.drawBitmap(this.bmpTriangleCursor, x, y);
  }

  /** @returns width in pixels of the drawn number */
  drawSmallNum(canvas: Canvas, num: number, x: number, y: number): number {
    let tmpX = x;
    const digits = String(Math.abs(num));
    for (const d of digits) {
      this.imgSmallNum.draw(canvas, d.charCodeAt(0) - 48 + 1, tmpX, y);
      tmpX += this.imgSmallNum.width + 1;
    }
    return digits.length * this.imgSmallNum.width;
  }

  getSmallSignedNumBitmap(num: number): Bitmap {
    const digits = String(num > 0 ? num : -num);
    const sign = DatLib.getRes(ResType.PIC, 2, num > 0 ? 6 : 7) as ResImage;
    const bmp = Bitmap.createBitmap(
      sign.width + digits.length * this.imgSmallNum.width + 1 + digits.length,
      this.imgSmallNum.height,
    );
    const c = new Canvas(bmp);
    sign.draw(c, 1, 0, 0);
    let x = sign.width + 1;
    for (const d of digits) {
      this.imgSmallNum.draw(c, d.charCodeAt(0) - 48 + 1, x, 0);
      x += this.imgSmallNum.width + 1;
    }
    return bmp;
  }
}

let impl: UtilImpl | null = null;

/** Lazily initialised (it needs DAT.LIB), like the Kotlin `object Util`. */
export const Util = {
  get(): UtilImpl {
    if (!impl) impl = new UtilImpl();
    return impl;
  },
  reset(): void {
    impl = null;
  },
  get bmpChuandai(): Bitmap { return Util.get().bmpChuandai; },
  get sBlackPaint(): Paint { return Util.get().sBlackPaint; },
  showInformation: (c: Canvas, m: string) => Util.get().showInformation(c, m),
  showMessage: (c: Canvas, m: string | Int8Array) => Util.get().showMessage(c, m),
  drawSideFrame: (c: Canvas) => Util.get().drawSideFrame(c),
  drawSideFramesAround: (c: Canvas) => Util.get().drawSideFramesAround(c),
  getFrameBitmap: (w: number, h: number) => Util.get().getFrameBitmap(w, h),
  drawTriangleCursor: (c: Canvas, x: number, y: number) => Util.get().drawTriangleCursor(c, x, y),
  drawSmallNum: (c: Canvas, n: number, x: number, y: number) => Util.get().drawSmallNum(c, n, x, y),
  getSmallSignedNumBitmap: (n: number) => Util.get().getSmallSignedNumBitmap(n),
};
