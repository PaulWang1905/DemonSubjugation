// Port of fmj/combat/ui/CombatSuccess.kt — post-battle rewards screens,
// shown in the order and places the original engine shows them.
//
// The original (fmj-engine engine_battle.c _0022C000, engine_reward.c) draws
// its boxes straight onto the LCD, over whatever is there, while pictures go
// into the screen buffer, which is shown by a "flip" (_0021828D) that wipes
// the boxes:
//
// - _0022C757: experience (box style 0) and money (style 1), then waits 5
//   timer ticks or a key (_0020C000);
// - _0022CC0F / _00203425: each item found, a box in the middle (style 2),
//   2 ticks;
// - for each member who levels up (_0022F05D): "name grew" in the middle box
//   (_0022CFD6), the level-up panel 2-9 drawn into the buffer (_0022D34B),
//   2 ticks (the panel is not seen yet), the flip (the battle scene with the
//   panel only), 3 ticks; then each spell learnt (_0022F1D7, _0022E873) in
//   panel 2-10 over it (_0022EB3F), 3 ticks.
//
// So the next member's "grew" box is drawn over the previous member's
// "learnt" panel, on the device too, until that member's own panel replaces
// both. A wait of n ticks ends at the (n+1)th 500 ms timer message.
import { Global } from "../../Global";
import { T } from "../../i18n";
import type { Player } from "../../characters/Player";
import type { BaseGoods } from "../../goods/BaseGoods";
import { TextRender } from "../../graphics/TextRender";
import { Util } from "../../graphics/Util";
import { DatLib, ResType } from "../../lib/DatLib";
import type { ResImage } from "../../lib/ResImage";
import type { GameNode } from "../../views/BaseScreen";
import { type Canvas, Paint, PaintStyle } from "../../../graphics";
import { gbkBytes } from "../../../java";
import { lcdSpan, onLcd } from "../../script/choiceBox";

/** Something drawn on the screen (a box or a panel). */
export interface Layer {
  draw(canvas: Canvas): void;
}

/** The device's timer message: every 500 ms. */
export const TIMER_TICK_MS = 500;

/** The LCD's width as the original's centring uses it (0x9F). */
const LCD_W = 159;

const white = new Paint();
white.color = Global.COLOR_WHITE;
white.style = PaintStyle.FILL;
const black = new Paint();
black.color = Global.COLOR_BLACK;
black.style = PaintStyle.STROKE;

/** SysLcdPartClear: white from x1, y1 to x2, y2 (the columns its byte loop covers). */
function clear(canvas: Canvas, x1: number, y1: number, x2: number, y2: number): void {
  if (!onLcd(x1, y1, x2, y2)) return;
  const [x, xe] = lcdSpan(x1, x2);
  if (xe > x) canvas.drawRect(x, y1, xe, y2 + 1, white);
}

/** A picture's frame drawn with SysPicture (nothing when it does not fit on the LCD). */
function picture(canvas: Canvas, img: ResImage, frame: number, x: number, y: number): void {
  if (onLcd(x, y, x + img.width - 1, y + img.height - 1)) img.draw(canvas, frame + 1, x, y);
}

/**
 * The message box of _0022A8FA: the end caps of picture 2-8 around a frame
 * as wide as the text, at the top (style 0), below it (1) or in between (2),
 * and the text in it (SysPrintString).
 */
export class MessageBox implements Layer {
  private readonly bytes: Int8Array;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  private readonly caps: ResImage;

  constructor(style: 0 | 1 | 2, msg: string) {
    this.bytes = gbkBytes(msg);
    this.caps = DatLib.getRes(ResType.PIC, 2, 8) as ResImage;
    const w = this.caps.width;
    const h = this.caps.height;
    let top = 0x18 - (h >> 2);
    if (style === 1) top += h + 4;
    else if (style === 2) top += (h + 4) >> 1;
    const half = (this.bytes.length & 0xff) << 2;
    this.left = 0x50 - half - w - 2;
    this.top = top;
    this.right = 0x50 + half + 2;
    this.bottom = top + h;
  }

  /** Where the text starts. */
  get textX(): number {
    return this.left + this.caps.width - 1 + 2;
  }
  get textY(): number {
    return this.top + 1 + 3;
  }

  draw(canvas: Canvas): void {
    clear(canvas, this.left, this.top, this.right, this.bottom);
    picture(canvas, this.caps, 0, this.left, this.top);
    picture(canvas, this.caps, 1, this.right, this.top);
    const x1 = this.left + this.caps.width - 1;
    const y1 = this.top + 1;
    const y2 = this.bottom - 2;
    if (onLcd(x1, y1, this.right, y2)) canvas.drawRect(x1, y1, this.right, y2, black);
    TextRender.drawText(canvas, this.bytes, this.textX, this.textY);
  }
}

/** Panel 2-9 with the stats before and after (_0022D34B), centred as the original centres it. */
export class LevelupScreen implements Layer {
  private readonly panel: ResImage;
  readonly x: number;
  readonly y: number;
  private readonly numbers: [number, number, number][] = [];

  constructor(
    readonly parent: GameNode | null,
    p: Player,
  ) {
    this.panel = DatLib.getRes(ResType.PIC, 2, 9) as ResImage;
    this.x = (LCD_W - this.panel.width) >> 1;
    this.y = (96 - this.panel.height) >> 1;
    const lc = p.levelupChain;
    const curl = p.level;
    const n = (v: number, x: number, y: number) => this.numbers.push([v, x, y]);
    const b = p.levelBefore;
    if (b) {
      // before -> after, for any number of levels gained at once
      p.levelBefore = null;
      n(b.hp, 37, 9);
      n(b.maxHP, 56, 9);
      n(p.hp, 86, 9);
      n(p.maxHP, 105, 9);
      n(b.mp, 37, 21);
      n(b.maxMP, 56, 21);
      n(p.mp, 86, 21);
      n(p.maxMP, 105, 21);
      n(b.attack, 47, 33);
      n(p.attack, 96, 33);
      n(b.defend, 47, 45);
      n(p.defend, 96, 45);
      n(b.speed, 47, 57);
      n(p.speed, 96, 57);
      n(b.lingli, 47, 69);
      n(p.lingli, 96, 69);
      n(b.luck, 47, 81);
      n(p.luck, 96, 81);
      return;
    }
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

  draw(canvas: Canvas): void {
    this.panel.draw(canvas, 1, this.x, this.y);
    for (const [v, x, y] of this.numbers) Util.drawSmallNum(canvas, v, this.x + x, this.y + y);
  }
}

/** Panel 2-10 with the member's name and the spell learnt (_0022EB3F), with a white border of 3 pixels. */
export class LearnMagicScreen implements Layer {
  private readonly panel: ResImage;
  readonly x: number;
  readonly y: number;
  private readonly name: Int8Array;
  private readonly magic: Int8Array;

  constructor(
    readonly parent: GameNode | null,
    playerName: string,
    magicName: string,
  ) {
    this.panel = DatLib.getRes(ResType.PIC, 2, 10) as ResImage;
    this.x = (LCD_W - this.panel.width) >> 1;
    this.y = (96 - this.panel.height) >> 1;
    this.name = gbkBytes(playerName);
    this.magic = gbkBytes(magicName);
  }

  draw(canvas: Canvas): void {
    const { x, y } = this;
    clear(canvas, x - 3, y - 3, x + this.panel.width + 3, y + this.panel.height + 3);
    picture(canvas, this.panel, 0, x, y);
    TextRender.drawText(canvas, this.name, (LCD_W - ((this.name.length * 8) & 0xff)) >> 1, y + 6);
    TextRender.drawText(canvas, this.magic, (LCD_W - ((this.magic.length * 8) & 0xff)) >> 1, y + 43);
  }
}

/** One step of the screens: a box onto the screen, the flip to the buffer (with a panel), or a wait. */
export type RewardAction = { kind: "show"; layer: Layer } | { kind: "flip"; layer: Layer } | { kind: "wait"; ticks: number };

/** The spells a member learnt with this level-up: [from, to) in their spell list. */
function learntRange(p: Player, before: number | null): [number, number] {
  const c = p.levelupChain;
  const to = c.getLearnMagicNum(p.level);
  return [before ?? c.getLearnMagicNum(p.level - 1), to];
}

/** What the original shows when a member levels up (_0022F05D). */
export function levelUpActions(p: Player): RewardAction[] {
  const before = p.levelBefore?.learnt ?? null;
  const out: RewardAction[] = [{ kind: "show", layer: new MessageBox(2, T.levelUp(p.name)) }];
  const panel = new LevelupScreen(null, p);
  out.push({ kind: "wait", ticks: 2 }, { kind: "flip", layer: panel }, { kind: "wait", ticks: 3 });
  const chain = p.magicChain;
  if (chain) {
    const [from, to] = learntRange(p, before);
    for (let i = from; i < to; i++) {
      const magic = chain.getMagic(i);
      if (magic) out.push({ kind: "show", layer: new LearnMagicScreen(null, p.name, magic.magicName) }, { kind: "wait", ticks: 3 });
    }
  }
  return out;
}

/**
 * Plays reward actions: boxes pile up on the screen until a flip, which
 * leaves only the scene and the flipped panel (as the original's LCD and
 * screen buffer). Each wait ends after `ticks + 1` timer messages or a key.
 */
export class RewardScreens {
  private readonly lcd: Layer[] = [];
  private buffer: Layer | null = null;
  private at = 0;
  private waited = -1;
  private keyed = false;

  constructor(private readonly actions: RewardAction[]) {}

  /** @returns true once everything has been shown */
  update(delta: number): boolean {
    for (;;) {
      const a = this.actions[this.at];
      if (!a) return true;
      if (a.kind === "wait") {
        if (this.waited < 0) {
          this.waited = 0;
          this.keyed = false;
          return false;
        }
        this.waited += delta;
        if (!this.keyed && this.waited < (a.ticks + 1) * TIMER_TICK_MS) return false;
        this.waited = -1;
        this.keyed = false;
        this.at++;
        // the next steps happen at once
        delta = 0;
        continue;
      }
      if (a.kind === "show") this.lcd.push(a.layer);
      else {
        this.lcd.length = 0;
        this.buffer = a.layer;
      }
      this.at++;
    }
  }

  /** What is on the screen now, over the scene. */
  get layers(): Layer[] {
    return this.buffer ? [this.buffer, ...this.lcd] : [...this.lcd];
  }

  draw(canvas: Canvas): void {
    this.buffer?.draw(canvas);
    for (const s of this.lcd) s.draw(canvas);
  }

  onKeyUp(): void {
    if (this.waited >= 0) this.keyed = true;
  }
}

export class CombatSuccess {
  private readonly screens: RewardScreens;

  constructor(
    _parent: GameNode,
    exp: number,
    money: number,
    goods: BaseGoods[],
    lvuplist: Player[],
  ) {
    const actions: RewardAction[] = [
      { kind: "show", layer: new MessageBox(0, T.expLine(String(exp))) },
      { kind: "show", layer: new MessageBox(1, T.moneyLine(String(money))) },
      { kind: "wait", ticks: 5 },
    ];
    for (const g of goods) actions.push({ kind: "show", layer: new MessageBox(2, T.gotItem(g.name, g.goodsNum)) }, { kind: "wait", ticks: 2 });
    for (const p of lvuplist) actions.push(...levelUpActions(p));
    this.screens = new RewardScreens(actions);
  }

  /** @returns true once everything has been shown */
  update(delta: number): boolean {
    return this.screens.update(delta);
  }

  get layers(): Layer[] {
    return this.screens.layers;
  }

  draw(canvas: Canvas): void {
    this.screens.draw(canvas);
  }

  onKeyDown(_key: number): void {}

  onKeyUp(_key: number): void {
    this.screens.onKeyUp();
  }
}
