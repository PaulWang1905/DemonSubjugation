// Port of fmj/gamemenu/ScreenMenuProperties.kt — status / equipment choice.
import { Global } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import type { Canvas } from "../../graphics";
import { ScreenActorState } from "./ScreenActorState";
import { ScreenActorWearing } from "./ScreenActorWearing";

export class ScreenMenuProperties extends BaseScreen {
  private readonly mFrameBmp = Util.getFrameBitmap(77 - 39 + 1, 54 - 16 + 1);
  private readonly strs = ["状态", "穿戴"];
  private mSelId = 0;

  constructor(readonly parent: GameNode) {
    super();
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mFrameBmp, 39, 16);
    const [a, b] = this.strs;
    if (this.mSelId === 0) {
      TextRender.drawSelText(canvas, a, 42, 19);
      TextRender.drawText(canvas, b, 42, 35);
    } else {
      TextRender.drawText(canvas, a, 42, 19);
      TextRender.drawSelText(canvas, b, 42, 35);
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP || key === Global.KEY_DOWN) this.mSelId = 1 - this.mSelId;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      this.popScreen();
      this.pushScreen(this.mSelId === 0 ? new ScreenActorState(this) : new ScreenActorWearing(this));
    }
  }
}
