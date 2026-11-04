// Port of fmj/magic/ScreenMagic.kt — magic list screen.
import { Global } from "../Global";
import { T } from "../i18n";
import { TextRender } from "../graphics/TextRender";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Bitmap, Canvas, Paint, PaintStyle, Point, Rect } from "../../graphics";
import { Stack, gbkBytes } from "../../java";
import type { BaseMagic } from "./BaseMagic";

const ITEM_NUM = 2;

export interface OnMagicSelectedListener {
  onItemSelected(magic: BaseMagic): void;
}

export class ScreenMagic extends BaseScreen {
  private readonly magics: BaseMagic[];
  private mFirstItemIndex = 0;
  private mCurItemIndex = 0;
  private readonly mBmpCursor = Bitmap.createBitmap(12, 11);
  private readonly mBmpMarker = Bitmap.createBitmap(5, 8);
  private readonly mBmpMarker2 = Bitmap.createBitmap(5, 8);
  private readonly mRectTop = new Rect(10, 4, 147, 39);
  private readonly mRectBtm = new Rect(10, 41, 147, 76);
  private readonly mRectDsp = new Rect(11, 42, 146, 75);
  private mToDraw = 0;
  private mNextToDraw = 0;
  private readonly mStackLastToDraw = Stack.create<number>();
  private readonly mTextPos = new Point(10, 77);
  private readonly mFramePaint = new Paint();

  constructor(
    readonly parent: GameNode,
    magics: BaseMagic[],
    private readonly mOnItemSelectedListener: OnMagicSelectedListener | ((m: BaseMagic) => void),
  ) {
    super();
    this.magics = [...magics];
    this.mFramePaint.color = Global.COLOR_BLACK;
    this.mFramePaint.style = PaintStyle.STROKE;
    this.mFramePaint.strokeWidth = 1;
    this.createBmp();
  }

  private createBmp(): void {
    const canvas = new Canvas();
    const p = new Paint();
    p.color = Global.COLOR_BLACK;
    p.strokeWidth = 1;
    p.style = PaintStyle.STROKE;

    canvas.setBitmap(this.mBmpCursor);
    canvas.drawColor(Global.COLOR_WHITE);
    canvas.drawLine(8, 0, 11, 0, p);
    canvas.drawLine(11, 1, 11, 4, p);
    canvas.drawRect(6, 1, 7, 4, p);
    canvas.drawRect(7, 4, 10, 5, p);
    canvas.drawLine(7, 4, 0, 11, p);
    canvas.drawLine(8, 5, 2, 11, p);

    canvas.setBitmap(this.mBmpMarker);
    canvas.drawColor(Global.COLOR_WHITE);
    const pts = [2, 0, 4, 2, 4, 2, 4, 6, 4, 6, 2, 8, 2, 7, 0, 5, 0, 5, 0, 2, 0, 3, 3, 0, 2, 3, 2, 5];
    canvas.drawLines(pts, p);

    canvas.setBitmap(this.mBmpMarker2);
    canvas.drawColor(Global.COLOR_WHITE);
    canvas.drawLines(pts, p);
    canvas.drawLines([1, 1, 1, 6, 2, 0, 2, 8, 3, 2, 3, 6], p);
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    canvas.drawRectR(this.mRectTop, this.mFramePaint);
    canvas.drawRectR(this.mRectBtm, this.mFramePaint);
    const hlMagic = this.magics[this.mFirstItemIndex];
    TextRender.drawText(canvas, hlMagic.magicName, this.mRectTop.left + 1, this.mRectTop.top + 1);
    if (this.mFirstItemIndex + 1 < this.magics.length) {
      TextRender.drawText(canvas, this.magics[this.mFirstItemIndex + 1].magicName, this.mRectTop.left + 1, this.mRectTop.top + 1 + 16);
    }
    this.mNextToDraw = TextRender.drawTextFrom(canvas, hlMagic.magicDescription, this.mToDraw, this.mRectDsp);
    TextRender.drawText(canvas, T.mpCost + hlMagic.costMp, this.mTextPos.x, this.mTextPos.y);
    canvas.drawBitmap(this.mBmpCursor, 100, this.mFirstItemIndex === this.mCurItemIndex ? 10 : 26);
    canvas.drawBitmap(this.mFirstItemIndex === 0 ? this.mBmpMarker : this.mBmpMarker2, 135, 6);
    canvas.drawBitmap(this.mBmpMarker, 135, 6 + 8);
    canvas.drawBitmap(this.mBmpMarker, 135, 6 + 16);
    canvas.drawBitmap(this.mFirstItemIndex + 2 < this.magics.length ? this.mBmpMarker2 : this.mBmpMarker, 135, 6 + 24);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP && this.mCurItemIndex > 0) {
      --this.mCurItemIndex;
      if (this.mCurItemIndex < this.mFirstItemIndex) --this.mFirstItemIndex;
      this.mNextToDraw = 0;
      this.mToDraw = 0;
      this.mStackLastToDraw.clear();
    } else if (key === Global.KEY_DOWN && this.mCurItemIndex + 1 < this.magics.length) {
      ++this.mCurItemIndex;
      if (this.mCurItemIndex >= this.mFirstItemIndex + ITEM_NUM) ++this.mFirstItemIndex;
      this.mNextToDraw = 0;
      this.mToDraw = 0;
      this.mStackLastToDraw.clear();
    } else if (key === Global.KEY_PAGEDOWN) {
      const len = gbkBytes(this.magics[this.mCurItemIndex].magicDescription).length;
      if (this.mNextToDraw < len) {
        this.mStackLastToDraw.push(this.mToDraw);
        this.mToDraw = this.mNextToDraw;
      }
    } else if (key === Global.KEY_PAGEUP && this.mToDraw !== 0) {
      const v = this.mStackLastToDraw.pop();
      if (v !== null) this.mToDraw = v;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      const l = this.mOnItemSelectedListener;
      const m = this.magics[this.mCurItemIndex];
      if (typeof l === "function") l(m);
      else l.onItemSelected(m);
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }
}
