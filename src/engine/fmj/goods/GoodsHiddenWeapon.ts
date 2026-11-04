// Port of fmj/goods/GoodsHiddenWeapon.kt — 08 thrown weapons
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResSrs } from "../lib/ResSrs";
import { BaseGoods } from "./BaseGoods";

export class GoodsHiddenWeapon extends BaseGoods {
  /** >0: enemy loses that much HP; <0: drained to the thrower. */
  affectHp = 0;
  /** >0: enemy loses that much MP; <0: drained to the thrower. */
  affectMp = 0;
  ani: ResSrs | null = null;
  private mBitMask = 0; // 000 all? poison confusion seal sleep

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.affectHp = ResBase.get2BytesSInt(buf, offset + 0x16);
    this.affectMp = ResBase.get2BytesSInt(buf, offset + 0x18);
    const type = buf[offset + 0x1b] & 0xff;
    const index = buf[offset + 0x1a] & 0xff;
    if (type > 0 && index > 0) this.ani = DatLib.getRes(ResType.SRS, type, index) as ResSrs | null;
    this.mBitMask = buf[offset + 0x1c] & 0xff;
  }

  effectAll(): boolean {
    return (this.mBitMask & 0x10) !== 0;
  }
}
