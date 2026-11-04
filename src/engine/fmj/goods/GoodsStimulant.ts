// Port of fmj/goods/GoodsStimulant.kt — 12 stimulants
import { BaseGoods } from "./BaseGoods";

export class GoodsStimulant extends BaseGoods {
  public mdfPercent = 0;
  public matPercent = 0;
  public mSpeedPercent = 0;
  private mForAll = false;

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mdfPercent = buf[offset + 0x18] & 0xff;
    this.matPercent = buf[offset + 0x19] & 0xff;
    this.mSpeedPercent = buf[offset + 0x1b] & 0xff;
    this.mForAll = (buf[offset + 0x1c] & 0x10) !== 0;
  }

  effectAll(): boolean {
    return this.mForAll;
  }
}
