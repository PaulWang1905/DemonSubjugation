// Port of fmj/goods/GoodsMedicine.kt — 09 medicine, usable by anyone
import { Player } from "../characters/Player";
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResSrs } from "../lib/ResSrs";
import { BaseGoods } from "./BaseGoods";
import type { IEatMedicine } from "./IEatMedicine";

export class GoodsMedicine extends BaseGoods implements IEatMedicine {
  private mHp = 0;
  private mMp = 0;
  ani: ResSrs | null = null;
  private mBitMask = 0; // cures poison, confusion, seal, sleep

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mHp = ResBase.get2BytesInt(buf, offset + 0x16);
    this.mMp = ResBase.get2BytesInt(buf, offset + 0x18);
    const index = buf[offset + 0x1a] & 0xff;
    if (index > 0) this.ani = DatLib.getRes(ResType.SRS, 2, index) as ResSrs | null;
    this.mBitMask = buf[offset + 0x1c] & 0xff;
  }

  eat(player: Player): void {
    player.hp = player.hp + this.mHp;
    if (player.hp > player.maxHP) player.hp = player.maxHP;
    player.mp = player.mp + this.mMp;
    if (player.mp > player.maxMP) player.mp = player.maxMP;
    player.delDebuff(this.mBitMask);
    Player.sGoodsList.deleteGoods(this.type, this.index);
  }

  effectAll(): boolean {
    return (this.mBitMask & 0x10) !== 0;
  }
}
