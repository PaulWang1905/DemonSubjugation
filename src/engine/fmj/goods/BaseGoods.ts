// Port of fmj/goods/BaseGoods.kt
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResImage } from "../lib/ResImage";
import type { Canvas } from "../../graphics";

export abstract class BaseGoods extends ResBase {
  /** Bit mask of players that may use/equip this (bit 0 = player 1). */
  private mEnable = 0;
  /** Rounds the effect lasts. */
  sumRound = 0;
  private mImage: ResImage | null = null;
  name = "";
  buyPrice = 0;
  sellPrice = 0;
  description = "";
  /** When non-zero, equipping sets this event and taking off clears it; cannot be sold. */
  eventId = 0;
  goodsNum = 0;
  /** Effect bytes 0x16-0x1d, as the original engine applies them (ItemRules). */
  raw = new Uint8Array(8);

  /** The original's "hits everyone" test for battle items: byte 0x1c above 0x0f. */
  get originalForAll(): boolean {
    return this.raw[6] > 0x0f;
  }

  protected abstract setOtherData(buf: Int8Array, offset: number): void;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.mEnable = buf[offset + 3] & 0xff;
    this.sumRound = buf[offset + 4] & 0xff;
    this.mImage = DatLib.getRes(ResType.GDP, this.type, buf[offset + 5] & 0xff) as ResImage;
    this.name = ResBase.getString(buf, offset + 6);
    this.buyPrice = ResBase.get2BytesInt(buf, offset + 0x12);
    this.sellPrice = ResBase.get2BytesInt(buf, offset + 0x14);
    this.description = ResBase.getString(buf, offset + 0x1e);
    this.eventId = ResBase.get2BytesInt(buf, offset + 0x84);
    this.raw = Uint8Array.from(buf.subarray(offset + 0x16, offset + 0x1e), (v) => v & 0xff);
    this.setOtherData(buf, offset);
  }

  /** @param playId 1-4 */
  canPlayerUse(playId: number): boolean {
    return playId >= 1 && playId <= 4 ? (this.mEnable & (1 << (playId - 1))) !== 0 : false;
  }

  draw(canvas: Canvas, x: number, y: number): void {
    this.mImage!.draw(canvas, 1, x, y);
  }

  addGoodsNum(d: number): void {
    this.goodsNum += d;
  }

  /** Whether the effect applies to the whole party / all enemies. */
  effectAll(): boolean {
    return false;
  }

  /** Kotlin `equals`: goods compare by (type, index). */
  equals(other: BaseGoods | null | undefined): boolean {
    return other != null && this.type === other.type && this.index === other.index;
  }
}
