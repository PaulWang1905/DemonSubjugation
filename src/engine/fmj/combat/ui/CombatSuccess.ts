// Port of fmj/combat/ui/CombatSuccess.kt — post-battle rewards screens.
import { Global } from "../../Global";
import { T } from "../../i18n";
import type { Player } from "../../characters/Player";
import type { BaseGoods } from "../../goods/BaseGoods";
import { TextRender } from "../../graphics/TextRender";
import { Util } from "../../graphics/Util";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResImage } from "../../lib/ResImage";
import { BaseScreen, type GameNode } from "../../views/BaseScreen";
import { Bitmap, Canvas, Paint, PaintStyle } from "../../../graphics";
import { gbkBytes } from "../../../java";

export class LevelupScreen extends BaseScreen {
  private readonly mInfo: Bitmap;

  constructor(
    readonly parent: GameNode,
    p: Player,
  ) {
    super();
    const ri = DatLib.getRes(ResType.PIC, 2, 9) as ResImage;
    this.mInfo = ri.getBitmap(0)!;
    const canvas = new Canvas(this.mInfo);
    const lc = p.levelupChain;
    const curl = p.level;
    const n = (v: number, x: number, y: number) => Util.drawSmallNum(canvas, v, x, y);
    n(p.hp, 37, 9);
    p.hp = p.maxHP;
    n(p.maxHP - (lc.getMaxHP(curl) - lc.getMaxHP(curl - 1)), 56, 9);
    n(p.maxHP, 86, 9);
    n(p.maxHP, 105, 9);
    n(p.mp, 37, 21);
    p.mp = p.maxMP;
    n(p.maxMP - (lc.getMaxMP(curl) - lc.getMaxMP(curl - 1)), 56, 21);
    n(p.maxMP, 86, 21);
    n(p.maxMP, 105, 21);
    n(p.attack - (lc.getAttack(curl) - lc.getAttack(curl - 1)), 47, 33);
    n(p.attack, 96, 33);
    n(p.defend - (lc.getDefend(curl) - lc.getDefend(curl - 1)), 47, 45);
    n(p.defend, 96, 45);
    n(p.speed - (lc.getSpeed(curl) - lc.getSpeed(curl - 1)), 47, 57);
    n(p.speed, 96, 57);
    n(p.lingli - (lc.getLingli(curl) - lc.getLingli(curl - 1)), 47, 69);
    n(p.lingli, 96, 69);
    n(p.luck - (lc.getLuck(curl) - lc.getLuck(curl - 1)), 47, 81);
    n(p.luck, 96, 81);
  }

  update(_delta: number): void {}
  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mInfo, Math.trunc((160 - this.mInfo.width) / 2), Math.trunc((96 - this.mInfo.height) / 2));
  }
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}
}

export class MsgScreen extends BaseScreen {
  private readonly mMsg: Bitmap;
  private readonly mX: number;
  private readonly mY: number;

  constructor(parent: GameNode, msg: string);
  constructor(parent: GameNode, y: number, msg: string);
  constructor(
    readonly parent: GameNode,
    a: number | string,
    b?: string,
  ) {
    super();
    this.mY = typeof a === "number" ? a : Math.trunc((96 - 24) / 2);
    const bytes = gbkBytes(typeof a === "number" ? b! : a);
    const side = DatLib.getRes(ResType.PIC, 2, 8) as ResImage;
    this.mMsg = Bitmap.createBitmap(bytes.length * 8 + 8, 24);
    const c = new Canvas(this.mMsg);
    c.drawColor(Global.COLOR_WHITE);
    side.draw(c, 1, 0, 0);
    side.draw(c, 2, this.mMsg.width - 3, 0);
    const p = new Paint();
    p.color = Global.COLOR_BLACK;
    p.style = PaintStyle.FILL_AND_STROKE;
    c.drawLine(0, 1, this.mMsg.width, 1, p);
    c.drawLine(0, 22, this.mMsg.width, 22, p);
    TextRender.drawText(c, bytes, 4, 4);
    this.mX = Math.trunc((160 - this.mMsg.width) / 2);
  }

  update(_delta: number): void {}
  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mMsg, this.mX, this.mY);
  }
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}
}

export class LearnMagicScreen extends BaseScreen {
  private readonly mInfo: Bitmap;

  constructor(
    readonly parent: GameNode,
    playerName: string,
    magicName: string,
  ) {
    super();
    this.mInfo = (DatLib.getRes(ResType.PIC, 2, 10) as ResImage).getBitmap(0)!;
    const pn = gbkBytes(playerName);
    const mn = gbkBytes(magicName);
    const canvas = new Canvas(this.mInfo);
    TextRender.drawText(canvas, pn, Math.trunc((this.mInfo.width - pn.length * 8) / 2), 8);
    TextRender.drawText(canvas, mn, Math.trunc((this.mInfo.width - mn.length * 8) / 2), 42);
  }

  update(_delta: number): void {}
  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mInfo, Math.trunc((160 - this.mInfo.width) / 2), Math.trunc((96 - this.mInfo.height) / 2));
  }
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}
}

export class CombatSuccess {
  private readonly mMsgList: BaseScreen[] = [];
  private readonly mLvupList: BaseScreen[] = [];
  private mCnt = 0;
  private mIsAnyKeyPressed = false;

  constructor(
    private readonly parent: GameNode,
    exp: number,
    money: number,
    private readonly mGoodsList: BaseGoods[],
    lvuplist: Player[],
  ) {
    const e = String(exp);
    this.mMsgList.push(new MsgScreen(parent, 18, T.expLine(e)));
    const m = String(money);
    this.mMsgList.push(new MsgScreen(parent, 46, T.moneyLine(m)));

    for (const p of lvuplist) {
      this.mLvupList.push(new MsgScreen(parent, T.levelUp(p.name)));
      this.mLvupList.push(new LevelupScreen(parent, p));
      const magicChain = p.magicChain;
      if (magicChain) {
        const newNum = p.levelupChain.getLearnMagicNum(p.level);
        const oldNum = p.levelupChain.getLearnMagicNum(p.level - 1);
        // fmj.kt used getMagic(it - 1), which shows the wrong spell (or
        // crashes for the first one); newly learnt spells are oldNum..newNum-1.
        for (let it = oldNum; it < newNum; it++) {
          const magic = magicChain.getMagic(it);
          if (magic) this.mLvupList.push(new LearnMagicScreen(parent, p.name, magic.magicName));
        }
      }
    }
  }

  /** @returns true once everything has been shown */
  update(delta: number): boolean {
    this.mCnt += delta;
    if (this.mCnt > 1000 || this.mIsAnyKeyPressed) {
      this.mCnt = 0;
      this.mIsAnyKeyPressed = false;
      if (this.mGoodsList.length === 0) {
        if (this.mLvupList.length === 0) return true;
        this.mMsgList.push(this.mLvupList.shift()!);
      } else {
        const g = this.mGoodsList.shift()!;
        this.mMsgList.push(new MsgScreen(this.parent, T.gotItem(g.name, g.goodsNum)));
      }
    }
    return false;
  }

  draw(canvas: Canvas): void {
    for (const s of this.mMsgList) s.draw(canvas);
  }

  onKeyDown(_key: number): void {}

  onKeyUp(_key: number): void {
    this.mIsAnyKeyPressed = true;
  }
}
