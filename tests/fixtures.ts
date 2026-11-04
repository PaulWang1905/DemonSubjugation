// Builds tiny synthetic DAT.LIB archives for unit tests (no real game data).

export interface FixtureRes {
  resType: number;
  type: number;
  index: number;
  bytes: number[];
}

/** Assemble an archive: index at 0x10, offsets at 0x2000, data from 0x4000. */
export function buildLib(resources: FixtureRes[]): Uint8Array {
  let dataSize = 0;
  for (const r of resources) dataSize += r.bytes.length;
  const out = new Uint8Array(0x4000 + dataSize + 16);
  out.set([0x4c, 0x49, 0x42], 0); // "LIB"
  out.set([0xb2, 0xe2, 0xca, 0xd4], 3); // "测试" in GBK
  let i = 0x10;
  let j = 0x2000;
  let ptr = 0x4000;
  for (const r of resources) {
    out[i++] = r.resType;
    out[i++] = r.type;
    out[i++] = r.index;
    const block = Math.floor(ptr / 0x4000);
    const rel = ptr % 0x4000;
    out[j++] = block;
    out[j++] = rel & 0xff;
    out[j++] = (rel >> 8) & 0xff;
    out.set(r.bytes, ptr);
    ptr += r.bytes.length;
  }
  out[i] = 0xff;
  return out;
}

export function le16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

/** ResImage bytes. `rows` are strings of '#', '.', and ' ' (transparent). */
export function image(type: number, index: number, frames: string[][]): number[] {
  const h = frames[0].length;
  const w = frames[0][0].length;
  const transparent = frames.some((f) => f.some((r) => r.includes(" ")));
  const out = [type, index, w, h, frames.length, transparent ? 2 : 1];
  for (const f of frames) {
    for (const row of f) {
      if (transparent) {
        let bytes: number[] = [];
        let cur = 0;
        let bits = 0;
        for (const ch of row) {
          const t = ch === " " ? 1 : 0;
          const b = ch === "#" ? 1 : 0;
          cur = (cur << 2) | (t << 1) | b;
          bits += 2;
          if (bits === 8) {
            bytes.push(cur);
            cur = 0;
            bits = 0;
          }
        }
        if (bits) bytes.push(cur << (8 - bits));
        if (bytes.length % 2) bytes.push(0); // rows are word-aligned
        out.push(...bytes);
        bytes = [];
      } else {
        let cur = 0;
        let bits = 0;
        for (const ch of row) {
          cur = (cur << 1) | (ch === "#" ? 1 : 0);
          if (++bits === 8) {
            out.push(cur);
            cur = 0;
            bits = 0;
          }
        }
        if (bits) out.push(cur << (8 - bits));
      }
    }
  }
  return out;
}

/** ResGut bytes for a script with the given scene events (byte offsets into `code`). */
export function gut(type: number, index: number, code: number[], eventOffsets: number[]): number[] {
  const n = eventOffsets.length;
  const head = new Array(0x18).fill(0);
  head[0] = type;
  head[1] = index;
  const length = 3 + n * 2 + code.length;
  const ev: number[] = [];
  for (const off of eventOffsets) ev.push(...le16(off === -1 ? 0 : 3 + n * 2 + off));
  return [...head, ...le16(length), n, ...ev, ...code];
}

/** Address operand for jumps inside `gut()` scripts. */
export function addr(eventCount: number, byteOffset: number): number[] {
  return le16(3 + eventCount * 2 + byteOffset);
}
