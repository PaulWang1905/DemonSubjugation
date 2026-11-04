// Port of fmj/characters/Monster.kt
import type { BaseGoods } from "../goods/BaseGoods";
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import { random } from "../../java";
import { FightingCharacter } from "./FightingCharacter";
import { FightingSprite } from "./FightingSprite";

const arr = [
  [12, 25],
  [44, 14],
  [82, 11],
];

export class Monster extends FightingCharacter {
  public mLastRound = 0;
  public mIQ = 0;
  money = 0;
  exp = 0;
  /** Stealable goods: type, id, num */
  private readonly mCarryGoods1 = [0, 0, 0];
  /** Dropped goods: type, id, num */
  private readonly mCarryGoods2 = [0, 0, 0];

  get dropGoods(): BaseGoods | null {
    const c = this.mCarryGoods2;
    if (c[0] === 0 || c[1] === 0 || c[2] === 0) return null;
    const g = DatLib.getRes(ResType.GRS, c[0], c[1]) as unknown as BaseGoods;
    g.goodsNum = c[2];
    return g;
  }

  stealGoods(_attacker: FightingCharacter): BaseGoods | null {
    const c = this.mCarryGoods1;
    if (c[0] === 0 || c[1] === 0 || c[2] === 0) return null;
    if (random() < 0.5) return null;
    c[2] -= 1;
    return DatLib.getRes(ResType.GRS, c[0], c[1]) as unknown as BaseGoods;
  }

  setData(buf: Int8Array, offset: number): void {
    const g2 = ResBase.get2BytesInt;
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    const magicIndex = buf[offset + 0x2f] & 0xff;
    this.magicChain = DatLib.getMlr(1, magicIndex, true);
    if (this.magicChain) this.magicChain.learnNum = buf[offset + 2] & 0xff;
    this.addBuff(buf[offset + 3] & 0xff);
    this.mAtbuff = buf[offset + 4] & 0xff;
    this.mLastRound = buf[offset + 0x17] & 0xff;
    this.name = ResBase.getString(buf, offset + 6);
    this.level = buf[offset + 0x12] & 0xff;
    this.maxHP = g2(buf, offset + 0x18);
    this.hp = g2(buf, offset + 0x1a);
    this.maxMP = g2(buf, offset + 0x1c);
    this.mp = g2(buf, offset + 0x1e);
    this.attack = g2(buf, offset + 0x20);
    this.defend = g2(buf, offset + 0x22);
    this.speed = buf[offset + 0x13] & 0xff;
    this.lingli = buf[offset + 0x14] & 0xff;
    this.luck = buf[offset + 0x16] & 0xff;
    this.mIQ = buf[offset + 0x15] & 0xff;
    this.money = g2(buf, offset + 0x24);
    this.exp = g2(buf, offset + 0x26);
    for (let i = 0; i < 3; i++) {
      this.mCarryGoods1[i] = buf[offset + 0x28 + i] & 0xff;
      this.mCarryGoods2[i] = buf[offset + 0x2b + i] & 0xff;
    }
    this.fightingSprite = new FightingSprite(ResType.ACP, buf[offset + 0x2e] & 0xff);
  }

  /** @param i slot on screen */
  setOriginalCombatPos(i: number): void {
    const fs = this.fightingSprite;
    if (!fs) return;
    fs.setCombatPos(
      arr[i][0] - Math.trunc(fs.width / 6) + Math.trunc(fs.width / 2),
      arr[i][1] - Math.trunc(fs.height / 10) + Math.trunc(fs.height / 2),
    );
  }
}
