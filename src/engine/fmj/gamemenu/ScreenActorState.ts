// Port of fmj/gamemenu/ScreenActorState.kt — character status pages.
import { Global } from "../Global";
import type { Player } from "../characters/Player";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import type { Canvas } from "../../graphics";

export class ScreenActorState extends BaseScreen {
  private mPage = 0;
  private readonly mPlayerList: Player[];
  private mCurPlayer = 0;

  constructor(readonly parent: GameNode) {
    super();
    this.mPlayerList = this.game.playerList;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    for (let i = 0; i < this.mPlayerList.length; i++) this.mPlayerList[i].drawHead(canvas, 10, 2 + 32 * i);
    if (this.mPlayerList.length > 0) {
      this.mPlayerList[this.mCurPlayer].drawState(canvas, this.mPage);
      Util.drawTriangleCursor(canvas, 3, 10 + 32 * this.mCurPlayer);
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_PAGEDOWN || key === Global.KEY_PAGEUP) {
      this.mPage = 1 - this.mPage;
    } else if (key === Global.KEY_DOWN) {
      if (++this.mCurPlayer >= this.mPlayerList.length) this.mCurPlayer = 0;
    } else if (key === Global.KEY_UP) {
      if (--this.mCurPlayer < 0) this.mCurPlayer = this.mPlayerList.length - 1;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) this.popScreen();
  }
}
