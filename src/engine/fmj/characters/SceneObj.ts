// Port of fmj/characters/SceneObj.kt — static scene objects (boxes, lamps...).
import type { ObjectInput, ObjectOutput } from "../../java";
import { ResBase } from "../lib/ResBase";
import { stateFromInt } from "./Character";
import { Direction, directionFromInt } from "./Direction";
import { NPC } from "./NPC";
import { WalkingSprite } from "./WalkingSprite";

export class SceneObj extends NPC {
  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.state = stateFromInt(buf[offset + 4] & 0xff);
    this.name = ResBase.getString(buf, offset + 9);
    this.mDelay = buf[offset + 0x15] & 0xff;
    this.setWalkingSprite(new WalkingSprite(4, buf[offset + 0x16] & 0xff));
    this.direction = Direction.North;
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
    out.writeInt(this.posInMap.x);
    out.writeInt(this.posInMap.y);
  }

  decode(coder: ObjectInput): void {
    this.type = coder.readInt();
    this.index = coder.readInt();
    this.state = stateFromInt(coder.readInt());
    this.name = coder.readString();
    this.mDelay = coder.readInt();
    this.setWalkingSprite(new WalkingSprite(4, coder.readInt()));
    this.direction = directionFromInt(coder.readInt());
    this.step = coder.readInt();
    this.setPosInMap(coder.readInt(), coder.readInt());
  }

  walk(_d?: Direction): void {}
  /** Turning in place is disabled, but ACTIVE objects still animate. */
  walkStay(d?: Direction): void {
    if (d === undefined) super.walkStay();
  }
}
