// Port of fmj/lib/ResGut.kt — a story script ("gut") resource.
import { ResBase } from "./ResBase";

export class ResGut extends ResBase {
  description = "";
  private mLength = 0;
  private mNumSceneEvent = 0;
  /**
   * Scene events (1-255). 1-40 are NPC events (matching their resource slot),
   * 41-255 are map events (map editor event N is scene event N+40).
   */
  sceneEvent: number[] = [];
  /** Script bytes: opcode + operands. */
  scriptData: Int8Array = new Int8Array(0);

  setData(buf: Int8Array, offset: number): void {
    this.type = buf[offset];
    this.index = buf[offset + 1];
    this.description = ResBase.getString(buf, offset + 2);
    this.mLength = ((buf[offset + 0x19] & 0xff) << 8) | (buf[offset + 0x18] & 0xff);
    this.mNumSceneEvent = buf[offset + 0x1a] & 0xff;
    this.sceneEvent = new Array(this.mNumSceneEvent);
    for (let i = 0; i < this.mNumSceneEvent; i++) {
      this.sceneEvent[i] = ((buf[offset + (i << 1) + 0x1c] & 0xff) << 8) | (buf[offset + (i << 1) + 0x1b] & 0xff);
    }
    const len = this.mLength - this.mNumSceneEvent * 2 - 3;
    const start = offset + 0x1b + this.mNumSceneEvent * 2;
    this.scriptData = buf.slice(start, start + len);
  }
}
