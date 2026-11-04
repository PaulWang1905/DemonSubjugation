// Port of fmj/goods/GoodsTudun.kt — 13 escape items. Using one triggers
// event 255 of the running script (normally: leave the dungeon).
import { BaseGoods } from "./BaseGoods";

export class GoodsTudun extends BaseGoods {
  protected setOtherData(_buf: Int8Array, _offset: number): void {}
}
