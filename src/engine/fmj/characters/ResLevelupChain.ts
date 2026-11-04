// Port of fmj/characters/ResLevelupChain.kt
import { ResBase } from "../lib/ResBase";

const LEVEL_BYTES = 20;

export class ResLevelupChain extends ResBase {
  maxLevel = 0;
  private mLevelData: Int8Array = new Int8Array(0);

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.maxLevel = buf[offset + 2] & 0xff;
    this.mLevelData = buf.slice(offset + 4, offset + 4 + this.maxLevel * LEVEL_BYTES);
  }

  private w(level: number, off: number): number {
    return level <= this.maxLevel ? ResBase.get2BytesInt(this.mLevelData, off + level * LEVEL_BYTES - LEVEL_BYTES) : 0;
  }
  private b(level: number, off: number): number {
    return level <= this.maxLevel ? this.mLevelData[level * LEVEL_BYTES - LEVEL_BYTES + off] & 0xff : 0;
  }

  getMaxHP(l: number): number { return this.w(l, 0); }
  getHP(l: number): number { return this.w(l, 2); }
  getMaxMP(l: number): number { return this.w(l, 4); }
  getMP(l: number): number { return this.w(l, 6); }
  getAttack(l: number): number { return this.w(l, 8); }
  getDefend(l: number): number { return this.w(l, 10); }
  getNextLevelExp(l: number): number { return this.w(l, 14); }
  getSpeed(l: number): number { return this.b(l, 16); }
  getLingli(l: number): number { return this.b(l, 17); }
  getLuck(l: number): number { return this.b(l, 18); }
  getLearnMagicNum(l: number): number { return this.b(l, 19); }
}
