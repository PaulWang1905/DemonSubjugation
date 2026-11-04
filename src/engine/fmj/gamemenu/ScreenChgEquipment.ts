// Port of fmj/gamemenu/ScreenChgEquipment.kt — preview and confirm an equipment change.
import { Global } from "../Global";
import { Player } from "../characters/Player";
import type { GoodsEquipment } from "../goods/GoodsEquipment";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import type { Canvas } from "../../graphics";

export class ScreenChgEquipment extends BaseScreen {
  private readonly mGoods: GoodsEquipment[];
  private mSelIndex: number;
  private mPage = 0;

  constructor(
    readonly parent: GameNode,
    private readonly mActor: Player,
    goods: GoodsEquipment,
  ) {
    super();
    const currentEquip = mActor.getCurrentEquipment(goods.type);
    if (currentEquip == null || mActor.hasSpace(goods.type)) {
      this.mGoods = [goods];
      this.mSelIndex = 0;
    } else {
      this.mGoods = [currentEquip, goods];
      this.mSelIndex = 1;
      // No free slot: take off what is currently worn.
      mActor.takeOff(goods.type);
    }
    mActor.putOn(goods);
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    this.mActor.drawState(canvas, this.mPage);
    this.mActor.drawHead(canvas, 5, 60);
    this.mGoods.forEach((e, i) => e.draw(canvas, 8, 2 + 32 * i));
    Util.drawTriangleCursor(canvas, 1, 10 + 32 * this.mSelIndex);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP && this.mSelIndex > 0) {
      this.mActor.takeOff(this.mGoods[this.mSelIndex].type);
      --this.mSelIndex;
      this.mActor.putOn(this.mGoods[this.mSelIndex]);
    } else if (key === Global.KEY_DOWN && this.mSelIndex < this.mGoods.length - 1) {
      this.mActor.takeOff(this.mGoods[this.mSelIndex].type);
      ++this.mSelIndex;
      this.mActor.putOn(this.mGoods[this.mSelIndex]);
    } else if (key === Global.KEY_PAGEDOWN || key === Global.KEY_PAGEUP) {
      this.mPage = 1 - this.mPage;
    }
  }

  onKeyUp(key: number): void {
    const g = this.mGoods;
    if (key === Global.KEY_CANCEL) {
      // Restore the original equipment.
      this.mActor.takeOff(g[0].type);
      if (g.length > 1) this.mActor.putOn(g[0]);
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      if (this.mSelIndex === g.length - 1) {
        Player.sGoodsList.deleteGoods(g[g.length - 1].type, g[g.length - 1].index);
        if (g.length > 1) Player.sGoodsList.addGoods(g[0].type, g[0].index);
      }
      this.popScreen();
    }
  }
}
