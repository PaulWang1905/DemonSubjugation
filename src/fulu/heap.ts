// The OS's heap: SysMemAllocate and SysMemFree. Blocks follow one another
// from the heap's start, each a 4-byte header and its data: the header is
// whether the block is free ('b') or used ('u'), whether another block
// follows ('n') or it is the last ('e'), and the data's size (16 bits).
//
// The OS's code is compiled C that checks block addresses against the heap's
// 32-bit bounds with the C runtime, so it leaves the bounds' end in the
// scratch area (+8) and the last address it checked there (+$10); Fulu does
// the same.

import { cpu, fn, get16, long, nz, put16, ram, rd, set16, store, word, wr } from "./alu";
import type { OsFunction } from "./fulu";

/** The heap's start and size (32-bit), and a flag set when a block is found broken. */
const START = 0x2bab, SIZE = 0x2baf, BROKEN = 0x2bb3;
const FREE = 0x62, USED = 0x75, MORE = 0x6e, LAST = 0x65;

const scratch = () => word(0x2a);
const size = (b: number) => get16(b + 2);

/** As the OS checks a block address against the heap's start: (scratch + $10) = b widened, $20 at it, $23 at the start. */
function aboveStart(b: number): boolean {
  store(scratch() + 0x10, b);
  set16(0x20, scratch() + 0x10);
  set16(0x23, START);
  return b >= long(START);
}

/** As the OS checks a block address against the heap's end: (scratch + 8) = the end, (scratch + $10) = b; $20 and $23 at them. */
function belowEnd(b: number): boolean {
  const end = (long(START) + long(SIZE)) >>> 0;
  store(scratch() + 8, end);
  store(scratch() + 0x10, b);
  set16(0x20, scratch() + 0x10);
  set16(0x23, scratch() + 8);
  return b <= end;
}

/** 8:$7FAC: whether block b is sound (its follow byte, and the next block inside the heap); if not, the heap is marked broken. */
function sound(b: number): boolean {
  set16(0x26, b);
  const follow = rd(b + 1), q = (b + 4 + size(b)) & 0xffff;
  if ((follow !== MORE && follow !== LAST) || !belowEnd(q) || !aboveStart(q)) {
    ram[BROKEN] = 1;
    return false;
  }
  return true;
}

/** 8:$80BF: the block after b, or 0 (b outside the heap, the last, or broken), also in $20/$21. */
function next(b: number): number {
  let q = 0;
  if (aboveStart(b) && belowEnd(b)) {
    set16(0x26, b);
    if (rd(b + 1) !== LAST && sound(b)) q = (b + 4 + size(b)) & 0xffff;
  }
  set16(0x20, q);
  return q;
}

/** 8:$8234: give block b n bytes, splitting off the rest as a free block when more than 4 bytes remain. */
function split(b: number, n: number): void {
  const rest = (size(b) - n) & 0xffff;
  if (rest <= 4) return;
  const q = (b + 4 + n) & 0xffff;
  wr(q, FREE);
  wr(q + 1, rd(b + 1));
  put16(q + 2, (rest - 4) & 0xffff);
  wr(b + 1, MORE);
  put16(b + 2, n);
}

/** 8:$86D8: join each free block with the free blocks after it; leaves $20/$21, $23/$24 and $26/$27 as the OS's loop does. */
function join(): void {
  let b = word(START);
  for (;;) {
    set16(0x26, b);
    if (rd(b + 1) !== MORE) return;
    const q = next(b);
    set16(0x20, q);
    set16(0x23, 0);
    if (!q) return;
    if (rd(b) === FREE && rd(q) === FREE) {
      put16(b + 2, (size(b) + size(q) + 4) & 0xffff);
      wr(b + 1, rd(q + 1));
      set16(0x20, b + 1);
      set16(0x23, b + 1);
    } else b = q;
  }
}

export const HEAP: Record<number, OsFunction> = {
  // $E947 SysMemAllocate(n): n bytes (rounded up to a multiple of 4, in its argument) from the first free block with room; 0 if none
  0xe947: fn(0x8515, () => {
    const arg = word(0x28);
    let n = get16(arg);
    if (n & 3) put16(arg, (n = (n + 4) & 0xfffc));
    for (let b = word(START); b; b = next(b), set16(0x23, 0)) {
      if (rd(b) === FREE && ((size(b) - 4) & 0xffff) >= n) {
        split(b, n);
        wr(b, USED);
        set16(0x23, b);
        set16(0x26, b);
        set16(0x20, b + 4);
        cpu.a = cpu.y = nz((b + 4) >> 8);
        cpu.p &= ~0x41;
        return;
      }
    }
    set16(0x20, 0);
    cpu.a = cpu.y = nz(0);
  }),
  // $E94A SysMemFree(p): free the block whose data is at p; 1 if done (or already free), 0 if p is no block
  0xe94a: fn(0x88dd, () => {
    const h = (get16(word(0x28)) - 4) & 0xffff;
    const start = word(START), end = (long(START) + long(SIZE)) & 0xffff;
    // its bounds check (16-bit), leaving $20 = h and $23 the bound last compared
    store(scratch() + 8, (long(START) + long(SIZE)) >>> 0);
    set16(0x20, h);
    set16(0x23, start);
    if (h < start) return void (cpu.a = cpu.y = nz(0));
    set16(0x23, end);
    if (h > end) return void (cpu.a = cpu.y = nz(0));
    for (let b = start; b; ) {
      set16(0x20, h);
      set16(0x23, b);
      if (b === h) {
        set16(0x26, b);
        if (rd(b) === FREE) return void (cpu.a = cpu.y = nz(1));
        wr(b, FREE);
        join();
        cpu.p &= ~0x41;
        cpu.a = cpu.y = nz(1);
        return;
      }
      b = next(b);
      set16(0x23, 0);
    }
    cpu.a = cpu.y = nz(0);
  }),
};
