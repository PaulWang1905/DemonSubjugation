// Port of fmj/magic/MagicAuxiliary.kt — 04 auxiliary (revival)
import type { FightingCharacter } from "../characters/FightingCharacter";
import { ResBase } from "../lib/ResBase";
import { BaseMagic } from "./BaseMagic";

export class MagicAuxiliary extends BaseMagic {
  private mHp = 0; // 0-100: % of life restored

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mHp = ResBase.get2BytesInt(buf, offset + 0x12);
  }

  use(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): void {
    if (this.castOriginal(src, dst)) return;
    for (const d of Array.isArray(dst) ? dst : [dst]) {
      d.hp = Math.min(d.maxHP, d.hp + Math.trunc((d.maxMP * this.mHp) / 100));
    }
  }
}
