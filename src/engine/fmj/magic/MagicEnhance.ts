// Port of fmj/magic/MagicEnhance.kt — 02 enhancement
import { BaseMagic } from "./BaseMagic";

export class MagicEnhance extends BaseMagic {
  public mDf = 0;
  public mAt = 0;
  public mRound = 0;
  public mBuff = 0;

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mDf = buf[offset + 0x16] & 0xff;
    this.mAt = buf[offset + 0x17] & 0xff;
    this.mRound = (buf[offset + 0x18] >> 4) & 0xf;
    this.mBuff = buf[offset + 0x19] & 0xff;
  }
}
