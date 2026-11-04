// Port of fmj/goods/GoodsMedicineChg4Ever.kt — 11 elixirs (permanent stat changes)
import { Player } from "../characters/Player";
import { ResBase } from "../lib/ResBase";
import { BaseGoods } from "./BaseGoods";
import type { IEatMedicine } from "./IEatMedicine";

export class GoodsMedicineChg4Ever extends BaseGoods implements IEatMedicine {
  private mMpMax = 0;
  private mHpMax = 0;
  private mdf = 0;
  private mat = 0;
  private mling = 0;
  private mSpeed = 0;
  private mLuck = 0;

  protected setOtherData(buf: Int8Array, offset: number): void {
    const s1 = ResBase.get1ByteSInt;
    this.mMpMax = s1(buf, offset + 0x16);
    this.mHpMax = s1(buf, offset + 0x17);
    this.mdf = s1(buf, offset + 0x18);
    this.mat = s1(buf, offset + 0x19);
    this.mling = s1(buf, offset + 0x1a);
    this.mSpeed = s1(buf, offset + 0x1b);
    this.mLuck = s1(buf, offset + 0x1d);
  }

  eat(player: Player): void {
    player.maxMP = player.maxMP + this.mMpMax;
    player.maxHP = player.maxHP + this.mHpMax;
    player.defend = player.defend + this.mdf;
    player.attack = player.attack + this.mat;
    player.lingli = player.lingli + this.mling;
    player.speed = player.speed + this.mSpeed;
    player.luck = player.luck + this.mLuck;
    Player.sGoodsList.deleteGoods(this.type, this.index);
  }
}
