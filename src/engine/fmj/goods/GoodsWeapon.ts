// Port of fmj/goods/GoodsWeapon.kt — 07 weapons
import type { Player } from "../characters/Player";
import { GoodsEquipment } from "./GoodsEquipment";

export class GoodsWeapon extends GoodsEquipment {
  isWeapon(): boolean {
    return true;
  }

  putOn(p: Player): void {
    super.putOn(p);
    p.addAtbuff(this.mBitEffect, this.sumRound);
  }

  takeOff(p: Player): void {
    super.takeOff(p);
    p.delAtbuff(this.mBitEffect);
  }

  attackAll(): boolean {
    return (this.mBitEffect & 0x10) !== 0;
  }
}
