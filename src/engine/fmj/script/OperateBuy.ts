// Port of fmj/script/OperateBuy.kt — shop (buy) screen driven by the BUY command.
import { Global } from "../Global";
import { Player } from "../characters/Player";
import { GoodsListMode, ScreenGoodsList, type OnGoodsSelectedListener } from "../gamemenu/ScreenGoodsList";
import type { BaseGoods } from "../goods/BaseGoods";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { DatLib, ResType } from "../lib/DatLib";
import { BaseScreen, Control, type GameNode } from "../views/BaseScreen";
import type { Bitmap, Canvas } from "../../graphics";
import type { Operate } from "./Operate";

class BuyGoodsScreen extends BaseScreen {
  private goods: BaseGoods | null = null;
  private buyCnt = 0;
  private money = 0;
  private _bmpBg: Bitmap | null = null;

  constructor(readonly parent: GameNode) {
    super();
  }

  private get bmpBg(): Bitmap {
    if (!this._bmpBg) this._bmpBg = Util.getFrameBitmap(136, 55);
    return this._bmpBg;
  }

  get isPopup(): boolean {
    return true;
  }

  init(goods: BaseGoods): void {
    this.goods = goods;
    this.buyCnt = 0;
    this.money = Player.sMoney;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    const g = this.goods!;
    canvas.drawBitmap(this.bmpBg, 12, 21);
    TextRender.drawText(canvas, "金钱：" + this.money, 15, 24);
    TextRender.drawText(canvas, g.name, 15, 40);
    TextRender.drawText(canvas, ": " + g.goodsNum, 93, 40);
    TextRender.drawText(canvas, "买入个数　：" + this.buyCnt, 15, 56);
  }

  onKeyUp(key: number): void {
    const g = this.goods!;
    if (key === Global.KEY_ENTER) {
      Player.sMoney = this.money;
      if (this.buyCnt === g.goodsNum && this.buyCnt > 0) {
        Player.sGoodsList.addGoods(g.type, g.index, this.buyCnt);
      }
      this.popScreen();
    } else if (key === Global.KEY_CANCEL) {
      g.addGoodsNum(-this.buyCnt);
      this.popScreen();
    }
  }

  onKeyDown(key: number): void {
    const g = this.goods!;
    if (key === Global.KEY_UP && g.goodsNum < 99) {
      if (this.money >= g.buyPrice) {
        ++this.buyCnt;
        g.addGoodsNum(1);
        this.money -= g.buyPrice;
      } else {
        this.showMessage("金钱不足!", 1000);
      }
    } else if (key === Global.KEY_DOWN && this.buyCnt > 0) {
      --this.buyCnt;
      g.addGoodsNum(-1);
      this.money += g.buyPrice;
    }
  }
}

export class OperateBuy extends Control implements Operate, OnGoodsSelectedListener {
  private readonly goodsList: BaseGoods[] = [];
  private readonly mBuyScreen: BuyGoodsScreen;

  constructor(
    readonly parent: GameNode,
    data: Int8Array,
  ) {
    super();
    this.mBuyScreen = new BuyGoodsScreen(this);
    let i = 0;
    while (data[i] !== 0 && i < data.length) {
      const type = data[i + 1] & 0xff;
      const index = data[i] & 0xff;
      let g = Player.sGoodsList.getGoods(type, index);
      if (g == null) {
        g = DatLib.getRes(ResType.GRS, type, index) as unknown as BaseGoods;
        g.goodsNum = 0;
      }
      this.goodsList.push(g);
      i += 2;
    }
    this.pushScreen(new ScreenGoodsList(this, this.goodsList, this, GoodsListMode.Buy));
  }

  update(_delta: number): boolean {
    return false;
  }

  draw(canvas: Canvas): void {
    this.game.mainScene.drawScene(canvas);
  }

  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}

  onItemSelected(goods: BaseGoods): void {
    if (Player.sMoney < goods.buyPrice) {
      this.showMessage("金钱不足!", 1000);
    } else {
      this.mBuyScreen.init(goods);
      this.pushScreen(this.mBuyScreen);
    }
  }
}
