// Port of fmj/views/ScreenSaveLoadGame.kt
import { Global, ScreenViewType } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import { SaveLoadGame } from "../scene/SaveLoadGame";
import { ScriptResources } from "../script/ScriptResources";
import type { Canvas } from "../../graphics";
import { File, gbkBytes, objectInputOf, objectOutputOf } from "../../java";
import { BaseScreen, type GameNode } from "./BaseScreen";
import { ScreenMessageBox } from "./ScreenMessageBox";

export enum SaveLoadOperate {
  SAVE,
  LOAD,
}

const mFileNames = ["fmjsave0", "fmjsave1", "fmjsave2"];

export class ScreenSaveLoadGame extends BaseScreen {
  private readonly mTextPos = [
    [68, 28],
    [68, 51],
    [68, 74],
  ];
  private index = 0;
  private readonly mEmpty = "空档案    ";
  private readonly mText = [this.mEmpty, this.mEmpty, this.mEmpty];
  private readonly mHeadImgs: ResImage[][] = [[], [], []];
  private readonly mImgBg: ResImage;
  callback: (() => void) | null = null;

  constructor(
    readonly parent: GameNode,
    private readonly mOperate: SaveLoadOperate,
    /** Screens to pop after saving (3 from the in-game menu, 1 from the GAMESAVE command). */
    private readonly popDepth = 3,
  ) {
    super();
    this.mImgBg = DatLib.getRes(ResType.PIC, 2, mOperate === SaveLoadOperate.LOAD ? 16 : 15) as ResImage;
    for (let i = 0; i < 3; i++) {
      const file = new File("sav/" + mFileNames[i]);
      if (file.exists()) {
        try {
          this.mText[i] = this.format(this.getSceneNameAndHeads(file, this.mHeadImgs[i]));
        } catch (e) {
          console.warn("Unreadable save slot", i, e);
        }
      }
    }
  }

  private format(s: string): string {
    let tmp = s;
    const n = gbkBytes(this.mEmpty).length;
    while (gbkBytes(tmp).length < n) tmp += " ";
    return tmp;
  }

  private getSceneNameAndHeads(f: File, heads: ResImage[]): string {
    const file = objectInputOf(f);
    const name = file.readString();
    const actorNum = file.readInt();
    for (let i = 0; i < actorNum; i++) {
      heads.push(DatLib.getRes(ResType.PIC, 1, file.readInt()) as ResImage);
    }
    file.close();
    return name;
  }

  update(_delta: number): void {}

  draw(canvas: Canvas): void {
    this.mImgBg.draw(canvas, 1, 0, 0);
    for (let i = 0; i < this.mHeadImgs.length; i++) {
      for (let j = 0; j < this.mHeadImgs[i].length; j++) {
        this.mHeadImgs[i][j].draw(canvas, 7, 8 + 20 * j, this.mTextPos[i][1] - 6);
      }
    }
    for (let i = 0; i < 3; i++) TextRender.drawText(canvas, this.mText[i], this.mTextPos[i][0], this.mTextPos[i][1]);
    TextRender.drawSelText(canvas, this.mText[this.index], this.mTextPos[this.index][0], this.mTextPos[this.index][1]);
  }

  onKeyDown(key: number): void {
    if (key === Global.KEY_UP) {
      if (--this.index < 0) this.index = 2;
    } else if (key === Global.KEY_DOWN) {
      if (++this.index > 2) this.index = 0;
    }
  }

  onKeyUp(key: number): void {
    if (key === Global.KEY_CANCEL) {
      this.popScreen();
      this.callback?.();
    } else if (key === Global.KEY_ENTER) {
      const file = new File("sav/" + mFileNames[this.index]);
      if (this.mOperate === SaveLoadOperate.LOAD) {
        if (!file.exists()) return;
        try {
          this.loadGame(file);
        } catch (e) {
          console.error("Failed to load save", e);
          return;
        }
        SaveLoadGame.startNewGame = false;
        this.game.changeScreen(ScreenViewType.SCREEN_MAIN_GAME);
      } else {
        const done = () => {
          this.saveGame(file);
          for (let i = 0; i < this.popDepth; i++) this.popScreen();
          this.callback?.();
        };
        if (!file.exists()) {
          file.createNewFile();
          done();
        } else {
          this.pushScreen(new ScreenMessageBox(this, "覆盖原进度?", done));
        }
      }
    }
  }

  private loadGame(file: File): void {
    const ioIn = objectInputOf(file);
    SaveLoadGame.read(this.game, ioIn);
    ScriptResources.read(ioIn);
    ioIn.close();
  }

  saveGame(file: File): void {
    const o = objectOutputOf(file);
    SaveLoadGame.write(this.game, o);
    ScriptResources.write(o);
    o.close();
  }
}
