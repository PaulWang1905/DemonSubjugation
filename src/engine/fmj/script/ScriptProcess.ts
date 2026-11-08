// Port of fmj/script/ScriptProcess.kt — one compiled script being executed.
import { EngineSettings } from "../config/EngineSettings";
import type { Canvas } from "../../graphics";
import type { ObjectInput, ObjectOutput } from "../../java";
import type { Command, Operate } from "./Operate";

export class ScriptProcess {
  /** Index in `commands` of the command being executed. */
  private mCurExeOperateIndex = 0;
  private curOp: Operate | null = null;
  running = false;
  prev: ScriptProcess | null = null;
  timer = 0;
  timerCounter = 0;
  timerEventId = 0;
  goonExecute = true;

  /**
   * @param commands the script's commands
   * @param eventIndex eventIndex[i] = command index run for event i+1, -1 if none
   * @param mMapAddrOffsetIndex address offset -> command index
   * @param mHeaderCnt bytes preceding the code
   */
  constructor(
    private readonly commands: Command[],
    private readonly eventIndex: number[],
    private readonly mMapAddrOffsetIndex: Map<number, number>,
    private readonly mHeaderCnt: number,
  ) {}

  /** Debug view: index of the command being executed and its operation. */
  get debugState(): { index: number; total: number; op: string | null; goon: boolean } {
    return {
      index: this.mCurExeOperateIndex,
      total: this.commands.length,
      op: this.curOp ? this.curOp.constructor.name : null,
      goon: this.goonExecute,
    };
  }

  start(): void {
    this.running = true;
    this.goonExecute = true;
  }

  stop(): void {
    this.running = false;
    this.goonExecute = false;
  }

  /** Trigger a map event (scene change, NPC talk, chest...). */
  triggerEvent(eventId: number): boolean {
    if (eventId > this.eventIndex.length) {
      this.stop();
      return false;
    }
    const index = this.eventIndex[eventId - 1] ?? -1;
    if (index !== -1) {
      this.mCurExeOperateIndex = index;
      this.curOp = null;
      this.start();
      return true;
    }
    this.stop();
    return false;
  }

  gotoAddress(address: number): void {
    const idx = this.mMapAddrOffsetIndex.get(address - this.mHeaderCnt);
    if (idx === undefined) {
      // Corrupt jump (seen in some community archives): end the script
      // instead of crashing the whole game.
      console.warn("Script jumps to an invalid address", address, "- stopping the script");
      this.stop();
      return;
    }
    this.mCurExeOperateIndex = idx;
    if (this.curOp != null) {
      // called outside of Command.run()
      this.curOp = null;
      --this.mCurExeOperateIndex;
    } else {
      // called from within Command.run(): resume on the next process()
      this.goonExecute = false;
    }
    this.running = true;
  }

  /**
   * Run instructions until one has to wait (a message, a walk, a fight...).
   * Jumps go on at once, as on the device; fmj.kt waited a tick after each,
   * so loops in scripts took seconds. A script looping without ever waiting
   * gets INSTRUCTIONS_PER_TICK at a time, so the page cannot hang on it.
   */
  process(): void {
    if (this.curOp != null) return;
    for (let budget = ScriptProcess.INSTRUCTIONS_PER_TICK; budget > 0 && this.goonExecute && this.mCurExeOperateIndex < this.commands.length; budget--) {
      const cmd = this.commands[this.mCurExeOperateIndex];
      this.curOp = cmd.run(this);
      if (this.curOp != null) return;
      if (!this.goonExecute) {
        // a jump (the index is already set) or the script stopped
        this.goonExecute = true;
        if (!this.running) return;
        continue;
      }
      ++this.mCurExeOperateIndex;
    }
  }

  static readonly INSTRUCTIONS_PER_TICK = 100_000;

  update(delta: number): void {
    const op = this.curOp;
    // Note: gotoAddress() called from inside update() pre-decrements the
    // index to compensate for the increment below, exactly like the original.
    if (op && !op.update(delta)) {
      this.curOp = null;
      ++this.mCurExeOperateIndex;
    }
  }

  timerStep(delta: number): void {
    if (this.timer > 0 && this.timerEventId > 0) {
      this.timerCounter -= delta;
      if (this.timerCounter <= 0) {
        const id = this.timerEventId;
        if (EngineSettings.originalDamageFormula) {
          // the original's timer fires once (map loop, _00214000)
          this.timer = 0;
          this.timerEventId = 0;
        } else this.timerCounter += this.timer;
        this.triggerEvent(id);
      }
    }
  }

  setTimer(timer: number, eventId: number): void {
    this.timer = timer * 500;
    this.timerCounter = this.timer;
    this.timerEventId = eventId;
  }

  draw(canvas: Canvas): void {
    this.curOp?.draw(canvas);
  }

  keyDown(key: number): void {
    this.curOp?.onKeyDown(key);
  }

  keyUp(key: number): void {
    this.curOp?.onKeyUp(key);
  }

  encode(coder: ObjectOutput): void {
    coder.writeInt(this.timer);
    coder.writeInt(this.timerCounter);
    coder.writeInt(this.timerEventId);
  }

  decode(coder: ObjectInput): void {
    this.timer = coder.readInt();
    this.timerCounter = coder.readInt();
    this.timerEventId = coder.readInt();
  }
}
