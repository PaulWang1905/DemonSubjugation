// Port of fmj/combat/ui/CombatUI.kt — the battle command menus.
import { Global } from "../../Global";
import { T } from "../../i18n";
import { FightingCharacter } from "../../characters/FightingCharacter";
import type { Monster } from "../../characters/Monster";
import { Player } from "../../characters/Player";
import { ScreenChgEquipment } from "../../gamemenu/ScreenChgEquipment";
import { GoodsListMode, ScreenGoodsList } from "../../gamemenu/ScreenGoodsList";
import type { BaseGoods } from "../../goods/BaseGoods";
import type { GoodsEquipment } from "../../goods/GoodsEquipment";
import type { GoodsHiddenWeapon } from "../../goods/GoodsHiddenWeapon";
import { TextRender } from "../../graphics/TextRender";
import { Util } from "../../graphics/Util";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResImage } from "../../lib/ResImage";
import type { BaseMagic } from "../../magic/BaseMagic";
import { MagicAttack } from "../../magic/MagicAttack";
import { MagicSpecial } from "../../magic/MagicSpecial";
import { ScreenMagic } from "../../magic/ScreenMagic";
import { BaseScreen, screen, type GameNode } from "../../views/BaseScreen";
import { ScreenStack } from "../../views/ScreenStack";
import { Point, Rect, type Canvas } from "../../../graphics";
import { gbkBytes } from "../../../java";
import type { Action } from "../actions/Action";
import { ActionCoopMagic } from "../actions/ActionCoopMagic";
import { ActionDefend } from "../actions/ActionDefend";
import { ActionMagicAttackAll } from "../actions/ActionMagicAttackAll";
import { ActionMagicAttackOne } from "../actions/ActionMagicAttackOne";
import { ActionMagicHelpAll } from "../actions/ActionMagicHelpAll";
import { ActionMagicHelpOne } from "../actions/ActionMagicHelpOne";
import { ActionPhysicalAttackAll } from "../actions/ActionPhysicalAttackAll";
import { ActionPhysicalAttackOne } from "../actions/ActionPhysicalAttackOne";
import { ActionThrowItemAll } from "../actions/ActionThrowItemAll";
import { ActionThrowItemOne } from "../actions/ActionThrowItemOne";
import { ActionUseItemAll } from "../actions/ActionUseItemAll";
import { ActionUseItemOne } from "../actions/ActionUseItemOne";
import { FrameAnimation } from "../anim/FrameAnimation";

export interface CombatUICallBack {
  /** Called once an action has been chosen. */
  onActionSelected(action: Action): void;
  /** "Siege": auto-attack. */
  onAutoAttack(): void;
  /** Flee: actors that already chose keep their action, the rest flee. */
  onFlee(): void;
  /** Cancel the current actor's choice and go back to the previous actor. */
  onCancel(): void;
}

type OnCharacterSelected = (fc: FightingCharacter) => void;

const sPlayerIndicatorPos = [new Point(69, 45), new Point(101, 41), new Point(133, 33)];
const sMonsterIndicatorPos = [new Point(16, 14), new Point(48, 3), new Point(86, 0)];

export class CombatUI extends BaseScreen {
  private readonly mScreenStack: ScreenStack;
  mPlayerList: Player[] = [];
  mMonsterList: Monster[] = [];
  /** Marks the actor choosing an action. */
  readonly mPlayerIndicator: FrameAnimation;
  /** Marks the party member an action targets. */
  readonly mTargetIndicator: FrameAnimation;
  /** Marks the enemy an action targets. */
  readonly mMonsterIndicator: FrameAnimation;
  readonly mHeadsImg: ResImage[];

  constructor(
    readonly parent: GameNode,
    readonly mCallBack: CombatUICallBack | null,
    public mCurPlayerIndex: number,
  ) {
    super();
    this.mScreenStack = new ScreenStack(this.game);
    this.mHeadsImg = [1, 2, 3].map((i) => DatLib.getRes(ResType.PIC, 1, i) as ResImage);
    let tmpImg = DatLib.getRes(ResType.PIC, 2, 4) as ResImage;
    this.mPlayerIndicator = new FrameAnimation(tmpImg, 1, 2);
    this.mTargetIndicator = new FrameAnimation(tmpImg, 3, 4);
    tmpImg = DatLib.getRes(ResType.PIC, 2, 3) as ResImage;
    this.mMonsterIndicator = new FrameAnimation(tmpImg);
    this.mScreenStack.pushScreen(new MainMenu(this, this));
  }

  update(delta: number): void {
    this.mScreenStack.update(delta);
  }

  draw(canvas: Canvas): void {
    this.mScreenStack.draw(canvas);
  }

  onKeyDown(key: number): void {
    this.mScreenStack.keyDown(key);
  }

  onKeyUp(key: number): void {
    this.mScreenStack.keyUp(key);
  }

  reset(): void {
    this.mScreenStack.clear();
    this.mScreenStack.pushScreen(new MainMenu(this, this));
  }

  setPlayerList(list: Player[]): void {
    this.mPlayerList = list;
  }

  setMonsterList(list: Monster[]): void {
    this.mMonsterList = list;
  }

  setCurrentPlayerIndex(i: number): void {
    this.mCurPlayerIndex = i;
  }

  get currentPlayer(): Player {
    return this.mPlayerList[this.mCurPlayerIndex];
  }

  actionSelected(action: Action): void {
    this.mCallBack?.onActionSelected(action);
  }

  cancel(): void {
    this.mCallBack?.onCancel();
  }

  drawPlayerInfo(canvas: Canvas, p: Player): void {
    this.mHeadsImg[p.index - 1]?.draw(canvas, 1, 50, 63);
    Util.drawSmallNum(canvas, p.hp, 79, 72);
    Util.drawSmallNum(canvas, p.maxHP, 104, 72);
    Util.drawSmallNum(canvas, p.mp, 79, 83);
    Util.drawSmallNum(canvas, p.maxMP, 104, 83);
  }

  selectMonster(parent: GameNode, cb: OnCharacterSelected): MenuCharacterSelect {
    return new MenuCharacterSelect(parent, this, this.mMonsterIndicator, sMonsterIndicatorPos, this.mMonsterList, cb, true);
  }

  selectPlayer(parent: GameNode, cb: OnCharacterSelected): MenuCharacterSelect {
    return new MenuCharacterSelect(parent, this, this.mTargetIndicator, sPlayerIndicatorPos, this.mPlayerList, cb, false);
  }

  // Screens opened from the battle menus live on this UI's own stack.
  popScreen(): void {
    this.mScreenStack.popScreen();
  }

  pushScreen(scr: BaseScreen): void {
    this.mScreenStack.pushScreen(scr);
  }

  getCurScreen(): BaseScreen {
    return this.mScreenStack.getCurScreen();
  }

  showMessage(msg: string, delay = 1000): void {
    this.mScreenStack.showMessage(msg, delay);
  }

  static readonly sPlayerIndicatorPos = sPlayerIndicatorPos;
}

/** Main battle menu plus the current actor's HP/MP. */
class MainMenu extends BaseScreen {
  /** 1 up, 2 left, 3 down, 4 right */
  private readonly mMenuIcon = DatLib.getRes(ResType.PIC, 2, 1) as ResImage;
  private readonly mPlayerInfoBg = DatLib.getRes(ResType.PIC, 2, 2) as ResImage;
  private mCurIconIndex = 1;

  constructor(
    readonly parent: GameNode,
    private readonly ui: CombatUI,
  ) {
    super();
  }

  update(delta: number): void {
    this.ui.mPlayerIndicator.update(delta);
  }

  draw(canvas: Canvas): void {
    const ui = this.ui;
    this.mMenuIcon.draw(canvas, this.mCurIconIndex, 7, 96 - this.mMenuIcon.height);
    this.mPlayerInfoBg.draw(canvas, 1, 49, 66);
    const p = ui.currentPlayer;
    if (!p) return;
    ui.drawPlayerInfo(canvas, p);
    const pos = sPlayerIndicatorPos[ui.mCurPlayerIndex];
    if (pos) ui.mPlayerIndicator.draw(canvas, pos.x, pos.y);
  }

  onKeyDown(key: number): void {
    const ui = this.ui;
    switch (key) {
      case Global.KEY_LEFT:
        if (ui.currentPlayer.hasDebuff(FightingCharacter.BUFF_MASK_FENG)) return; // sealed: no magic
        this.mCurIconIndex = 2;
        break;
      case Global.KEY_DOWN:
        this.mCurIconIndex = 3;
        break;
      case Global.KEY_RIGHT:
        if (ui.mPlayerList.length <= 1) return; // no combined attack alone
        this.mCurIconIndex = 4;
        break;
      case Global.KEY_UP:
        this.mCurIconIndex = 1;
        break;
    }
  }

  onKeyUp(key: number): void {
    const ui = this.ui;
    if (key === Global.KEY_ENTER) {
      const cur = ui.currentPlayer;
      switch (this.mCurIconIndex) {
        case 1: // physical attack
          if (cur.hasAtbuff(FightingCharacter.BUFF_MASK_ALL)) {
            ui.actionSelected(new ActionPhysicalAttackAll(cur, ui.mMonsterList));
            return;
          }
          this.pushScreen(ui.selectMonster(this, (fc) => ui.actionSelected(new ActionPhysicalAttackOne(cur, fc))));
          break;
        case 2: {
          // magic
          const magics = cur.getAllMagics();
          if (magics.length === 0) return;
          this.pushScreen(
            new ScreenMagic(this, magics, (magic: BaseMagic) => {
              this.popScreen(); // close the magic list
              if (magic instanceof MagicAttack || magic instanceof MagicSpecial) {
                if (magic.isForAll) {
                  ui.actionSelected(new ActionMagicAttackAll(cur, ui.mMonsterList, magic as MagicAttack));
                } else {
                  this.pushScreen(ui.selectMonster(this, (fc) => ui.actionSelected(new ActionMagicAttackOne(cur, fc, magic))));
                }
              } else if (magic.isForAll) {
                ui.actionSelected(new ActionMagicHelpAll(cur, ui.mPlayerList, magic));
              } else {
                this.pushScreen(ui.selectPlayer(this, (fc) => ui.actionSelected(new ActionMagicHelpOne(cur, fc, magic))));
              }
            }),
          );
          break;
        }
        case 3: // misc
          this.pushScreen(new MenuMisc(this, ui));
          break;
        case 4: // combined attack
          this.pushScreen(ui.selectMonster(this, (fc) => ui.actionSelected(new ActionCoopMagic(ui.mPlayerList, fc, ui.currentPlayer))));
          break;
      }
    } else if (key === Global.KEY_CANCEL) {
      ui.cancel();
    }
  }
}

/** Cursor for picking a target character. */
class MenuCharacterSelect extends BaseScreen {
  private mCurSel = 0;

  constructor(
    readonly parent: GameNode,
    private readonly ui: CombatUI,
    private readonly mIndicator: FrameAnimation,
    private readonly mIndicatorPos: Point[],
    private readonly mList: FightingCharacter[],
    private readonly mOnCharacterSelected: OnCharacterSelected | null,
    private readonly mIgnoreDead: boolean,
  ) {
    super();
    const i = mList.findIndex((c) => c.isAlive);
    if (i >= 0) this.mCurSel = i;
  }

  update(delta: number): void {
    this.mIndicator.update(delta);
  }

  draw(canvas: Canvas): void {
    const pos = this.mIndicatorPos[this.mCurSel];
    if (pos) this.mIndicator.draw(canvas, pos.x, pos.y);
    if (this.mIndicator === this.ui.mTargetIndicator) {
      const p = this.ui.mPlayerList[this.mCurSel];
      if (p) this.ui.drawPlayerInfo(canvas, p);
    }
  }

  private anySelectable(): boolean {
    return !this.mIgnoreDead || this.mList.some((c) => c.isAlive);
  }

  private selectNextTarget(): void {
    if (!this.anySelectable()) return;
    do {
      this.mCurSel = (this.mCurSel + 1) % this.mList.length;
    } while (this.mIgnoreDead && !this.mList[this.mCurSel].isAlive);
  }

  private selectPreTarget(): void {
    if (!this.anySelectable()) return;
    do {
      this.mCurSel = (this.mCurSel - 1 + this.mList.length) % this.mList.length;
    } while (this.mIgnoreDead && !this.mList[this.mCurSel].isAlive);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_RIGHT) this.selectNextTarget();
    else if (key === Global.KEY_LEFT) this.selectPreTarget();
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
    } else if (key === Global.KEY_ENTER) {
      this.popScreen();
      this.mOnCharacterSelected?.(this.mList[this.mCurSel]);
    }
  }
}

/** Siege, items, defend, flee, status. */
class MenuMisc extends BaseScreen {
  private readonly mBg = Util.getFrameBitmap(2 * 16 + 6, 5 * 16 + 6);
  private readonly mItemText = T.battleMisc.map((s) => gbkBytes(s));
  private readonly mTextRect = new Rect(9 + 3, 4 + 3, 9 + 4 + 16 * 2, 4 + 3 + 16 * 5);
  private mCurSelIndex = 0;

  constructor(
    readonly parent: GameNode,
    private readonly ui: CombatUI,
  ) {
    super();
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mBg, 9, 4);
    this.mItemText.forEach((t, i) => TextRender.drawText(canvas, t, this.mTextRect.left, this.mTextRect.top + i * 16));
    TextRender.drawSelText(canvas, this.mItemText[this.mCurSelIndex], this.mTextRect.left, this.mTextRect.top + this.mCurSelIndex * 16);
  }

  onKeyDown(key: number): void {
    const n = this.mItemText.length;
    if (key === Global.KEY_UP) this.mCurSelIndex = (this.mCurSelIndex - 1 + n) % n;
    else if (key === Global.KEY_DOWN) this.mCurSelIndex = (this.mCurSelIndex + 1) % n;
  }

  onKeyUp(key: number): void {
    const ui = this.ui;
    if (key === Global.KEY_ENTER) {
      switch (this.mCurSelIndex) {
        case 0:
          ui.mCallBack?.onAutoAttack();
          break;
        case 1:
          this.pushScreen(new MenuGoods(this, ui));
          break;
        case 2: {
          const p = ui.currentPlayer;
          p.fightingSprite!.currentFrame = 9;
          ui.actionSelected(new ActionDefend(p));
          break;
        }
        case 3:
          ui.mCallBack?.onFlee();
          break;
        case 4:
          this.popScreen();
          this.pushScreen(new MenuState(this, ui));
          break;
      }
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }
}

/** Shows a party member's state during battle. */
class MenuState extends BaseScreen {
  private readonly mBg = DatLib.getRes(ResType.PIC, 2, 11) as ResImage;
  /** 1 up, 2 down, 3 cross, 4 tick, 5 return */
  private readonly mMarker = DatLib.getRes(ResType.PIC, 2, 12) as ResImage;
  private mCurPlayer: number;

  constructor(
    readonly parent: GameNode,
    private readonly ui: CombatUI,
  ) {
    super();
    this.mCurPlayer = ui.mCurPlayerIndex;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    const x = Math.trunc((160 - this.mBg.width) / 2);
    const y = Math.trunc((96 - this.mBg.height) / 2);
    this.mBg.draw(canvas, 1, x, y);
    const p = this.ui.mPlayerList[this.mCurPlayer];
    p.drawHead(canvas, x + 7, y + 4);
    Util.drawSmallNum(canvas, p.hp, x + 50, y + 9);
    Util.drawSmallNum(canvas, p.attack, x + 50, y + 21);
    Util.drawSmallNum(canvas, p.luck, x + 87, y + 9);
    Util.drawSmallNum(canvas, p.speed, x + 87, y + 21);
    // The original shows placeholder markers/round counts here.
    const markers = [1, 2, 5, 3, 4, 3, 4];
    const mx = [9, 25, 41, 57, 73, 88, 104];
    for (let i = 0; i < 7; i++) this.mMarker.draw(canvas, markers[i], x + mx[i], y + 48);
    const nx = [10, 26, 42, 58, 74, 90, 106];
    for (let i = 0; i < 7; i++) Util.drawSmallNum(canvas, 5, x + nx[i], y + 57);
  }

  onKeyDown(key: number): void {
    const n = this.ui.mPlayerList.length;
    switch (key) {
      case Global.KEY_RIGHT:
      case Global.KEY_DOWN:
      case Global.KEY_PAGEDOWN:
      case Global.KEY_ENTER:
        this.mCurPlayer = (this.mCurPlayer + 1) % n;
        break;
      case Global.KEY_LEFT:
      case Global.KEY_UP:
      case Global.KEY_PAGEUP:
        this.mCurPlayer = (this.mCurPlayer - 1 + n) % n;
        break;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
      this.pushScreen(new MenuMisc(this, this.ui));
    }
  }
}

/** Items submenu: equip, throw, use. */
class MenuGoods extends BaseScreen {
  private readonly mBg = Util.getFrameBitmap(16 * 2 + 6, 16 * 3 + 6);
  private readonly mItemText = T.battleGoods.map((s) => gbkBytes(s));
  private readonly mTextRect = new Rect(29 + 3, 14 + 3, 29 + 3 + this.mBg.width, 14 + 3 + this.mBg.height);
  private mSelIndex = 0;

  constructor(
    readonly parent: GameNode,
    private readonly ui: CombatUI,
  ) {
    super();
  }

  private get useableGoodsList(): BaseGoods[] {
    return Player.sGoodsList.goodsList.filter((g) => g.type >= 9 && g.type <= 12);
  }

  private get throwableGoodsList(): BaseGoods[] {
    return Player.sGoodsList.goodsList.filter((g) => g.type === 8);
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mBg, 29, 14);
    this.mItemText.forEach((t, i) => TextRender.drawText(canvas, t, this.mTextRect.left, this.mTextRect.top + i * 16));
    TextRender.drawSelText(canvas, this.mItemText[this.mSelIndex], this.mTextRect.left, this.mTextRect.top + 16 * this.mSelIndex);
  }

  onKeyDown(key: number): void {
    const n = this.mItemText.length;
    if (key === Global.KEY_DOWN) this.mSelIndex = (this.mSelIndex + 1) % n;
    else if (key === Global.KEY_UP) this.mSelIndex = (this.mSelIndex - 1 + n) % n;
  }

  onKeyUp(key: number): void {
    const ui = this.ui;
    if (key === Global.KEY_ENTER) {
      this.popScreen();
      const cur = ui.currentPlayer;
      switch (this.mSelIndex) {
        case 0: // equip
          this.pushScreen(
            new ScreenGoodsList(this, Player.sGoodsList.equipList, { onItemSelected: (g) => this.equipSelected(g) }, GoodsListMode.Use),
          );
          break;
        case 1: // throw
          this.pushScreen(
            new ScreenGoodsList(
              this,
              this.throwableGoodsList,
              {
                onItemSelected: (goods) => {
                  this.popScreen(); // goods list
                  this.popScreen(); // misc menu
                  if (goods.effectAll()) {
                    ui.actionSelected(new ActionThrowItemAll(cur, ui.mMonsterList, goods as GoodsHiddenWeapon));
                  } else {
                    ui.pushScreen(
                      ui.selectMonster(ui, (fc) => ui.actionSelected(new ActionThrowItemOne(cur, fc, goods as GoodsHiddenWeapon))),
                    );
                  }
                },
              },
              GoodsListMode.Use,
            ),
          );
          break;
        case 2: // use
          this.pushScreen(
            new ScreenGoodsList(
              this,
              this.useableGoodsList,
              {
                onItemSelected: (goods) => {
                  this.popScreen(); // goods list
                  this.popScreen(); // misc menu
                  if (goods.effectAll()) {
                    ui.actionSelected(new ActionUseItemAll(cur, ui.mPlayerList, goods));
                  } else {
                    this.pushScreen(ui.selectPlayer(this, (fc) => ui.actionSelected(new ActionUseItemOne(cur, fc, goods))));
                  }
                },
              },
              GoodsListMode.Use,
            ),
          );
          break;
      }
    } else if (key === Global.KEY_CANCEL) {
      this.popScreen();
    }
  }

  private equipSelected(goods: BaseGoods): void {
    const list = this.ui.mPlayerList.filter((p) => goods.canPlayerUse(p.index));
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
        b.set(gbkBytes(p.name).subarray(0, 11));
        return b;
      });
      this.pushScreen(
        screen(this, {
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
            const n = itemsText.length;
            if (key === Global.KEY_DOWN) curSel = (curSel + 1) % n;
            else if (key === Global.KEY_UP) curSel = (curSel - 1 + n) % n;
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
