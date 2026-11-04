// Port of fmj/gamemenu/ScreenMenuSystem.kt — load / save / settings / quit.
import { Global, ScreenViewType } from "../Global";
import { T } from "../i18n";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { SaveLoadOperate, ScreenSaveLoadGame } from "../views/ScreenSaveLoadGame";
import { Bitmap, Canvas, Paint } from "../../graphics";

export class ScreenMenuSystem extends BaseScreen {
  private first = 0;
  private index = 0;
  private readonly str = T.systemMenu;
  private readonly strX = 42;
  private strY = 32;
  private selY = 32;
  private readonly bmpFrame = Util.getFrameBitmap(109 - 39 + 1, 91 - 29 + 1);
  private readonly bmpArrowUp = Bitmap.createBitmap(7, 4);
  private readonly bmpArrowDown = Bitmap.createBitmap(7, 4);
  private readonly bmpArr = [this.bmpArrowDown, this.bmpArrowUp];
  private readonly arrowX = 70;
  private arrowY = 82;
  private bmpi = 0;

  constructor(readonly parent: GameNode) {
    super();
    const p = new Paint();
    p.color = Global.COLOR_BLACK;
    const c = new Canvas(this.bmpArrowUp);
    c.drawColor(Global.COLOR_WHITE);
    c.drawLine(3, 0, 4, 0, p);
    c.drawLine(2, 1, 5, 1, p);
    c.drawLine(1, 2, 6, 2, p);
    c.drawLine(0, 3, 7, 3, p);
    c.setBitmap(this.bmpArrowDown);
    c.drawColor(Global.COLOR_WHITE);
    c.drawLine(0, 0, 7, 0, p);
    c.drawLine(1, 1, 6, 1, p);
    c.drawLine(2, 2, 5, 2, p);
    c.drawLine(3, 3, 4, 3, p);
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.bmpFrame, 39, 29);
    TextRender.drawText(canvas, this.str[this.first], this.strX, this.strY);
    TextRender.drawText(canvas, this.str[this.first + 1], this.strX, this.strY + 16);
    TextRender.drawText(canvas, this.str[this.first + 2], this.strX, this.strY + 32);
    TextRender.drawSelText(canvas, this.str[this.index], this.strX, this.selY);
    canvas.drawBitmap(this.bmpArr[this.bmpi], this.arrowX, this.arrowY);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP) {
      --this.index;
      this.selY -= 16;
    } else if (key === Global.KEY_DOWN) {
      ++this.index;
      this.selY += 16;
    }
    if (this.index === 0 || this.index === 4) {
      this.index = 0;
      this.selY = 32;
      this.arrowY = 82;
      this.bmpi = 0;
      this.first = 0;
      this.strY = 32;
    } else if (this.index === 3 || this.index === -1) {
      this.index = 3;
      this.selY = 72;
      this.arrowY = 34;
      this.bmpi = 1;
      this.first = 1;
      this.strY = 40;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      switch (this.index) {
        case 0:
          this.pushScreen(new ScreenSaveLoadGame(this, SaveLoadOperate.LOAD));
          break;
        case 1:
          if (Global.disableSave) this.showMessage(T.cannotSave);
          else if (this.game.mainScene.scriptProcess.prev != null) this.showMessage(T.cannotSaveHere);
          else this.pushScreen(new ScreenSaveLoadGame(this, SaveLoadOperate.SAVE));
          break;
        case 2:
          break;
        case 3:
          this.game.changeScreen(ScreenViewType.SCREEN_MENU);
          break;
      }
    }
  }
}
