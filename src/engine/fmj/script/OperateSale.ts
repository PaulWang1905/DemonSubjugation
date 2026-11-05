// Port of fmj/script/OperateSale.kt — pawn shop driven by the SALE command.
import { Global } from "../Global";
import { EngineSettings } from "../config/EngineSettings";
import { T } from "../i18n";
import { Player } from "../characters/Player";
import { GoodsListMode, ScreenGoodsList, type OnGoodsSelectedListener } from "../gamemenu/ScreenGoodsList";
import type { BaseGoods } from "../goods/BaseGoods";
import { GoodsDrama } from "../goods/GoodsDrama";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { BaseScreen, Control, type GameNode } from "../views/BaseScreen";
import type { Bitmap, Canvas } from "../../graphics";
import type { Operate } from "./Operate";

class SaleGoodsScreen extends BaseScreen {
  private saleCnt = 0;
  private money = Player.sMoney;
  private _bmpBg: Bitmap | null = null;

  constructor(
    readonly parent: GameNode,
    private readonly goods: BaseGoods,
    private readonly owner: OperateSale,
  ) {
    super();
  }

  private get bmpBg(): Bitmap {
    if (!this._bmpBg) this._bmpBg = Util.getFrameBitmap(136, 55);
    return this._bmpBg;
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.bmpBg, 12, 21);
    TextRender.drawText(canvas, T.moneyWide + this.money, 15, 24);
    TextRender.drawText(canvas, this.goods.name, 15, 40);
    TextRender.drawText(canvas, ": " + (this.goods.goodsNum - this.saleCnt), 93, 40);
    TextRender.drawText(canvas, T.sellCount + this.saleCnt, 15, 56);
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER) {
      Player.sMoney = this.money;
      if (this.saleCnt > 0) Player.sGoodsList.useGoodsNum(this.goods.type, this.goods.index, this.saleCnt);
      this.popScreen();
      // Recreate the goods list so items sold down to 0 disappear.
      this.popScreen();
      const list: BaseGoods[] = [...Player.sGoodsList.goodsList, ...Player.sGoodsList.equipList];
      this.pushScreen(new ScreenGoodsList(this, list, this.owner, GoodsListMode.Sale));
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP && this.saleCnt > 0) {
      --this.saleCnt;
      this.money -= this.goods.sellPrice;
    } else if (key === Global.KEY_DOWN && this.goods.goodsNum > this.saleCnt) {
      ++this.saleCnt;
      this.money += this.goods.sellPrice;
      const cap = EngineSettings.originalDamageFormula ? 0x1019f : 99999; // the original's money cap
      if (this.money > cap) this.money = cap;
    }
  }
}

export class OperateSale extends Control implements Operate, OnGoodsSelectedListener {
  constructor(readonly parent: GameNode) {
    super();
  }

  update(_delta: number): boolean {
    return false;
  }
  draw(_canvas: Canvas): void {}
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}

  onItemSelected(goods: BaseGoods): void {
    // the original refuses anything with an event number (_00236FD7)
    if (goods instanceof GoodsDrama || (EngineSettings.originalDamageFormula && goods.eventId >= 1)) {
      this.showMessage(T.questItem, 1000);
    } else {
      this.pushScreen(new SaleGoodsScreen(this, goods, this));
    }
  }
}
