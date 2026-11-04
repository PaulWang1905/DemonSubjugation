// Port of fmj/views/ScreenAnimation.kt — logo / game-over animations (SRS 247-249).
import { Global, ScreenViewType } from "../Global";
import { DatLib, ResType } from "../lib/DatLib";
import type { ResSrs } from "../lib/ResSrs";
import type { Canvas } from "../../graphics";
import { BaseScreen, type GameNode } from "./BaseScreen";

export class ScreenAnimation extends BaseScreen {
  private readonly mResSrs: ResSrs;

  constructor(
    readonly parent: GameNode,
    private readonly index: number,
  ) {
    super();
    if (index !== 247 && index !== 248 && index !== 249) {
      throw new Error("ScreenAnimation index must be 247, 248 or 249");
    }
    this.mResSrs = DatLib.getRes(ResType.SRS, 1, index) as ResSrs;
    this.mResSrs.setIteratorNum(4);
    this.mResSrs.start();
  }

  update(delta: number): void {
    if (!this.mResSrs.update(delta)) {
      switch (this.index) {
        case 247:
          this.game.changeScreen(ScreenViewType.SCREEN_GAME_LOGO);
          break;
        case 248:
        case 249:
          this.game.changeScreen(ScreenViewType.SCREEN_MENU);
          break;
      }
    }
  }

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    this.mResSrs.draw(canvas, 0, 0);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_CANCEL && (this.index === 247 || this.index === 248)) {
      this.game.changeScreen(ScreenViewType.SCREEN_MENU);
    }
  }

  onKeyUp(_key: number): void {}
}
