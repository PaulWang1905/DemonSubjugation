// Port of fmj/gamemenu/ScreenTakeMedicine.kt
import { Global } from "../Global";
import type { BaseGoods } from "../goods/BaseGoods";
import { isEatMedicine } from "../goods/IEatMedicine";
import { TextRender } from "../graphics/TextRender";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import type { Canvas } from "../../graphics";

export class ScreenTakeMedicine extends BaseScreen {
  private mStatePageIndex = 0;
  private mActorIndex = 0;

  constructor(
    readonly parent: GameNode,
    private readonly mMedicine: BaseGoods,
  ) {
    super();
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    const p = this.game.playerList[this.mActorIndex];
    canvas.drawColor(Global.COLOR_WHITE);
    p.drawState(canvas, this.mStatePageIndex);
    p.drawHead(canvas, 5, 60);
    if (this.mMedicine.goodsNum > 0) {
      this.mMedicine.draw(canvas, 5, 10);
      TextRender.drawText(canvas, "" + this.mMedicine.goodsNum, 13, 35);
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_PAGEDOWN) this.mStatePageIndex = 1;
    else if (key === Global.KEY_PAGEUP) this.mStatePageIndex = 0;
    else if (key === Global.KEY_LEFT && this.mActorIndex > 0) --this.mActorIndex;
    else if (key === Global.KEY_RIGHT && this.mActorIndex < this.game.playerList.length - 1) ++this.mActorIndex;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      const m = this.mMedicine;
      if (m.goodsNum > 0 && isEatMedicine(m)) {
        if (m.type === 9 && m.effectAll()) {
          for (let i = this.game.playerList.length - 1; i >= 0; i--) m.eat(this.game.playerList[i]);
        } else {
          m.eat(this.game.playerList[this.mActorIndex]);
        }
      } else {
        this.popScreen();
      }
    }
  }
}
