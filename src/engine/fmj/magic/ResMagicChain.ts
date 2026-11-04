// Port of fmj/magic/ResMagicChain.kt
import { DatLib, ResType, warnOnce } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { BaseMagic } from "./BaseMagic";

export class ResMagicChain extends ResBase {
  private magicSum = 0;
  private mMagics: BaseMagic[] = [];
  /** Number of magics already learnt. */
  learnNum = 0;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.magicSum = buf[offset + 2] & 0xff;
    let index = offset + 3;
    this.mMagics = [];
    for (let i = 0; i < this.magicSum; i++) {
      const t = buf[index++];
      const n = buf[index++];
      const m = DatLib.getRes(ResType.MRS, t, n, true) as unknown as BaseMagic | null;
      if (m) this.mMagics.push(m);
      else warnOnce(`mrs:${t}:${n}`, `Magic chain ${this.index} lists missing magic ${t}-${n}; skipped`);
    }
  }

  /** Number of magics in the chain. */
  get size(): number {
    return this.mMagics.length;
  }

  getMagic(index: number): BaseMagic | undefined {
    return this.mMagics[index];
  }

  getAllLearntMagics(): BaseMagic[] {
    return this.mMagics.slice(0, this.learnNum);
  }
}
