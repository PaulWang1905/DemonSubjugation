// Port of fmj/goods/GoodsEquipment.kt — 01 hats, 02 clothes, 03 shoes, 04 armour, 05 bracers
import type { Player } from "../characters/Player";
import { ResBase } from "../lib/ResBase";
import { ScriptResources } from "../script/ScriptResources";
import { BaseGoods } from "./BaseGoods";

export class GoodsEquipment extends BaseGoods {
  protected mMpMax = 0;
  protected mHpMax = 0;
  protected mdf = 0;
  protected mat = 0;
  protected mlingli = 0;
  protected mSpeed = 0;
  /** 0,0,0,0 (weapons: attack-all), poison, confusion, seal, sleep */
  protected mBitEffect = 0;
  protected mLuck = 0;

  protected setOtherData(buf: Int8Array, offset: number): void {
    const s1 = ResBase.get1ByteSInt;
    this.mMpMax = s1(buf, offset + 0x16);
    this.mHpMax = s1(buf, offset + 0x17);
    this.mdf = s1(buf, offset + 0x18);
    this.mat = buf[offset + 0x19] & 0xff;
    this.mlingli = s1(buf, offset + 0x1a);
    this.mSpeed = s1(buf, offset + 0x1b);
    this.mBitEffect = buf[offset + 0x1c] & 0xff;
    this.mLuck = s1(buf, offset + 0x1d);
  }

  /** Replaces Kotlin's `this is GoodsWeapon` check. */
  isWeapon(): boolean {
    return false;
  }

  putOn(p: Player): void {
    if (this.canPlayerUse(p.index)) {
      p.maxMP = p.maxMP + this.mMpMax;
      p.maxHP = p.maxHP + this.mHpMax;
      p.defend = p.defend + this.mdf;
      p.attack = p.attack + this.mat;
      p.lingli = p.lingli + this.mlingli;
      p.speed = p.speed + this.mSpeed;
      if (!this.isWeapon()) p.addBuff(this.mBitEffect);
      p.luck = p.luck + this.mLuck;
      if (this.eventId !== 0) ScriptResources.setEvent(this.eventId);
    }
  }

  takeOff(p: Player): void {
    p.maxMP = p.maxMP - this.mMpMax;
    p.maxHP = p.maxHP - this.mHpMax;
    p.defend = p.defend - this.mdf;
    p.attack = p.attack - this.mat;
    p.lingli = p.lingli - this.mlingli;
    p.speed = p.speed - this.mSpeed;
    if (!this.isWeapon()) p.delBuff(this.mBitEffect);
    p.luck = p.luck - this.mLuck;
    if (this.eventId !== 0) ScriptResources.clearEvent(this.eventId);
  }
}
