// Port of fmj/goods/GoodsMedicineChg4Ever.kt — 11 elixirs (permanent stat changes)
import { applyItemChange } from "./ItemRules";
import { Player } from "../characters/Player";
import { BaseGoods } from "./BaseGoods";
import type { IEatMedicine } from "./IEatMedicine";

export class GoodsMedicineChg4Ever extends BaseGoods implements IEatMedicine {
  protected setOtherData(_buf: Int8Array, _offset: number): void {}

  /** Permanent changes, sign-and-magnitude like equipment (_0022111F type 11). */
  eat(player: Player): void {
    applyItemChange(11, null, this.raw, player);
    Player.sGoodsList.deleteGoods(this.type, this.index);
  }
}
