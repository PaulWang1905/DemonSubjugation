// Port of fmj/goods/GoodsManage.kt — the party inventory.
import { DatLib, ResType } from "../lib/DatLib";
import type { ObjectInput, ObjectOutput } from "../../java";
import type { BaseGoods } from "./BaseGoods";
import { EngineSettings } from "../config/EngineSettings";

function grs(type: number, index: number): BaseGoods {
  return DatLib.getRes(ResType.GRS, type, index) as unknown as BaseGoods;
}

export class GoodsManage {
  /** Consumables: thrown weapons, medicine, ... */
  mGoodsList: BaseGoods[] = [];
  /** Equipment. */
  mEquipList: BaseGoods[] = [];

  get goodsList(): BaseGoods[] { return this.mGoodsList; }
  get equipList(): BaseGoods[] { return this.mEquipList; }
  get equitTypeNum(): number { return this.mEquipList.length; }
  get goodsTypeNum(): number { return this.mGoodsList.length; }

  getEquip(i: number): BaseGoods | null {
    return i >= 0 && i < this.mEquipList.length ? this.mEquipList[i] : null;
  }

  getGoodsAt(i: number): BaseGoods | null {
    return i >= 0 && i < this.mGoodsList.length ? this.mGoodsList[i] : null;
  }

  private listFor(type: number): BaseGoods[] | null {
    if (type >= 1 && type <= 7) return this.mEquipList;
    if (type >= 8 && type <= 14) return this.mGoodsList;
    return null;
  }

  getGoods(type: number, index: number): BaseGoods | null {
    return this.listFor(type)?.find((g) => g.type === type && g.index === index) ?? null;
  }

  getGoodsNum(type: number, index: number): number {
    return this.getGoods(type, index)?.goodsNum ?? 0;
  }

  addGoods(type: number, index: number, num = 1): void {
    const list = this.listFor(type);
    if (!list) return;
    for (const g of list) {
      if (g.type === type && g.index === index) {
        g.addGoodsNum(num);
        // the original keeps at most 99 of a kind (_00239BE2)
        if (EngineSettings.originalDamageFormula && g.goodsNum > 99) g.goodsNum = 99;
        return;
      }
    }
    // ... and at most 200 kinds
    if (EngineSettings.originalDamageFormula && this.mGoodsList.length + this.mEquipList.length >= 200) return;
    const item = grs(type, index);
    item.goodsNum = num;
    list.push(item);
  }

  deleteGoods(type: number, index: number): boolean {
    return this.useGoodsNum(type, index, 1);
  }

  /**
   * Remove `num` of the item; false if not enough. With the original rules
   * (_00239F29): asking for at least as many as there are removes the item
   * and still succeeds; only a missing item fails. The last item of the
   * list takes the removed one's place, as in the original bag.
   */
  useGoodsNum(type: number, index: number, num: number): boolean {
    const list = this.listFor(type);
    if (!list) return false;
    if (EngineSettings.originalDamageFormula) {
      const k = list.findIndex((g) => g.type === type && g.index === index);
      if (k < 0) return false;
      const g = list[k];
      if (g.goodsNum > num) {
        g.addGoodsNum(-num);
      } else {
        g.goodsNum = 0;
        const last = list.pop()!;
        if (last !== g) list[k] = last;
      }
      return true;
    }
    for (let k = 0; k < list.length; k++) {
      const g = list[k];
      if (g.type === type && g.index === index) {
        if (g.goodsNum < num) return false;
        g.addGoodsNum(-num);
        if (g.goodsNum <= 0) list.splice(k, 1);
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.mEquipList.length = 0;
    this.mGoodsList.length = 0;
  }

  read(coder: ObjectInput): void {
    this.clear();
    for (const list of [this.mEquipList, this.mGoodsList]) {
      const size = coder.readInt();
      for (let i = 0; i < size; i++) {
        const t = coder.readInt();
        const n = coder.readInt();
        const g = grs(t, n);
        g.goodsNum = coder.readInt();
        list.push(g);
      }
    }
  }

  write(out: ObjectOutput): void {
    for (const list of [this.mEquipList, this.mGoodsList]) {
      out.writeInt(list.length);
      for (const g of list) {
        out.writeInt(g.type);
        out.writeInt(g.index);
        out.writeInt(g.goodsNum);
      }
    }
  }
}
