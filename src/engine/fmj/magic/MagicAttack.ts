// Port of fmj/magic/MagicAttack.kt — 01 attack magic
import type { FightingCharacter } from "../characters/FightingCharacter";
import { ResBase } from "../lib/ResBase";
import { BaseMagic } from "./BaseMagic";
import { EngineSettings } from "../config/EngineSettings";
import { guarded, MISS, spellDamage } from "../combat/OriginalRules";

export class MagicAttack extends BaseMagic {
  private mHp = 0; // >0: HP damage base, <0: HP drain base
  public mMp = 0; // >0: MP damage base, <0: MP drain base
  public mDf = 0; // 0-100: defence reduction %
  public mAt = 0; // 0-100: attack reduction %
  public mBuff = 0; // high nibble rounds, low nibble poison/confusion/seal/sleep
  public mDebuff = 0; // 0-100: speed reduction %

  protected setOtherData(buf: Int8Array, offset: number): void {
    this.mHp = ResBase.get2BytesSInt(buf, offset + 0x12);
    this.mMp = ResBase.get2BytesSInt(buf, offset + 0x14);
    this.mDf = buf[offset + 0x16] & 0xff;
    this.mAt = buf[offset + 0x17] & 0xff;
    this.mBuff = buf[offset + 0x18] & 0xff;
    this.mDebuff = buf[offset + 0x19] & 0xff;
  }

  /** Targets the last cast missed (original battle rules). */
  readonly missed = new Set<FightingCharacter>();

  use(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): void {
    src.mp = src.mp - this.costMp;
    const targets = Array.isArray(dst) ? dst : [dst];
    this.missed.clear();
    if (!EngineSettings.originalDamageFormula) {
      for (const fc of targets) fc.hp = fc.hp - this.mHp;
      return;
    }
    // Original engine: spirit scaling, dodging, MP damage; a negative value
    // drains, giving what it takes to the caster.
    let drainedHp = 0;
    let drainedMp = 0;
    for (const fc of targets) {
      if (!fc.isAlive) continue;
      const r = spellDamage(src, fc, Math.abs(this.mHp), Math.abs(this.mMp), fc.isPlayer && guarded(fc, fc.defending, fc.hasAilment));
      if (r.hp === MISS || r.mp === MISS) {
        this.missed.add(fc);
        continue;
      }
      fc.hp = fc.hp - r.hp;
      fc.mp = fc.mp - r.mp;
      if (this.mHp < 0) drainedHp += r.hp;
      if (this.mMp < 0) drainedMp += r.mp;
    }
    if (drainedHp) src.hp = src.hp + drainedHp;
    if (drainedMp) src.mp = src.mp + drainedMp;
  }
}
