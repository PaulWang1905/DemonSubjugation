// Port of fmj/goods/GoodsDecorations.kt — 06 decorations
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { MagicAttack } from "../magic/MagicAttack";
import { GoodsEquipment } from "./GoodsEquipment";

export class GoodsDecorations extends GoodsEquipment {
  public mMp = 0; // MP restored/lost per combat round
  public mHp = 0; // HP restored/lost per combat round
  private mMagic = 0; // combined-magic index

  get coopMagic(): MagicAttack {
    return DatLib.getRes(ResType.MRS, 1, this.mMagic) as unknown as MagicAttack;
  }

  protected setOtherData(buf: Int8Array, offset: number): void {
    const s1 = ResBase.get1ByteSInt;
    this.mMp = s1(buf, offset + 0x16);
    this.mHp = s1(buf, offset + 0x17);
    this.mdf = s1(buf, offset + 0x18);
    this.mat = buf[offset + 0x19] & 0xff;
    this.mlingli = s1(buf, offset + 0x1a);
    this.mSpeed = s1(buf, offset + 0x1b);
    this.mMagic = buf[offset + 0x1c] & 0xff;
    this.mLuck = s1(buf, offset + 0x1d);
  }
}
