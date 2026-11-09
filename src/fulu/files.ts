// The OS's file functions, over the flash file system (src/bbk/flashfs.ts):
// the OS maps the flash into banks 9-12 and 4 while it works and maps the
// old pages back afterwards.

import { adc, clc, cpu, fn, get16, m, nz, ram, rd, sbc, sec, set16, word, wr } from "./alu";
import type { OsFunction } from "./fulu";

const TYPE = 0x2100;
/** How deep the OS is in its file code, and where it saves the pages of banks 9, 10, 11, 12 and 4. */
const DEPTH = 0x216a, SAVED = [0x215c, 0x215e, 0x2160, 0x2164, 0x2166], SAVED_BANKS = [9, 10, 11, 12, 4];
/** The page D:$610A maps (low, high). */
const PAGE = 0x2177;
const COUNT = 0x2119, MATCH = 0x2117;
/** The directory: groups of sectors ($2186 of them, 7 sectors apart). */
const GROUPS = 0x2186;

/** D:$610A: map n consecutive banks from bank b, the first to the page at $2177/$2178 (flags kept). */
function mapBanks(b: number, n: number): void {
  const p = cpu.p;
  m.write(0x0c, b);
  m.write(0x0d, ram[PAGE]);
  m.write(0x0e, ram[PAGE + 1]);
  let hi = ram[PAGE + 1];
  for (let x = (n - 1) & 0xff; x; x--) {
    const lo = m.read(0x0d);
    clc();
    m.write(0x0c, adc(m.read(0x0c), 1));
    clc();
    m.write(0x0d, adc(lo, 1));
    m.write(0x0e, (hi = adc(hi, 0)));
  }
  cpu.x = 0;
  cpu.a = hi;
  cpu.p = p;
}

const mapPage = (b: number, lo: number, hi: number) => {
  ram[PAGE] = lo;
  ram[PAGE + 1] = hi;
  mapBanks(b, 1);
};

/** D:$604D and D:$60B0: on first entering the file code, save the banks' pages and map the flash. */
function enter(): void {
  ram[DEPTH]++;
  if (ram[DEPTH] !== 1) return;
  SAVED_BANKS.forEach((b, i) => {
    m.write(0x0c, b);
    ram[SAVED[i]] = m.read(0x0d);
    ram[SAVED[i] + 1] = m.read(0x0e);
  });
  ram[PAGE] = ram[PAGE + 1] = 2;
  mapBanks(9, 4);
  ram[PAGE] = 0;
  ram[PAGE + 1] = 2;
  mapBanks(4, 1);
}

/** D:$64B2: on leaving the file code, map the saved pages back. */
function leave(): void {
  ram[DEPTH]--;
  if (ram[DEPTH]) return;
  SAVED_BANKS.forEach((b, i) => mapPage(b, ram[SAVED[i]], ram[SAVED[i] + 1]));
}

/** Count the entries of one directory sector, mapped at $A000, whose type (+15) is $2100. */
function countSector(): void {
  set16(0x86, 0xa000);
  cpu.y = 0x0f;
  for (;;) {
    if (rd(word(0x86) + 15) === ram[TYPE]) {
      clc();
      ram[COUNT] = adc(ram[COUNT], 1);
      ram[COUNT + 1] = adc(ram[COUNT + 1], 0);
      // (the OS would stop at the $2117/$2118-th, which FileNum sets to $FFFF)
    }
    clc();
    ram[0x86] = adc(ram[0x86], 0x10);
    ram[0x87] = adc(ram[0x87], 0);
    if (ram[0x87] === 0xb0) return;
  }
}

/** D:$721E: count the files of type $2100. */
function count(): void {
  ram[MATCH] = ram[MATCH + 1] = 0xff;
  ram[COUNT] = ram[COUNT + 1] = 0;
  if (ram[TYPE] >= 0x20) {
    // D:$718D: the directory sectors, from the first, 7 apart
    ram[0x2182] = 1;
    ram[0x2183] = ram[0x2184] = 0;
    for (;;) {
      ram[0x2168] = ram[0x2184];
      ram[0x2169] = 0;
      mapPage(10, ram[0x2168], (ram[0x2169] + 2) & 0xff);
      countSector();
      ram[0x2183]++;
      if (ram[0x2183] === ram[GROUPS]) return clc();
      clc();
      ram[0x2184] = adc(ram[0x2184], 7);
    }
  }
  // D:$723A: the sector maps, from the last group down; each map's bytes from $FF down: 3, a directory sector; 2, none; else the end
  let first = 0;
  for (let x = 1; x !== ram[GROUPS]; x = (x + 1) & 0xff) {
    clc();
    first = adc(first, 7);
  }
  ram[0x2152] = first;
  clc();
  ram[0x2182] = adc(1, first);
  ram[0x2183] = ram[GROUPS];
  for (;;) {
    ram[0x211b] = ram[0x2182];
    ram[0x211c] = 0;
    clc();
    mapPage(4, ram[0x211b], adc(ram[0x211c], 2));
    set16(0x8a, 0x40ff);
    cpu.y = 0;
    for (;;) {
      const v = rd(word(0x8a));
      if (v === 3) {
        ram[0x2152] = 3;
        ram[0x2168] = ram[0x8a];
        sec();
        ram[0x2169] = sbc(ram[0x2183], 1);
        clc();
        mapPage(10, ram[0x2168], adc(ram[0x2169], 2));
        countSector();
      } else if (v !== 2) {
        cpu.y = 0;
        return clc();
      }
      ram[0x8a] = (ram[0x8a] - 1) & 0xff;
      if (ram[0x8a] === 0xff) break;
    }
    ram[0x2183]--;
    if (!ram[0x2183]) return clc();
    sec();
    ram[0x2182] = sbc(ram[0x2182], 7);
  }
}

// ---- the user files (types below $20): open, read, write, seek, close, create, delete, search ----
//
// Done from what the functions do, not from the OS's code (which programs
// the flash cell by cell, with its own wear-levelling), but on the OS's own
// format, so that the two see each other's files:
//
//   sector maps ($1000: sectors $000-$0FF, $8000: $100-$1FF), a byte a
//     sector: $03 a directory sector of user files, $02 a data sector of
//     theirs (both from the top of the flash down, without a gap: FileNum
//     stops at the first other byte), $FF free;
//   page maps ($4000, $B000), a byte a 256-byte page: $02 used, $00 freed;
//   directory entries of 16 bytes: {first page (2), name (10), size (3),
//     type}, type $00 deleted, $FF free;
//   the open files: 4 records of 12 bytes at $2122: {mode (0 closed, 1
//     read, 2 write), first page (2), position (3), size (3), the entry's
//     place (3: its index in its sector, the sector)}.
//
// What the OS keeps for itself while it works ($2100-$219F, zero page
// $80-$8F, $20-$27, X, Y and C, V) is not left as the OS leaves it, and is
// declared (ownState) so that checking Fulu leaves it out.

const RECORDS = 0x2122, RECORD = 12;
const TOP = 0x1ff;
const flash = () => m.flash.data;
const sectorMap = (s: number) => (s < 0x100 ? 0x1000 : 0x8000) + (s & 0xff);
const pageMap = (p: number) => (p < 0x1000 ? 0x4000 : 0xb000) + (p & 0xfff);
const u24 = (a: number) => rd(a) | (rd(a + 1) << 8) | (rd(a + 2) << 16);
const put24 = (a: number, v: number) => [0, 1, 2].forEach((i) => wr(a + i, (v >>> (8 * i)) & 0xff));
const f24 = (o: number) => flash()[o] | (flash()[o + 1] << 8) | (flash()[o + 2] << 16);

/** The user area's sectors, from the top down (a gap ends it). */
function userSectors(): number[] {
  const out: number[] = [];
  for (let s = TOP; s >= 0; s--) {
    const v = flash()[sectorMap(s)];
    if (v !== 2 && v !== 3) break;
    out.push(s);
  }
  return out;
}

/** Directory entries' flash offsets, in the OS's order: user files (types below $20) or the downloaded ones. */
function entries(type: number): number[] {
  const f = flash(), out: number[] = [];
  if (type < 0x20) {
    for (const s of userSectors()) if (f[sectorMap(s)] === 3) for (let e = s << 12; e < (s + 1) << 12; e += 16) if (f[e + 15] === type) out.push(e);
  } else {
    for (let e = 0; e < 0x1000 && f[e + 15] !== 0xff; e += 16) if (f[e + 15] === type) out.push(e);
  }
  return out;
}

const record = (h: number) => RECORDS + RECORD * h;

/** All live user-file entries, in the OS's order. */
function liveEntries(): number[] {
  const f = flash(), out: number[] = [];
  for (const s of userSectors()) if (f[sectorMap(s)] === 3) for (let e = s << 12; e < (s + 1) << 12; e += 16) if (f[e + 15] !== 0 && f[e + 15] !== 0xff) out.push(e);
  return out;
}

/** The result in A, as the functions return it (and N, Z from it). */
const result = (ok: boolean) => void (cpu.a = nz(ok ? 1 : 0));

/** The data sectors live user files use. */
function liveSectors(): Set<number> {
  const f = flash(), used = new Set<number>();
  for (const s of userSectors()) {
    if (f[sectorMap(s)] !== 3) continue;
    for (let e = s << 12; e < (s + 1) << 12; e += 16) {
      const type = f[e + 15];
      if (type === 0 || type === 0xff) continue;
      const page = f[e] | (f[e + 1] << 8), pages = Math.max(1, Math.ceil(f24(e + 12) / 0x100));
      for (let p = page; p < page + pages; p++) used.add(p >> 4);
    }
  }
  return used;
}

/** A free sector for the user area: from the top, one of its data sectors no live file uses (erased), else the next below it. */
function claimSector(): number | null {
  const f = flash(), area = userSectors(), live = liveSectors();
  for (const s of area) {
    if (f[sectorMap(s)] !== 2 || live.has(s)) continue;
    f.fill(0xff, s << 12, (s + 1) << 12);
    return s;
  }
  const below = area.length ? area[area.length - 1] - 1 : TOP;
  return below > 0 && f[sectorMap(below)] === 0xff ? below : null;
}

/** An entry's place as the OS keeps it in a record: its index in its sector, the sector (low byte, then high). */
const place = (entry: number) => ((entry >> 4) & 0xff) | (((entry >> 12) & 0xff) << 8) | ((entry >> 20) << 16);
const unplace = (v: number) => (((v >> 16) << 20) | (((v >> 8) & 0xff) << 12) | ((v & 0xff) << 4)) >>> 0;

/** A free directory slot (a new directory sector if none), or null. */
function freeSlot(): number | null {
  const f = flash();
  for (const deleted of [0xff, 0x00])
    for (const s of userSectors()) if (f[sectorMap(s)] === 3) for (let e = s << 12; e < (s + 1) << 12; e += 16) if (f[e + 15] === deleted) return e;
  const s = claimSector();
  if (s === null) return null;
  f[sectorMap(s)] = 3;
  f.fill(0xff, s << 12, (s + 1) << 12);
  return s << 12;
}

/** Sectors for a file of `size` bytes, contiguous, at the bottom of the user area: its first page, or null. */
function allocate(size: number): number | null {
  const f = flash(), sectors = Math.max(1, Math.ceil(size / 0x1000));
  let first = -1;
  for (let i = 0; i < sectors; i++) {
    const s = claimSector();
    if (s === null) return null;
    f[sectorMap(s)] = 2;
    for (let p = 0; p < 16; p++) f[pageMap((s << 4) | p)] = 0xff;
    first = s;
  }
  // (claimed downward, so the last is the lowest)
  for (let p = 0; p < Math.max(1, Math.ceil(size / 0x100)); p++) f[pageMap((first << 4) + p)] = 2;
  return first << 4;
}

/** Open a record for a file: its handle, or 4 if all four are open. */
function openRecord(mode: number, page: number, size: number, entry: number): number {
  for (let h = 0; h < 4; h++) {
    const r = record(h);
    if (rd(r)) continue;
    wr(r, mode);
    wr(r + 1, page & 0xff);
    wr(r + 2, page >> 8);
    put24(r + 3, 0);
    put24(r + 6, size);
    put24(r + 9, place(entry));
    return h;
  }
  return 4;
}

/** The files' own work, between the OS's entering and leaving its file code (as it maps the banks). */
function inFiles(run: () => boolean): void {
  enter();
  const ok = run();
  leave();
  result(ok);
}

const OWN_STATE: OsFunction["ownState"] = { registers: ["x", "y", "p"], ram: [[0x20, 0x28], [0x80, 0x90], [0x2100, 0x21a0]] };
const fileFn = (at: number, run: () => void): OsFunction => ({ ...fn(at, run), ownState: OWN_STATE, files: true });

export const USER_FILES: Record<number, OsFunction> = {
  /** $E9EC FileSearch(type in A, n, &id, &name): the n-th file (from 1) of a type: its id (first page) and name. */
  0xe9ec: fileFn(0x7a30, () => {
    const type = cpu.a, args = word(0x28), n = get16(args);
    inFiles(() => {
      const e = entries(type)[n - 1];
      if (e === undefined) return false;
      const out = get16(args + 2), name = get16(args + 4);
      wr(out, flash()[e]);
      wr(out + 1, flash()[e + 1]);
      for (let i = 0; i < 10; i++) wr(name + i, flash()[e + 2 + i]);
      return true;
    });
  }),
  /** $E9CE FileOpen(id, type, mode, &handle, &size): open a file (mode 1 to read, 2 to write). */
  0xe9ce: fileFn(0x6edc, () => {
    const args = word(0x28), id = get16(args), type = rd(args + 2), mode = rd(args + 3);
    inFiles(() => {
      // (a user file by its id alone, as the OS finds it; a downloaded one by type and id)
      const e = (type < 0x20 ? liveEntries() : entries(type)).find((o) => (flash()[o] | (flash()[o + 1] << 8)) === id);
      if (e === undefined) return false;
      const size = f24(e + 12), h = openRecord(mode, id, size, e);
      wr(get16(args + 4), h);
      const info = get16(args + 6);
      put24(info, size);
      wr(info + 3, 0);
      return h < 4;
    });
  }),
  /** $E9C8 (create)(type in A, size, name, &id, &handle): a new user file, open to write. */
  0xe9c8: fileFn(0x70b7, () => {
    const type = cpu.a, args = word(0x28), size = u24(args), name = get16(args + 4);
    if (!size) return void result(false);
    inFiles(() => {
      if (type >= 0x20) return false; // (the downloaded files' area: not for programs)
      const slot = freeSlot();
      if (slot === null) return false;
      const page = allocate(size);
      if (page === null) return false;
      const f = flash();
      f[slot] = page & 0xff;
      f[slot + 1] = page >> 8;
      for (let i = 0; i < 10; i++) f[slot + 2 + i] = rd(name + i);
      f[slot + 12] = size & 0xff;
      f[slot + 13] = (size >> 8) & 0xff;
      f[slot + 14] = size >> 16;
      f[slot + 15] = type;
      const h = openRecord(2, page, size, slot), id = get16(args + 6);
      wr(id, page & 0xff);
      wr(id + 1, page >> 8);
      wr(get16(args + 8), h);
      return h < 4;
    });
  }),
  /** $E9D7 (read)(handle in A, n, buffer): n bytes (0: none) from the position on. */
  0xe9d7: fileFn(0x6cf5, () => {
    const h = cpu.a, args = word(0x28), n = rd(args), buffer = get16(args + 1);
    inFiles(() => {
      const r = record(h & 3);
      if (!n) return true;
      if (!rd(r)) return false;
      const at = (get16(r + 1) << 8) + u24(r + 3);
      for (let i = 0; i < n; i++) wr(buffer + i, flash()[(at + i) & 0x1fffff]);
      put24(r + 3, u24(r + 3) + n);
      return true;
    });
  }),
  /** $E9D4 (write)(handle in A, n, buffer): n bytes (0: none) at the position, for a file open to write. */
  0xe9d4: fileFn(0x6e54, () => {
    const h = cpu.a, args = word(0x28), n = rd(args), buffer = get16(args + 1);
    inFiles(() => {
      const r = record(h & 3);
      if (!n) return true;
      if (rd(r) !== 2) return false;
      const at = (get16(r + 1) << 8) + u24(r + 3);
      for (let i = 0; i < n; i++) flash()[(at + i) & 0x1fffff] = rd(buffer + i);
      put24(r + 3, u24(r + 3) + n);
      return true;
    });
  }),
  /**
   * $E9EF (seek)(handle in A, offset (long), whence): 1 from the start (an
   * offset's top byte under $50), 2 from the position, 3 from the end (a
   * negative offset: size + offset - 1).
   */
  0xe9ef: fileFn(0x7953, () => {
    const h = cpu.a, args = word(0x28), offset = u24(args), top = rd(args + 3), whence = rd(args + 4);
    inFiles(() => {
      const r = record(h & 3);
      let pos: number;
      if (whence === 1 && top < 0x50) pos = offset;
      else if (whence === 2) pos = u24(r + 3) + offset;
      else if (whence === 3 && top >= 0x80) pos = u24(r + 6) + offset - 1;
      else return false;
      put24(r + 3, pos & 0xffffff);
      return true;
    });
  }),
  /** $E9D1 (close)(handle in A). */
  0xe9d1: fileFn(0x6e49, () => {
    wr(record(cpu.a & 3), 0);
    result(true);
  }),
  /** $E9DD FileDel(handle in A): delete a file open to write (its entry deleted, its pages freed) and close it. */
  0xe9dd: fileFn(0x7c59, () => {
    const h = cpu.a;
    inFiles(() => {
      const r = record(h & 3);
      if (rd(r) !== 2) return false;
      wr(r, 0);
      const f = flash(), entry = unplace(u24(r + 9)), page = get16(r + 1), size = u24(r + 6);
      f[entry + 15] = 0;
      for (let p = 0; p < Math.max(1, Math.ceil(size / 0x100)); p++) f[pageMap(page + p)] = 0;
      return true;
    });
  }),
};

export const FILES: Record<number, OsFunction> = {
  ...USER_FILES,
  // $E9E9 FileNum(type in A, &n): the number of files of a type in the flash file system, through the pointer; returns 1
  0xe9e9: fn(0x74c5, () => {
    ram[TYPE] = cpu.a;
    enter();
    count();
    const p = get16(word(0x28));
    set16(0x82, p);
    wr(p, ram[COUNT]);
    wr(p + 1, ram[COUNT + 1]);
    leave();
    cpu.y = 1;
    cpu.a = nz(1);
  }, [[0x82, 0x88], [0x8a, 0x8c]]),
};
