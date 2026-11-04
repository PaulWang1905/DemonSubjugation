// Port of fmj/magic/MagicRestore.kt — 03 restoration
import type { FightingCharacter } from "../characters/FightingCharacter";
import type { Player } from "../characters/Player";
import { ResBase } from "../lib/ResBase";
import { BaseMagic } from "./BaseMagic";

export class MagicRestore extends BaseMagic {
  private mHp = 0; // 0-8000 HP restored
  private mBuff = 0; // low nibble: cures poison/confusion/seal/sleep

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mHp = ResBase.get2BytesInt(buf, offset + 0x12);
    this.mBuff = buf[offset + 0x18];
  }

  /**
   * In fmj.kt this was an overload that combat actions (which hold a
   * BaseMagic) never reached, so healing spells did nothing in battle.
   */
  use(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): void {
    for (const d of Array.isArray(dst) ? dst : [dst]) this.useRestore(src as Player, d as Player);
  }

  /** Kotlin overload `use(src: Player, dst: Player)`. */
  useRestore(src: Player, dst: Player): void {
    if (src.mp < this.costMp) return;
    src.mp = src.mp - this.costMp;
    dst.hp = dst.hp + this.mHp;
    if (dst.hp > dst.maxHP) dst.hp = dst.maxHP;
    dst.delDebuff(this.mBuff);
  }
}
