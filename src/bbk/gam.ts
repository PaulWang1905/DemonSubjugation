// .gam: a program for the BBK A-series dictionaries ("GAM\0" header, the name
// the OS lists at offset 6, entry address at 0x40), as its download tool sends it.

const gbk = new TextDecoder("gbk");

export interface GamInfo {
  /** The name in the OS's game list. */
  name: string;
  /** The 10 raw name bytes (GBK), for the flash directory. */
  rawName: Uint8Array;
  /** Whether the program carries an fmj-engine resource library (".lib"). */
  hasLib: boolean;
}

export function isGam(data: Uint8Array): boolean {
  return data.length >= 0x46 && data[0] === 0x47 && data[1] === 0x41 && data[2] === 0x4d && data[3] === 0;
}

export function gamInfo(data: Uint8Array): GamInfo {
  const rawName = data.slice(6, 16);
  const end = rawName.indexOf(0);
  return {
    name: gbk.decode(rawName.subarray(0, end < 0 ? 10 : end)).trim(),
    rawName,
    hasLib: findLib(data) >= 0,
  };
}

/** Offset of an embedded fmj resource library, or -1. */
export function findLib(data: Uint8Array): number {
  for (let i = 4; i + 3 <= data.length; i++) {
    if (data[i] === 0x4c && data[i + 1] === 0x49 && data[i + 2] === 0x42 && isLib(data, i)) return i;
  }
  return -1;
}

/**
 * A resource library: "LIB", an index of 3-byte entries from +0x10 (resource
 * type 1-12, ended by 0xFF) and their locations from +0x2000 (16 KB block,
 * offset), each inside the library.
 */
function isLib(d: Uint8Array, base: number): boolean {
  const len = d.length - base;
  if (len < 0x4000) return false;
  let n = 0;
  for (let i = base + 0x10, j = base + 0x2000; d[i] !== 0xff; i += 3, j += 3, n++) {
    if (i >= d.length || j + 3 > d.length || d[i] < 1 || d[i] > 12 || n > 10000) return false;
    if (d[j] * 0x4000 + (d[j + 1] | (d[j + 2] << 8)) >= len) return false;
  }
  return n > 0;
}
