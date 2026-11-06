// Port of fmj/lib/ResMap.kt
import { Global } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { Tiles } from "../graphics/Tiles";
import { Canvas, Colors } from "../../graphics";
import { gbkString } from "../../java";
import { ResBase } from "./ResBase";

export class ResMap extends ResBase {
  private mTilIndex = 0;
  mapName: string | null = null;
  mapWidth = 0;
  mapHeight = 0;
  /**
   * Two bytes per tile, row-major. Low byte: bit 7 = walkable, bits 0-6 = tile
   * index. High byte: event number.
   */
  private mData: Int8Array = new Int8Array(0);
  private mTiles: Tiles | null = null;

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    this.mTilIndex = buf[offset + 2];

    let i = 0;
    while (offset + 3 + i < buf.length && buf[offset + 3 + i] !== 0 && i < 13) ++i;
    this.mapName = gbkString(buf, offset + 3, i);

    this.mapWidth = buf[offset + 0x10];
    this.mapHeight = buf[offset + 0x11];

    const len = this.mapWidth * this.mapHeight * 2;
    this.mData = buf.slice(offset + 0x12, offset + 0x12 + len);
  }

  canWalk(x: number, y: number): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
    const i = y * this.mapWidth + x;
    return (this.mData[i * 2] & 0x80) !== 0;
  }

  canPlayerWalk(x: number, y: number): boolean {
    return this.canWalk(x, y) && x >= 4 && x < this.mapWidth - 4 && y >= 3 && y < this.mapHeight - 2;
  }

  getEventNum(x: number, y: number): number {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return -1;
    const i = y * this.mapWidth + x;
    return this.mData[i * 2 + 1] & 0xff;
  }

  private getTileIndex(x: number, y: number): number {
    const i = y * this.mapWidth + x;
    return this.mData[i * 2] & 0x7f;
  }

  private tiles(): Tiles {
    if (!this.mTiles) this.mTiles = new Tiles(this.mTilIndex);
    return this.mTiles;
  }

  /** Draws WIDTH x HEIGHT tiles starting at map tile (left, top). */
  drawMap(canvas: Canvas, left: number, top: number): void {
    const tiles = this.tiles();
    const minY = Math.min(ResMap.HEIGHT, this.mapHeight - top);
    const minX = Math.min(ResMap.WIDTH, this.mapWidth - left);
    for (let y = 0; y < minY; y++) {
      for (let x = 0; x < minX; x++) {
        tiles.draw(canvas, x * Tiles.WIDTH + Global.MAP_LEFT_OFFSET, y * Tiles.HEIGHT, this.getTileIndex(left + x, top + y));
      }
    }
  }

  /**
   * `cols` x `rows` tiles from map tile (left, top), the first at (8, 0) as on
   * the device's screen; tiles outside the map are left as they are.
   */
  drawMapArea(canvas: Canvas, left: number, top: number, cols: number, rows: number): void {
    const tiles = this.tiles();
    for (let y = 0; y < rows; y++) {
      const ty = top + y;
      if (ty < 0 || ty >= this.mapHeight) continue;
      for (let x = 0; x < cols; x++) {
        const tx = left + x;
        if (tx < 0 || tx >= this.mapWidth) continue;
        tiles.draw(canvas, x * Tiles.WIDTH + Global.MAP_LEFT_OFFSET, y * Tiles.HEIGHT, this.getTileIndex(tx, ty));
      }
    }
  }

  drawWholeMap(canvas: Canvas, x: number, y: number): void {
    const tiles = this.tiles();
    for (let ty = 0; ty < this.mapHeight; ty++) {
      for (let tx = 0; tx < this.mapWidth; tx++) {
        const sx = tx * Tiles.WIDTH + x;
        const sy = ty * Tiles.HEIGHT + y;
        tiles.draw(canvas, sx, sy, this.getTileIndex(tx, ty));
        const event = this.getEventNum(tx, ty);
        if (event !== 0) {
          Global.bgColor = Colors.RED;
          TextRender.drawText(canvas, String(event), sx, sy);
          Global.bgColor = Global.COLOR_WHITE;
        }
      }
    }
  }

  /** Tiles rendered horizontally / vertically. */
  static readonly WIDTH = 160 / 16 - 1;
  static readonly HEIGHT = 96 / 16;
}
