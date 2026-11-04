// Port of fmj/goods/GoodsMedicineLife.kt — 10 revival medicine
import { Player } from "../characters/Player";
import { BaseGoods } from "./BaseGoods";
import type { IEatMedicine } from "./IEatMedicine";

export class GoodsMedicineLife extends BaseGoods implements IEatMedicine {
  private mPercent = 0;

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mPercent = buf[offset + 0x17] & 0xff;
    if (this.mPercent > 100) this.mPercent = 100;
  }

  eat(player: Player): void {
    // Faithful to the original port, which restores MP here.
    player.mp = player.mp + Math.trunc((player.maxMP * this.mPercent) / 100);
    if (player.mp > player.maxMP) player.mp = player.maxMP;
    Player.sGoodsList.deleteGoods(this.type, this.index);
  }
}
