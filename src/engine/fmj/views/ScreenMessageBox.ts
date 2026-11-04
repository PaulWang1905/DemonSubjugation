// Port of fmj/views/ScreenMessageBox.kt — yes/no confirmation box.
import { Global } from "../Global";
import { T } from "../i18n";
import { TextRender } from "../graphics/TextRender";
import { Bitmap, Canvas, Paint, PaintStyle } from "../../graphics";
import { BaseScreen, type GameNode } from "./BaseScreen";

let bmpBg: Bitmap | null = null;

function background(): Bitmap {
  if (bmpBg) return bmpBg;
  const bmp = Bitmap.createBitmap(137 - 27 + 1, 81 - 15 + 1);
  const c = new Canvas(bmp);
  c.drawColor(Global.COLOR_WHITE);
  const p = new Paint();
  p.color = Global.COLOR_BLACK;
  p.style = PaintStyle.STROKE;
  c.drawRect(1, 1, bmp.width - 5, bmp.height - 5, p);
  c.drawRect(43 - 27, 51 - 15, 70 - 27, 70 - 15, p);
  c.drawRect(91 - 27, 51 - 15, 118 - 27, 70 - 15, p);
  p.style = PaintStyle.FILL_AND_STROKE;
  c.drawRect(32 - 27, 77 - 15, 137 - 27, 81 - 15, p);
  c.drawRect(133 - 27, 20 - 15, bmp.width - 1, bmp.height - 1, p);
  bmpBg = bmp;
  return bmp;
}

export interface OnOKClickListener {
  onOKClick(): void;
}

export class ScreenMessageBox extends BaseScreen {
  private index = 0;
  private readonly mMsg: string;

  constructor(
    readonly parent: GameNode,
    msg: string | null,
    private readonly mOnOkClickListener: OnOKClickListener | (() => void) | null,
  ) {
    super();
    this.mMsg = msg ?? "";
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(background(), 27, 15);
    TextRender.drawText(canvas, this.mMsg, 33, 23);
    if (this.index === 0) {
      TextRender.drawSelText(canvas, T.yes, 45, 53);
      TextRender.drawText(canvas, T.no, 93, 53);
    } else {
      TextRender.drawText(canvas, T.yes, 45, 53);
      TextRender.drawSelText(canvas, T.no, 93, 53);
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_LEFT || key === Global.KEY_RIGHT) this.index = 1 - this.index;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      const l = this.mOnOkClickListener;
      if (this.index === 0 && l) {
        if (typeof l === "function") l();
        else l.onOKClick();
      }
      this.popScreen();
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }
}
