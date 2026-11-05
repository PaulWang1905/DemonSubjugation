// Port of fmj/goods/GoodsEquipment.kt — 01 hats, 02 clothes, 03 shoes, 04 armour, 05 bracers
import type { Player } from "../characters/Player";
import { ResBase } from "../lib/ResBase";
import { ScriptResources } from "../script/ScriptResources";
import { BaseGoods } from "./BaseGoods";
import { applyItemChange } from "./ItemRules";

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

  /** Armour (types 1-5) protects against the statuses in byte 0x1c; accessories use it for their combined spell. */
  get isArmour(): boolean {
    return this.type >= 1 && this.type <= 5;
  }

  /**
   * Put on as the original does (_0022111F): stat bytes are sign-and-
   * magnitude and subtraction stops at 0 (fmj.kt read them as plain signed
   * bytes, so 0x83 meant -125 instead of -3).
   */
  /** Equipping rewrites the fields a script may have set (see Player.scriptOverrides). */
  protected clearOverrides(p: Player): void {
    const o = p.scriptOverrides;
    if (this.isArmour) delete o.immune;
    else if (this.type === 7) delete o.attackStatus;
    else if (this.type === 6) {
      delete o.combo;
      delete o.turnHp;
      delete o.turnMp;
    }
  }

  putOn(p: Player): void {
    if (this.canPlayerUse(p.index)) {
      this.clearOverrides(p);
      applyItemChange(this.type, null, this.raw, p);
      if (this.isArmour) p.addBuff(this.mBitEffect);
      if (this.eventId !== 0) ScriptResources.setEvent(this.eventId);
    }
  }

  takeOff(p: Player): void {
    this.clearOverrides(p);
    applyItemChange(this.type, this.raw, null, p);
    if (this.isArmour) p.delBuff(this.mBitEffect);
    if (this.eventId !== 0) ScriptResources.clearEvent(this.eventId);
  }
}
