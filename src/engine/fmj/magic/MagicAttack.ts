// Port of fmj/magic/MagicAttack.kt — 01 attack magic
import type { FightingCharacter } from "../characters/FightingCharacter";
import { ResBase } from "../lib/ResBase";
import { BaseMagic } from "./BaseMagic";

export class MagicAttack extends BaseMagic {
  private mHp = 0; // >0: HP damage base, <0: HP drain base
  public mMp = 0; // >0: MP damage base, <0: MP drain base
  public mDf = 0; // 0-100: defence reduction %
  public mAt = 0; // 0-100: attack reduction %
  public mBuff = 0; // high nibble rounds, low nibble poison/confusion/seal/sleep
  public mDebuff = 0; // 0-100: speed reduction %

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mHp = ResBase.get2BytesSInt(buf, offset + 0x12);
    this.mMp = ResBase.get2BytesSInt(buf, offset + 0x14);
    this.mDf = buf[offset + 0x16] & 0xff;
    this.mAt = buf[offset + 0x17] & 0xff;
    this.mBuff = buf[offset + 0x18] & 0xff;
    this.mDebuff = buf[offset + 0x19] & 0xff;
  }

  use(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): void {
    src.mp = src.mp - this.costMp;
    const targets = Array.isArray(dst) ? dst : [dst];
    for (const fc of targets) fc.hp = fc.hp - this.mHp;
  }
}
