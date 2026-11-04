// Port of fmj/views/BaseScreen.kt (GameNode / Control / Game / BaseScreen).
import type { Canvas } from "../../graphics";
import type { ScreenViewType } from "../Global";
import type { Player } from "../characters/Player";
import type { ScreenMainGame } from "../scene/ScreenMainGame";
import type { ScriptVM } from "../script/ScriptVM";

export interface GameNode {
  readonly parent: GameNode;
  readonly game: Game;
  popScreen(): void;
  pushScreen(scr: BaseScreen): void;
  getCurScreen(): BaseScreen;
  showMessage(msg: string, delay?: number): void;
}

/** A node that forwards screen-stack operations to its parent. */
export abstract class Control implements GameNode {
  abstract readonly parent: GameNode;

  get game(): Game {
    return this.parent.game;
  }
  popScreen(): void {
    this.parent.popScreen();
  }
  pushScreen(scr: BaseScreen): void {
    this.parent.pushScreen(scr);
  }
  getCurScreen(): BaseScreen {
    return this.parent.getCurScreen();
  }
  showMessage(msg: string, delay = 1000): void {
    this.parent.showMessage(msg, delay);
  }
}

export interface Game extends GameNode {
  changeScreen(screenType: ScreenViewType): void;
  readonly mainScene: ScreenMainGame;
  readonly vm: ScriptVM;
  readonly playerList: Player[];
  triggerEvent(eventId: number): void;
  gotoAddress(address: number): void;
  exitScript(): void;
}

export abstract class BaseScreen extends Control {
  get isPopup(): boolean {
    return false;
  }
  abstract update(delta: number): void;
  abstract draw(canvas: Canvas): void;
  abstract onKeyDown(key: number): void;
  abstract onKeyUp(key: number): void;
  willAppear(): void {}
}

/** Helper for the many anonymous `object : BaseScreen { ... }` screens. */
export interface ScreenImpl {
  isPopup?: boolean;
  update?(this: BaseScreen, delta: number): void;
  draw(this: BaseScreen, canvas: Canvas): void;
  onKeyDown?(this: BaseScreen, key: number): void;
  onKeyUp?(this: BaseScreen, key: number): void;
  willAppear?(this: BaseScreen): void;
}

class AnonScreen extends BaseScreen {
  constructor(
    readonly parent: GameNode,
    private readonly impl: ScreenImpl,
  ) {
    super();
  }
  get isPopup(): boolean {
    return this.impl.isPopup ?? false;
  }
  update(delta: number): void {
    this.impl.update?.call(this, delta);
  }
  draw(canvas: Canvas): void {
    this.impl.draw.call(this, canvas);
  }
  onKeyDown(key: number): void {
    this.impl.onKeyDown?.call(this, key);
  }
  onKeyUp(key: number): void {
    this.impl.onKeyUp?.call(this, key);
  }
  willAppear(): void {
    this.impl.willAppear?.call(this);
  }
}

export function screen(parent: GameNode, impl: ScreenImpl): BaseScreen {
  return new AnonScreen(parent, impl);
}
