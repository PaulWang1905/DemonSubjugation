// Port of fmj/gamemenu/ScreenMenuGoods.kt — use / equip goods from the menu.
import { Global } from "../Global";
import { T } from "../i18n";
import { Player } from "../characters/Player";
import type { BaseGoods } from "../goods/BaseGoods";
import type { GoodsEquipment } from "../goods/GoodsEquipment";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { ScreenMainGame } from "../scene/ScreenMainGame";
import { BaseScreen, screen, type GameNode } from "../views/BaseScreen";
import type { Canvas } from "../../graphics";
import { gbkBytes } from "../../java";
import { ScreenChgEquipment } from "./ScreenChgEquipment";
import { GoodsListMode, ScreenGoodsList, type OnGoodsSelectedListener } from "./ScreenGoodsList";
import { ScreenTakeMedicine } from "./ScreenTakeMedicine";
import { listKey } from "../views/ScrollList";

export class ScreenMenuGoods extends BaseScreen implements OnGoodsSelectedListener {
  private readonly mFrameBmp = Util.getFrameBitmap(77 - 39 + 1, 77 - 39 + 1);
  private readonly strs = T.useEquip;
  private mSelId = 0;

  constructor(readonly parent: GameNode) {
    super();
  }

  get isPopup(): boolean {
    return true;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mFrameBmp, 39, 39);
    if (this.mSelId === 0) {
      TextRender.drawSelText(canvas, this.strs[0], 42, 42);
      TextRender.drawText(canvas, this.strs[1], 42, 58);
    } else {
      TextRender.drawText(canvas, this.strs[0], 42, 42);
      TextRender.drawSelText(canvas, this.strs[1], 42, 58);
    }
  }

  onKeyDown(key: number): void {
    key = listKey(key);
    if (key === Global.KEY_UP || key === Global.KEY_DOWN) this.mSelId = 1 - this.mSelId;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      this.popScreen();
      this.pushScreen(
        new ScreenGoodsList(
          this,
          this.mSelId === 0 ? Player.sGoodsList.goodsList : Player.sGoodsList.equipList,
          this,
          GoodsListMode.Use,
        ),
      );
    }
  }

  onItemSelected(goods: BaseGoods): void {
    if (this.mSelId === 0) this.goodsSelected(goods);
    else this.equipSelected(goods);
  }

  private goodsSelected(goods: BaseGoods): void {
    switch (goods.type) {
      case 8: // thrown weapons
      case 12: // stimulants
        this.showMessage(T.battleOnly, 1000);
        break;
      case 13: // escape item: triggers event 255 of the running script
        this.game.triggerEvent(255);
        while (!(this.getCurScreen() instanceof ScreenMainGame)) this.popScreen();
        break;
      case 14: // story items
        this.showMessage(T.cannotUseNow, 1000);
        break;
      case 9:
      case 10:
      case 11:
        this.pushScreen(new ScreenTakeMedicine(this, goods));
        break;
    }
  }

  private equipSelected(goods: BaseGoods): void {
    const list = this.game.playerList.filter((p) => goods.canPlayerUse(p.index));
    if (list.length === 0) {
      this.showMessage(T.cannotEquip, 1000);
    } else if (list.length === 1) {
      if (list[0].hasEquipt(goods.type, goods.index)) this.showMessage(T.alreadyEquipped, 1000);
      else this.pushScreen(new ScreenChgEquipment(this, list[0], goods as GoodsEquipment));
    } else {
      const bg = Util.getFrameBitmap(16 * 5 + 6, 6 + 16 * list.length);
      let curSel = 0;
      const itemsText = list.map((p) => {
        const b = new Int8Array(11).fill(0x20);
        b[10] = 0;
        const tmp = gbkBytes(p.name);
        b.set(tmp.subarray(0, 11));
        return b;
      });
      this.pushScreen(
        screen(this, {
          isPopup: true,
          onKeyUp(key) {
            if (key === Global.KEY_ENTER) {
              if (list[curSel].hasEquipt(goods.type, goods.index)) {
                this.showMessage(T.alreadyEquipped, 1000);
              } else {
                this.popScreen();
                this.pushScreen(new ScreenChgEquipment(this, list[curSel], goods as GoodsEquipment));
              }
            } else if (key === Global.KEY_CANCEL) {
              this.popScreen();
            }
          },
          onKeyDown(key) {
            if (key === Global.KEY_DOWN && curSel < itemsText.length - 1) ++curSel;
            else if (key === Global.KEY_UP && curSel > 0) --curSel;
          },
          draw(canvas) {
            canvas.drawBitmap(bg, 50, 14);
            for (let i = 0; i < itemsText.length; i++) {
              if (i !== curSel) TextRender.drawText(canvas, itemsText[i], 53, 17 + 16 * i);
              else TextRender.drawSelText(canvas, itemsText[i], 53, 17 + 16 * i);
            }
          },
        }),
      );
    }
  }
}
