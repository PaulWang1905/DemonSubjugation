// Port of fmj/views/ScreenMenu.kt — title menu (new game / load).
import { Global, ScreenViewType } from "../Global";
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import type { ResSrs } from "../lib/ResSrs";
import { SaveLoadGame } from "../scene/SaveLoadGame";
import type { Canvas } from "../../graphics";
import { sysExit } from "../../java";
import { BaseScreen, type GameNode } from "./BaseScreen";
import { ScreenSaveLoadGame, SaveLoadOperate } from "./ScreenSaveLoadGame";

export class ScreenMenu extends BaseScreen {
  private readonly mImgMenu: ResImage = DatLib.getPic(2, 14)!;
  private readonly mLeft: number;
  private readonly mTop: number;
  private readonly mSrsSelector: ResSrs[] = [
    DatLib.getRes(ResType.SRS, 1, 250) as ResSrs,
    DatLib.getRes(ResType.SRS, 1, 251) as ResSrs,
  ];
  private mCurSelect = 0;
  private isCancelKeyDown = false;

  constructor(readonly parent: GameNode) {
    super();
    this.mSrsSelector[0].start();
    this.mSrsSelector[1].start();
    this.mLeft = Math.trunc((160 - this.mImgMenu.width) / 2);
    this.mTop = Math.trunc((96 - this.mImgMenu.height) / 2);
  }

  update(delta: number): void {
    if (!this.mSrsSelector[this.mCurSelect].update(delta)) {
      this.mSrsSelector[this.mCurSelect].start();
    }
  }

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    this.mImgMenu.draw(canvas, 1, this.mLeft, this.mTop);
    this.mSrsSelector[this.mCurSelect].draw(canvas, 0, 0);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP || key === Global.KEY_DOWN) this.mCurSelect = 1 - this.mCurSelect;
    else if (key === Global.KEY_CANCEL) this.isCancelKeyDown = true;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      if (this.mCurSelect === 0) {
        SaveLoadGame.startNewGame = true;
        this.game.changeScreen(ScreenViewType.SCREEN_MAIN_GAME);
      } else {
        this.pushScreen(new ScreenSaveLoadGame(this, SaveLoadOperate.LOAD));
      }
    } else if (key === Global.KEY_CANCEL && this.isCancelKeyDown) {
      sysExit();
    } else if (key === Global.KEY_PAGEUP) {
      DatLib.instance.tryCompileScripts(this.game.vm);
    }
  }
}
