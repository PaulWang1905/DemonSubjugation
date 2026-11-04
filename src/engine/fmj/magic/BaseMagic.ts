// Port of fmj/magic/BaseMagic.kt
import type { FightingCharacter } from "../characters/FightingCharacter";
import { EngineSettings } from "../config/EngineSettings";
import { castMagic, type SpellResult } from "../combat/OriginalRules";
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResSrs } from "../lib/ResSrs";

export abstract class BaseMagic extends ResBase {
  roundNum = 0;
  isForAll = false;
  costMp = 0;
  magicAni: ResSrs | null = null;
  magicName = "";
  magicDescription = "";

  protected abstract setOtherData(buf: Int8Array, offset: number): void;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.roundNum = buf[offset + 3] & 0x7f;
    this.isForAll = (buf[offset + 3] & 0x80) !== 0;
    this.costMp = buf[offset + 4];
    this.costByte = buf[offset + 4] & 0xff;
    this.raw = Uint8Array.from(buf.subarray(offset + 0x12, offset + 0x1a), (v) => v & 0xff);
    this.magicAni = DatLib.getRes(ResType.SRS, 2, buf[offset + 5] & 0xff) as ResSrs;
    this.magicName = ResBase.getString(buf, offset + 6);
    if ((buf[offset + 2] & 0xff) > 0x70) {
      // description too long (the original also patches the archive buffer)
      buf[offset + 0x70] = 0;
    }
    this.magicDescription = ResBase.getString(buf, offset + 0x1a);
    this.setOtherData(buf, offset);
  }

  /** MP cost as the original reads it (unsigned). */
  costByte = 0;
  /** Effect bytes 0x12-0x19 (values, percentages, statuses) for the original rules. */
  raw = new Uint8Array(8);

  /** Per-target results of the last cast under the original rules. */
  lastResults = new Map<FightingCharacter, SpellResult>();

  /**
   * Under the original battle rules, cast like the original engine and
   * return true; the subclasses' own (fmj.kt) effects are used otherwise.
   */
  protected castOriginal(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): boolean {
    this.lastResults = new Map();
    if (!EngineSettings.originalDamageFormula || this.type < 1 || this.type > 4) return false;
    this.lastResults = castMagic(src, this, Array.isArray(dst) ? dst : [dst]);
    return true;
  }

  use(src: FightingCharacter, dst: FightingCharacter | FightingCharacter[]): void {
    this.castOriginal(src, dst);
  }
}
