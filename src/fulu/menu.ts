// $E94D (9:$5024): a menu of items in a grid, with its own key loop (中国象棋
// opens it at its start). Compiled C, done here through the same calls to the
// other OS functions and the C runtime's helpers, with the same software-stack
// locals, zero-page traffic and flags (its signed tests read V from whatever
// came before, as the compiler left them); resumable while GuiGetMsg waits, as
// GuiMsgBox is.
//
//   (selection in A, menu, layout):
//   menu: [0] items, [1] columns, [2-3] each column's x offset (a byte table),
//     [4] flags (bit 0: items have 16 × 16 icons; bit 1: the arrows wrap
//     round), [5-6] the items (a table of pointers to {?, text, icon, icon
//     when chosen}).
//   layout: [0-3] x1, x2, y1, y2 (rows and columns 16 pixels), [4] the first
//     item shown, [5] the items a page holds, [6] those it shows, [7] where
//     Exit left the selection.
//   A message already queued for GuiGetMsg is put back first ($0A 3 returns
//   $FD). It lays the menu out (8:$6641; 0 if it cannot), saves the status
//   icons and clears them, keyboard state 3, input mode 2; draws a page
//   (9:$69E4: the area cleared, each item's icon and text) and marks the
//   chosen item (9:$6F1D: inverted, with its other icon; the up and down
//   arrows' icons, and the bar graph for how far down it is). Keys: the
//   arrows move a column or a row (paging, and wrapping round when the
//   flags say), page keys a page, 1-9 and A-Z choose that item, Enter
//   returns the item, Exit $FF, help shows the help word's text ($E96B);
//   the status icons and the keyboard state are put back on leaving.
//
// Its switch's table on the keys is at 9:$8AB6, which Fulu does not have: it
// is here (the keys, then where their cases are in the OS's code, which only
// steer the switch).

import { adc, asl, carry, clc, cpu, fn, m, nz, os, ram, rd, rol, sbc, sec, set16, word, wr } from "./alu";
import { drop, getB, imm, leave, put23, reserve, setB } from "./compiled";
import { helper, load, move, sp, store } from "./itoa";
import { GUI } from "./gui";
import { HEAP } from "./heap";
import { SCREEN } from "./screen";
import { TEXT } from "./text";
import { HELP } from "./help";
import type { OsFunction } from "./fulu";

const Z = 0x02;

// ---- idioms ----

/** $zp = $28 + k. */
function local(zp: number, k: number): void {
  clc();
  ram[zp] = adc(ram[0x28], k);
  ram[zp + 1] = cpu.a = adc(ram[0x29], 0);
}

/** push $28 + k. */
function pushLocal(k: number): void {
  local(0x20, k);
  helper(0xdaca);
}

/** A = ($26)[k] (LDY #k / LDA ($26),y). */
function at26(k: number): number {
  cpu.y = k;
  return (cpu.a = nz(rd(word(0x26) + k)));
}

/** A = L16[n]'s pointee's byte k ($2616 = L16[n], then LDY #k / LDA ($26),y). */
function field(n: number, k: number): number {
  load(0x26, n);
  return at26(k);
}

/** $20 = the word at ($26)[k] (LDY #k / LDA / TAX / INY / LDA / STA $21 / STX $20). */
function word26(k: number): void {
  cpu.y = k;
  cpu.x = nz(rd(word(0x26) + k));
  cpu.y = k + 1;
  ram[0x21] = cpu.a = nz(rd(word(0x26) + k + 1));
  ram[0x20] = cpu.x;
}

/** $20 = the word at ($20)[k]. */
function word20(k: number): void {
  const p = word(0x20);
  cpu.y = k;
  cpu.x = nz(rd(p + k));
  cpu.y = k + 1;
  ram[0x21] = cpu.a = nz(rd(p + k + 1));
  ram[0x20] = cpu.x;
}

/** A -= v, from SEC. */
function minus(v: number): number {
  sec();
  return (cpu.a = sbc(cpu.a, v));
}

/** A += v, from CLC. */
function plus(v: number): number {
  clc();
  return (cpu.a = adc(cpu.a, v));
}

/** A + L[n] (LDY #n / CLC / ADC ($28),y). */
function plusL(n: number): number {
  cpu.y = n;
  return plus(rd(sp() + n));
}

/** A - L[n] (LDY #n / SEC / SBC ($28),y). */
function minusL(n: number): number {
  cpu.y = n;
  return minus(rd(sp() + n));
}

/** A ⊙ $23 by a runtime helper (PHA / LDA #v / STA $23 / PLA / JSR: v given), or with $23 as it is. */
function by(at: number, v?: number): number {
  if (v !== undefined) {
    const a = cpu.a;
    ram[0x23] = cpu.a = nz(v);
    cpu.a = nz(a);
  }
  helper(at);
  return cpu.a;
}

/** L16[n]'s pointee's byte k = L[from] ($2016 = L16[n] / +k / $2316 = $2016 / A = L[from] / LDY #0 / STA). */
function storeField(n: number, k: number, from: number): void {
  load(0x20, n);
  clc();
  ram[0x20] = adc(ram[0x20], k);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  move();
  getB(from);
  put23();
}

/** L16[n]'s pointee's byte k = 0 (... / LDA #0 / LDY #0 / STA). */
function zeroField(n: number, k: number): void {
  load(0x20, n);
  clc();
  ram[0x20] = adc(ram[0x20], k);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  move();
  cpu.a = nz(0);
  put23();
}

/** L[n] = a constant (LDY #n / LDA #v / STA). */
function setConst(n: number, v: number): void {
  cpu.y = n;
  cpu.a = nz(v);
  wr(sp() + n, v);
}

/** A far call with A, no arguments. */
function callA(entry: number, a: number): void {
  cpu.a = nz(a);
  os.call(entry);
}

/** A far call, its arguments then dropped, its byte back in A (TAX / pop / TXA). */
function callByte(entry: number, args: number): number {
  os.call(entry);
  cpu.x = cpu.a;
  drop(args);
  return (cpu.a = nz(cpu.x));
}

/** N ≠ V. */
const negative = () => ((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0);

// ---- 9:$6641: the layout ----

/** layout(&selection, menu, layout): rows and columns, the items a page holds, the selection and the first item shown kept in range; 1. */
function layout(): void {
  reserve(4);
  // L16[4] = &selection, L16[6] = menu, L16[8] = layout
  setB(3, field(8, 1));
  ram[0x23] = field(8, 0);
  getB(3);
  minus(ram[0x23]);
  plus(1);
  setB(2, by(0xdc7b, 0x10));
  setB(3, field(8, 3));
  ram[0x23] = field(8, 2);
  getB(3);
  minus(ram[0x23]);
  plus(1);
  setB(1, by(0xdc7b, 0x10));
  field(6, 1);
  {
    const a = cpu.a;
    ram[0x23] = getB(1);
    cpu.a = nz(a);
  }
  setB(3, by(0xdcef));
  load(0x20, 8);
  clc();
  ram[0x20] = adc(ram[0x20], 5);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  move();
  getB(3);
  put23();
  // the items a page holds: no more than there are
  setB(3, field(8, 5));
  ram[0x23] = field(6, 0);
  getB(3);
  minus(ram[0x23]);
  if (carry() && cpu.a) {
    setB(3, field(6, 0));
    storeField(8, 5, 3);
  }
  // the selection: below the items
  setB(3, field(4, 0));
  ram[0x23] = field(6, 0);
  getB(3);
  minus(ram[0x23]);
  if (carry()) {
    field(6, 0);
    setB(3, minus(1));
    load(0x20, 4);
    move();
    getB(3);
    put23();
  }
  // the first item shown: at a row's start, within the items, not after the selection
  setB(3, field(8, 4));
  ram[0x23] = field(6, 1);
  getB(3);
  helper(0xdcab);
  if (!(cpu.p & Z)) zeroField(8, 4);
  setB(0, field(8, 5));
  setB(3, field(8, 4));
  ram[0x23] = field(6, 0);
  getB(3);
  minus(ram[0x23]);
  let clear = carry() !== 0;
  if (!clear) {
    setB(3, field(8, 4));
    ram[0x23] = field(4, 0);
    getB(3);
    minus(ram[0x23]);
    clear = carry() !== 0 && cpu.a !== 0;
  }
  if (clear) zeroField(8, 4);
  // the selection past the page: the first item shown moved on, by rows
  setB(3, field(4, 0));
  ram[0x23] = field(8, 4);
  getB(3);
  minus(ram[0x23]);
  cpu.y = 0;
  minus(rd(sp()));
  if (carry()) {
    field(4, 0);
    cpu.y = 0;
    minus(rd(sp()));
    setB(3);
    ram[0x23] = field(6, 1);
    getB(3);
    helper(0xdc7b);
    setB(3, plus(1));
    ram[0x23] = field(6, 1);
    getB(3);
    setB(3, by(0xdcef));
    storeField(8, 4, 3);
  }
  // the selection, from the first item shown
  setB(3, field(4, 0));
  ram[0x23] = field(8, 4);
  getB(3);
  setB(3, minus(ram[0x23]));
  load(0x20, 4);
  move();
  getB(3);
  put23();
  cpu.a = nz(1);
  leave(4);
}

// ---- 9:$69E4: a page ----

/** The item's pointer: $20 = menu's items[(i)] (A = i / STA $20 / LDA #0 / STA $21 / ASL / ROL / + L16[n] / the word there). */
function itemAt(i: number, base: number): void {
  ram[0x20] = cpu.a = i;
  ram[0x21] = cpu.a = nz(0);
  ram[0x20] = asl(ram[0x20]);
  ram[0x21] = rol(ram[0x21]);
  cpu.y = base;
  clc();
  ram[0x20] = cpu.a = adc(rd(sp() + base), ram[0x20]);
  cpu.y = base + 1;
  ram[0x21] = cpu.a = adc(rd(sp() + base + 1), ram[0x21]);
  word20(0);
}

/** A = the column table's byte for A % columns ($23 = columns, JSR $DCAB, + L16[n], LDA). */
function columnX(base: number): number {
  helper(0xdcab);
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  cpu.y = base;
  clc();
  ram[0x20] = cpu.a = adc(rd(sp() + base), ram[0x20]);
  cpu.y = base + 1;
  ram[0x21] = cpu.a = adc(rd(sp() + base + 1), ram[0x21]);
  cpu.y = 0;
  return (cpu.a = nz(rd(word(0x20))));
}

/** page(selection in A, menu, layout). */
function page(): void {
  helper(0xdaaa);
  reserve(15);
  // L[15] the selection, L16[16] the menu, L16[18] the layout
  setConst(0, 0);
  setB(10, field(18, 4));
  setB(11, field(16, 0));
  ram[0x23] = field(18, 4);
  getB(11);
  setB(11, minus(ram[0x23]));
  ram[0x23] = field(18, 5);
  getB(11);
  minus(ram[0x23]);
  if (carry()) setB(11, field(18, 5));
  else {
    setB(11, field(16, 0));
    ram[0x23] = field(18, 4);
    getB(11);
    setB(11, minus(ram[0x23]));
  }
  storeField(18, 6, 11);
  // the selection within those shown
  field(18, 6);
  ram[0x23] = minus(1);
  getB(15);
  minus(ram[0x23]);
  if (carry() && cpu.a) {
    field(18, 6);
    setB(15, minus(1));
  }
  // the area: x2 no further than 158
  setB(5, field(18, 1));
  imm(0x23, 0x9e);
  getB(5);
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  helper(0xd340);
  if (carry() && !(cpu.p & Z)) setConst(5, 0x9e);
  setB(11, field(18, 0));
  setB(12, field(18, 2));
  field(18, 3);
  helper(0xdaaa);
  getB(6);
  helper(0xdaaa);
  getB(14);
  helper(0xdaaa);
  getB(14);
  os.call(0xe85d);
  drop(3);
  // the icons' width
  field(16, 4);
  cpu.a = nz(cpu.a & 0x01);
  if (cpu.a) setConst(0, 0x10);
  setConst(4, 0);
  for (;;) {
    ram[0x23] = field(18, 6);
    getB(4);
    minus(ram[0x23]);
    if (carry()) break;
    load(0x26, 16);
    word26(2);
    store(11);
    ram[0x23] = field(16, 1);
    getB(4);
    setB(3, columnX(11));
    setB(11, field(18, 2));
    ram[0x23] = field(16, 1);
    getB(4);
    helper(0xdc7b);
    by(0xdcef, 0x10);
    setB(6, plusL(11));
    field(16, 4);
    cpu.a = nz(cpu.a & 0x01);
    if (cpu.a) {
      getB(4);
      minusL(15);
      if (cpu.a) {
        // its icon (the chosen one has its own, when marked)
        setB(11, field(18, 0));
        load(0x26, 16);
        word26(2);
        store(13);
        getB(10);
        setB(12, plusL(4));
        ram[0x23] = field(16, 1);
        getB(12);
        columnX(13);
        setB(7, plusL(11));
        load(0x26, 16);
        word26(5);
        store(11);
        getB(10);
        itemAt(plusL(4), 11);
        word20(3);
        store(8);
        getB(7);
        setB(11, plus(0x0f));
        getB(6);
        setB(12, plus(0x0f));
        cpu.a = nz(0);
        helper(0xdaaa);
        load(0x20, 9);
        helper(0xdaca);
        getB(15);
        helper(0xdaaa);
        getB(15);
        helper(0xdaaa);
        getB(11);
        helper(0xdaaa);
        getB(13);
        os.call(0xe78e);
        drop(6);
      }
    }
    // its text
    field(18, 0);
    cpu.y = 0;
    plus(rd(sp()));
    setB(7, plusL(3));
    load(0x26, 16);
    word26(5);
    store(11);
    getB(4);
    itemAt(plusL(10), 11);
    word20(1);
    store(1);
    load(0x20, 1);
    helper(0xdaca);
    getB(8);
    helper(0xdaaa);
    getB(10);
    os.call(0xe79a);
    drop(3);
    getB(4);
    setB(4, plus(1));
  }
  // the chosen one marked
  load(0x20, 18);
  helper(0xdaca);
  load(0x20, 18);
  helper(0xdaca);
  getB(19);
  helper(0xdaaa);
  getB(20);
  mark();
  drop(5);
  leave(16);
}

// ---- 9:$6F1D: the chosen item marked ----

/** One item drawn as (un)chosen: its icon (items' word `icon` of the item `nth` = L[14] or L[15]), then its text's place inverted. */
function markItem(nth: number, icon: number): void {
  setConst(2, 0);
  load(0x26, 16);
  word26(2);
  store(10);
  ram[0x23] = field(16, 1);
  getB(nth);
  setB(6, columnX(10));
  field(18, 0);
  setB(9, plusL(6));
  setB(10, field(18, 2));
  ram[0x23] = field(16, 1);
  getB(nth);
  helper(0xdc7b);
  by(0xdcef, 0x10);
  setB(8, plusL(10));
  field(16, 4);
  cpu.a = nz(cpu.a & 0x01);
  if (cpu.a) {
    load(0x26, 16);
    word26(5);
    store(10);
    getB(5);
    itemAt(plusL(nth), 10);
    word20(icon);
    store(3);
    getB(9);
    setB(10, plus(0x0f));
    getB(8);
    setB(11, plus(0x0f));
    cpu.a = nz(0);
    helper(0xdaaa);
    load(0x20, 4);
    helper(0xdaca);
    getB(14);
    helper(0xdaaa);
    getB(14);
    helper(0xdaaa);
    getB(13);
    helper(0xdaaa);
    getB(15);
    os.call(0xe78e);
    drop(6);
    setConst(2, 0x10);
  }
  getB(9);
  setB(10, plusL(2));
  load(0x26, 16);
  word26(5);
  store(12);
  getB(5);
  itemAt(plusL(nth), 12);
  cpu.y = 0;
  cpu.a = nz(rd(word(0x20)));
  by(0xdcef, 0x08);
  plusL(10);
  setB(7, minus(2));
  getB(9);
  setB(10, plusL(2));
  getB(8);
  plus(0x0f);
  helper(0xdaaa);
  getB(8);
  helper(0xdaaa);
  getB(10);
  helper(0xdaaa);
  getB(13);
  os.call(0xe860);
  drop(3);
}

/** mark(new in A, old, menu, layout): the old item unmarked, the new marked; the bar graph and the arrows' icons; 1. */
function mark(): void {
  helper(0xdaaa);
  reserve(14);
  // L[14] the new, L[15] the old, L16[16] the menu, L16[18] the layout
  setB(5, field(18, 4));
  getB(14);
  minusL(15);
  if (cpu.a) markItem(15, 3);
  markItem(14, 5);
  // the bar graph: (first shown + new + 1) × 100 / items
  getB(14);
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  store(10);
  field(18, 4);
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  cpu.y = 10;
  cpu.a = ram[0x20];
  clc();
  ram[0x20] = cpu.a = adc(cpu.a, rd(sp() + 10));
  cpu.y = 11;
  cpu.a = ram[0x21];
  ram[0x21] = cpu.a = adc(cpu.a, rd(sp() + 11));
  cpu.a = ram[0x20];
  clc();
  ram[0x20] = cpu.a = adc(cpu.a, 1);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  imm(0x23, 0x64);
  helper(0xdcf4);
  store(10);
  ram[0x23] = field(16, 0);
  ram[0x24] = cpu.x = nz(0);
  load(0x20, 10);
  helper(0xdc80);
  store(0);
  load(0x20, 0);
  cpu.a = nz(ram[0x20]);
  os.call(0xe8e3);
  // the arrows
  field(18, 4);
  plusL(14);
  plus(1);
  minus(1);
  callA(0xe815, carry() && cpu.a ? 1 : 0);
  field(18, 4);
  plusL(14);
  setB(10, plus(1));
  ram[0x23] = field(16, 0);
  getB(10);
  minus(ram[0x23]);
  callA(0xe812, carry() ? 0 : 1);
  cpu.a = nz(1);
  leave(15);
}

// ---- the switch's table ----

const SWITCH = 0x8ab6;
const CASES: [number, number][] = [
  [0x24, 0x55a5],
  [0x25, 0x58bd],
  [0x22, 0x5b02],
  [0x23, 0x5e60],
  [0x20, 0x6131],
  [0x21, 0x62ca],
  [0x27, 0x6481],
  [0x28, 0x64ef],
  [0x26, 0x6588],
];
const DEFAULT = 0x65da;
const TABLE = new Map<number, number>([
  ...CASES.flatMap(([k], i): [number, number][] => [[SWITCH + 2 * i, k], [SWITCH + 2 * i + 1, 0]]),
  ...CASES.flatMap(([, at], i): [number, number][] => [[SWITCH + 18 + 2 * i, at & 0xff], [SWITCH + 19 + 2 * i, at >> 8]]),
]);

/** The switch on the message's word ($DB5C): where it goes. */
function switchOn(): number {
  load(0x20, 18);
  ram[0x23] = cpu.a = ram[0x20];
  ram[0x24] = cpu.x = nz(0);
  imm(0x26, SWITCH);
  cpu.x = 9;
  cpu.y = 0;
  imm(0x20, DEFAULT);
  const pc = cpu.pc, s = cpu.s, read = m.read;
  m.read = (a: number) => TABLE.get(a) ?? read.call(m, a);
  try {
    helper(0xdb5c);
  } finally {
    m.read = read;
  }
  const to = word(0x26);
  cpu.pc = pc;
  cpu.s = s;
  return to;
}

// ---- the cases' recurring parts ----

/** The page drawn again: page(L[20], menu, layout) (push L16[28] twice, A = L[24], JSR $69E4, pop 4). */
function redraw(): void {
  load(0x20, 28);
  helper(0xdaca);
  load(0x20, 28);
  helper(0xdaca);
  getB(24);
  page();
  drop(4);
}

/** L[22] = L[20], L[20] = v (by `set`), L[21] = 1: the mark moves. */
function moveMark(set: () => void): void {
  setB(22, getB(20));
  set();
  setConst(0x15, 1);
}

/** layout[4] = L[23] (storeField). */
const firstShown = () => storeField(28, 4, 23);

/** The arrows' wrap to the last item (9:$56E0, 9:$5C83). */
function toLast(): void {
  setB(23, field(26, 0));
  ram[0x23] = field(28, 5);
  getB(23);
  minus(ram[0x23]);
  if (!(cpu.p & Z) && carry()) {
    setB(23, field(26, 0));
    ram[0x23] = field(26, 1);
    getB(23);
    helper(0xdcab);
    if (cpu.p & Z) {
      setB(23, field(26, 0));
      ram[0x23] = field(28, 5);
      getB(23);
      setB(23, minus(ram[0x23]));
      firstShown();
    } else {
      setB(23, field(26, 0));
      ram[0x23] = field(26, 1);
      getB(23);
      helper(0xdc7b);
      setB(23, plus(1));
      ram[0x23] = field(26, 1);
      getB(23);
      setB(23, by(0xdcef));
      ram[0x23] = field(28, 5);
      getB(23);
      setB(23, minus(ram[0x23]));
      firstShown();
    }
    setB(23, field(26, 0));
    ram[0x23] = field(28, 4);
    getB(23);
    minus(ram[0x23]);
    setB(20, minus(1));
    redraw();
    return;
  }
  moveMark(() => {
    field(26, 0);
    setB(20, minus(1));
  });
}

/** The arrows' wrap to the first item (9:$5A57, 9:$6086). */
function toFirst(): void {
  setB(23, field(26, 0));
  ram[0x23] = field(28, 5);
  getB(23);
  minus(ram[0x23]);
  if (cpu.p & Z || !carry()) {
    setB(22, getB(20));
    setConst(0x14, 0);
    setConst(0x15, 1);
    return;
  }
  zeroField(28, 4);
  setConst(0x14, 0);
  redraw();
}

// ---- the cases ----

/** $24: back an item. */
function back(): void {
  getB(20);
  if (cpu.a && !negative()) return moveMark(() => (getB(20), setB(20, minus(1))));
  field(28, 4);
  plus(1);
  minus(1);
  if (carry() && cpu.a) {
    getB(20);
    if (!cpu.a) {
      setB(23, field(28, 4));
      ram[0x23] = field(26, 1);
      getB(23);
      setB(23, minus(ram[0x23]));
      firstShown();
      field(26, 1);
      setB(20, minus(1));
      return redraw();
    }
  }
  field(28, 4);
  plus(1);
  minus(1);
  if (cpu.a) return;
  getB(20);
  plus(1);
  minus(1);
  if (cpu.a) return;
  field(26, 4);
  cpu.a = nz(cpu.a & 0x02);
  if (cpu.a) toLast();
}

/** $25: on an item. */
function forward(): void {
  field(28, 6);
  ram[0x23] = minus(1);
  getB(20);
  minus(ram[0x23]);
  if (!carry()) return moveMark(() => (getB(20), setB(20, plus(1))));
  field(28, 5);
  ram[0x23] = minus(1);
  getB(20);
  minus(ram[0x23]);
  if (!cpu.a) {
    setB(23, field(28, 6));
    field(28, 4);
    setB(23, plusL(0x17));
    ram[0x23] = field(26, 0);
    getB(23);
    minus(ram[0x23]);
    if (!carry()) {
      setB(23, field(28, 4));
      field(26, 1);
      setB(23, plusL(0x17));
      firstShown();
      ram[0x23] = field(26, 1);
      getB(20);
      minus(ram[0x23]);
      setB(20, plus(1));
      return redraw();
    }
  }
  field(28, 4);
  plusL(0x14);
  setB(23, plus(1));
  ram[0x23] = field(26, 0);
  getB(23);
  minus(ram[0x23]);
  if (cpu.a) return;
  field(26, 4);
  cpu.a = nz(cpu.a & 0x02);
  if (cpu.a) toFirst();
}

/** $22: up a row. */
function up(): void {
  ram[0x23] = field(26, 1);
  getB(20);
  minus(ram[0x23]);
  if (carry()) {
    return moveMark(() => {
      ram[0x23] = field(26, 1);
      getB(20);
      setB(20, minus(ram[0x23]));
    });
  }
  setB(23, field(28, 4));
  ram[0x23] = field(26, 1);
  getB(23);
  minus(ram[0x23]);
  if (carry()) {
    setB(23, field(28, 4));
    ram[0x23] = field(26, 1);
    getB(23);
    setB(23, minus(ram[0x23]));
    firstShown();
    return redraw();
  }
  getB(20);
  if (cpu.a && !negative()) {
    field(26, 4);
    cpu.a = nz(cpu.a & 0x02);
    if (cpu.a) return moveMark(() => (getB(20), setB(20, minus(1))));
  }
  getB(20);
  if (cpu.a) return;
  field(28, 4);
  if (cpu.a) return;
  field(26, 4);
  cpu.a = nz(cpu.a & 0x02);
  if (cpu.a) toLast();
}

/** $23: down a row. */
function down(): void {
  field(26, 1);
  setB(23, plusL(0x14));
  ram[0x23] = field(28, 6);
  getB(23);
  minus(ram[0x23]);
  if (!carry()) {
    return moveMark(() => {
      field(26, 1);
      setB(20, plusL(0x14));
    });
  }
  setB(23, field(28, 6));
  field(28, 4);
  setB(23, plusL(0x17));
  ram[0x23] = field(26, 0);
  getB(23);
  minus(ram[0x23]);
  if (!carry()) {
    setB(23, field(28, 4));
    field(26, 1);
    setB(23, plusL(0x17));
    firstShown();
    field(28, 4);
    setB(23, plusL(0x14));
    field(26, 0);
    ram[0x23] = minus(1);
    getB(23);
    minus(ram[0x23]);
    if (carry() && cpu.a) {
      setB(23, field(26, 0));
      ram[0x23] = field(28, 4);
      getB(23);
      minus(ram[0x23]);
      setB(20, minus(1));
    }
    return redraw();
  }
  field(28, 6);
  ram[0x23] = minus(1);
  getB(20);
  minus(ram[0x23]);
  if (!carry()) {
    field(26, 4);
    cpu.a = nz(cpu.a & 0x02);
    if (cpu.a) return moveMark(() => (getB(20), setB(20, plus(1))));
  }
  field(28, 6);
  ram[0x23] = minus(1);
  getB(20);
  minus(ram[0x23]);
  if (cpu.a) return;
  field(26, 4);
  cpu.a = nz(cpu.a & 0x02);
  if (cpu.a) toFirst();
}

/** $20: a page back. */
function pageBack(): void {
  setB(23, field(28, 4));
  ram[0x23] = field(28, 5);
  getB(23);
  minus(ram[0x23]);
  if (carry()) {
    setB(23, field(28, 4));
    ram[0x23] = field(28, 5);
    getB(23);
    setB(23, minus(ram[0x23]));
    firstShown();
    setConst(0x14, 0);
    return redraw();
  }
  field(28, 4);
  plus(1);
  minus(1);
  if (!carry() || !cpu.a) return;
  setB(22, field(28, 4));
  zeroField(28, 4);
  getB(22);
  setB(23, plusL(0x14));
  field(28, 5);
  ram[0x23] = minus(1);
  getB(23);
  minus(ram[0x23]);
  if (carry() && cpu.a) setConst(0x14, 0);
  else {
    getB(20);
    setB(20, plusL(0x16));
  }
  redraw();
}

/** $21: a page on. */
function pageOn(): void {
  setB(23, field(28, 4));
  field(28, 5);
  by(0xdcef, 0x02);
  setB(23, plusL(0x17));
  ram[0x23] = field(26, 0);
  getB(23);
  minus(ram[0x23]);
  if (!carry()) {
    setB(23, field(28, 4));
    field(28, 5);
    setB(23, plusL(0x17));
    firstShown();
    setConst(0x14, 0);
    return redraw();
  }
  setB(23, field(28, 4));
  field(28, 5);
  setB(23, plusL(0x17));
  ram[0x23] = field(26, 0);
  getB(23);
  minus(ram[0x23]);
  if (carry()) return;
  setB(23, field(28, 4));
  field(28, 5);
  setB(23, plusL(0x17));
  firstShown();
  setConst(0x14, 0);
  redraw();
}

/** Leaving: the status icons and the keyboard state put back. */
function putBack(): void {
  pushLocal(0);
  os.call(0xe8f2);
  drop(2);
  load(0x20, 14);
  helper(0xdaca);
  os.call(0xe968);
  drop(2);
}

// ---- 9:$5024 ----

/** The frame (its software stack pointer), kept while GuiGetMsg waits; and whether it waits in the help screen. */
let frame = 0, inHelp = false;

/** A digit or letter's item (L[16], from 1): if it is one of the items, A = it - 1 and true. */
function chosen(): boolean {
  ram[0x23] = field(26, 0);
  getB(16);
  minus(ram[0x23]);
  if (cpu.a && carry()) return false;
  putBack();
  getB(16);
  minus(1);
  return true;
}

/** $20 = L16[18], compared with v (Z; C: at least). */
function compareWord(v: number): void {
  load(0x20, 18);
  imm(0x23, v);
  helper(0xd340);
}

function menu(): void | "wait" {
  const caller = word(0x28);
  let retrying = os.retrying;
  if (!retrying) {
    inHelp = false;
    helper(0xdaaa);
    reserve(25);
    // a message already queued: put back ($0A 3: leave with $FD)
    pushLocal(0x11);
    callByte(0xea25, 2);
    minus(0);
    if (cpu.a) {
      pushLocal(0x11);
      os.call(0xe92f);
      drop(2);
      getB(0x11);
      minus(0x0a);
      if (!cpu.a) {
        load(0x20, 18);
        cpu.a = ram[0x20];
        minus(3);
        if (!cpu.a) {
          cpu.a = nz(0xfd);
          return leave(26);
        }
      }
    }
    setB(20, getB(25));
    local(0x20, 0x14);
    store(23);
    load(0x20, 28);
    helper(0xdaca);
    load(0x20, 28);
    helper(0xdaca);
    load(0x20, 27);
    helper(0xdaca);
    layout();
    cpu.x = cpu.a;
    drop(6);
    cpu.a = nz(cpu.x);
    minus(0);
    if (!cpu.a) {
      cpu.a = nz(0);
      return leave(26);
    }
    pushLocal(0);
    os.call(0xe8ef);
    drop(2);
    os.call(0xe8ec);
    os.call(0xe965);
    store(14);
    callA(0xe938, 3);
    callA(0xe93b, 2);
    load(0x20, 28);
    helper(0xdaca);
    load(0x20, 28);
    helper(0xdaca);
    getB(24);
    page();
    drop(4);
    frame = sp();
  } else set16(0x28, frame);
  for (;;) {
    if (retrying && inHelp) {
      // back into the help screen, where it waited
      set16(0x28, (frame - 2) & 0xffff);
      os.retrying = true;
      const r = os.call(0xe96b, true);
      os.retrying = retrying = false;
      if (r === "wait") {
        set16(0x28, caller);
        return "wait";
      }
      inHelp = false;
      drop(2);
      marked();
      continue;
    }
    // GuiGetMsg(&L[17]), GuiTranslateMsg
    if (!retrying) cpu.a = nz(1);
    pushLocal(0x11);
    os.retrying = retrying;
    const r = os.call(0xe935, retrying);
    retrying = false;
    os.retrying = false;
    if (r === "wait") {
      set16(0x28, caller);
      return "wait";
    }
    cpu.x = cpu.a;
    drop(2);
    cpu.a = nz(cpu.x);
    minus(0);
    if (!cpu.a) continue;
    pushLocal(0x11);
    callByte(0xe93e, 2);
    minus(0);
    if (!cpu.a) continue;
    setConst(0x15, 0);
    ram[0x23] = getB(0x11);
    ram[0x24] = cpu.x = nz(0);
    const is = (k: number) => {
      sec();
      ram[0x20] = sbc(k, ram[0x23]);
      cpu.a = sbc(0, ram[0x24]);
      return !(cpu.a = nz(cpu.a | ram[0x20]));
    };
    if (is(2)) {
      // a character: 1-9 and A-Z (a-z made capitals) choose an item
      compareWord(0x30);
      if (carry()) {
        compareWord(0x39);
        if (cpu.p & Z || !carry()) {
          load(0x20, 18);
          cpu.a = nz(ram[0x20] & 0xff);
          ram[0x20] = cpu.a;
          cpu.a = nz(ram[0x21] & 0);
          ram[0x21] = cpu.a;
          cpu.a = ram[0x20];
          setB(16, minus(0x30));
          getB(16);
          if (cpu.a && chosen()) return leave(26);
        }
      }
      compareWord(0x61);
      if (carry()) {
        compareWord(0x7a);
        if (cpu.p & Z || !carry()) {
          load(0x20, 18);
          store(23);
          load(0x20, 23);
          cpu.a = ram[0x20];
          sec();
          ram[0x20] = sbc(cpu.a, 0x20);
          ram[0x21] = cpu.a = sbc(ram[0x21], 0);
          store(23);
          local(0x20, 0x12);
          move();
          load(0x20, 23);
          cpu.y = 0;
          wr(word(0x23), (cpu.a = ram[0x20]));
          cpu.y = 1;
          wr(word(0x23) + 1, (cpu.a = ram[0x21]));
        }
      }
      compareWord(0x41);
      if (carry()) {
        compareWord(0x5a);
        if (cpu.p & Z || !carry()) {
          load(0x20, 18);
          cpu.a = ram[0x20];
          sec();
          ram[0x20] = sbc(cpu.a, 0x41);
          ram[0x21] = cpu.a = sbc(ram[0x21], 0);
          cpu.a = ram[0x20];
          clc();
          ram[0x20] = adc(cpu.a, 0x0a);
          ram[0x21] = cpu.a = adc(ram[0x21], 0);
          cpu.a = nz(ram[0x20]);
          setB(16);
          if (chosen()) return leave(26);
        }
      }
    } else if (is(0x0a)) {
      load(0x20, 18);
      cpu.a = ram[0x20];
      minus(3);
      if (!cpu.a) {
        pushLocal(0x11);
        os.call(0xe92f);
        drop(2);
        putBack();
        cpu.a = nz(0xfd);
        return leave(26);
      }
    } else if (is(5)) {
      const to = switchOn();
      if (to === 0x55a5) back();
      else if (to === 0x58bd) forward();
      else if (to === 0x5b02) up();
      else if (to === 0x5e60) down();
      else if (to === 0x6131) pageBack();
      else if (to === 0x62ca) pageOn();
      else if (to === 0x6481) {
        putBack();
        field(28, 4);
        plusL(0x14);
        return leave(26);
      } else if (to === 0x64ef) {
        putBack();
        field(28, 4);
        setB(23, plusL(0x14));
        storeField(28, 7, 23);
        cpu.a = nz(0xff);
        return leave(26);
      } else if (to === 0x6588) {
        // help: $E96B(the help word at $2BA8), unless $FFFF
        ram[0x20] = cpu.a = rd(0x2ba8);
        ram[0x21] = cpu.a = rd(0x2ba9);
        store(12);
        imm(0x23, 0xffff);
        load(0x20, 12);
        helper(0xd340);
        if (!(cpu.p & Z)) {
          load(0x20, 12);
          helper(0xdaca);
          if (os.call(0xe96b) === "wait") {
            inHelp = true;
            set16(0x28, caller);
            return "wait";
          }
          drop(2);
        }
      }
    }
    marked();
  }
}

/** The mark moved (9:$65DD): mark(L[20], L[22], menu, layout), L[21] = 0. */
function marked(): void {
  getB(0x15);
  if (!cpu.a) return;
  load(0x20, 28);
  helper(0xdaca);
  load(0x20, 28);
  helper(0xdaca);
  getB(26);
  helper(0xdaaa);
  getB(25);
  mark();
  drop(5);
  setConst(0x15, 0);
}

// ---- $E96B (1:$6C66): the help word's text ----

/** $E96B(w): $FFFF nothing; above $8000 a text in memory, through $E980; else one of the OS's own help texts (not in Fulu). */
function helpWord(): void | "wait" {
  const caller = word(0x28);
  if (!os.retrying) {
    reserve(2);
    imm(0x23, 0xffff);
    load(0x20, 2);
    helper(0xd340);
    if (cpu.p & Z) return drop(2);
    imm(0x23, 0x8000);
    load(0x20, 2);
    helper(0xd340);
    if (!carry() || cpu.p & Z) return void os.stop("Fulu has no $E96B with one of the OS's own help texts yet");
    load(0x20, 2);
    helper(0xdaca);
  } else set16(0x28, (caller - 4) & 0xffff);
  if (os.call(0xe980, os.retrying) === "wait") {
    set16(0x28, caller);
    return "wait";
  }
  drop(2);
  drop(2);
}

/** What the functions it calls use as temporaries. */
const FUNCS: Record<number, OsFunction> = { ...SCREEN, ...TEXT, ...HEAP, ...GUI, ...HELP };
const TEMPORARIES = [0xea25, 0xe92f, 0xe8ef, 0xe8ec, 0xe965, 0xe938, 0xe93b, 0xe935, 0xe93e, 0xe8f2, 0xe968, 0xe85d, 0xe78e, 0xe79a, 0xe860, 0xe8e3, 0xe815, 0xe812, 0xe980].flatMap(
  (e) => FUNCS[e]?.temporaries ?? [],
);

export const MENU: Record<number, OsFunction> = {
  0xe94d: fn(0x5024, menu, TEMPORARIES),
  0xe96b: fn(0x6c66, helpWord, TEMPORARIES),
};
