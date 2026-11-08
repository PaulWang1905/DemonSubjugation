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

export const FILES: Record<number, OsFunction> = {
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
