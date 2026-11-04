// Port of fmj/characters/NPC.kt
import { Random, type Coder, type ObjectInput, type ObjectOutput } from "../../java";
import { ResBase } from "../lib/ResBase";
import { Character, CharacterState, stateFromInt } from "./Character";
import { Direction, directionFromInt } from "./Direction";
import { WalkingSprite } from "./WalkingSprite";

export interface ICanWalk {
  canWalk(x: number, y: number): boolean;
}

export class NPC extends Character implements Coder {
  protected mDelay = 0;
  private mCanWalk: ICanWalk | null = null;
  private readonly mRandom = new Random();
  private mPauseCnt = 0;
  private mActiveCnt = 0;
  private mWalkingCnt = 0;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.state = stateFromInt(buf[offset + 4] & 0xff);
    this.name = ResBase.getString(buf, offset + 9);
    this.mDelay = buf[offset + 0x15] & 0xff;
    if (this.mDelay === 0) this.state = CharacterState.STOP;
    this.setWalkingSprite(new WalkingSprite(2, buf[offset + 0x16] & 0xff));
    this.direction = directionFromInt(buf[offset + 2] & 0xff);
    this.step = buf[offset + 3] & 0xff;
  }

  encode(out: ObjectOutput): void {
    out.writeInt(this.type);
    out.writeInt(this.index);
    out.writeInt(this.state);
    out.writeString(this.name);
    out.writeInt(this.mDelay);
    out.writeInt(this.walkingSpriteId);
    out.writeInt(this.direction);
    out.writeInt(this.step);
    out.writeLong(this.mPauseCnt);
    out.writeLong(this.mActiveCnt);
    out.writeLong(this.mWalkingCnt);
    out.writeInt(this.posInMap.x);
    out.writeInt(this.posInMap.y);
  }

  decode(coder: ObjectInput): void {
    this.type = coder.readInt();
    this.index = coder.readInt();
    this.state = stateFromInt(coder.readInt());
    this.name = coder.readString();
    this.mDelay = coder.readInt();
    this.setWalkingSprite(new WalkingSprite(2, coder.readInt()));
    this.direction = directionFromInt(coder.readInt());
    this.step = coder.readInt();
    this.mPauseCnt = coder.readLong();
    this.mActiveCnt = coder.readLong();
    this.mWalkingCnt = coder.readLong();
    this.setPosInMap(coder.readInt(), coder.readInt());
  }

  setICanWalk(arg: ICanWalk): void {
    this.mCanWalk = arg;
  }

  update(delta: number): void {
    switch (this.state) {
      case CharacterState.PAUSE:
        this.mPauseCnt -= delta;
        if (this.mPauseCnt < 0) this.state = CharacterState.WALKING;
        break;
      case CharacterState.FORCE_MOVE:
      case CharacterState.WALKING:
        this.mWalkingCnt += delta;
        if (this.mWalkingCnt < 500) return;
        this.mWalkingCnt = 0;
        if (this.mRandom.nextInt(5) === 0) {
          this.mPauseCnt = this.mDelay * 100;
          this.state = CharacterState.PAUSE;
        } else if (this.mRandom.nextInt(5) === 0) {
          const dirs = [Direction.North, Direction.East, Direction.South, Direction.West];
          this.direction = dirs[this.mRandom.nextInt(4)];
          this.walk();
        } else {
          this.walk();
        }
        break;
      case CharacterState.STOP:
        break;
      case CharacterState.ACTIVE:
        this.mActiveCnt += delta;
        if (this.mActiveCnt > 100) {
          this.mActiveCnt = 0;
          this.walkStay();
        }
        break;
    }
  }

  walk(d?: Direction): void {
    if (d !== undefined) {
      super.walk(d);
      return;
    }
    let x = this.posInMap.x;
    let y = this.posInMap.y;
    switch (this.direction) {
      case Direction.North: --y; break;
      case Direction.East: ++x; break;
      case Direction.South: ++y; break;
      case Direction.West: --x; break;
    }
    if (this.mCanWalk!.canWalk(x, y)) super.walk();
  }

  get isEmpty(): boolean {
    return this.type === 0;
  }

  private static _empty: NPC | null = null;
  static get empty(): NPC {
    if (!NPC._empty) NPC._empty = new NPC();
    return NPC._empty;
  }
}
