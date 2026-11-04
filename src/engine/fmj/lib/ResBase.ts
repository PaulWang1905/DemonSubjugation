// Port of fmj/lib/ResBase.kt
import { gbkString } from "../../java";

/** Every resource must have setData() called right after construction. */
export abstract class ResBase {
  type = 0;
  index = 0;

  abstract setData(buf: Int8Array, offset: number): void;

  /** GBK, NUL-terminated string. */
  static getString(buf: Int8Array, start: number): string {
    let i = 0;
    while (start + i < buf.length && buf[start + i] !== 0) ++i;
    return gbkString(buf, start, i);
  }

  /** Unsigned little-endian 16-bit integer. */
  static get2BytesInt(buf: Int8Array, start: number): number {
    return (buf[start] & 0xff) | ((buf[start + 1] << 8) & 0xff00);
  }

  /** Sign-magnitude 16-bit integer (top bit = sign). */
  static get2BytesSInt(buf: Int8Array, start: number): number {
    const i = (buf[start] & 0xff) | ((buf[start + 1] << 8) & 0x7f00);
    return (buf[start + 1] & 0x80) !== 0 ? -i : i;
  }

  static get1ByteSInt(buf: Int8Array, start: number): number {
    const i = buf[start] & 0x7f;
    return (buf[start] & 0x80) !== 0 ? -i : i;
  }
}
