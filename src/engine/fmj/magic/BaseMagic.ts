// Port of fmj/magic/BaseMagic.kt
import type { FightingCharacter } from "../characters/FightingCharacter";
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResSrs } from "../lib/ResSrs";

export abstract class BaseMagic extends ResBase {
  roundNum = 0;
  isForAll = false;
  costMp = 0;
  magicAni: ResSrs | null = null;
  magicName = "";
  magicDescription = "";

  protected abstract setOtherData(buf: Int8Array, offset: number): void;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.roundNum = buf[offset + 3] & 0x7f;
    this.isForAll = (buf[offset + 3] & 0x80) !== 0;
    this.costMp = buf[offset + 4];
    this.magicAni = DatLib.getRes(ResType.SRS, 2, buf[offset + 5] & 0xff) as ResSrs;
    this.magicName = ResBase.getString(buf, offset + 6);
    if ((buf[offset + 2] & 0xff) > 0x70) {
      // description too long (the original also patches the archive buffer)
      buf[offset + 0x70] = 0;
    }
    this.magicDescription = ResBase.getString(buf, offset + 0x1a);
    this.setOtherData(buf, offset);
  }

  use(_src: FightingCharacter, _dst: FightingCharacter | FightingCharacter[]): void {}
}
