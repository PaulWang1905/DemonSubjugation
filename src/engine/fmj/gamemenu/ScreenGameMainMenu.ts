// Port of fmj/gamemenu/ScreenGameMainMenu.kt — in-game menu (status/magic/goods/system).
import { Global } from "../Global";
import { T } from "../i18n";
import { Player } from "../characters/Player";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import type { BaseMagic } from "../magic/BaseMagic";
import { MagicRestore } from "../magic/MagicRestore";
import { ScreenMagic } from "../magic/ScreenMagic";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Rect, type Bitmap, type Canvas } from "../../graphics";
import { ScreenMenuGoods } from "./ScreenMenuGoods";
import { ScreenMenuProperties } from "./ScreenMenuProperties";
import { ScreenMenuSystem } from "./ScreenMenuSystem";
import { ScreenUseMagic } from "./ScreenUseMagic";
import { listKey } from "../views/ScrollList";

class SelectActorScreen extends BaseScreen {
  private index = 0;
  private readonly mFrameRect: Rect;
  private readonly bmpFrame: Bitmap;
  private readonly mNames: string[];
  private readonly mSum: number;

  constructor(readonly parent: ScreenGameMainMenu) {
    super();
    const list = this.game.playerList;
    this.mFrameRect = new Rect(39, 29, 125, 67 - 32 + list.length * 16);
    this.bmpFrame = Util.getFrameBitmap(this.mFrameRect.width(), this.mFrameRect.height());
    this.mSum = list.length;
    this.mNames = list.map((p) => p.name);
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    const r = this.mFrameRect;
    canvas.drawBitmap(this.bmpFrame, r.left, r.top);
    for (let i = 0; i < this.mSum; i++) {
      if (i === this.index) TextRender.drawSelText(canvas, this.mNames[i], r.left + 3, r.top + 3 + 16 * i);
      else TextRender.drawText(canvas, this.mNames[i], r.left + 3, r.top + 3 + 16 * i);
    }
  }

  onKeyDown(key: number): void {
    key = listKey(key);
    if (key === Global.KEY_DOWN) {
      if (++this.index >= this.mSum) this.index = 0;
    } else if (key === Global.KEY_UP) {
      if (--this.index < 0) this.index = this.mSum - 1;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      this.popScreen();
      const scr = this.parent.getScreenMagic(this.index);
      if (scr) this.pushScreen(scr);
    }
  }
}

export class ScreenGameMainMenu extends BaseScreen {
  private readonly bmpFrame1 = Util.getFrameBitmap(93, 16 + 6);
  private readonly bmpFrame2 = Util.getFrameBitmap(32 + 6, 64 + 6);
  private readonly menuItemsRect: Rect;
  private readonly menuItemsS = T.mainMenu;
  private mSelIndex = 0;
  private readonly screenSelectActor: SelectActorScreen;

  constructor(readonly parent: GameNode) {
    super();
    this.screenSelectActor = new SelectActorScreen(this);
    const l = 9 + 3;
    const t = 3 + 16 + 6 - 1 + 3;
    this.menuItemsRect = new Rect(l, t, l + 32, t + 64);
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.bmpFrame1, 9, 3);
    TextRender.drawText(canvas, T.money + Player.sMoney, 9 + 3, 3 + 3);
    canvas.drawBitmap(this.bmpFrame2, 9, 3 + 16 + 6 - 1);
    this.menuItemsS.forEach((s, i) => TextRender.drawText(canvas, s, this.menuItemsRect.left, this.menuItemsRect.top + i * 16));
    TextRender.drawSelText(
      canvas,
      this.menuItemsS[this.mSelIndex],
      this.menuItemsRect.left,
      this.menuItemsRect.top + this.mSelIndex * 16,
    );
  }

  onKeyDown(key: number): void {
    key = listKey(key);
    if (key === Global.KEY_UP) {
      if (--this.mSelIndex < 0) this.mSelIndex = 3;
    } else if (key === Global.KEY_DOWN) {
      if (++this.mSelIndex > 3) this.mSelIndex = 0;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      // Nothing but the system menu makes sense without a party.
      if (this.game.playerList.length === 0 && this.mSelIndex !== 3) return;
      let scr: BaseScreen | null = null;
      switch (this.mSelIndex) {
        case 0: scr = new ScreenMenuProperties(this); break;
        case 1: scr = this.game.playerList.length > 1 ? this.screenSelectActor : this.getScreenMagic(0); break;
        case 2: scr = new ScreenMenuGoods(this); break;
        case 3: scr = new ScreenMenuSystem(this); break;
      }
      if (scr) this.pushScreen(scr);
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }

  /** @param id 0, 1 or 2 */
  getScreenMagic(id: number): ScreenMagic | null {
    const player = this.game.playerList[id];
    if (!player) return null;
    const magics = player.getAllMagics();
    if (magics.length === 0) return null;
    return new ScreenMagic(this, magics, (magic: BaseMagic) => {
      if (magic instanceof MagicRestore) {
        this.pushScreen(new ScreenUseMagic(this, magic, this.game.playerList[id]));
      } else {
        this.showMessage(T.cannotUseHere, 1000);
      }
    });
  }
}
