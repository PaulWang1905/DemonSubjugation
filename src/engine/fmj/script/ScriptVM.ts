// Port of fmj/script/ScriptVM.kt — the story-script ("GUT") interpreter.
//
// Each opcode is decoded once into a Command; running a Command performs the
// instruction and may return an Operate that keeps running (and drawing) over
// several frames, e.g. dialogue boxes or NPC movement.
//
// Opcodes 4, 5, 7, 8, 15, 17, 18, 19 and 25 were unassigned in the original
// fmj.kt; their decoders come from the erduoniba/baye-fmj-app fork so scripts
// that use them no longer abort.
import { EngineSettings } from "../config/EngineSettings";
import * as OriginalRules from "../combat/OriginalRules";
import { rand16 } from "../combat/OriginalRules";
import { CharacterState } from "../characters/Character";
import { Global, ScreenViewType } from "../Global";
import { T } from "../i18n";
import type { Character } from "../characters/Character";
import { stateFromInt } from "../characters/Character";
import { Direction } from "../characters/Direction";
import { Player } from "../characters/Player";
import { Combat } from "../combat/Combat";
import { LevelupScreen, MsgScreen } from "../combat/ui/CombatSuccess";
import { ScreenCommonMenu } from "../gamemenu/ScreenCommonMenu";
import { GoodsListMode, ScreenGoodsList } from "../gamemenu/ScreenGoodsList";
import type { BaseGoods } from "../goods/BaseGoods";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { DatLib, ResType, warnOnce } from "../lib/DatLib";
import type { ResGut } from "../lib/ResGut";
import type { ResSrs } from "../lib/ResSrs";
import { Control, type GameNode } from "../views/BaseScreen";
import { SaveLoadOperate, ScreenSaveLoadGame } from "../views/ScreenSaveLoadGame";
import { Canvas, Paint, PaintStyle, Rect, RectF } from "../../graphics";
import type { ResImage } from "../lib/ResImage";
import { gbkString, getCString, random } from "../../java";
import { OperateAdapter, OperateDrawOnce, type Command, type Operate } from "./Operate";
import { OperateBuy } from "./OperateBuy";
import { OperateSale } from "./OperateSale";
import { ScriptProcess } from "./ScriptProcess";
import { ScriptResources } from "./ScriptResources";

type Instruct = (code: Int8Array, start: number) => Command;

function makeCommand(len: number, run: (p: ScriptProcess) => Operate | null): Command {
  return { len, run };
}

class DrawSceneOnce extends OperateDrawOnce {
  constructor(private readonly drawFn: (c: Canvas) => void) {
    super();
  }
  drawOnce(canvas: Canvas): void {
    this.drawFn(canvas);
  }
}

/**
 * The SAY box with compact text (the experimental text size option): the
 * same box and portrait tab, grown upwards to hold more, smaller lines.
 * Returns the index of the first byte that did not fit.
 */
function drawCompactSay(canvas: Canvas, text: Int8Array, from: number, headImg: ResImage | null, size: number, paint: Paint): number {
  const maxLines = size === 12 ? 4 : 5;
  const bottom = 94;
  const rowsFor = (lines: number) => {
    const textTop = bottom - lines * size;
    const headBottom = headImg == null ? -1 : textTop - 12 + headImg.height;
    const rows: { x: number; y: number; right: number }[] = [];
    for (let row = 0; row < lines; row++) {
      const y = textTop + row * size;
      // lines beside the portrait start after it, as in the device's box
      rows.push({ x: y < headBottom ? 44 : 14, y, right: 145 });
    }
    return rows;
  };
  // as tall as this page needs, never less than the device's two lines
  const fit = (n: number) => TextRender.withSize(size, () => TextRender.drawWrapped(null, text, from, rowsFor(n)).next);
  const full = fit(maxLines);
  let lines = 2;
  while (lines < maxLines && fit(lines) < full) lines++;
  const rows = rowsFor(lines);
  const textTop = rows[0].y;
  const frameTop = headImg == null ? textTop - 3 : textTop - 8;
  paint.color = Global.COLOR_WHITE;
  paint.style = PaintStyle.FILL;
  const r = new RectF(9, frameTop, 151, 96 - 0.5);
  canvas.drawRectR(r, paint);
  paint.color = Global.COLOR_BLACK;
  paint.style = PaintStyle.STROKE;
  paint.strokeWidth = 1;
  canvas.drawRectR(r, paint);
  if (headImg != null) {
    const tab = textTop - 2;
    canvas.drawLine(38, frameTop, 44, tab, paint);
    canvas.drawLine(43.5, tab, 151, tab, paint);
    headImg.draw(canvas, 1, 13, textTop - 12);
  }
  return TextRender.withSize(size, () => TextRender.drawWrapped(canvas, text, from, rows).next);
}

export class ScriptVM extends Control {
  static cmdDebug = false;
  /** Throw on decode problems instead of tolerating them (used by tests/tools). */
  static strict = false;

  static cmdPrint(msg: string): void {
    if (ScriptVM.cmdDebug) console.log(msg);
  }

  static get2ByteInt(data: Int8Array, start: number): number {
    return (data[start] & 0xff) | ((data[start + 1] << 8) & 0xff00);
  }

  static get4BytesInt(data: Int8Array, start: number): number {
    return (
      (data[start] & 0xff) |
      ((data[start + 1] << 8) & 0xff00) |
      ((data[start + 2] << 16) & 0xff0000) |
      (data[start + 3] << 24)
    );
  }

  /** NUL-terminated byte string, including the terminator. */
  static getStringBytes(data: Int8Array, start: number): Int8Array {
    let i = 0;
    while (data[start + i] !== 0 && start + i < data.length) ++i;
    ++i;
    return data.slice(start, start + i);
  }

  private readonly instructions: (Instruct | null)[];
  /** Problems found while decoding scripts (unknown opcodes, bad events). */
  readonly decodeWarnings: string[] = [];

  constructor(readonly parent: GameNode) {
    super();
    this.instructions = this.buildInstructions();
  }

  private buildInstructions(): (Instruct | null)[] {
    const vm = this;
    const g2 = ScriptVM.get2ByteInt;
    const g4 = ScriptVM.get4BytesInt;
    // Under the original engine rules script variables are single bytes and
    // money is capped at 65951, as on the device (BA4988/fmj-engine).
    const orig = () => EngineSettings.originalDamageFormula;
    const b8 = (v: number) => (orig() ? v & 0xff : v);
    const MONEY_MAX = 0x1019f;
    const str = ScriptVM.getStringBytes;
    const log = ScriptVM.cmdPrint;
    const game = () => vm.game;
    const scene = () => vm.game.mainScene;
    const drawScene = (c: Canvas) => scene().drawScene(c);

    const cmd_music: Instruct = () => makeCommand(4, () => null);

    const cmd_loadmap: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      const x = g2(code, start + 4);
      const y = g2(code, start + 6);
      return makeCommand(8, () => {
        log(`cmd_loadmap type=${type} index=${index} x=${x} y=${y}`);
        scene().loadMap(type, index, x, y);
        return new DrawSceneOnce(drawScene);
      });
    };

    const cmd_createactor: Instruct = (code, start) => {
      const actor = g2(code, start);
      const x = g2(code, start + 2);
      const y = g2(code, start + 4);
      return makeCommand(6, () => {
        log(`cmd_createactor ${actor} at (${x}, ${y})`);
        scene().createActor(actor, x, y);
        return new DrawSceneOnce(drawScene);
      });
    };

    const cmd_deletenpc: Instruct = (code, start) => {
      const npc = g2(code, start);
      return makeCommand(2, () => {
        scene().deleteNpc(npc);
        return null;
      });
    };

    // --- opcodes from the baye-fmj-app fork (mostly no-ops) ---
    const cmd_mapevent: Instruct = () => makeCommand(2, () => null);
    const cmd_actorevent: Instruct = () => makeCommand(4, () => null);
    const cmd_actormove: Instruct = () => makeCommand(6, () => null);
    const cmd_actorspeed: Instruct = () => makeCommand(4, () => null);
    const cmd_screenr: Instruct = () => makeCommand(1, () => null);
    const cmd_screena: Instruct = () => makeCommand(1, () => null);
    const cmd_event: Instruct = (code, start) => {
      const eventId = g2(code, start);
      return makeCommand(2, () => {
        game().triggerEvent(eventId);
        return null;
      });
    };
    const cmd_money: Instruct = (code, start) => {
      const amount = g4(code, start);
      return makeCommand(4, () => {
        Player.sMoney = amount;
        return null;
      });
    };
    const cmd_gutevent: Instruct = (code, start) => {
      const gutId = g2(code, start);
      const eventId = g2(code, start + 2);
      return makeCommand(4, () => {
        scene().callChapter(1, gutId);
        scene().triggerEvent(eventId);
        return null;
      });
    };

    const cmd_move: Instruct = (code, start) => {
      const npcId = g2(code, start);
      const dstX = g2(code, start + 2);
      const dstY = g2(code, start + 4);
      return makeCommand(6, () => {
        const npc = scene().getNPC(npcId);
        log(`cmd_move ${npc.name} to (${dstX}, ${dstY})`);
        let time = 400;
        return {
          update(delta: number): boolean {
            time += delta;
            if (time > 100) {
              const p = npc.posInMap;
              if (dstX < p.x) npc.walk(Direction.West);
              else if (dstX > p.x) npc.walk(Direction.East);
              else if (dstY < p.y) npc.walk(Direction.North);
              else if (dstY > p.y) npc.walk(Direction.South);
              else return false;
              time = 0;
            }
            return true;
          },
          onKeyUp() {},
          onKeyDown() {},
          draw: drawScene,
        };
      });
    };

    const cmd_callback: Instruct = () =>
      makeCommand(0, () => {
        scene().exitScript();
        return null;
      });

    const cmd_goto: Instruct = (code, start) => {
      const address = g2(code, start);
      return makeCommand(2, () => {
        game().gotoAddress(address);
        return null;
      });
    };

    const cmd_if: Instruct = (code, start) => {
      const va = g2(code, start);
      const address = g2(code, start + 2);
      return makeCommand(4, () => {
        if (ScriptResources.globalEvents[va]) game().gotoAddress(address);
        return null;
      });
    };

    const cmd_set: Instruct = (code, start) => {
      const id = g2(code, start);
      const value = g2(code, start + 2);
      return makeCommand(4, () => {
        ScriptResources.variables[b8(id)] = b8(value);
        return null;
      });
    };

    const cmd_say: Instruct = (code, start) => {
      const picNum = g2(code, start);
      const text = str(code, start + 2);
      const headImg = DatLib.getPic(1, picNum, true);
      let isAnyKeyDown = false;
      const rWithPic = new RectF(9, 50, 151, 96 - 0.5);
      const rWithTextT = new Rect(44, 58, 145, 75);
      const rWithTextB = new Rect(14, 76, 145, 93);
      const rWithoutPic = new RectF(9, 55, 151, 96 - 0.5);
      const rWithoutTextT = new Rect(14, 58, 145, 75);
      const rWithoutTextB = new Rect(14, 76, 145, 93);
      const paint = new Paint();
      paint.color = Global.COLOR_BLACK;
      paint.style = PaintStyle.FILL_AND_STROKE;

      return makeCommand(2 + text.length, () => {
        log("cmd_say " + gbkString(text));
        let iOfText = 0;
        let iOfNext = 0;
        return {
          update(): boolean {
            if (isAnyKeyDown) {
              if (iOfNext >= text.length - 1) return false; // last byte is NUL
              iOfText = iOfNext;
              isAnyKeyDown = false;
            }
            return true;
          },
          onKeyUp() {},
          onKeyDown() {
            isAnyKeyDown = true;
          },
          draw(canvas: Canvas) {
            if (!Combat.IsActive()) scene().drawScene(canvas);
            const size = EngineSettings.textSize;
            if (size !== 16) {
              iOfNext = drawCompactSay(canvas, text, iOfText, headImg, size, paint);
              return;
            }
            const r = headImg == null ? rWithoutPic : rWithPic;
            paint.color = Global.COLOR_WHITE;
            paint.style = PaintStyle.FILL;
            canvas.drawRectR(r, paint);
            paint.color = Global.COLOR_BLACK;
            paint.style = PaintStyle.STROKE;
            paint.strokeWidth = 1;
            canvas.drawRectR(r, paint);
            if (headImg == null) {
              iOfNext = TextRender.drawTextFrom(canvas, text, iOfText, rWithoutTextT);
              iOfNext = TextRender.drawTextFrom(canvas, text, iOfNext, rWithoutTextB);
            } else {
              canvas.drawLine(38, 50, 44, 56, paint);
              canvas.drawLine(43.5, 56, 151, 56, paint);
              headImg.draw(canvas, 1, 13, 46);
              iOfNext = TextRender.drawTextFrom(canvas, text, iOfText, rWithTextT);
              iOfNext = TextRender.drawTextFrom(canvas, text, iOfNext, rWithTextB);
            }
          },
        };
      });
    };

    const cmd_startchapter: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      return makeCommand(4, () => {
        log(`cmd_startchapter ${type} ${index}`);
        scene().startChapter(type, index);
        return null;
      });
    };

    const cmd_screens: Instruct = (code, start) => {
      const x = g2(code, start);
      const y = g2(code, start + 2);
      return makeCommand(4, () => {
        scene().setMapScreenPos(x, y);
        return null;
      });
    };

    const cmd_gameover: Instruct = () =>
      makeCommand(0, () => {
        game().changeScreen(ScreenViewType.SCREEN_MENU);
        return null;
      });

    const cmd_ifcmp: Instruct = (code, start) => {
      const id = g2(code, start);
      const other = g2(code, start + 2);
      const addr = g2(code, start + 4);
      return makeCommand(6, () => {
        if (ScriptResources.variables[b8(id)] === b8(other)) game().gotoAddress(addr);
        return null;
      });
    };

    const cmd_add: Instruct = (code, start) => {
      const va = g2(code, start);
      const value = g2(code, start + 2);
      return makeCommand(4, () => {
        ScriptResources.variables[b8(va)] = b8(ScriptResources.variables[b8(va)] + value);
        return null;
      });
    };

    const cmd_sub: Instruct = (code, start) => {
      const va = g2(code, start);
      const value = g2(code, start + 2);
      return makeCommand(4, () => {
        ScriptResources.variables[b8(va)] = b8(ScriptResources.variables[b8(va)] - value);
        return null;
      });
    };

    const cmd_setcontrolid: Instruct = (code, start) =>
      makeCommand(2, () => {
        scene().setControlPlayer(g2(code, start));
        return null;
      });

    const cmd_setevent: Instruct = (code, start) => {
      const event = g2(code, start);
      return makeCommand(2, () => {
        ScriptResources.setEvent(event);
        return null;
      });
    };

    const cmd_clrevent: Instruct = (code, start) => {
      const event = g2(code, start);
      return makeCommand(2, () => {
        ScriptResources.clearEvent(event);
        return null;
      });
    };

    const cmd_buy: Instruct = (code, start) => {
      const bytes = str(code, start);
      return makeCommand(bytes.length, () => new OperateBuy(vm, bytes));
    };

    const cmd_facetoface: Instruct = (code, start) => {
      const id0 = g2(code, start);
      const id1 = g2(code, start + 2);
      const getCharacter = (id: number): Character => (id === 0 ? scene().player! : scene().getNPC(id));
      return makeCommand(4, () => {
        const c1 = getCharacter(id0);
        const c2 = getCharacter(id1);
        const p1 = c1.posInMap;
        const p2 = c2.posInMap;
        if (p1.x > p2.x) c2.direction = Direction.East;
        else if (p1.x < p2.x) c2.direction = Direction.West;
        else if (p1.y > p2.y) c2.direction = Direction.South;
        else if (p1.y < p2.y) c2.direction = Direction.North;
        return new DrawSceneOnce(drawScene);
      });
    };

    const cmd_movie: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      const x = g2(code, start + 4);
      const y = g2(code, start + 6);
      const ctl = g2(code, start + 8);
      return makeCommand(10, () => {
        const movie = DatLib.getRes(ResType.SRS, type, index, true) as ResSrs | null;
        if (!movie) return null;
        movie.setIteratorNum(5);
        movie.start();
        let downKey = 0;
        let isAnyKeyPressed = false;
        return {
          update(delta: number): boolean {
            if ((ctl === 1 || ctl === 3) && isAnyKeyPressed) return false;
            return movie.update(delta);
          },
          onKeyUp(key: number) {
            if (key === downKey) isAnyKeyPressed = true;
          },
          onKeyDown(key: number) {
            downKey = key;
          },
          draw(canvas: Canvas) {
            if (ctl === 2 || ctl === 3) drawScene(canvas);
            movie.draw(canvas, x, y);
          },
        };
      });
    };

    const cmd_choice: Instruct = (code, start) => {
      let choice1 = str(code, start);
      let choice2 = str(code, start + choice1.length);
      const addrOffset = choice1.length + choice2.length;
      const address = g2(code, start + addrOffset);
      let w: number;
      if (choice1.length > choice2.length) {
        w = choice1.length * 8 - 8 + 6;
        const tmp = new Int8Array(choice1.length);
        tmp.set(choice2);
        for (let i = choice2.length - 1; i < tmp.length; i++) tmp[i] = 0x20;
        tmp[tmp.length - 1] = 0;
        choice2 = tmp;
      } else {
        w = choice2.length * 8 - 8 + 6;
        const tmp = new Int8Array(choice2.length);
        tmp.set(choice1);
        for (let i = choice1.length - 1; i < tmp.length; i++) tmp[i] = 0x20;
        tmp[tmp.length - 1] = 0;
        choice1 = tmp;
      }
      const c1 = choice1;
      const c2 = choice2;
      // Built lazily: Util needs DAT.LIB, which is fine at decode time, but
      // keeping it lazy also lets scripts be compiled without drawing.
      let bg: ReturnType<typeof Util.getFrameBitmap> | null = null;

      return makeCommand(addrOffset + 2, () => {
        if (!bg) bg = Util.getFrameBitmap(w, 16 * 2 + 6);
        const b = bg;
        const bgx = Math.trunc((160 - b.width) / 2);
        const bgy = Math.trunc((96 - b.height) / 2);
        let curChoice = 0;
        let hasSelect = false;
        let mLastDownKey = -1;
        return {
          update(): boolean {
            if (hasSelect) {
              if (curChoice === 1) game().gotoAddress(address);
              return false;
            }
            return true;
          },
          onKeyUp(key: number) {
            if (key === Global.KEY_ENTER && mLastDownKey === key) hasSelect = true;
          },
          onKeyDown(key: number) {
            if (key === Global.KEY_DOWN || key === Global.KEY_UP || key === Global.KEY_LEFT || key === Global.KEY_RIGHT) {
              curChoice = 1 - curChoice;
            }
            mLastDownKey = key;
          },
          draw(canvas: Canvas) {
            drawScene(canvas);
            canvas.drawBitmap(b, bgx, bgy);
            if (curChoice === 0) {
              TextRender.drawSelText(canvas, c1, bgx + 3, bgy + 3);
              TextRender.drawText(canvas, c2, bgx + 3, bgy + 3 + 16);
            } else {
              TextRender.drawText(canvas, c1, bgx + 3, bgy + 3);
              TextRender.drawSelText(canvas, c2, bgx + 3, bgy + 3 + 16);
            }
          },
        };
      });
    };

    const cmd_createbox: Instruct = (code, start) => {
      const id = g2(code, start);
      const boxId = g2(code, start + 2);
      const x = g2(code, start + 4);
      const y = g2(code, start + 6);
      return makeCommand(8, () => {
        scene().createBox(id, boxId, x, y);
        return null;
      });
    };

    const cmd_deletebox: Instruct = (code, start) => {
      const boxid = g2(code, start);
      return makeCommand(2, () => {
        scene().deleteBox(boxid);
        return null;
      });
    };

    const cmd_gaingoods: Instruct = (code, start) => {
      const goods = DatLib.getRes(ResType.GRS, g2(code, start), g2(code, start + 2), true) as BaseGoods | null;
      if (!goods) {
        console.warn("cmd_gaingoods: missing goods", g2(code, start), g2(code, start + 2));
        return makeCommand(4, () => null);
      }
      const msg = T.gotColon + goods.name;
      return makeCommand(4, () => {
        goods.goodsNum = 1;
        Player.sGoodsList.addGoods(goods.type, goods.index);
        let time = 0;
        let isAnyKeyPressed = false;
        let downKey = 0;
        return {
          update(delta: number): boolean {
            time += delta;
            return !(time > 1000 || isAnyKeyPressed);
          },
          onKeyUp(key: number) {
            if (key === downKey) isAnyKeyPressed = true;
          },
          onKeyDown(key: number) {
            downKey = key;
          },
          draw(canvas: Canvas) {
            Util.showMessage(canvas, msg);
          },
        };
      });
    };

    const cmd_initfight: Instruct = (code, start) => {
      const scrb = g2(code, start + 16);
      const scrl = g2(code, start + 18);
      const scrr = g2(code, start + 20);
      const arr: number[] = [];
      for (let i = 0; i <= 7; i++) arr.push(g2(code, start + i * 2));
      return makeCommand(22, () => {
        Combat.InitFight(vm, arr, scrb, scrl, scrr);
        return null;
      });
    };

    const cmd_fightenable: Instruct = () =>
      makeCommand(0, () => {
        Combat.FightEnable();
        return null;
      });

    const cmd_fightdisenable: Instruct = () =>
      makeCommand(0, () => {
        Combat.FightDisable();
        return null;
      });

    const cmd_createnpc: Instruct = (code, start) => {
      const id = g2(code, start);
      const resId = g2(code, start + 2);
      const x = g2(code, start + 4);
      const y = g2(code, start + 6);
      return makeCommand(8, () => {
        scene().createNpc(id, resId, x, y);
        return null;
      });
    };

    const cmd_enterfight: Instruct = (code, start) =>
      makeCommand(30, () => {
        const monstersType = [g2(code, start + 2), g2(code, start + 4), g2(code, start + 6)];
        const scr = [g2(code, start + 8), g2(code, start + 10), g2(code, start + 12)];
        const evtRnds = [g2(code, start + 14), g2(code, start + 16), g2(code, start + 18)];
        const evts = [g2(code, start + 20), g2(code, start + 22), g2(code, start + 24)];
        const lossto = g2(code, start + 26);
        const winto = g2(code, start + 28);
        Combat.EnterFight(vm, g2(code, start), monstersType, scr, evtRnds, evts, lossto, winto);
        game().exitScript();
        return null;
      });

    const cmd_deleteactor: Instruct = (code, start) => {
      const id = g2(code, start);
      return makeCommand(2, () => {
        scene().deleteActor(id);
        return null;
      });
    };

    const cmd_gainmoney: Instruct = (code, start) => {
      const value = g4(code, start);
      return makeCommand(4, () => {
        Player.sMoney = orig() ? Math.min(MONEY_MAX, Player.sMoney + value) : Player.sMoney + value;
        return null;
      });
    };

    const cmd_usemoney: Instruct = (code, start) => {
      const value = g4(code, start);
      return makeCommand(4, () => {
        Player.sMoney = orig() ? Math.max(0, Player.sMoney - value) : Player.sMoney - value;
        return null;
      });
    };

    const cmd_setmoney: Instruct = (code, start) => {
      const money = g4(code, start);
      return makeCommand(4, () => {
        Player.sMoney = orig() ? Math.min(MONEY_MAX, money) : money;
        return null;
      });
    };

    const cmd_learnmagic: Instruct = (code, start) =>
      makeCommand(6, () => {
        const actorId = g2(code, start);
        const type = g2(code, start + 2);
        const index = g2(code, start + 4);
        const magic = DatLib.getMrs(type, index);
        const player = scene().getPlayer(actorId);
        player?.learnMagic(magic);
        const playerName = player?.name ?? "E";
        let timeCnt = 0;
        return {
          update(delta: number): boolean {
            timeCnt += delta;
            return timeCnt < 1000;
          },
          onKeyUp() {},
          onKeyDown() {},
          draw(canvas: Canvas) {
            TextRender.drawText(canvas, playerName, 0, 0);
            TextRender.drawText(canvas, T.learnedMagic, 0, 16);
            TextRender.drawText(canvas, magic.magicName, 0, 16 * 2);
          },
        };
      });

    const cmd_sale: Instruct = () =>
      makeCommand(0, () => {
        const op = new OperateSale(vm);
        const list: BaseGoods[] = [...Player.sGoodsList.goodsList, ...Player.sGoodsList.equipList];
        vm.pushScreen(new ScreenGoodsList(vm, list, op, GoodsListMode.Sale));
        return op;
      });

    const cmd_npcmovemod: Instruct = (code, start) => {
      const id = g2(code, start);
      const state = g2(code, start + 2);
      return makeCommand(4, () => {
        // the original: 0 stops, 1 wanders (pause / walk), anything else animates in place (_002060B7)
        const s = orig() ? (state === 0 ? CharacterState.STOP : state === 1 ? CharacterState.PAUSE : CharacterState.ACTIVE) : stateFromInt(state);
        scene().getNPC(id).state = s;
        return null;
      });
    };

    const cmd_message: Instruct = (code, start) => {
      const msg = str(code, start);
      return makeCommand(msg.length, () => {
        let downKey = 0;
        let isAnyKeyDown = false;
        return {
          update: () => !isAnyKeyDown,
          onKeyUp(key: number) {
            if (downKey === key) isAnyKeyDown = true;
          },
          onKeyDown(key: number) {
            downKey = key;
          },
          draw(canvas: Canvas) {
            Util.showMessage(canvas, msg);
          },
        };
      });
    };

    const cmd_deletegoods: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      // The original read the jump address from start + 2; fixed as in the fork.
      const address = g2(code, start + 4);
      return makeCommand(6, () => {
        // the original takes all of them (99) and only fails when there are none
        const ok = orig() ? Player.sGoodsList.useGoodsNum(type, index, 99) : Player.sGoodsList.deleteGoods(type, index);
        if (!ok) game().gotoAddress(address);
        return null;
      });
    };

    const cmd_resumeactorhp: Instruct = (code, start) => {
      const id = g2(code, start);
      const value = g2(code, start + 2);
      return makeCommand(4, () => {
        const p = scene().getPlayer(id);
        if (p && orig()) {
          // heal by a percentage of max HP, at least 1 (_002062BB)
          if (value >= 1 && value <= 100) p.hp = Math.min(p.maxHP, p.hp + Math.max(1, Math.trunc((p.maxHP * value) / 100)));
        } else if (p) p.hp = Math.trunc((p.maxHP * value) / 100);
        return null;
      });
    };

    const cmd_actorlayerup: Instruct = (code, start) => {
      const actor = g2(code, start);
      const toLevel = g2(code, start + 2);
      return makeCommand(4, () => {
        const player = scene().getPlayer(actor);
        if (orig() && player) {
          // the original (_0022EE58): experience becomes the requirement of
          // the level below the target plus 5, then the usual level-up
          const c = player.levelupChain;
          const target = Math.min(toLevel, c.maxLevel);
          player.currentExp = (c.getNextLevelExp(target - 1) + 5) & 0xffff;
          if (!OriginalRules.gainExperience(player, 0)) return null;
        } else {
          if (!player || toLevel <= player.level) return null;
          player.levelUp(toLevel);
        }
        if (!player) return null;
        const msgScreen = new MsgScreen(vm, T.levelUp(player.name));
        const levelupScreen = new LevelupScreen(vm, player);
        let exit = false;
        let keydown = false;
        return {
          update: () => !exit,
          onKeyUp() {
            if (keydown) exit = true;
          },
          onKeyDown() {
            keydown = true;
          },
          draw(canvas: Canvas) {
            msgScreen.draw(canvas);
            levelupScreen.draw(canvas);
          },
        };
      });
    };

    const cmd_boxopen: Instruct = (code, start) => {
      const id = g2(code, start);
      return makeCommand(2, () => {
        scene().getNPC(id).step = 1;
        return null;
      });
    };

    const cmd_delallnpc: Instruct = () =>
      makeCommand(0, () => {
        scene().deleteAllNpc();
        return null;
      });

    const cmd_npcstep: Instruct = (code, start) => {
      const id = g2(code, start); // 0 = the player
      const faceto = g2(code, start + 2);
      const step = g2(code, start + 4);
      // Note: differs from the encoding used in the resource files.
      const d = [Direction.North, Direction.East, Direction.South, Direction.West][faceto] ?? Direction.South;
      return makeCommand(6, () => {
        let interval: number;
        if (id === 0) {
          const p = scene().player!;
          p.direction = d;
          p.step = step;
          interval = 300;
        } else {
          const npc = scene().getNPC(id);
          npc.direction = d;
          npc.step = step;
          interval = scene().isNpcVisible(npc) ? 300 : 0;
        }
        let time = 0;
        return {
          update(delta: number): boolean {
            time += delta;
            return time < interval;
          },
          onKeyUp() {},
          onKeyDown() {},
          draw: drawScene,
        };
      });
    };

    const cmd_setscenename: Instruct = (code, start) => {
      const bytes = str(code, start);
      const name = gbkString(bytes); // keeps the trailing NUL, as the original
      return makeCommand(bytes.length, () => {
        scene().sceneName = name;
        return null;
      });
    };

    const cmd_showscenename: Instruct = () =>
      makeCommand(0, () => {
        const text = scene().sceneName;
        let time = 0;
        let isAnyKeyDown = false;
        return {
          update(delta: number): boolean {
            time += delta;
            if (time > 100 && isAnyKeyDown) {
              isAnyKeyDown = false;
              return false;
            }
            return time < 1000;
          },
          onKeyUp() {},
          onKeyDown() {
            isAnyKeyDown = true;
          },
          draw(canvas: Canvas) {
            drawScene(canvas);
            Util.showInformation(canvas, text);
          },
        };
      });

    const cmd_showscreen: Instruct = () => makeCommand(0, () => new DrawSceneOnce(drawScene));

    const cmd_usegoods: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      const address = g2(code, start + 4);
      return makeCommand(6, () => {
        if (!Player.sGoodsList.deleteGoods(type, index)) game().gotoAddress(address);
        return null;
      });
    };

    const cmd_attribtest: Instruct = (code, start) => {
      const actor = g2(code, start);
      const type = g2(code, start + 2);
      const value = g2(code, start + 4);
      const addr1 = g2(code, start + 6);
      const addr2 = g2(code, start + 8);
      return makeCommand(10, () => {
        const player = scene().getPlayer(actor);
        if (!player) return null;
        const eq = player.equipmentsArray;
        let currentValue: number;
        switch (type) {
          case 0: currentValue = player.level; break;
          case 1: currentValue = player.attack; break;
          case 2: currentValue = player.defend; break;
          case 3: currentValue = player.speed; break;
          case 4: currentValue = player.hp; break;
          case 5: currentValue = player.mp; break;
          case 6: currentValue = player.currentExp; break;
          case 7: currentValue = player.lingli; break;
          case 8: currentValue = player.luck; break;
          case 15: currentValue = eq[7]?.index ?? 0; break;
          case 16: currentValue = eq[5]?.index ?? 0; break;
          case 17: currentValue = eq[6]?.index ?? 0; break;
          case 18: currentValue = eq[2]?.index ?? 0; break;
          case 19: currentValue = eq[4]?.index ?? 0; break;
          case 20: currentValue = eq[3]?.index ?? 0; break;
          case 21: currentValue = eq[0]?.index ?? 0; break;
          case 22: currentValue = eq[1]?.index ?? 0; break;
          case 23: currentValue = player.maxHP; break;
          case 24: currentValue = player.maxMP; break;
          case 9: currentValue = player.attackStatusRounds; break;
          case 10: currentValue = player.immuneBits; break;
          case 11: currentValue = player.attackStatusRaw; break;
          case 12: currentValue = player.comboMagicId; break;
          case 13: currentValue = OriginalRules.turnRecovery(player).hp; break;
          case 14: currentValue = OriginalRules.turnRecovery(player).mp; break;
          default:
            warnOnce(`attrib:test:${type}`, "ATTRIBTEST: unsupported attribute " + type);
            currentValue = value;
        }
        if (currentValue < value) game().gotoAddress(addr1);
        else if (currentValue > value) game().gotoAddress(addr2);
        return null;
      });
    };

    const cmd_attribset: Instruct = (code, start) => {
      const actor = g2(code, start);
      const type = g2(code, start + 2);
      const value = g2(code, start + 4);
      return makeCommand(6, () => {
        const player = scene().getPlayer(actor);
        if (!player) return null;
        switch (type) {
          case 0: player.setLevel(value); break;
          case 1: player.attack = value; break;
          case 2: player.defend = value; break;
          case 3: player.speed = value; break;
          case 4: player.hp = value; break;
          case 5: player.mp = value; break;
          case 6: player.currentExp = value; break;
          case 7: player.lingli = value; break;
          case 8: player.luck = value; break;
          case 15: player.maxHP = value; break;
          case 16: player.maxMP = value; break;
          case 9: player.attackStatusRounds = value & 0xff; break;
          case 10: player.scriptOverrides.immune = value & 0xff; break;
          case 11: player.scriptOverrides.attackStatus = value & 0xff; break;
          case 12: player.scriptOverrides.combo = value & 0xff; break;
          case 13: player.scriptOverrides.turnHp = value & 0xff; break;
          case 14: player.scriptOverrides.turnMp = value & 0xff; break;
          default:
            warnOnce(`attrib:ATTRIBSET:${type}`, "ATTRIBSET: unsupported attribute " + type);
        }
        return null;
      });
    };

    const cmd_attribadd: Instruct = (code, start) => {
      const actor = g2(code, start);
      const type = g2(code, start + 2);
      const value = g2(code, start + 4);
      return makeCommand(6, () => {
        const player = scene().getPlayer(actor);
        if (!player) return null;
        switch (type) {
          case 0: player.setLevel(player.level + value); break;
          case 1: player.attack += value; break;
          case 2: player.defend += value; break;
          case 3: player.speed += value; break;
          case 4: player.hp += value; break;
          case 5: player.mp += value; break;
          case 6: player.currentExp += value; break;
          case 7: player.lingli += value; break;
          case 8: player.luck += value; break;
          case 10: player.maxHP += value; break;
          case 11: player.maxMP += value; break;
          case 9: player.attackStatusRounds = (player.attackStatusRounds + value) & 0xff; break;
          default:
            warnOnce(`attrib:ATTRIBADD:${type}`, "ATTRIBADD: unsupported attribute " + type);
        }
        return null;
      });
    };

    const cmd_showgut: Instruct = (code, start) => {
      const bytes = str(code, start + 4);
      const text = gbkString(bytes); // keeps the trailing NUL, as the original
      const top = g2(code, start);
      const btm = g2(code, start + 2);
      const imgTop = DatLib.getPic(5, top, true);
      const imgBottom = DatLib.getPic(5, btm, true);
      return makeCommand(bytes.length + 4, () => {
        let goon = true;
        let interval = 50;
        let timeCnt = 0;
        let step = 1;
        let curY = imgBottom != null ? 96 - imgBottom.height : 96;
        const rect = new Rect(0, imgTop?.height ?? 0, 160, curY);
        return {
          update(delta: number): boolean {
            if (!goon) return false;
            timeCnt += delta;
            if (timeCnt >= interval) {
              timeCnt = 0;
              curY -= step;
            }
            return true;
          },
          onKeyUp(key: number) {
            if (key === Global.KEY_CANCEL) goon = false;
            step = 1;
            interval = 50;
          },
          onKeyDown() {
            step = 3;
            interval = 20;
          },
          draw(canvas: Canvas) {
            canvas.drawColor(Global.COLOR_WHITE);
            const e = TextRender.withSize(EngineSettings.textSize, () => TextRender.drawTextInRect(canvas, text, rect, curY));
            if (e !== 1 && e !== 2) goon = false;
            imgTop?.draw(canvas, 1, 0, 0);
            if (imgBottom) imgBottom.draw(canvas, 1, 0, 96 - imgBottom.height);
          },
        };
      });
    };

    const cmd_usegoodsnum: Instruct = (code, start) =>
      makeCommand(8, () => {
        const [type, index, num] = [g2(code, start), g2(code, start + 2), g2(code, start + 4)];
        // the original jumps when there are fewer than asked (_00206F18)
        const enough = !orig() || Player.sGoodsList.getGoodsNum(type, index) >= b8(num);
        const b = enough && Player.sGoodsList.useGoodsNum(type, index, orig() ? b8(num) : num);
        if (!b) game().gotoAddress(g2(code, start + 6));
        return null;
      });

    const cmd_randrade: Instruct = (code, start) =>
      makeCommand(4, () => {
        const hit = orig() ? rand16() % 1000 < g2(code, start) : Math.trunc(random() * 1000) <= g2(code, start);
        if (hit) game().gotoAddress(g2(code, start + 2));
        return null;
      });

    const cmd_menu: Instruct = (code, start) => {
      const bytes = getCString(code, start + 2);
      const stringItems = gbkString(bytes).split(" ");
      return makeCommand(bytes.length + 3, () => {
        let finished = false;
        const rvAddr = g2(code, start);
        const menu = new ScreenCommonMenu(vm, stringItems, (it: number) => {
          ScriptResources.variables[b8(rvAddr)] = b8(it);
          finished = true;
        });
        vm.pushScreen(menu);
        return new (class extends OperateAdapter {
          draw(canvas: Canvas): void {
            menu.draw(canvas);
          }
          onKeyDown(key: number): void {
            menu.onKeyDown(key);
          }
          onKeyUp(key: number): void {
            menu.onKeyUp(key);
          }
          update(delta: number): boolean {
            if (finished) return false;
            menu.update(delta);
            return true;
          }
        })();
      });
    };

    const cmd_testmoney: Instruct = (code, start) => {
      const money = g4(code, start);
      const address = g2(code, start + 4);
      return makeCommand(6, () => {
        // the original compares the low 16 bits of both (_0020378B)
        const less = orig() ? (Player.sMoney & 0xffff) < (money & 0xffff) : Player.sMoney < money;
        if (less) game().gotoAddress(address);
        return null;
      });
    };

    const cmd_callchapter: Instruct = (code, start) => {
      const type = g2(code, start);
      const index = g2(code, start + 2);
      return makeCommand(4, () => {
        log(`cmd_callchapter ${type} ${index}`);
        scene().callChapter(type, index);
        return null;
      });
    };

    const cmd_discmp: Instruct = (code, start) =>
      makeCommand(8, () => {
        const v = ScriptResources.variables[b8(g2(code, start))];
        const num = b8(g2(code, start + 2));
        if (v < num) game().gotoAddress(g2(code, start + 4));
        else if (v > num) game().gotoAddress(g2(code, start + 6));
        return null;
      });

    const cmd_return: Instruct = () =>
      makeCommand(0, () => {
        const prev = scene().scriptProcess.prev;
        if (prev) scene().scriptProcess = prev;
        return null;
      });

    const cmd_timemsg: Instruct = (code, start) => {
      const time = g2(code, start);
      const text = str(code, start + 2);
      return makeCommand(text.length + 2, () => {
        let downKey = 0;
        let isAnyKeyDown = false;
        let countDown = time * 10;
        return {
          update(delta: number): boolean {
            if (countDown !== 0) {
              countDown -= delta;
              if (countDown <= 0) return false;
            }
            return !isAnyKeyDown;
          },
          onKeyUp(key: number) {
            if (downKey === key) isAnyKeyDown = true;
          },
          onKeyDown(key: number) {
            downKey = key;
          },
          draw(canvas: Canvas) {
            Util.showMessage(canvas, text);
          },
        };
      });
    };

    const cmd_disablesave: Instruct = () =>
      makeCommand(0, () => {
        Global.disableSave = true;
        return null;
      });

    const cmd_enablesave: Instruct = () =>
      makeCommand(0, () => {
        Global.disableSave = false;
        return null;
      });

    const cmd_gamesave: Instruct = () =>
      makeCommand(0, () => {
        let end = false;
        const view = new ScreenSaveLoadGame(vm, SaveLoadOperate.SAVE, 1);
        view.callback = () => {
          end = true;
        };
        vm.pushScreen(view);
        return new (class extends OperateAdapter {
          update(): boolean {
            return !end;
          }
        })();
      });

    const cmd_seteventtimer: Instruct = (code, start) => {
      const event = g2(code, start);
      const timer = g2(code, start + 2);
      return makeCommand(4, (p) => {
        p.setTimer(timer, event);
        return null;
      });
    };

    const cmd_enableshowpos: Instruct = () => makeCommand(0, () => null);
    const cmd_disableshowpos: Instruct = () => makeCommand(0, () => null);

    const cmd_setto: Instruct = (code, start) =>
      makeCommand(4, () => {
        ScriptResources.variables[b8(g2(code, start + 2))] = ScriptResources.variables[b8(g2(code, start))];
        return null;
      });

    const cmd_testgoodsnum: Instruct = (code, start) =>
      makeCommand(10, () => {
        const goodsnum = Player.sGoodsList.getGoodsNum(g2(code, start), g2(code, start + 2));
        const num = b8(g2(code, start + 4));
        // the original does nothing when the item is not in the bag (_0020774E)
        if (orig() && !Player.sGoodsList.getGoods(g2(code, start), g2(code, start + 2))) return null;
        if (goodsnum === num) game().gotoAddress(g2(code, start + 6));
        else if (goodsnum > num) game().gotoAddress(g2(code, start + 8));
        return null;
      });

    const cmd_setfightmiss: Instruct = () => makeCommand(2, () => null);
    const cmd_setarmstoss: Instruct = () => makeCommand(2, () => null);

    return [
      cmd_music, // 0
      cmd_loadmap,
      cmd_createactor,
      cmd_deletenpc,
      cmd_mapevent,
      cmd_actorevent, // 5
      cmd_move,
      cmd_actormove,
      cmd_actorspeed,
      cmd_callback,
      cmd_goto, // 10
      cmd_if,
      cmd_set,
      cmd_say,
      cmd_startchapter,
      cmd_screenr, // 15
      cmd_screens,
      cmd_screena,
      cmd_event,
      cmd_money,
      cmd_gameover, // 20
      cmd_ifcmp,
      cmd_add,
      cmd_sub,
      cmd_setcontrolid,
      cmd_gutevent, // 25
      cmd_setevent,
      cmd_clrevent,
      cmd_buy,
      cmd_facetoface,
      cmd_movie, // 30
      cmd_choice,
      cmd_createbox,
      cmd_deletebox,
      cmd_gaingoods,
      cmd_initfight, // 35
      cmd_fightenable,
      cmd_fightdisenable,
      cmd_createnpc,
      cmd_enterfight,
      cmd_deleteactor, // 40
      cmd_gainmoney,
      cmd_usemoney,
      cmd_setmoney,
      cmd_learnmagic,
      cmd_sale, // 45
      cmd_npcmovemod,
      cmd_message,
      cmd_deletegoods,
      cmd_resumeactorhp,
      cmd_actorlayerup, // 50
      cmd_boxopen,
      cmd_delallnpc,
      cmd_npcstep,
      cmd_setscenename,
      cmd_showscenename, // 55
      cmd_showscreen,
      cmd_usegoods,
      cmd_attribtest,
      cmd_attribset,
      cmd_attribadd, // 60
      cmd_showgut,
      cmd_usegoodsnum,
      cmd_randrade,
      cmd_menu,
      cmd_testmoney, // 65
      cmd_callchapter,
      cmd_discmp,
      cmd_return,
      cmd_timemsg,
      cmd_disablesave, // 70
      cmd_enablesave,
      cmd_gamesave,
      cmd_seteventtimer,
      cmd_enableshowpos,
      cmd_disableshowpos, // 75
      cmd_setto,
      cmd_testgoodsnum,
      cmd_setfightmiss,
      cmd_setarmstoss,
    ];
  }

  private loadGut(gut: ResGut): ScriptProcess {
    const code = gut.scriptData;
    let pointer = 0;
    const map = new Map<number, number>();
    let address = 0;
    const commands: Command[] = [];

    while (pointer < code.length) {
      map.set(pointer, address);
      ++address;
      const cmdCode = code[pointer] & 0xff;
      const cmdMaker = this.instructions[cmdCode];
      if (!cmdMaker) {
        // Unknown opcode: the original devices stop here too in practice.
        // Treat it as the end of the script so the rest of the game runs.
        const msg = `ECMD: ${cmdCode} at ${pointer} (gut ${gut.type}-${gut.index})`;
        this.decodeWarnings.push(msg);
        warnOnce(`ecmd:${gut.type}:${gut.index}`, msg + "; script truncated");
        if (ScriptVM.strict) throw new Error(msg);
        commands.push(makeCommand(0, () => {
          this.game.mainScene.exitScript();
          return null;
        }));
        break;
      }
      const cmd = cmdMaker(code, pointer + 1);
      commands.push(cmd);
      pointer += cmd.len + 1;
    }

    const events = gut.sceneEvent;
    const eventIndex: number[] = new Array(events.length);
    for (let i = 0; i < events.length; i++) {
      if (events[i] === 0) {
        eventIndex[i] = -1;
      } else {
        const idx = map.get(events[i] - events.length * 2 - 3);
        if (idx === undefined) {
          const msg = `Bad address for event ${i + 1} in gut ${gut.type}-${gut.index}`;
          this.decodeWarnings.push(msg);
          if (ScriptVM.strict) throw new Error(msg);
          eventIndex[i] = -1;
        } else {
          eventIndex[i] = idx;
        }
      }
    }
    return new ScriptProcess(commands, eventIndex, map, events.length * 2 + 3);
  }

  loadScript(type: number, index: number): ScriptProcess {
    const gut = DatLib.getRes(ResType.GUT, type, index) as ResGut;
    return this.loadGut(gut);
  }
}
