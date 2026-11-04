// Port of fmj/views/ScreenStack.kt
import { Util } from "../graphics/Util";
import type { Canvas } from "../../graphics";
import { Stack } from "../../java";
import { screen, type BaseScreen, type Game, type GameNode } from "./BaseScreen";

export class ScreenStack implements GameNode {
  private readonly mScreenStack = Stack.create<BaseScreen>();

  constructor(readonly parent: GameNode) {}

  get game(): Game {
    return this.parent.game;
  }

  clear(): void {
    this.mScreenStack.clear();
  }

  keyDown(key: number): void {
    this.mScreenStack.peek()?.onKeyDown(key);
  }

  keyUp(key: number): void {
    this.mScreenStack.peek()?.onKeyUp(key);
  }

  changeScreen(scr: BaseScreen): void {
    this.mScreenStack.clear();
    this.mScreenStack.push(scr);
    scr.willAppear();
  }

  pushScreen(scr: BaseScreen): void {
    this.mScreenStack.push(scr);
    scr.willAppear();
  }

  popScreen(): void {
    this.mScreenStack.pop();
    this.mScreenStack.peek()?.willAppear();
  }

  getCurScreen(): BaseScreen {
    return this.mScreenStack.peek()!;
  }

  get depth(): number {
    return this.mScreenStack.size;
  }

  showMessage(msg: string, delay = 1000): void {
    let cnt = 0;
    this.pushScreen(
      screen(this, {
        isPopup: true,
        update(delta) {
          cnt += delta;
          if (cnt > delay) this.popScreen();
        },
        draw(canvas) {
          Util.showMessage(canvas, msg);
        },
        onKeyDown() {
          this.popScreen();
        },
      }),
    );
  }

  draw(canvas: Canvas): void {
    // Iterate over a snapshot: a screen may push/pop while drawing.
    for (const scr of [...this.mScreenStack.toArray()]) scr.draw(canvas);
  }

  update(delta: number): void {
    this.mScreenStack.peek()?.update(delta);
  }
}
