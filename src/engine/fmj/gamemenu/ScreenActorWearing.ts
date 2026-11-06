// Port of fmj/gamemenu/ScreenActorWearing.kt — equipment overview.
import { Global } from "../Global";
import { T } from "../i18n";
import { Player } from "../characters/Player";
import type { BaseGoods } from "../goods/BaseGoods";
import type { GoodsEquipment } from "../goods/GoodsEquipment";
import { TextRender } from "../graphics/TextRender";
import { EngineSettings } from "../config/EngineSettings";
import { Util } from "../graphics/Util";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Point, Rect, type Canvas } from "../../graphics";
import { Stack, gbkBytes } from "../../java";
import { ScreenChgEquipment } from "./ScreenChgEquipment";
import { GoodsListMode, ScreenGoodsList } from "./ScreenGoodsList";
import { drawMoreMark } from "../views/ScrollList";

const sRectDesc = new Rect(9 + 3, 28 + 3, 151, 65);

export class ScreenActorWearing extends BaseScreen {
  private readonly mPos = [
    new Point(4, 3),
    new Point(4, 30),
    new Point(21, 59),
    new Point(51, 65),
    new Point(80, 61),
    new Point(109, 46),
    new Point(107, 9),
    new Point(79, 2),
  ];
  private mEquipments: (GoodsEquipment | null)[];
  private readonly mItemName = T.slots;
  private mCurItem = 0;
  private mActorIndex = -1;
  private showingDesc = false;
  private readonly bmpName = Util.getFrameBitmap(92 - 9 + 1, 29 - 10 + 1);
  private readonly bmpDesc = Util.getFrameBitmap(151 - 9 + 1, 65 - 28 + 1);
  private mTextName: Int8Array = new Int8Array(0);
  private mTextDesc: Int8Array = new Int8Array(0);
  private mToDraw = 0;
  private mNextToDraw = 0;
  private readonly mStackLastToDraw = Stack.create<number>();

  constructor(readonly parent: GameNode) {
    super();
    this.mEquipments = this.game.playerList[0].equipmentsArray;
    this.mActorIndex = 0;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawColor(Global.COLOR_WHITE);
    canvas.drawBitmap(Util.bmpChuandai, 160 - Util.bmpChuandai.width, 0);
    for (let i = 0; i <= 7; i++) this.mEquipments[i]?.draw(canvas, this.mPos[i].x + 1, this.mPos[i].y + 1);
    const p0 = this.mPos[this.mCurItem];
    canvas.drawRect(p0.x, p0.y, p0.x + 25, p0.y + 25, Util.sBlackPaint);
    TextRender.drawText(canvas, this.mItemName[this.mCurItem], 120, 80);

    if (this.mActorIndex >= 0) {
      const p = this.game.playerList[this.mActorIndex];
      p.drawHead(canvas, 44, 12);
      TextRender.drawText(canvas, p.name, 30, 40);
    }

    if (this.showingDesc) {
      canvas.drawBitmap(this.bmpName, 9, 10);
      canvas.drawBitmap(this.bmpDesc, 9, 28);
      TextRender.drawText(canvas, this.mTextName, 12, 13);
      this.mNextToDraw = TextRender.drawBlock(canvas, this.mTextDesc, this.mToDraw, sRectDesc, EngineSettings.textSize);
      if (this.mNextToDraw < this.mTextDesc.length) drawMoreMark(canvas, sRectDesc);
    }
  }

  private resetDesc(): void {
    if (this.showingDesc) {
      this.showingDesc = false;
      this.mNextToDraw = 0;
      this.mToDraw = 0;
      this.mStackLastToDraw.clear();
    }
  }

  onKeyDown(key: number): void {
    const list = this.game.playerList;
    if (key === Global.KEY_DOWN && this.mCurItem < 7) {
      ++this.mCurItem;
      this.resetDesc();
    } else if (key === Global.KEY_UP && this.mCurItem > 0) {
      --this.mCurItem;
      this.resetDesc();
    } else if (key === Global.KEY_RIGHT && this.mActorIndex < list.length - 1) {
      ++this.mActorIndex;
      this.mEquipments = list[this.mActorIndex].equipmentsArray;
      this.resetDesc();
    } else if (key === Global.KEY_LEFT && this.mActorIndex > 0) {
      --this.mActorIndex;
      this.mEquipments = list[this.mActorIndex].equipmentsArray;
      this.resetDesc();
    } else if (this.showingDesc) {
      if (key === Global.KEY_PAGEDOWN) {
        if (this.mNextToDraw < this.mTextDesc.length) {
          this.mStackLastToDraw.push(this.mToDraw);
          this.mToDraw = this.mNextToDraw;
        } else if (this.mToDraw !== 0) {
          this.mToDraw = 0;
          this.mStackLastToDraw.clear();
        }
      } else if (key === Global.KEY_PAGEUP && this.mToDraw !== 0) {
        const v = this.mStackLastToDraw.pop();
        if (v !== null) this.mToDraw = v;
      }
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      const cur = this.mEquipments[this.mCurItem];
      if (!this.showingDesc && cur != null) {
        this.showingDesc = true;
        this.mTextName = gbkBytes(cur.name);
        this.mTextDesc = gbkBytes(cur.description);
      } else {
        this.resetDesc();
        const self = this;
        this.pushScreen(
          new ScreenGoodsList(
            this,
            this.getTheEquipList(Player.sEquipTypes[this.mCurItem]),
            {
              onItemSelected(goods: BaseGoods) {
                const actor = self.game.playerList[self.mActorIndex];
                if (goods.canPlayerUse(actor.index)) {
                  self.popScreen();
                  self.pushScreen(new ScreenChgEquipment(self, actor, goods as GoodsEquipment));
                } else {
                  self.showMessage(T.cannotEquip, 1000);
                }
              },
            },
            GoodsListMode.Use,
          ),
        );
      }
    }
  }

  private getTheEquipList(type: number): BaseGoods[] {
    return Player.sGoodsList.equipList.filter((g) => g.type === type);
  }
}
