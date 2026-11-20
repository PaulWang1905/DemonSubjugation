// $E980 (8:$7A6E) and the dialog it opens, $F262 ($25:$73FA): a text
// shown a page at a time, scrolled by the arrows and the page keys (a help
// screen, it seems; 幸运花 opens it). Compiled C, done here through the same
// calls to the other OS functions and the C runtime's helpers, with the same
// software-stack locals and zero-page traffic; resumable while GuiGetMsg
// waits, as GuiMsgBox is.
//
//   $E980(text): $F262(text), A its result.
//   $F262(text): the text is lines, each ended by a 0, the whole by a 1
//     after a 0. The cursor's state saved ($E8E9) and the cursor hidden, the
//     screen saved ($E8CB), the status icons saved ($E8EF) and cleared, the
//     keyboard in state 2 and input mode 2. Six lines a page, 16 pixels
//     apart, each in a cleared band through SysPrintString; the up and down
//     arrows' icons ($E815, $E812) as there is more above and below, and
//     how far down the page is on the bar graph ($E8E3, the last line shown
//     × 100 / the lines). Up and down a line, page up and down 6 lines;
//     Enter, Exit, the power key ($08 1) and the messages $0A 3 (put back)
//     and $0A 4 leave. Then all of it is put back, and the cursor if it was
//     on. It returns A as its epilogue leaves it (the software stack
//     pointer's high byte): the key that ended it is not returned.
//
// Its switch's table on the arrows and page keys is at $25:$82C7, which Fulu
// does not have: it is here (the keys, then where their cases are in the
// OS's code, which only steer the switch).

import { adc, clc, cpu, fn, m, nz, os, ram, rd, sbc, sec, set16, word, wr } from "./alu";
import { add2023, call, drop, getB, imm, leave, put23, reserve, setB } from "./compiled";
import { helper, load, move, sp, store } from "./itoa";
import { GUI } from "./gui";
import { HEAP } from "./heap";
import { SCREEN } from "./screen";
import { TEXT } from "./text";
import type { OsFunction } from "./fulu";

// ---- the compiled idioms these use ----

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

/** A = *(L16[n]) (A = L[n] / TAX / INY / LDA / STA $27 / STX $26 / LDY #0 / LDA ($26),y). */
function deref(n: number): number {
  getB(n);
  cpu.x = cpu.a;
  cpu.y = n + 1;
  ram[0x27] = cpu.a = nz(rd(sp() + n + 1));
  ram[0x26] = cpu.x;
  cpu.y = 0;
  return (cpu.a = nz(rd(word(0x26))));
}

/** L16[n] += 1 ($2316 = #1, $2016 = L16[n], CLC / ADC, L16[n] = $2016). */
function incL16(n: number): void {
  imm(0x23, 1);
  load(0x20, n);
  add2023();
  store(n);
}

/** L16[n] += 1 by LDA $20 / CLC / ADC #1 ... (the other way the compiler writes it). */
function bumpL16(n: number): void {
  load(0x20, n);
  cpu.a = ram[0x20];
  clc();
  ram[0x20] = adc(cpu.a, 1);
  ram[0x21] = cpu.a = adc(ram[0x21], 0);
  store(n);
}

/** Whether L[n] + 1 - k is 0 as a byte (A = L[n] / CLC / ADC #1 / SEC / SBC #k). */
function plusOneMinus(n: number, k: number): number {
  getB(n);
  clc();
  cpu.a = adc(cpu.a, 1);
  sec();
  return (cpu.a = sbc(cpu.a, k));
}

/** N ≠ V: the last subtraction was negative, as a signed byte. */
const negative = () => ((cpu.p & 0x80) !== 0) !== ((cpu.p & 0x40) !== 0);

/** A far call with A, no arguments. */
function callA(entry: number, a: number): void {
  cpu.a = nz(a);
  os.call(entry);
}

/** A local JSR returning a byte, then its arguments dropped (TAX / pop / TXA). */
function byte(run: () => void, args: number): number {
  run();
  cpu.x = cpu.a;
  drop(args);
  return (cpu.a = nz(cpu.x));
}

// ---- $802D: the text's lines ----

/** The lines (ended by 0) before the end (a 1 after a 0), from p (its argument). */
function countLines(): void {
  reserve(4);
  load(0x20, 4);
  store(2);
  setB(0, deref(2));
  cpu.y = 1;
  wr(sp() + 1, (cpu.a = nz(0)));
  for (;;) {
    if (!plusOneMinus(0, 1)) {
      getB(1);
      clc();
      setB(1, adc(cpu.a, 1));
    }
    incL16(2);
    setB(0, deref(2));
    if (plusOneMinus(0, 2)) continue;
    imm(0x23, 1);
    load(0x20, 2);
    sec();
    ram[0x20] = sbc(ram[0x20], ram[0x23]);
    ram[0x21] = cpu.a = sbc(ram[0x21], ram[0x24]);
    cpu.y = 0;
    cpu.a = nz(rd(word(0x20)));
    clc();
    cpu.a = adc(cpu.a, 1);
    sec();
    if (!(cpu.a = sbc(cpu.a, 1))) break;
  }
  getB(1);
  leave(4);
}


// ---- $7C3A: a page ----

/** The page of 6 lines from p, the top line `top` (A); *next = the text after it. A = the last line shown + 1, counting from 1 (or what L[1] held, if none was). */
function page(): void {
  helper(0xdaaa); // top, pushed
  reserve(38);
  // L16[27]: p; L[31], L[30]: the page's x and y; L16[25]: the row; L[29]: its y; L[0]: the character; L[2-22]: the line; L16[23]: its length
  load(0x20, 39);
  store(27);
  cpu.y = 0x1f;
  wr(sp() + 0x1f, (cpu.a = nz(0)));
  cpu.y = 0x1e;
  wr(sp() + 0x1e, (cpu.a = nz(0)));
  cpu.y = 0x19;
  wr(sp() + 0x19, (cpu.a = nz(0)));
  cpu.y = 0x1a;
  wr(sp() + 0x1a, 0);
  setB(0, deref(27));
  for (;;) {
    imm(0x23, 6);
    load(0x20, 25);
    helper(0xd340);
    if (cpu.p & 0x01) break;
    imm(0x23, 0x10);
    load(0x20, 25);
    helper(0xdcf4);
    cpu.a = nz(ram[0x20]);
    setB(29);
    if (plusOneMinus(0, 2)) {
      // a line: into L[2-22], 0s first
      cpu.y = 0x20;
      wr(sp() + 0x20, (cpu.a = nz(0)));
      cpu.y = 0x21;
      wr(sp() + 0x21, 0);
      for (;;) {
        imm(0x23, 0x15);
        load(0x20, 32);
        helper(0xd340);
        if (cpu.p & 0x01) break;
        load(0x20, 32);
        lineAt();
        move();
        cpu.a = nz(0);
        cpu.y = 0;
        wr(word(0x23), 0);
        bumpL16(32);
      }
      cpu.y = 0x17;
      wr(sp() + 0x17, (cpu.a = nz(0)));
      cpu.y = 0x18;
      wr(sp() + 0x18, 0);
      while (plusOneMinus(0, 1)) {
        load(0x20, 23);
        lineAt();
        move();
        getB(0);
        put23();
        incL16(27);
        setB(0, deref(27));
        bumpL16(23);
      }
      band();
      // SysPrintString(x, y, the line)
      getB(30);
      cpu.y = 0x1d;
      clc();
      setB(34, adc(cpu.a, rd(sp() + 0x1d)));
      pushLocal(2);
      getB(36);
      helper(0xdaaa);
      getB(34);
      call(0xe79a, 3);
      incL16(27);
      setB(0, deref(27));
      // L[1] = row + top + 1
      load(0x23, 25);
      getB(38);
      helper(0xd49e);
      add2023();
      cpu.a = ram[0x20];
      clc();
      ram[0x20] = adc(cpu.a, 1);
      ram[0x21] = cpu.a = adc(ram[0x21], 0);
      cpu.a = nz(ram[0x20]);
      setB(1);
    } else band(); // (the end: the rest of the page cleared, p staying there)
    bumpL16(25);
  }
  // *next = p
  load(0x20, 27);
  store(34);
  load(0x20, 41);
  move();
  load(0x20, 34);
  cpu.y = 0;
  wr(word(0x23), (cpu.a = ram[0x20]));
  cpu.y = 1;
  wr(word(0x23) + 1, (cpu.a = ram[0x21]));
  getB(1);
  leave(39);
}

/** $20 += $28 + 2 (CLC / LDA $28 / ADC #2 / TAX / LDA $29 / ADC #0 / TAY / CLC / TXA / ADC $20 ...): the line's byte. */
function lineAt(): void {
  clc();
  cpu.x = adc(ram[0x28], 2);
  cpu.y = adc(ram[0x29], 0);
  clc();
  ram[0x20] = adc(cpu.x, ram[0x20]);
  ram[0x21] = cpu.a = adc(cpu.y, ram[0x21]);
}

/** The row's band cleared: $E85D(x, y, x + 158, y + 15), y = L[30] + L[29]. */
function band(): void {
  getB(30);
  cpu.y = 0x1d;
  clc();
  setB(34, adc(cpu.a, rd(sp() + 0x1d)));
  imm(0x23, 0x9e);
  getB(31);
  ram[0x20] = cpu.a;
  ram[0x21] = cpu.a = nz(0);
  add2023();
  store(36);
  getB(30);
  cpu.y = 0x1d;
  clc();
  cpu.a = adc(cpu.a, rd(sp() + 0x1d));
  clc();
  cpu.a = adc(cpu.a, 0x0f);
  helper(0xdaaa);
  load(0x20, 37);
  cpu.a = ram[0x20];
  helper(0xdaaa);
  getB(36);
  helper(0xdaaa);
  getB(34);
  call(0xe85d, 3);
}

// ---- $812A: how far down, on the bar graph ----

/** The 32-bit 100, at $25:$82DF. */
const HUNDRED = 0x82df;

function scrollBar(): void {
  helper(0xdaaa);
  reserve(9);
  getB(9);
  helper(0xd4a9);
  move();
  local(0x20, 1);
  helper(0xdae6);
  local(0x23, 1);
  imm(0x20, HUNDRED);
  withTable(0xd6f5);
  move();
  local(0x20, 1);
  helper(0xdae6);
  getB(10);
  helper(0xd4a9);
  move();
  local(0x20, 5);
  helper(0xdae6);
  local(0x23, 5);
  local(0x20, 1);
  helper(0xd435);
  helper(0xd85a);
  setB(0);
  getB(0);
  os.call(0xe8e3);
  drop(10);
}

// ---- the switch's table, and the constant ----

const SWITCH = 0x82c7;
/** The keys the switch tests, and where their cases are in the OS (which steer the switch only). */
const CASES: [number, number][] = [
  [0x23, 0x788f],
  [0x22, 0x794b],
  [0x21, 0x7a5c],
  [0x20, 0x7ad6],
  [0x28, 0x7be7],
  [0x27, 0x7bec],
];
const DEFAULT = 0x7bf1;
const TABLE = new Map<number, number>([
  ...CASES.flatMap(([k], i): [number, number][] => [[SWITCH + 2 * i, k], [SWITCH + 2 * i + 1, 0]]),
  ...CASES.flatMap(([, at], i): [number, number][] => [[SWITCH + 12 + 2 * i, at & 0xff], [SWITCH + 13 + 2 * i, at >> 8]]),
  ...[100, 0, 0, 0].map((b, i): [number, number] => [HUNDRED + i, b]),
]);

/** A runtime helper, with the table and the constant readable where the OS has them. */
function withTable(at: number): void {
  const read = m.read;
  m.read = (a: number) => TABLE.get(a) ?? read.call(m, a);
  try {
    helper(at);
  } finally {
    m.read = read;
  }
}

/** The switch on the message's word ($DB5C): where it goes. */
function switchOn(): number {
  load(0x20, 14);
  move();
  imm(0x26, SWITCH);
  cpu.x = 6;
  cpu.y = 0;
  imm(0x20, DEFAULT);
  const pc = cpu.pc, s = cpu.s;
  withTable(0xdb5c);
  const to = word(0x26);
  cpu.pc = pc;
  cpu.s = s;
  return to;
}

// ---- $761E: the dialog's loop ----

/**
 * The loop's frame: $F262's caller's software stack pointer less 54 (its 33
 * locals, the 4 bytes it pushes, the loop's 17), worked out again when it is
 * asked again after waiting, so that it goes on right also in a machine
 * restored from a saved state.
 */
const LOOP_FRAME = 54;

/** A page from L16[8] at line L[19]: L[2] = what it returns, L16[6] = the next page's start. */
function redraw(): void {
  pushLocal(6);
  load(0x20, 10);
  helper(0xdaca);
  getB(23);
  setB(2, byte(page, 4));
}

/** From the text's start, to line L[19] (the up and page-up keys): L16[8], counting lines in L[3]. */
function seek(): void {
  load(0x20, 17);
  store(8);
  setB(1, deref(8));
  cpu.y = 3;
  wr(sp() + 3, (cpu.a = nz(0)));
  for (;;) {
    getB(3);
    clc();
    setB(16, adc(cpu.a, 1));
    getB(19);
    clc();
    ram[0x23] = adc(cpu.a, 1);
    getB(16);
    sec();
    if (!sbc(cpu.a, ram[0x23])) break;
    if (!plusOneMinus(1, 1)) {
      getB(3);
      clc();
      setB(3, adc(cpu.a, 1));
    }
    incL16(8);
    setB(1, deref(8));
  }
}

/** L[19] -= k, not below 0. */
function back(k: number): void {
  getB(19);
  sec();
  setB(19, sbc(cpu.a, k));
  plusOneMinus(19, 1);
  if (negative()) {
    cpu.y = 0x13;
    wr(sp() + 0x13, (cpu.a = nz(0)));
  }
}

/** The loop: its result in A, or "wait" (GuiGetMsg waiting; the frames stay as they are). */
function loop(retrying: boolean, frame: number): void | "wait" {
  if (!retrying) {
    reserve(17);
    load(0x20, 17);
    store(8);
    redraw();
  } else set16(0x28, frame);
  let resumed = retrying;
  for (;;) {
    if (!resumed) {
      callA(0xe815, 1);
      callA(0xe812, 1);
      if (!plusOneMinus(19, 1)) callA(0xe815, 0);
      getB(2);
      cpu.y = 0x14;
      sec();
      sbc(cpu.a, rd(sp() + 0x14));
      if (cpu.p & 0x01) {
        setB(2, getB(20));
        callA(0xe812, 0);
      }
      getB(20);
      helper(0xdaaa);
      getB(3);
      scrollBar();
      drop(1);
    }
    // GuiGetMsg(&L[13]), GuiTranslateMsg
    pushLocal(0x0d);
    os.retrying = resumed;
    const r = os.call(0xe935, resumed);
    resumed = false;
    os.retrying = false;
    if (r === "wait") return "wait";
    // (a stop in what it called ends it here: Fulu leaves it, for Continue to go on from the program's call)
    if (os.stopped) return;
    cpu.x = cpu.a;
    drop(2);
    cpu.a = nz(cpu.x);
    sec();
    if (!sbc(cpu.a, 0)) continue;
    os.retrying = false;
    pushLocal(0x0d);
    os.call(0xe93e);
    if (os.stopped) return;
    cpu.x = cpu.a;
    drop(2);
    cpu.a = nz(cpu.x);
    sec();
    if (!sbc(cpu.a, 0)) continue;
    // the switch on the type, by subtractions as the compiler has it ($23/$24 the type, loaded once)
    ram[0x23] = getB(0x0d);
    ram[0x24] = cpu.x = nz(0);
    const is = (k: number) => {
      sec();
      ram[0x20] = sbc(k, ram[0x23]);
      cpu.a = sbc(0, ram[0x24]);
      return !(cpu.a = nz(cpu.a | ram[0x20]));
    };
    if (is(0x0a)) {
      load(0x20, 14);
      move();
      if (is(3)) {
        // put back $0A 3, leave with $FE
        local(0x20, 0x0a);
        move();
        cpu.a = 0x0a;
        cpu.y = 0;
        wr(word(0x23), 0x0a);
        local(0x20, 0x0b);
        move();
        imm(0x20, 3);
        cpu.y = 0;
        wr(word(0x23), (cpu.a = ram[0x20]));
        cpu.y = 1;
        wr(word(0x23) + 1, (cpu.a = ram[0x21]));
        pushLocal(0x0a);
        call(0xe92f, 2);
        cpu.a = nz(0xfe);
        return leave(17);
      }
      if (is(4)) {
        cpu.a = nz(0xfd);
        return leave(17);
      }
      continue;
    }
    if (is(0x05)) {
      const to = switchOn();
      if (to === 0x788f) {
        // down a line, if there is more below
        getB(2);
        cpu.y = 0x14;
        sec();
        sbc(cpu.a, rd(sp() + 0x14));
        if (!(cpu.p & 0x01)) {
          getB(19);
          clc();
          setB(19, adc(cpu.a, 1));
          setB(1, deref(8));
          while (plusOneMinus(1, 1)) {
            setB(1, deref(8));
            incL16(8);
          }
          redraw();
        }
      } else if (to === 0x794b) {
        back(1);
        seek();
        redraw();
      } else if (to === 0x7a5c) {
        // page down, if there is more below
        getB(2);
        clc();
        setB(2, adc(cpu.a, 1));
        getB(2);
        cpu.y = 0x14;
        sec();
        const d = sbc(cpu.a, rd(sp() + 0x14));
        if (!d || !(cpu.p & 0x01)) {
          getB(19);
          clc();
          setB(19, adc(cpu.a, 6));
          load(0x20, 6);
          store(8);
          redraw();
        }
      } else if (to === 0x7ad6) {
        back(6);
        seek();
        redraw();
      } else if (to === 0x7be7) {
        cpu.a = nz(0xff);
        return leave(17);
      } else if (to === 0x7bec) {
        cpu.a = nz(0x27);
        return leave(17);
      }
      continue;
    }
    if (is(0x08)) {
      load(0x20, 14);
      move();
      if (is(1)) {
        cpu.a = nz(0xff);
        return leave(17);
      }
    }
  }
}

// ---- $F262 and $E980 ----

/** $F262(text). */
function dialog(): void | "wait" {
  const caller = word(0x28);
  if (!os.retrying) {
    reserve(33);
    pushLocal(0x0c);
    call(0xe8e9, 2);
    getB(16);
    sec();
    if (!sbc(cpu.a, 1)) os.call(0xe86e);
    os.call(0xe8cb);
    pushLocal(0);
    call(0xe8ef, 2);
    callA(0xe848, 0);
    callA(0xe8d7, 0);
    os.call(0xe8ec);
    os.call(0xe965);
    store(18);
    callA(0xe938, 2);
    callA(0xe93b, 2);
    cpu.y = 0x14;
    wr(sp() + 0x14, (cpu.a = nz(1)));
    cpu.y = 0x15;
    wr(sp() + 0x15, (cpu.a = nz(0)));
    load(0x20, 33);
    helper(0xdaca);
    setB(22, byte(countLines, 2));
    getB(22);
    helper(0xdaaa);
    getB(22);
    helper(0xdaaa);
    load(0x20, 35);
    helper(0xdaca);
  }
  const r = loop(os.retrying, (caller - LOOP_FRAME) & 0xffff);
  if (r === "wait") {
    set16(0x28, caller);
    return "wait";
  }
  if (os.stopped) return;
  drop(4);
  load(0x20, 18);
  helper(0xdaca);
  call(0xe968, 2);
  callA(0xe848, 0);
  pushLocal(0);
  call(0xe8f2, 2);
  os.call(0xe8ce);
  getB(16);
  sec();
  if (!sbc(cpu.a, 1)) {
    setB(32, getB(12));
    getB(13);
    helper(0xdaaa);
    getB(33);
    call(0xe863, 1);
    setB(32, getB(14));
    getB(15);
    helper(0xdaaa);
    getB(33);
    call(0xe86b, 1);
  }
  drop(33);
}

/** What the functions it calls use as temporaries (the screen's, the icons', the text's, the heap's). */
const FUNCS: Record<number, OsFunction> = { ...SCREEN, ...TEXT, ...HEAP, ...GUI };
const TEMPORARIES = [0xe8e9, 0xe86e, 0xe8cb, 0xe8ef, 0xe848, 0xe8d7, 0xe8ec, 0xe965, 0xe938, 0xe93b, 0xe968, 0xe8f2, 0xe8ce, 0xe863, 0xe86b, 0xe815, 0xe812, 0xe935, 0xe93e, 0xe92f, 0xe8e3, 0xe85d, 0xe79a].flatMap(
  (e) => FUNCS[e]?.temporaries ?? [],
);

export const HELP: Record<number, OsFunction> = {
  0xe980: fn(
    0x7a6e,
    () => {
      const caller = word(0x28);
      load(0x20, 0);
      helper(0xdaca);
      const r = os.call(0xf262, os.retrying);
      if (r === "wait") {
        set16(0x28, caller);
        return "wait";
      }
      cpu.x = cpu.a;
      drop(2);
      cpu.a = nz(cpu.x);
    },
    TEMPORARIES,
  ),
  0xf262: fn(0x73fa, dialog, TEMPORARIES),
};
