// Port of fmj/gamemenu/ScreenGoodsList.kt — scrolling goods list (buy/sell/use).
import { Global } from "../Global";
import { T } from "../i18n";
import { Player } from "../characters/Player";
import type { BaseGoods } from "../goods/BaseGoods";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { EngineSettings } from "../config/EngineSettings";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Bitmap, Canvas, Rect } from "../../graphics";
import { Stack, gbkBytes } from "../../java";
import { drawMoreMark } from "../views/ScrollList";

export enum GoodsListMode {
  Sale,
  Buy,
  Use,
}

export interface OnGoodsSelectedListener {
  onItemSelected(goods: BaseGoods): void;
}

/**
 * The list's background. At the device's text size it is fmj.kt's; with
 * compact text the name and price rows are smaller and the divider under
 * them moves up, so the description gets more lines.
 */
const bgCache = new Map<number, Bitmap>();
function bgImage(size = 16): Bitmap {
  let bmp = bgCache.get(size);
  if (bmp) return bmp;
  bmp = Bitmap.createBitmap(160, 96);
  const d = size === 16 ? 57 : divider(size); // the divider's top line
  const pts = [
    40, 21, 40, 95, 40, 95, 0, 95, 0, 95, 0, 5, 0, 5, 5, 0, 5, 0, 39, 0, 39, 0, 58, 19, 38, 0, 57, 19, 57, 19, 140, 19,
    41, 20, 140, 20, 41, 21, 159, 21, 54, 0, 140, 0, 40, 95, 159, 95, 40, d, 160, d, 40, d + 1, 140, d + 1, 40, d + 2, 159, d + 2,
    41, 20, 41, 95, 42, 20, 42, 95, 159, 21, 159, d, 159, d + 2, 159, 96,
  ];
  const c = new Canvas(bmp);
  c.drawColor(Global.COLOR_WHITE);
  c.drawLines(pts, Util.sBlackPaint);
  // (the labels are drawn with the rest of the text, not kept in here: the
  // interface language and the font can change while the page is open)
  bgCache.set(size, bmp);
  return bmp;
}

/** Top of the divider under the name and price rows with compact text. */
function divider(size: number): number {
  return 23 + 2 * size + 1;
}

/** Where the description goes: under the divider, to the bottom frame. */
function descRect(size: number): Rect {
  return size === 16 ? displayRect : new Rect(44, divider(size) + 4, 156, 94);
}

/** Where a value starts after its label ("名:" or an English one). */
function valueX(label: string, size: number): number {
  if (size === 16) return 69;
  return 45 + Math.max(Math.ceil(size * 1.5), gbkBytes(label).length * (size >> 1));
}

const displayRect = new Rect(44, 61, 156, 94);
const itemNumberPerPage = 4;

export class ScreenGoodsList extends BaseScreen {
  private description: Int8Array = new Int8Array(0);
  private toDraw = 0;
  private nextToDraw = 0;
  private readonly stackLastToDraw = Stack.create<number>();
  private firstDisplayItemIndex = 0;
  private curItemIndex = 0;
  private lastDownKey = -1;

  constructor(
    readonly parent: GameNode,
    private readonly goodsList: BaseGoods[],
    private readonly itemSelectedListener: OnGoodsSelectedListener,
    private readonly mode: GoodsListMode,
  ) {
    super();
  }

  private resetDescription(): void {
    this.description =
      this.goodsList.length > 0 ? gbkBytes(this.goodsList[this.curItemIndex].description) : new Int8Array(0);
    this.nextToDraw = 0;
    this.toDraw = 0;
    this.stackLastToDraw.clear();
  }

  willAppear(): void {
    if (this.goodsList.length === 0) this.curItemIndex = 0;
    else if (this.curItemIndex >= this.goodsList.length) this.curItemIndex = this.goodsList.length - 1;
    this.resetDescription();
  }

  update(_delta: number): void {
    if (this.goodsList.length === 0) this.popScreen();
  }

  draw(canvas: Canvas): void {
    const size = EngineSettings.textSize;
    canvas.drawBitmap(bgImage(size), 0, 0);
    if (this.goodsList.length === 0) return;
    while (this.curItemIndex >= this.goodsList.length) this.showPreItem();

    const g = this.goodsList[this.curItemIndex];
    TextRender.drawText(canvas, this.mode === GoodsListMode.Buy ? T.money + Player.sMoney : T.goodsCount + g.goodsNum, 60, 2);
    TextRender.withSize(size, () => {
      TextRender.drawText(canvas, T.goodsName, 45, 23);
      TextRender.drawText(canvas, T.goodsPrice, 45, size === 16 ? 40 : 23 + size);
      TextRender.drawText(canvas, g.name, valueX(T.goodsName, size), 23);
      TextRender.drawText(canvas, "" + (this.mode === GoodsListMode.Buy ? g.buyPrice : g.sellPrice), valueX(T.goodsPrice, size), size === 16 ? 40 : 23 + size);
    });
    Util.drawTriangleCursor(canvas, 4, 8 + 23 * (this.curItemIndex - this.firstDisplayItemIndex));

    for (
      let i = this.firstDisplayItemIndex;
      i < this.firstDisplayItemIndex + itemNumberPerPage && i < this.goodsList.length;
      i++
    ) {
      this.goodsList[i].draw(canvas, 14, 2 + 23 * (i - this.firstDisplayItemIndex));
    }
    // the description (in smaller text with the compact text option)
    this.nextToDraw = TextRender.drawBlock(canvas, this.description, this.toDraw, descRect(size), size);
    if (this.nextToDraw < this.description.length) drawMoreMark(canvas, descRect(size));
  }

  private showNextItem(): void {
    ++this.curItemIndex;
    if (this.curItemIndex >= this.firstDisplayItemIndex + itemNumberPerPage) ++this.firstDisplayItemIndex;
    this.resetDescription();
  }

  private showPreItem(): void {
    --this.curItemIndex;
    if (this.curItemIndex < this.firstDisplayItemIndex) --this.firstDisplayItemIndex;
    this.resetDescription();
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP && this.curItemIndex > 0) {
      this.showPreItem();
    } else if (key === Global.KEY_DOWN && this.curItemIndex + 1 < this.goodsList.length) {
      this.showNextItem();
    } else if (key === Global.KEY_PAGEDOWN) {
      if (this.nextToDraw < this.description.length) {
        this.stackLastToDraw.push(this.toDraw);
        this.toDraw = this.nextToDraw;
      } else if (this.toDraw !== 0) {
        this.toDraw = 0;
        this.stackLastToDraw.clear();
      }
    } else if (key === Global.KEY_PAGEUP && this.toDraw !== 0) {
      const v = this.stackLastToDraw.pop();
      if (v !== null) this.toDraw = v;
    }
    this.lastDownKey = key;
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_ENTER && this.lastDownKey === Global.KEY_ENTER) {
      const g = this.goodsList[this.curItemIndex];
      if (g) this.itemSelectedListener.onItemSelected(g);
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }
}
