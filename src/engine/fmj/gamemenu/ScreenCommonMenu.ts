// Port of fmj/gamemenu/ScreenCommonMenu.kt — generic vertical menu (MENU command).
import { Global } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import type { Bitmap, Canvas } from "../../graphics";
import { gbkBytes } from "../../java";

export class ScreenCommonMenu extends BaseScreen {
  private curSel = 0;
  private readonly paddedItems: Int8Array[];
  private readonly top: number;
  private readonly left: number;
  private readonly bg: Bitmap;
  private readonly padx = 3;
  private readonly pady = 3;

  constructor(
    readonly parent: GameNode,
    items: string[],
    private readonly callback: (sel: number) => void,
  ) {
    super();
    const byteItems = items.map((s) => gbkBytes(s));
    const colCount = byteItems.length ? Math.max(...byteItems.map((b) => b.length)) : 2;
    const width = 8 * colCount;
    const height = 16 * items.length;
    this.bg = Util.getFrameBitmap(width + this.padx * 2, height + this.pady * 2);
    this.left = Math.trunc((Global.SCREEN_WIDTH - width) / 2);
    this.top = Math.trunc((Global.SCREEN_HEIGHT - height) / 2);
    this.paddedItems = byteItems.map((b) => {
      const out = new Int8Array(colCount).fill(0x20);
      out.set(b);
      return out;
    });
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      this.popScreen();
      this.callback(this.curSel + 1);
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
      this.callback(0);
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_DOWN && this.curSel < this.paddedItems.length - 1) ++this.curSel;
    else if (key === Global.KEY_UP && this.curSel > 0) --this.curSel;
  }

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.bg, this.left - this.padx, this.top - this.pady);
    for (let i = 0; i < this.paddedItems.length; i++) {
      if (i !== this.curSel) TextRender.drawText(canvas, this.paddedItems[i], this.left, this.top + 16 * i);
      else TextRender.drawSelText(canvas, this.paddedItems[i], this.left, this.top + 16 * i);
    }
  }

  reset(): void {
    this.curSel = 0;
  }
}
