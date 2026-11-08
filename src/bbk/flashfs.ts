// The file system the 4988's OS keeps in flash, as its PC download tool writes it.
//
//   0x0000  directory: 16-byte entries {page (2), name (10, GBK), size (3), type}
//           type 0xFF ends the list, 0x00 marks a deleted entry
//   0x1000  sector map for sectors 0x000-0x0FF, one byte each
//   0x8000  sector map for sectors 0x100-0x1FF
//           0x04 system, 0x01 used by a file, 0xFF free (0x1FE/0x1FF: OS data)
//
// A file occupies whole 4 KB sectors; its entry holds its address >> 8.

import { FLASH_SIZE } from "./flash";

export const SECTOR = 0x1000;
const ENTRY = 16;
const DIR_END = 0x1000;
const FIRST_DATA_SECTOR = 0x0f;
const LAST_DATA_SECTOR = 0x1ef;
const FREE = 0xff, USED = 0x01, DELETED = 0x00;

/** File types the OS knows (the ones its download tool assigns by extension). */
export const FileType = {
  game: 0x3d, // .gam
  ebook: 0x3f, // .txt
  dictionary: 0x3b, // .dct
  study: 0x39, // .std
  data: 0x3e, // .dat
  program: 0x33, // .prg
} as const;

export interface FlashFile {
  /** Byte offset of the directory entry. */
  entry: number;
  name: string;
  type: number;
  /** Byte offset of the data in flash. */
  offset: number;
  size: number;
}

const gbk = new TextDecoder("gbk");

const mapIndex = (sector: number) => (sector < 0x100 ? 0x1000 + sector : 0x8000 + sector - 0x100);

/** True when the OS has set up a file system in this flash image. */
export function isFormatted(flash: Uint8Array): boolean {
  return flash[ENTRY - 1] !== FREE;
}

/** The files in the directory, in order (deleted entries are skipped). */
export function listFiles(flash: Uint8Array): FlashFile[] {
  const files: FlashFile[] = [];
  for (let e = 0; e < DIR_END; e += ENTRY) {
    const type = flash[e + 15];
    if (type === FREE) break;
    if (type === DELETED) continue;
    const name = gbk.decode(flash.subarray(e + 2, e + 12)).replace(/\0.*$/s, "").trim();
    const offset = (flash[e] << 8) | (flash[e + 1] << 16);
    const size = flash[e + 12] | (flash[e + 13] << 8) | (flash[e + 14] << 16);
    files.push({ entry: e, name, type, offset, size });
  }
  return files;
}

/**
 * Write a file into a formatted image the way the download tool does: the first
 * free directory entry, the first run of free sectors large enough. `name` is
 * the 10 GBK bytes shown in the OS's lists. Returns the new file, or null when
 * the directory or flash is full.
 */
export function installFile(flash: Uint8Array, data: Uint8Array, type: number, name: Uint8Array): FlashFile | null {
  if (data.length > FLASH_SIZE) return null;
  let entry = 0;
  while (entry < DIR_END && flash[entry + 15] !== FREE && flash[entry + 15] !== DELETED) entry += ENTRY;
  if (entry >= DIR_END) return null;
  const count = Math.max(1, Math.ceil(data.length / SECTOR));
  let run = 0, first = -1;
  for (let s = FIRST_DATA_SECTOR; s <= LAST_DATA_SECTOR && first < 0; s++) {
    run = flash[mapIndex(s)] === FREE ? run + 1 : 0;
    if (run === count) first = s - count + 1;
  }
  if (first < 0) return null;
  for (let s = first; s < first + count; s++) flash[mapIndex(s)] = USED;
  const offset = first * SECTOR;
  flash.fill(0xff, offset, offset + count * SECTOR);
  flash.set(data, offset);
  flash.set([(offset >> 8) & 0xff, offset >> 16], entry);
  flash.fill(0, entry + 2, entry + 12);
  flash.set(name.subarray(0, 10), entry + 2);
  flash.set([data.length & 0xff, (data.length >> 8) & 0xff, data.length >> 16, type], entry + 12);
  return listFiles(flash).find((f) => f.entry === entry)!;
}

/** Delete a file: mark its entry deleted, free and erase its sectors. */
export function deleteFile(flash: Uint8Array, file: FlashFile): void {
  flash[file.entry + 15] = DELETED;
  const first = file.offset / SECTOR, count = Math.max(1, Math.ceil(file.size / SECTOR));
  for (let s = first; s < first + count; s++) flash[mapIndex(s)] = FREE;
  flash.fill(0xff, file.offset, file.offset + count * SECTOR);
}
