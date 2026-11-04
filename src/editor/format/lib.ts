// Raw reader/writer for BBK RPG ".lib" archives (DAT.LIB).
//
// Layout (all little-endian), reverse-engineered from real archives:
//
//   0x0000  "LIB", game title (GBK, NUL-padded to byte 12),
//           u16 index length in bytes (3 per entry), FF FF
//   0x0010  index: [resType, type, index] per entry, sorted, then FF padding
//   0x2000  offsets: [block, lo, hi] per entry (offset = block*0x4000 + hi<<8|lo),
//           then FF padding
//   0x4000  data blocks of 0x4000 bytes. Each block holds one resource kind:
//             +0   3-letter tag (GUT MAP ARS MRS SRS GRS TIL ACP GDP GGJ SUN MLR)
//             +12  u16 end of used data in this block
//             +16  resources packed back to back; the rest is FF
//
// A resource's length is the distance to the next resource in its block, or to
// the block's used-data end for the last one.

export interface LibEntry {
  resType: number;
  type: number;
  index: number;
  data: Uint8Array;
}

export interface LibArchive {
  /** Raw title bytes from the header (GBK, up to 9 bytes). */
  titleBytes: Uint8Array;
  entries: LibEntry[];
}

export const BLOCK = 0x4000;
const BLOCK_HEADER = 0x10;
const INDEX_START = 0x10;
const OFFSETS_START = 0x2000;
const DATA_START = 0x4000;
const MAX_ENTRIES = Math.floor((OFFSETS_START - INDEX_START) / 3);

/** Block tag per resource kind (1-12). Kind 11 (PIC) really is "SUN". */
export const BLOCK_TAGS: Record<number, string> = {
  1: "GUT",
  2: "MAP",
  3: "ARS",
  4: "MRS",
  5: "SRS",
  6: "GRS",
  7: "TIL",
  8: "ACP",
  9: "GDP",
  10: "GGJ",
  11: "SUN",
  12: "MLR",
};

export function readLib(bytes: Uint8Array): LibArchive {
  if (bytes.length < DATA_START || bytes[0] !== 0x4c || bytes[1] !== 0x49 || bytes[2] !== 0x42) {
    throw new Error("Not a LIB archive");
  }
  let end = 3;
  while (end < 12 && bytes[end] !== 0) end++;
  const titleBytes = bytes.slice(3, end);

  type Raw = { resType: number; type: number; index: number; off: number };
  const raws: Raw[] = [];
  let i = INDEX_START;
  let j = OFFSETS_START;
  while (i < OFFSETS_START && bytes[i] !== 0xff) {
    const off = bytes[j] * BLOCK + ((bytes[j + 2] << 8) | bytes[j + 1]);
    raws.push({ resType: bytes[i], type: bytes[i + 1], index: bytes[i + 2], off });
    i += 3;
    j += 3;
  }

  // Resource ends: next start in the same block, or the block's used end.
  const starts = [...new Set(raws.map((r) => r.off))].sort((a, b) => a - b);
  const endOf = new Map<number, number>();
  for (let k = 0; k < starts.length; k++) {
    const off = starts[k];
    const blockStart = Math.floor(off / BLOCK) * BLOCK;
    const next = starts[k + 1];
    if (next !== undefined && next < blockStart + BLOCK) {
      endOf.set(off, next);
    } else {
      const used = bytes[blockStart + 12] | (bytes[blockStart + 13] << 8);
      endOf.set(off, used > off - blockStart && used <= BLOCK ? blockStart + used : blockStart + BLOCK);
    }
  }

  const entries = raws.map((r) => ({
    resType: r.resType,
    type: r.type,
    index: r.index,
    data: bytes.slice(r.off, Math.min(endOf.get(r.off)!, bytes.length)),
  }));
  return { titleBytes, entries };
}

function compareEntries(a: LibEntry, b: LibEntry): number {
  return a.resType - b.resType || a.type - b.type || a.index - b.index;
}

export function writeLib(archive: LibArchive): Uint8Array {
  const entries = [...archive.entries].sort(compareEntries);
  if (entries.length > MAX_ENTRIES) throw new Error(`Too many resources (${entries.length} > ${MAX_ENTRIES})`);
  for (let k = 1; k < entries.length; k++) {
    if (compareEntries(entries[k - 1], entries[k]) === 0) {
      const e = entries[k];
      throw new Error(`Duplicate resource ${e.resType}-${e.type}-${e.index}`);
    }
  }
  if (archive.titleBytes.length > 9) throw new Error("Title too long (max 9 bytes, 4 Chinese characters)");

  // Pack resources into blocks, one kind per block, first-fit (the original
  // tool also fills gaps, so data order need not follow index order).
  type Placed = { entry: LibEntry; block: number; rel: number };
  const placed: Placed[] = [];
  const blocks: { tag: string; kind: number; used: number }[] = [];
  // Largest first packs tighter; the index stays sorted regardless.
  const bySize = [...entries].sort((a, b) => a.resType - b.resType || b.data.length - a.data.length || compareEntries(a, b));
  for (const e of bySize) {
    const size = e.data.length;
    if (size > BLOCK - BLOCK_HEADER) {
      throw new Error(`Resource ${e.resType}-${e.type}-${e.index} is too large (${size} bytes)`);
    }
    // best fit: the fullest block of this kind that still has room
    let k = -1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === e.resType && b.used + size <= BLOCK && (k < 0 || b.used > blocks[k].used)) k = i;
    }
    if (k < 0) {
      blocks.push({ tag: BLOCK_TAGS[e.resType] ?? "???", kind: e.resType, used: BLOCK_HEADER });
      k = blocks.length - 1;
    }
    placed.push({ entry: e, block: k + 1, rel: blocks[k].used });
    blocks[k].used += size;
  }
  if (blocks.length + 1 > 255) throw new Error("Archive too large (more than 255 blocks)");

  const out = new Uint8Array(DATA_START + blocks.length * BLOCK).fill(0xff);
  // header
  out.fill(0, 0, 12);
  out.set([0x4c, 0x49, 0x42], 0);
  out.set(archive.titleBytes, 3);
  const idxLen = entries.length * 3;
  out[12] = idxLen & 0xff;
  out[13] = idxLen >> 8;
  // index + offsets
  placed.sort((x, y) => compareEntries(x.entry, y.entry));
  placed.forEach((p, k) => {
    out.set([p.entry.resType, p.entry.type, p.entry.index], INDEX_START + k * 3);
    out.set([p.block, p.rel & 0xff, p.rel >> 8], OFFSETS_START + k * 3);
  });
  // blocks
  blocks.forEach((b, k) => {
    const base = DATA_START + k * BLOCK;
    out.fill(0, base, base + BLOCK_HEADER);
    for (let c = 0; c < 3; c++) out[base + c] = b.tag.charCodeAt(c);
    out[base + 12] = b.used & 0xff;
    out[base + 13] = b.used >> 8;
  });
  for (const p of placed) out.set(p.entry.data, p.block * BLOCK + p.rel);
  return out;
}

export function findEntry(a: LibArchive, resType: number, type: number, index: number): LibEntry | undefined {
  return a.entries.find((e) => e.resType === resType && e.type === type && e.index === index);
}

/** Insert or replace a resource. */
export function putEntry(a: LibArchive, entry: LibEntry): void {
  const k = a.entries.findIndex((e) => compareEntries(e, entry) === 0);
  if (k >= 0) a.entries[k] = entry;
  else a.entries.push(entry);
}

export function removeEntry(a: LibArchive, resType: number, type: number, index: number): void {
  a.entries = a.entries.filter((e) => !(e.resType === resType && e.type === type && e.index === index));
}
