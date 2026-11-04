// Port of fmj/Game.kt — the game root: owns the screen stack and VM.
import { Global, ScreenViewType } from "./Global";
import type { Player } from "./characters/Player";
import { ScreenMainGame } from "./scene/ScreenMainGame";
import { ScriptVM } from "./script/ScriptVM";
import type { BaseScreen, Game } from "./views/BaseScreen";
import { ScreenAnimation } from "./views/ScreenAnimation";
import { ScreenMenu } from "./views/ScreenMenu";
import { SaveLoadOperate, ScreenSaveLoadGame } from "./views/ScreenSaveLoadGame";
import { ScreenStack } from "./views/ScreenStack";
import { Bitmap, Canvas } from "../graphics";

export class MainGame implements Game {
  readonly canvas = new Canvas(new Bitmap(Global.SCREEN_WIDTH, Global.SCREEN_HEIGHT));
  private readonly screenStack: ScreenStack;
  readonly vm: ScriptVM;
  mainScene: ScreenMainGame;
  readonly playerList: Player[] = [];

  constructor() {
    this.screenStack = new ScreenStack(this);
    this.vm = new ScriptVM(this);
    this.mainScene = new ScreenMainGame(this, this.vm);
  }

  get parent(): ScreenStack {
    return this.screenStack;
  }
  get game(): Game {
    return this;
  }

  start(): void {
    this.screenStack.pushScreen(new ScreenAnimation(this, 247));
  }

  draw(): void {
    this.screenStack.draw(this.canvas);
  }

  update(delta: number): void {
    this.screenStack.update(delta);
  }

  keyDown(key: number): void {
    this.screenStack.keyDown(key);
  }

  keyUp(key: number): void {
    this.screenStack.keyUp(key);
  }

  // GameNode / Control
  popScreen(): void {
    this.screenStack.popScreen();
  }
  pushScreen(scr: BaseScreen): void {
    this.screenStack.pushScreen(scr);
  }
  getCurScreen(): BaseScreen {
    return this.screenStack.getCurScreen();
  }
  showMessage(msg: string, delay = 1000): void {
    this.screenStack.showMessage(msg, delay);
  }

  // Game
  triggerEvent(eventId: number): void {
    this.mainScene.triggerEvent(eventId);
  }
  gotoAddress(address: number): void {
    this.mainScene.gotoAddress(address);
  }
  exitScript(): void {
    this.mainScene.exitScript();
  }

  changeScreen(screenType: ScreenViewType): void {
    let scr: BaseScreen;
    switch (screenType) {
      case ScreenViewType.SCREEN_DEV_LOGO: scr = new ScreenAnimation(this, 247); break;
      case ScreenViewType.SCREEN_GAME_LOGO: scr = new ScreenAnimation(this, 248); break;
      case ScreenViewType.SCREEN_MENU: scr = new ScreenMenu(this); break;
      case ScreenViewType.SCREEN_MAIN_GAME:
        this.mainScene = new ScreenMainGame(this, this.vm);
        scr = this.mainScene;
        break;
      case ScreenViewType.SCREEN_GAME_FAIL: scr = new ScreenAnimation(this, 249); break;
      case ScreenViewType.SCREEN_SAVE_GAME: scr = new ScreenSaveLoadGame(this, SaveLoadOperate.SAVE); break;
      case ScreenViewType.SCREEN_LOAD_GAME: scr = new ScreenSaveLoadGame(this, SaveLoadOperate.LOAD); break;
    }
    this.screenStack.changeScreen(scr);
  }
}
