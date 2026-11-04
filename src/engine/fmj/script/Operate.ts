// Port of fmj/script/Operate.kt, OperateAdapter.kt, OperateDrawOnce.kt
import type { Canvas } from "../../graphics";
import type { ScriptProcess } from "./ScriptProcess";

export interface Command {
  /** Instruction length in bytes. */
  readonly len: number;
  /** @returns an Operate to keep running, or null when the instruction is done */
  run(p: ScriptProcess): Operate | null;
}

export interface Operate {
  /** @returns false to leave the current operation */
  update(delta: number): boolean;
  draw(canvas: Canvas): void;
  onKeyDown(key: number): void;
  onKeyUp(key: number): void;
}

export abstract class OperateAdapter implements Operate {
  update(_delta: number): boolean {
    return false;
  }
  draw(_canvas: Canvas): void {}
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}
}

export abstract class OperateDrawOnce implements Operate {
  private drawCnt = 0;
  abstract drawOnce(canvas: Canvas): void;
  update(_delta: number): boolean {
    if (this.drawCnt >= 3) {
      this.drawCnt = 0;
      return false;
    }
    return true;
  }
  draw(canvas: Canvas): void {
    this.drawOnce(canvas);
    ++this.drawCnt;
  }
  onKeyDown(_key: number): void {}
  onKeyUp(_key: number): void {}
}

/** Build an Operate from an object literal (Kotlin `object : Operate {}`). */
export function operate(impl: Partial<Operate> & { update(delta: number): boolean }): Operate {
  return {
    update: impl.update.bind(impl),
    draw: impl.draw ? impl.draw.bind(impl) : () => {},
    onKeyDown: impl.onKeyDown ? impl.onKeyDown.bind(impl) : () => {},
    onKeyUp: impl.onKeyUp ? impl.onKeyUp.bind(impl) : () => {},
  };
}
