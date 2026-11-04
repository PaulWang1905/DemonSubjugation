// Port of fmj/gamemenu/ScreenUseMagic.kt — cast a restoration spell from the menu.
import { Global } from "../Global";
import type { Player } from "../characters/Player";
import { TextRender } from "../graphics/TextRender";
import type { MagicRestore } from "../magic/MagicRestore";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Rect, type Canvas } from "../../graphics";

const sNameRect = new Rect(4, 4, 37, 96);

export class ScreenUseMagic extends BaseScreen {
  private mCurPage = 0;
  private mCurActor = 0;

  constructor(
    readonly parent: GameNode,
    private readonly mMagic: MagicRestore,
    private readonly mScr: Player,
  ) {
    super();
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    TextRender.drawTextFrom(canvas, this.mMagic.magicName, 0, sNameRect);
    const actor = this.game.playerList[this.mCurActor];
    actor.drawState(canvas, this.mCurPage);
    actor.drawHead(canvas, 5, 60);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_RIGHT && this.mCurActor < this.game.playerList.length - 1) ++this.mCurActor;
    else if (key === Global.KEY_LEFT && this.mCurActor > 0) --this.mCurActor;
    else if (key === Global.KEY_PAGEDOWN || key === Global.KEY_PAGEUP) this.mCurPage = 1 - this.mCurPage;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      this.mMagic.useRestore(this.mScr, this.game.playerList[this.mCurActor]);
      this.popScreen();
    }
  }
}
