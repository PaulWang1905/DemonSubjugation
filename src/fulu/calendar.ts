// The OS's calendar (segments $13 and $14): today's date from the clock's day
// counter, and the functions under it. Compiled C, done here through the C
// runtime's helpers with the same software-stack locals and zero-page
// traffic (as itoa.ts), so registers, flags and the runtime's scratch are
// left as the OS leaves them.
//
//   $E99E date(p): the year is kept at $2B04 and the day of that year in
//     the clock's day counter ($0237/$0238, read by $E7E2); past the year's
//     last day the year moves on (after 2100, back to 1901) and the counter
//     back by a year's days ($E7EE). Then p[0] = the day of the month,
//     p[1] = the month, p[2] = year - 1900, p[3] = the weekday (1 Monday to
//     7 Sunday).
//   $EBEF days(year): 366 or 365.            $EBF2 monthDays(year, month)
//   $EBF8 dayOfYear(year, month, day)        $EBF5 weekday(year, month, day)
//   $EC67 month(year, dayOfYear)             $EC6A dayOfMonth(year, month, dayOfYear)
//   $E7EE setDay(n): the clock's day counter = n (and $0232/$0233).
//
// Their tables are in the OS's segments, which Fulu does not have: the days
// in each month ($13:$8F12), the days before each month in a year of 365
// and of 366 days ($14:$8DE7, $14:$8E01), and the weekday of 1 January of
// 1901-2100 (1-7, Sunday 7: $13:$8E49) are calendar facts, made here. A
// month or year out of their range reads past a table, as on the device:
// the bytes that follow are known up to a point (the next table), and past
// that Fulu reads its own memory.

import { adc, asl, clc, cpu, fn, nz, ram, rd, rol, sbc, sec, word, wr } from "./alu";
import { add20, add2023, call, callByte, getB, imm, leave, put23, reserve, setB, sub20, sub2023 } from "./compiled";
import { helper, load, move, sp, store } from "./itoa";
import type { OsFunction } from "./fulu";

const Z = 0x02;

// ---- the tables ----

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const before = (leap: boolean) => MONTH_DAYS.reduce((a, d, i) => [...a, a[i] + (i === 1 && leap ? 29 : d)], [0]);
const words = (ws: number[]) => ws.flatMap((w) => [w & 0xff, w >> 8]);
/** 1 January's weekday, 1 Monday to 7 Sunday. */
const jan1 = (year: number) => new Date(Date.UTC(year, 0, 1)).getUTCDay() || 7;

/** Segment $13 from $8E49: 1 January's weekday for 1901-2100, a 0, the days in each month, then the words 1-12 that follow. */
const SEG13 = new Map<number, number>(
  [...Array.from({ length: 200 }, (_, i) => jan1(1901 + i)), 0, ...MONTH_DAYS, ...words([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])].map((b, i) => [0x8e49 + i, b]),
);
/** Segment $14 from $8DE7: the days before each month (and the year's), in a year of 365 days, then of 366, then the words 0-3 that follow. */
const SEG14 = new Map<number, number>([...words(before(false)), ...words(before(true)), ...words([0, 1, 2, 3])].map((b, i) => [0x8de7 + i, b]));

/** LDA ($20),y from a table of the OS's (Y = 0, or as set). */
const table = (t: Map<number, number>, a: number) => nz(t.get(a & 0xffff) ?? rd(a));

/** L16[n] mod m, plus 1, compared with 1 (Z: m divides it). */
function divides(n: number, m: number): boolean {
  imm(0x23, m);
  load(0x20, n);
  helper(0xdcb1);
  cpu.a = ram[0x20];
  add20(1);
  imm(0x23, 1);
  helper(0xd340);
  return (cpu.p & Z) !== 0;
}

/** The leap year test on L16[n], as $EBEF and $EBF2 have it. */
const leap = (n: number) => (divides(n, 4) && !divides(n, 100)) || divides(n, 400);

/** $20 = the word at a table + 2 * A (STA $20 / LDA #0 / STA $21 / ASL / ROL / ADC / LDA ($20),y / TAX / INY / LDA / STA $21 / STX $20). */
function wordAt(t: number): void {
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  ram[0x20] = asl(ram[0x20]);
  ram[0x21] = rol(ram[0x21]);
  clc();
  ram[0x20] = adc(ram[0x20], t & 0xff);
  ram[0x21] = cpu.a = adc(ram[0x21], t >> 8);
  const at = word(0x20);
  cpu.y = 0;
  cpu.x = table(SEG14, at);
  cpu.y = 1;
  ram[0x21] = cpu.a = table(SEG14, at + 1);
  ram[0x20] = cpu.x;
}

/** Days in L16[n]'s year ($EBEF), into $20 by a far call. */
function yearDays(n: number): void {
  load(0x20, n);
  helper(0xdaca);
  call(0xebef, 2);
}

// ---- the functions ----

/** $EBEF days(year): $20 = 366 or 365. */
const days = fn(0x5000, () => imm(0x20, leap(0) ? 366 : 365));

/** $EBF2 monthDays(year, month): A = 29 or 28 for February, else the month's days from the table. */
const monthDays = fn(0x50b6, () => {
  getB(2);
  sec();
  if (!sbc(cpu.a, 2)) {
    cpu.a = nz(leap(0) ? 29 : 28);
    return;
  }
  getB(2);
  sec();
  ram[0x20] = sbc(cpu.a, 1);
  ram[0x21] = cpu.a = nz(0);
  add20(0x8f12);
  cpu.y = 0;
  cpu.a = table(SEG13, word(0x20));
});

/** $EBF8 dayOfYear(year, month, day): $20 = the days of the months before, plus the day. */
const dayOfYear = fn(0x528a, () => {
  reserve(4);
  // L16[2]: the sum; L[1]: the month counted; L[0]: its days
  cpu.y = 2;
  wr(sp() + 2, (cpu.a = nz(0)));
  cpu.y = 3;
  wr(sp() + 3, 0);
  cpu.y = 1;
  wr(sp() + 1, (cpu.a = nz(1)));
  for (;;) {
    getB(6);
    sec();
    ram[0x23] = sbc(cpu.a, 1);
    getB(1);
    sec();
    const d = sbc(cpu.a, ram[0x23]);
    if (d && (cpu.p & 0x01)) break; // above month - 1
    getB(1);
    helper(0xdaaa);
    load(0x20, 5);
    helper(0xdaca);
    setB(0, callByte(0xebf2, 3));
    ram[0x23] = getB(0);
    ram[0x24] = cpu.x = nz(0);
    load(0x20, 2);
    add2023();
    store(2);
    getB(1);
    clc();
    setB(1, adc(cpu.a, 1));
  }
  ram[0x23] = getB(7);
  ram[0x24] = cpu.x = nz(0);
  load(0x20, 2);
  add2023();
  leave(4);
});

/** $EBF5 weekday(year, month, day): 1 Monday to 7 Sunday. */
const weekday = fn(0x5190, () => {
  reserve(5);
  getB(8);
  helper(0xdaaa);
  getB(8);
  helper(0xdaaa);
  load(0x20, 7);
  helper(0xdaca);
  call(0xebf8, 4);
  store(3);
  imm(0x23, 7);
  load(0x20, 3);
  helper(0xdcb1);
  setB(0, nz(ram[0x20]));
  load(0x20, 5);
  cpu.a = ram[0x20];
  sub20(0x076d);
  add20(0x8e49);
  cpu.y = 0;
  setB(2, table(SEG13, word(0x20)));
  getB(2);
  cpu.y = nz(0);
  clc();
  setB(1, adc(cpu.a, rd(sp())));
  getB(1);
  sec();
  let d = sbc(cpu.a, 7);
  if (cpu.p & 0x01 && d) {
    getB(1);
    sec();
    setB(1, sbc(cpu.a, 8));
  } else {
    getB(1);
    sec();
    d = sbc(cpu.a, 7);
    if (!d || !(cpu.p & 0x01)) {
      getB(1);
      sec();
      setB(1, sbc(cpu.a, 1));
    }
  }
  getB(1);
  leave(5);
});

/** $EC67 and $EC6A's start: L16[1] = the year's days (L16[3]); Z: 365. */
function common365(): boolean {
  reserve(3);
  yearDays(3);
  store(1);
  imm(0x23, 0x016d);
  load(0x20, 1);
  helper(0xd340);
  return (cpu.p & Z) !== 0;
}

/** $EC67 month(year, dayOfYear): the first month m (0-12) whose days before it reach the day; past 12, 13 - 12. */
const month = fn(0x6318, () => {
  const t = common365() ? 0x8de7 : 0x8e01;
  cpu.y = 0;
  wr(sp(), (cpu.a = nz(0)));
  for (;;) {
    getB(0);
    sec();
    const d = sbc(cpu.a, 12);
    if (d && cpu.p & 0x01) break; // A: 1, its flags
    getB(0);
    wordAt(t);
    move();
    load(0x20, 5);
    helper(0xd340);
    if (cpu.p & Z || !(cpu.p & 0x01)) {
      getB(0);
      break;
    }
    getB(0);
    clc();
    wr(sp() + cpu.y, (cpu.a = adc(cpu.a, 1)));
  }
  leave(3);
});

/** $EC6A dayOfMonth(year, month, dayOfYear): the day less the days before the month. */
const dayOfMonth = fn(0x646f, () => {
  const t = common365() ? 0x8de7 : 0x8e01;
  getB(5);
  sec();
  cpu.a = sbc(cpu.a, 1);
  wordAt(t);
  move();
  load(0x20, 6);
  sub2023();
  cpu.a = nz(ram[0x20]);
  setB(0);
  getB(0);
  leave(3);
});

/** $E7EE setDay(n): the clock's day counter, and $0232/$0233, = n. */
const setDay = fn(0x7637, () => {
  cpu.y = 0;
  cpu.a = nz(rd(sp()));
  wr(0x237, cpu.a);
  wr(0x232, cpu.a);
  cpu.y = 1;
  cpu.a = nz(rd(sp() + 1));
  wr(0x238, cpu.a);
  wr(0x233, cpu.a);
});

/** $E99E date(p): today's date into p (see the top of this file). */
const date = fn(0x6d02, () => {
  reserve(10);
  // L16[1]: the year; L16[5]: the day of the year; L[4], L[3], L[0]: the month, the day, the weekday; L16[7], L[9]: the calls' arguments
  ram[0x20] = cpu.a = rd(0x2b04);
  ram[0x21] = cpu.a = nz(rd(0x2b05));
  store(1);
  clc();
  ram[0x20] = adc(ram[0x28], 5);
  ram[0x21] = cpu.a = adc(ram[0x29], 0);
  helper(0xdaca);
  call(0xe7e2, 2);
  yearDays(1);
  move();
  load(0x20, 5);
  helper(0xd340);
  if (cpu.p & 0x01 && !(cpu.p & Z)) {
    // past the year's last day: the next year
    load(0x20, 1);
    cpu.a = ram[0x20];
    add20(1);
    store(1);
    imm(0x23, 0x0834);
    load(0x20, 1);
    helper(0xd340);
    if (cpu.p & 0x01 && !(cpu.p & Z)) {
      cpu.y = 1;
      wr(sp() + 1, (cpu.a = nz(0x6d)));
      cpu.a = nz(0x07);
      cpu.y = 2;
      wr(sp() + 2, 0x07);
      imm(0x20, 0x0834);
      helper(0xdaca);
      call(0xebef, 2);
    } else {
      load(0x20, 1);
      cpu.a = ram[0x20];
      sub20(1);
      helper(0xdaca);
      call(0xebef, 2);
    }
    move();
    load(0x20, 5);
    sub2023();
    store(5);
    load(0x20, 5);
    helper(0xdaca);
    call(0xe7ee, 2);
    load(0x20, 1);
    wr(0x2b04, (cpu.a = ram[0x20]));
    wr(0x2b05, (cpu.a = ram[0x21]));
  }
  // the month
  load(0x20, 1);
  store(7);
  load(0x20, 5);
  helper(0xdaca);
  load(0x20, 9);
  helper(0xdaca);
  setB(4, callByte(0xec67, 4));
  // the day of the month
  load(0x20, 1);
  store(7);
  getB(4);
  setB(9);
  load(0x20, 5);
  helper(0xdaca);
  getB(11);
  helper(0xdaaa);
  load(0x20, 10);
  helper(0xdaca);
  setB(3, callByte(0xec6a, 5));
  // the weekday
  load(0x20, 1);
  store(7);
  getB(4);
  setB(9);
  getB(3);
  helper(0xdaaa);
  getB(10);
  helper(0xdaaa);
  load(0x20, 9);
  helper(0xdaca);
  setB(0, callByte(0xebf5, 4));
  // p[0..3]
  load(0x20, 10);
  move();
  getB(3);
  put23();
  load(0x20, 10);
  add20(1);
  move();
  getB(4);
  put23();
  load(0x20, 1);
  cpu.a = ram[0x20];
  sub20(0x076c);
  cpu.a = nz(ram[0x20]);
  setB(7);
  load(0x20, 10);
  add20(2);
  move();
  getB(7);
  put23();
  load(0x20, 10);
  add20(3);
  move();
  getB(0);
  put23();
  leave(10);
});

export const CALENDAR: Record<number, OsFunction> = {
  0xe99e: date,
  0xebef: days,
  0xebf2: monthDays,
  0xebf5: weekday,
  0xebf8: dayOfYear,
  0xec67: month,
  0xec6a: dayOfMonth,
  0xe7ee: setDay,
};
