// The OS's message functions (its "GUI"): programs wait for keys and timer
// ticks through GuiGetMsg, a message being a type byte and a 16-bit
// parameter.

import { Key, keyChar } from "../bbk/keys";
import { adc, carry, clc, cmp, cpu, farCalled, fn, get16, long, nz, os, put16, ram, rd, sbc, sec, set16, softPop, softPush, store, word, wr } from "./alu";
import type { OsFunction } from "./fulu";
import { HELPERS } from "./runtime";
import { add20, drop, getB, imm, leave, put23, reserve, setB } from "./compiled";
import { load, move, store as storeL } from "./itoa";
import { lcd } from "./screen";

/** The OS's 32-bit event flags (bit 0 set by timer 1's interrupt). */
const EVENTS = 0x201e;
/** Messages posted to the OS: 8 records of type and parameter, a read index and a count. */
const QUEUE = 0x2b0f, QUEUE_READ = 0x2b09, QUEUE_WRITE = 0x2b0a, QUEUE_COUNT = 0x2b0b;
/** $E7A0, where GuiGetMsg sleeps until an interrupt (at 7:$7304). */
const WAIT = 0x7304;

/** The events GuiGetMsg returns as messages, in the order it tests them: flag, message type. */
const FLAG_MESSAGES: [number, number][] = [
  [0x02000000, 7],
  [0x00000001, 6],
];
/** The events it hands to other code, in order (tested only when there is no key). */
const OTHER_EVENTS = [0x00000002, 0x00000004, 0x00000080, 0x00000040, 0x00000010, 0x00010000];

const scratch = () => word(0x2a) + 8;

/** As the OS tests an event: (scratch + 8) = events & flag, $20/$21 pointing at it. */
function test(flag: number): boolean {
  const v = (long(EVENTS) & flag) >>> 0;
  store(scratch(), v);
  set16(0x20, scratch());
  return v !== 0;
}

/** Clear an event flag, through the scratch area as the OS does. */
function clear(flag: number): void {
  const v = (long(EVENTS) & ~flag) >>> 0;
  store(scratch(), v);
  store(EVENTS, v);
}

/** Write a message (type, parameter) through the pointer in GuiGetMsg's argument and return 1. */
function message(type: number, parameter: number): void {
  const msg = get16(word(0x28));
  wr(msg, type);
  clc();
  const at = adc(msg & 0xff, 1) | (adc(msg >> 8, 0) << 8);
  set16(0x23, at);
  set16(0x20, parameter);
  put16(at, parameter);
  cpu.a = cpu.y = nz(1);
}

/**
 * Answer GuiGetMsg with `key`, as when it reads one (More text turns a
 * dialogue's remaining pages itself: src/fulu/moreText.ts).
 */
export function answerKey(key: number): void {
  message(1, key);
  const entry = 0x8c36 + 2 * (key & 0x3f);
  set16(0x20, entry);
  set16(0x26, entry);
  set16(0x23, key & 0x3f);
  cpu.p &= ~0x41;
}

/** The keyboard's state, as the GUI keeps it: bits 2 and 3 input methods, 4 caps, 5 a shift latch. */
const KEYBOARD = 0x2b27;

/**
 * What a key means to the GUI: class 2, a character (its code); class 5, a
 * command (its code); class 0, nothing. The second table is used while the
 * shift latch is set. (The OS keeps these at 8:$8C36.)
 */
export const KEY_CLASSES: [number, number][][] = [false, true].map((shift) => {
  const commands: Record<number, number> = {
    [Key.power]: 0x04, [Key.home]: 0x07, [Key.dualDict]: 0x01, [Key.modern]: 0x02,
    [Key.input]: shift ? 0x36 : 0x2a, [Key.shift]: shift ? 0x26 : 0x29, [Key.del]: 0x34, [Key.exit]: 0x28,
    [Key.enter]: 0x27, [Key.up]: shift ? 0x32 : 0x22, [Key.left]: shift ? 0x31 : 0x24,
    [Key.down]: shift ? 0x33 : 0x23, [Key.right]: shift ? 0x30 : 0x25, [Key.pageUp]: 0x20, [Key.pageDown]: 0x21,
  };
  return Array.from({ length: 64 }, (_, code): [number, number] => {
    const ch = code === Key.space ? " " : keyChar(code);
    if (ch) return [2, ch.toLowerCase().charCodeAt(0)];
    return code in commands ? [5, commands[code]] : [0, 0];
  });
});

/** $E938: $2B28 = A (passed through the software stack, which leaves A = $29). */
function setKeyboardHigh(): void {
  wr((word(0x28) - 1) & 0xffff, cpu.a);
  ram[KEYBOARD + 1] = cpu.a;
  cpu.x = cpu.a;
  cpu.y = 0;
  nz(cpu.a);
  cpu.a = ram[0x29];
}

/**
 * $E92C (post) and $E92F (put back) (msg): a copy of the message {type, a
 * word} into GuiGetMsg's queue: 8 records of 3 bytes at $2B0F, read from
 * $2B09, written at $2B0A, $2B0B of them. Posted at the back ($2B0A, then
 * stepped) or put at the front ($2B09 stepped back first); A = Y = 1, or 0
 * when the queue holds 8. As the OS's compiled C: two locals on the software
 * stack (the word, then the type), each record's address as index × 3 ($D6AF)
 * + $2B0F, the word stored first.
 */
function queueMessage(front: boolean): void {
  const msg = get16(word(0x28));
  softPush([0, 0]);
  const sp = word(0x28);
  sec();
  sbc(ram[QUEUE_COUNT], 8);
  const ok = !carry();
  if (ok) {
    if (front) {
      sec();
      ram[QUEUE_READ] = nz(sbc(ram[QUEUE_READ], 1) & 7);
    }
    const index = front ? ram[QUEUE_READ] : ram[QUEUE_WRITE];
    /** The record's address in $20/$21, by the runtime's multiply as the OS does it ($23/$24 kept). */
    const record = () => {
      ram[0x20] = index;
      ram[0x21] = 0;
      const lo = ram[0x23], hi = ram[0x24];
      set16(0x23, 3);
      const s = cpu.s;
      cpu.s = (s - 4) & 0xff; // (its two pushes and the JSR)
      HELPERS[0xd6af](os);
      cpu.s = s;
      ram[0x23] = lo;
      ram[0x24] = hi;
      clc();
      ram[0x20] = adc(ram[0x20], QUEUE & 0xff);
      ram[0x21] = adc(ram[0x21], QUEUE >> 8);
    };
    // the word
    set16(0x26, msg);
    cpu.y = 2;
    cpu.x = rd(msg + 1);
    ram[0x21] = rd(msg + 2);
    ram[0x20] = cpu.x;
    wr(sp, ram[0x20]);
    wr(sp + 1, ram[0x21]);
    record();
    clc();
    ram[0x20] = adc(ram[0x20], 1);
    ram[0x21] = adc(ram[0x21], 0);
    set16(0x23, word(0x20));
    set16(0x20, rd(sp) | (rd(sp + 1) << 8));
    put16(word(0x23), word(0x20));
    cpu.y = 1;
    // the type
    set16(0x26, msg);
    cpu.y = 0;
    const type = rd(msg);
    wr(sp, type);
    record();
    set16(0x23, word(0x20));
    cpu.y = 0;
    wr(word(0x23), (cpu.a = rd(sp)));
    if (!front) {
      clc();
      ram[QUEUE_WRITE] = adc(ram[QUEUE_WRITE], 1) & 7;
    }
    clc();
    ram[QUEUE_COUNT] = adc(ram[QUEUE_COUNT], 1);
  }
  cpu.a = cpu.y = nz(ok ? 1 : 0);
  softPop(2);
}

/** The status icons' rows (6:$6D15), by the index each icon function passes to 6:$6753. */
const ICON_TABLE = [93, 95, 76, 82, 88, 38, 39, 45, 49, 44, 34, 29, 23, 16, 0, 92, 94, 20, 31, 41, 13, 6, 68, 0, 61];
/** The icon functions but the GUI's three: their table entries and indexes (each at 6:$66D6 + 5 × its index). */
const ICON_ENTRIES: [number, number][] = [
  [0xe800, 0], [0xe803, 1], [0xe806, 2], [0xe809, 3], [0xe812, 4], [0xe815, 5],
  ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i): [number, number] => [0xe824 + 3 * (i - 6), i]),
  [0xe84e, 20],
];

/** The bar graph's icons (6:$6CEE, 1 to 38; 0 unused): their rows. */
const BAR_ROWS = [0, 36, 33, 30, 27, 25, 24, 22, 21, 18, 15, 14, 12, 11, 10, 9, 5, 4, 3, 2, 1, 66, 67, 69, 70, 71, 72, 73, 74, 75, 77, 79, 80, 81, 83, 84, 85, 86, 87];

/** $E8E3's thresholds (6:$69A4): a value below the n-th lights n + 1 bars. */
const BAR_STEPS = [3, 6, 8, 11, 14, 16, 19, 21, 24, 27, 29, 32, 35, 37, 40, 43, 45, 48, 50, 53, 56, 58, 61, 64, 66, 69, 71, 74, 77, 79, 82, 85, 87, 90, 93, 95, 98, 100, 141];

/**
 * 6:$69DB: the bar graph's icons $2081 to $2081 + $2082 - 1 on ($2080 ≠ 0)
 * or off; nothing unless $2082 < 39, $2081 < 39, their sum < 40 and neither
 * is 0 (A the value that failed). $2081 counts up and $2082 down as it goes.
 */
function barRun(): void {
  const first = ram[0x2081], n = ram[0x2082], on = ram[0x2080];
  if ((cmp((cpu.a = n), 0x27), n >= 0x27)) return;
  if ((cmp((cpu.a = first), 0x27), first >= 0x27)) return;
  clc();
  const sum = (cpu.a = adc(first, n));
  if ((cmp(sum, 0x28), sum >= 0x28)) return;
  if (!cmp((cpu.a = first), 0)) return;
  if (!cmp((cpu.a = n), 0)) return;
  for (let i = 0; i < n; i++) {
    const a = iconRow(BAR_ROWS[first + i]);
    wr(a, (rd(a) & 0xfe) | (on ? 1 : 0));
  }
  ram[0x2081] = first + n;
  ram[0x2082] = 0;
  cpu.x = on;
  cpu.y = 0;
  cpu.a = 0;
  cmp(0, 0);
  cpu.p &= ~0x40;
}

/** Status icons the GUI sets: the RAM row whose byte 18's bit 0 lights them. */
const ICON_ROWS = { e845: 20, e848: 31, e8d7: 41 };
const ICON_TEMPORARIES: [number, number][] = [[0x38, 0x3a], [0x2080, 0x208a]];
/** An OS function turning a status icon on (A ≠ 0) or off. */
const icon = (at: number, row: number) =>
  fn(
    at,
    () => {
      const on = cpu.a, a = 0x412 + row * 32;
      ram[0x2080] = on;
      set16(0x38, a);
      cpu.x = on;
      cpu.y = 0;
      cpu.a = rd(a) & 0xfe;
      cmp(on, 0);
      if (on) cpu.a = nz(cpu.a | 1);
      wr(a, cpu.a);
      cpu.p &= ~0x40;
    },
    ICON_TEMPORARIES,
  );

/** The seven-segment patterns of the status bar's digits (6:$6CDE): 0-F, then blank for anything above. */
const SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71, 0x00];
/** The icon rows of each of the four digits' seven segments (6:$6CC2, $6CC9, $6CD0, $6CD7). */
const DIGIT_ROWS = [
  [0x13, 0x11, 0x25, 0x23, 0x20, 0x1a, 0x1c],
  [0x3f, 0x3e, 0x2b, 0x2a, 0x28, 0x40, 0x41],
  [0x3b, 0x3a, 0x30, 0x2f, 0x2e, 0x3c, 0x39],
  [0x37, 0x36, 0x34, 0x33, 0x32, 0x38, 0x35],
];
/**
 * $E818, $E81B, $E81E, $E821: the status bar's digit 1-4 shows A (0-15, blank
 * above): each segment is bit 0 of byte 18 of its RAM row, the row's address
 * found by the OS's multiply (6:$6C85: $2085 × $2087 → $2085:$2089).
 */
const digit = (at: number, rows: number[]) =>
  fn(
    at,
    () => {
      let pattern = SEGMENTS[cpu.a < 0x10 ? cpu.a : 0x10];
      for (const row of rows) {
        const product = row * 0x20, a = 0x412 + product;
        ram[0x2087] = 0x20;
        ram[0x2089] = product & 0xff;
        ram[0x2085] = product >> 8;
        set16(0x38, a);
        const on = pattern & 1;
        ram[0x2080] = pattern >>= 1;
        wr(a, (cpu.a = (rd(a) & 0xfe) | on));
      }
      cpu.x = 7;
      cpu.y = 0;
      cmp(7, 7);
      cpu.p &= ~0x40;
    },
    ICON_TEMPORARIES,
  );

/** The icons' bits as $E8EF and $E8F2 keep them: a 96-bit shift register at $208D-$2098 (row 0 shifted in first, so it ends at the top). */
const ICON_BITS = 0x208d;

/** The address of icon row `row` (bit 0 of byte 18 of its RAM row), found by the multiply 6:$6C85 as the OS does, leaving its variables. */
function iconRow(row: number): number {
  const product = row * 0x20;
  ram[0x2085] = product >> 8;
  ram[0x2087] = 0x20;
  ram[0x2089] = product & 0xff;
  const a = 0x412 + product;
  set16(0x38, a);
  return a;
}

// ---- the text cursor: a w × h rectangle ($20BA, $20BB) at ($20BC, $20BD),
// on while $20BF is 1, blinked by the CT interrupt (its phase in $20BE: 1
// shown); $022E bit 4 runs CT, which also blinks the status icons ($20CD) ----

const CURSOR_W = 0x20ba, CURSOR_H = 0x20bb, CURSOR_X = 0x20bc, CURSOR_Y = 0x20bd, CURSOR_SHOWN = 0x20be, CURSOR_ON = 0x20bf;
const CT_CONTROL = 0x22e, ICONS_BLINK = 0x20cd;
/** What 5:$52D7 (inverting the cursor) leaves: its masks, counters and row pointers. */
export const CURSOR_TEMPORARIES: [number, number][] = [[0x20c0, 0x20cc]];

/**
 * 5:$52D7: invert the cursor's rectangle, if it fits on the screen (x < 160,
 * x + w ≤ 160, y < 96, y + h ≤ 96, 8-bit sums), a byte at a time as
 * SysLcdReverse does.
 */
export function invertCursor(): void {
  const x = ram[CURSOR_X], y = ram[CURSOR_Y], w = ram[CURSOR_W], h = ram[CURSOR_H];
  if (x >= 0xa0 || ((x + w) & 0xff) >= 0xa1 || y >= 0x60 || ((y + h) & 0xff) >= 0x61) return;
  // (0 wide or high: nothing; the OS would go round 256 times)
  if (!w || !h) return;
  const x2 = x + w - 1, first = x >> 3, last = x2 >> 3;
  for (let row = y; row < y + h; row++)
    for (let b = first; b <= last; b++) {
      const inside = (b === first ? 0xff >> (x & 7) : 0xff) & (b === last ? (0xff00 >> ((x2 & 7) + 1)) & 0xff : 0xff);
      const a = lcd(b, row);
      wr(a, rd(a) ^ inside);
    }
}

/** Stop CT unless the status icons blink too ($022E bit 4 cleared): A its new value, or $20CD. */
function stopBlinking(): void {
  cmp((cpu.a = ram[ICONS_BLINK]), 1);
  if (ram[ICONS_BLINK] === 1) return;
  wr(CT_CONTROL, (cpu.a = nz(rd(CT_CONTROL) & 0xef)));
}

/** Start CT ($022E |= $11): A its new value. */
const startBlinking = () => wr(CT_CONTROL, (cpu.a = nz(rd(CT_CONTROL) | 0x11)));

/** Cursor functions: their work as the OS's (the cursor routine's scratch, and $38-$3B, which it leaves) is not compared, nor Y and the flags. */
const cursorFn = (at: number, run: () => void): OsFunction => ({
  ...fn(at, run, [[0x38, 0x3c], ...CURSOR_TEMPORARIES]),
  ownState: { registers: ["y", "p"] },
});

/** The input modes $E93B switches between (the keyboard state's low 4 bits), and the modes each tests for a change to, in order. */
const MODES: Record<number, number[]> = { 2: [4, 8, 1], 4: [8, 2, 1], 8: [2, 4, 1], 1: [4, 8, 2] };
/** Where the OS keeps that switch's table (8:$8B9C: 4 modes, then their code's addresses). */
const MODE_TABLE = 0x8b9c, MODE_ORDER = [2, 4, 8, 1], MODE_CODE = [0x6028, 0x605e, 0x6094, 0x60ca];

/** $E929: GuiGetMsg's queue emptied: its indexes and count 0, its 24 bytes by memset (8:$6BC2, two locals). */
const emptyQueue = fn(0x6bc2, () => {
  reserve(2);
  ram[QUEUE_READ] = cpu.a = 0;
  ram[QUEUE_WRITE] = 0;
  ram[QUEUE_COUNT] = 0;
  imm(0x20, QUEUE);
  storeL(0);
  cpu.a = nz(0);
  HELPERS[0xdaaa](os);
  imm(0x20, 0x18);
  HELPERS[0xdaca](os);
  load(0x20, 3);
  HELPERS[0xdaca](os);
  os.call(0xe700);
  drop(5);
  drop(2);
});

/** Post a message at the back of GuiGetMsg's queue, if it has room (8:$6C3E, without its zero-page traffic). */
export function post(type: number, word: number): boolean {
  if (ram[QUEUE_COUNT] >= 8) return false;
  const at = QUEUE + 3 * (ram[QUEUE_WRITE] & 7);
  ram[at] = type;
  ram[at + 1] = word & 0xff;
  ram[at + 2] = word >> 8;
  ram[QUEUE_WRITE] = (ram[QUEUE_WRITE] + 1) & 7;
  ram[QUEUE_COUNT]++;
  return true;
}

/** $zp = $28 + k (CLC / LDA $28 / ADC #k / STA / LDA $29 / ADC #0 / STA). */
function local(zp: number, k: number): void {
  clc();
  ram[zp] = adc(ram[0x28], k);
  ram[zp + 1] = cpu.a = adc(ram[0x29], 0);
}

/**
 * 8:$5D60(A): post the message $0A 1 (A = 1: into Chinese input) or 2 (any
 * other A), as the OS's compiled C does: A pushed ($DAAA), four locals (the
 * message {type, word} and A + 1), the message's address pushed and posted
 * by 8:$6C3E ($E92C's code: its zero page and flags are what this leaves).
 */
function postModeMessage(a: number): void {
  cpu.a = a;
  HELPERS[0xdaaa](os);
  reserve(4);
  local(0x20, 0);
  ram[0x23] = ram[0x20];
  ram[0x24] = cpu.a = ram[0x21];
  cpu.a = 0x0a;
  cpu.y = 0;
  wr(word(0x23), 0x0a);
  cpu.y = 4;
  clc();
  cpu.a = adc(rd(word(0x28) + 4), 1);
  cpu.y = 3;
  wr(word(0x28) + 3, cpu.a);
  sec();
  const into = sbc(rd(word(0x28) + 3), 2) === 0;
  local(0x20, 1);
  ram[0x23] = ram[0x20];
  ram[0x24] = cpu.a = ram[0x21];
  ram[0x20] = into ? 1 : 2;
  ram[0x21] = cpu.a = 0;
  cpu.y = 0;
  wr(word(0x23), (cpu.a = ram[0x20]));
  cpu.y = 1;
  wr(word(0x23) + 1, (cpu.a = ram[0x21]));
  local(0x20, 0);
  HELPERS[0xdaca](os);
  queueMessage(false);
  drop(2);
  drop(5);
}

/** What a mode change does after setting the mode: the input bar opened or closed (its entry), the icon $E8D7 on (1) or off (0), the message $0A 1 (into Chinese input) or 2 (out of it). */
type ModeStep = ["bar" | "icon" | "message", number];

/**
 * A mode change: the keyboard state's mode, then its steps in the OS's
 * order. The input bar's far call is left out (Fulu has no bar): only the
 * OS's own setting up of it ($26/$27 its entry, X its high byte) is made,
 * which a full queue (no message to overwrite $26/$27) leaves to be seen.
 */
function modeChange(mode: number, ...steps: ModeStep[]): () => void {
  return () => {
    ram[KEYBOARD] = cpu.a = nz((ram[KEYBOARD] & 0xf0) | mode);
    for (const [step, v] of steps) {
      if (step === "bar") {
        ram[0x26] = cpu.x = v & 0xff;
        ram[0x27] = cpu.x = nz(v >> 8);
      } else if (step === "icon") {
        cpu.a = nz(v);
        os.call(0xe8d7);
      } else postModeMessage(v);
    }
  };
}

/**
 * The changes of input mode Fulu has (8:$5E2C-8:$5FF2): to mode 1 its icon
 * ($E8D7) on, caps off (with its icon, $E848); back to 2 that icon off.
 * Modes 4 and 8 are Chinese input: on the device the OS opens and closes
 * its input bar ($E913, $E91F, $E916, $E922) and the program is told by
 * the message $0A 1 or 2. Fulu has no input bar of its own: the player
 * takes the characters from the computer's or phone's input method, and
 * Fulu gives them to the program as the OS's does (Fulu.type). So it makes
 * the changes, the icon and the messages, without the bar. (8:$5D60's A: 1
 * for the message $0A 1, 0 for 2.)
 */
const MODE_CHANGES: Record<string, () => void> = {
  "2>4": modeChange(4, ["bar", 0xe913], ["message", 1]), // 8:$5E2C
  "2>8": modeChange(8, ["bar", 0xe91f], ["icon", 1], ["message", 1]), // 8:$5E47
  "4>8": modeChange(8, ["bar", 0xe916], ["bar", 0xe91f], ["icon", 1]), // 8:$5E9C
  "4>2": modeChange(2, ["bar", 0xe916], ["message", 0]), // 8:$5ECA
  "4>1": modeChange(1, ["icon", 1], ["bar", 0xe916], ["message", 0]), // 8:$5EE5
  "8>2": modeChange(2, ["bar", 0xe922], ["message", 0], ["icon", 0]), // 8:$5F0D
  "8>4": modeChange(4, ["bar", 0xe922], ["bar", 0xe913], ["icon", 0]), // 8:$5F35
  "8>1": modeChange(1, ["icon", 1], ["bar", 0xe922], ["message", 0]), // 8:$5F63
  "1>4": modeChange(4, ["icon", 0], ["bar", 0xe913], ["message", 1]), // 8:$5FA3
  "1>8": modeChange(8, ["icon", 1], ["bar", 0xe91f], ["message", 1]), // 8:$5FCB
  "2>1": () => {
    ram[KEYBOARD] = (ram[KEYBOARD] & 0xf0) | 1;
    cpu.a = 1;
    os.call(0xe8d7);
    ram[KEYBOARD] &= 0xef;
    cpu.a = 0;
    os.call(0xe848);
  },
  "1>2": () => {
    ram[KEYBOARD] = (ram[KEYBOARD] & 0xf0) | 2;
    cpu.a = 0;
    os.call(0xe8d7);
  },
};

/** The LCD rows of the status icons $E8EC leaves alone (those of icons 20-22, the GUI's three, and four more). */
const ICONS_KEPT = [6, 7, 8, 13, 20, 31, 41, 68, 78, 89, 90, 91];

const isLower = (c: number) => c >= 0x61 && c <= 0x7a;

/** 8:$695A: toggle the shift latch (the keyboard state's bit 5) and its icon. */
function toggleLatch(): void {
  ram[KEYBOARD] ^= 0x20;
  cpu.a = ram[KEYBOARD] & 0x20;
  os.call(0xe845);
}

/**
 * 8:$6973: whether $2B28 accepts a character: letters by bit 1, digits by
 * bit 0, space and '.' by either; 0 for anything else. (C and V are left by
 * its last comparison, done as the OS does them.)
 */
function classify(c: number): number {
  const allows = (bit: number) => (ram[KEYBOARD + 1] & bit ? 1 : 0);
  /** SEC / SBC #v: whether c ≥ v. */
  const atLeast = (v: number) => (sec(), sbc(c, v), carry() !== 0);
  /** c in [lo, hi], tested as the OS does: c ≥ lo, then c ≥ hi only if c = hi. */
  const within = (lo: number, hi: number) => atLeast(lo) && (!atLeast(hi) || c === hi);
  if (within(0x61, 0x7a) || within(0x41, 0x5a)) return allows(2);
  if (within(0x30, 0x39)) return allows(1);
  atLeast(0x20);
  if (c === 0x20 || (atLeast(0x2e), c === 0x2e)) return ram[KEYBOARD + 1] & 2 ? 1 : allows(1);
  return 0;
}

/** Where the OS keeps the shift key's switch (8:$8BAC: 4 modes, then their cases' addresses, which only steer the switch), and its default case. */
const SHIFT_TABLE = 0x8bac, SHIFT_MODES = [1, 2, 4, 8], SHIFT_CODE = [0x6811, 0x6811, 0x688c, 0x68a9], SHIFT_DEFAULT = 0x68b1;

/**
 * 8:$67CC(msg), the shift key (called with msg pushed, $DACA): a switch on
 * the input mode (the state's low 4 bits), through the runtime's $DB5C:
 *
 * - modes 1 and 2: with $2B28 bit 3, into Chinese input mode 4 (8:$5E2C,
 *   MODE_CHANGES' 2 > 4, from mode 1 too); else with bit 2, mode 8 (8:$5E47,
 *   2 > 8); else the message becomes the command $29 and it returns 1;
 * - mode 4: with bit 2 to mode 8 (8:$5E47 again, its message $0A 1 too),
 *   else back to 2 (8:$5ECA, 4 > 2);
 * - mode 8: back to 2 (8:$5F0D, 8 > 2);
 * - any other mode: nothing.
 *
 * A mode change returns 0 (the key is taken). Its one local, $2B28 & $0E,
 * is never read. Then, as GuiTranslateMsg returns it: X = Y = A.
 */
function shiftKey(msg: number): void {
  reserve(12); // (GuiTranslateMsg's locals, whose depth its message's address shows)
  set16(0x20, msg);
  HELPERS[0xdaca](os);
  reserve(1);
  cpu.y = 0;
  wr(word(0x28), (cpu.a = nz(ram[KEYBOARD + 1] & 0x0e)));
  const mode = (cpu.a = ram[KEYBOARD] & 0x0f);
  set16(0x23, mode);
  // the switch ($DB5C): the case's address from the table, flags of its last comparison (C set, V clear)
  const i = SHIFT_MODES.indexOf(mode);
  set16(0x20, SHIFT_TABLE + 8 + 2 * (i < 0 ? 4 : i));
  set16(0x26, i < 0 ? SHIFT_DEFAULT : SHIFT_CODE[i]);
  cpu.p = (cpu.p & ~0x41) | 0x01;
  const high = ram[KEYBOARD + 1];
  const change = (key: string) => {
    MODE_CHANGES[key]();
    cpu.a = nz(0);
  };
  if (mode === 1 || mode === 2) {
    if (nz(high & 0x08)) change("2>4");
    else if (nz(high & 0x04)) change("2>8");
    else {
      cpu.y = 1;
      wr(msg, (cpu.a = 5));
      clc();
      set16(0x20, adc(msg & 0xff, 1) | (adc(msg >> 8, 0) << 8));
      set16(0x23, word(0x20));
      set16(0x20, 0x29);
      put16(word(0x23), 0x29);
      cpu.y = 1;
      cpu.a = nz(1);
    }
  } else if (mode === 4) change(nz(high & 0x04) ? "2>8" : "4>2");
  else if (mode === 8) change("8>2");
  else cpu.a = nz(0);
  leave(1);
  const a = (cpu.x = cpu.a);
  drop(2);
  cpu.a = nz(a);
  leave(12);
}

/** The queue's record at the read index, its address in $20 ($23/$24 kept, pushed and pulled round the runtime's multiply). */
function readRecord(): void {
  ram[0x20] = cpu.a = ram[QUEUE_READ];
  ram[0x21] = cpu.a = 0;
  const lo = ram[0x23], hi = ram[0x24];
  imm(0x23, 3);
  const s = cpu.s;
  cpu.s = (s - 4) & 0xff; // (its two pushes and the JSR)
  HELPERS[0xd6af](os);
  cpu.s = s;
  ram[0x23] = cpu.a = lo;
  ram[0x24] = cpu.a = nz(hi);
  add20(QUEUE);
}

/**
 * $EA25 (msg): the next message from GuiGetMsg's queue into msg (its type,
 * then its word), the count down and the read index on (each mod 8): A = 1;
 * 0 if the queue is empty. (8:$6E7C, compiled C: two locals.)
 */
const takeMessage = fn(0x6e7c, () => {
  reserve(2);
  clc();
  cpu.a = adc(ram[QUEUE_COUNT], 1);
  sec();
  cpu.a = sbc(cpu.a, 1);
  if (!carry() || !cpu.a) {
    cpu.a = nz(0);
    return leave(2);
  }
  readRecord();
  cpu.y = 0;
  setB(0, nz(rd(word(0x20))));
  load(0x20, 2);
  move();
  getB(0);
  put23();
  readRecord();
  cpu.y = 1;
  cpu.x = nz(rd(word(0x20) + 1));
  cpu.y = 2;
  const at = word(0x20);
  ram[0x21] = cpu.a = nz(rd(at + 2));
  ram[0x20] = cpu.x;
  storeL(0);
  load(0x20, 2);
  add20(1);
  move();
  load(0x20, 0);
  cpu.y = 0;
  wr(word(0x23), (cpu.a = ram[0x20]));
  cpu.y = 1;
  wr(word(0x23) + 1, (cpu.a = ram[0x21]));
  sec();
  ram[QUEUE_COUNT] = sbc(ram[QUEUE_COUNT], 1);
  ram[QUEUE_COUNT] = cpu.a = nz(ram[QUEUE_COUNT] & 7);
  clc();
  ram[QUEUE_READ] = adc(ram[QUEUE_READ], 1);
  ram[QUEUE_READ] = cpu.a = nz(ram[QUEUE_READ] & 7);
  cpu.a = nz(1);
  leave(2);
});

/** The screen's copy at $7400 (RAM), its nesting at $202D. */
const SCREEN_SAVES = 0x202d;

/** 12 × 256 bytes through the data ports: read DATA1 ($00), write DATA2 ($01), each stepping as INCR says (the copy's loop as the OS has it). */
function portCopy(xFirst: boolean): void {
  cpu.x = 0;
  if (!xFirst) cpu.y = 0;
  for (;;) {
    cmp(cpu.x, 0x0c);
    if (carry()) return;
    if (xFirst) {
      cpu.x = nz(cpu.x + 1);
      cpu.y = 0;
    } else {
      cpu.y = 0;
      cpu.x = nz(cpu.x + 1);
    }
    for (;;) {
      cpu.a = nz(rd(0x00));
      wr(0x01, cpu.a);
      cmp(cpu.y, 0xff);
      if (carry()) break;
      cpu.y = nz(cpu.y + 1);
    }
  }
}

/** The ports' two addresses: ADDR1 = from, ADDR2 = to (24-bit, low byte first). */
function portAddresses(from: number, to: number): void {
  for (const [at, v] of [[0x208, from], [0x20b, to]]) for (let i = 0; i < 3; i++) wr(at + i, (v >> (8 * i)) & 0xff);
}

/**
 * $E8CB: save the screen (its buffer from $0401, 3 KB, to $7400) when
 * $202D is 0; $202D counts the saves (7:$7B20).
 */
const saveScreen = fn(0x7b20, () => {
  if (!cmp(ram[SCREEN_SAVES], 0)) {
    portAddresses(0x000401, 0x007400);
    cpu.a = nz(0);
    cpu.y = 0;
    portCopy(false);
  }
  clc();
  ram[SCREEN_SAVES] = cpu.a = adc(ram[SCREEN_SAVES], 1);
});

/** $E8CE: back from a save: $202D down, and the screen put back from $7400 when it reaches 0 (7:$7B66). */
const restoreScreen = fn(0x7b66, () => {
  cmp((cpu.a = ram[SCREEN_SAVES]), 1);
  if (!carry()) return;
  sec();
  ram[SCREEN_SAVES] = cpu.a = sbc(ram[SCREEN_SAVES], 1);
  if (cmp(cpu.a, 0)) return;
  // (ADDR2 first, as the OS writes them)
  for (const [at, v] of [[0x20b, 0x000401], [0x208, 0x007400]]) for (let i = 0; i < 3; i++) wr(at + i, (cpu.a = (v >> (8 * i)) & 0xff));
  portCopy(true);
});

/** $E8E9 (p): the text cursor's state into p: its size, its place, on ($20BA-$20BD, $20BF). */
const cursorState = fn(0x5094, () => {
  const sp = word(0x28);
  cpu.y = 0;
  ram[0x2f] = cpu.a = rd(sp);
  cpu.y = 1;
  ram[0x30] = cpu.a = rd(sp + 1);
  const p = word(0x2f);
  [0x20ba, 0x20bb, 0x20bc, 0x20bd, 0x20bf].forEach((a, i) => {
    cpu.y = i;
    wr(p + i, (cpu.a = nz(ram[a])));
  });
});

export const GUI: Record<number, OsFunction> = {
  /**
   * $E8EC: turn the status icons off: every icon row's bit but those of
   * ICONS_KEPT (icons 0-8 and 24, the gauges 9-16, a bar of 38 rows and four
   * groups of 7), ending as its last one (icon 24, row 61) leaves things.
   */
  0xe8ec: fn(
    0x624d,
    () => {
      for (let row = 0; row < 96; row++) if (!ICONS_KEPT.includes(row)) wr(0x412 + row * 32, rd(0x412 + row * 32) & 0xfe);
      const last = 0x412 + 61 * 32;
      ram[0x2080] = 0;
      set16(0x38, last);
      cpu.a = rd(last);
      cpu.x = cpu.y = 0;
      cmp(0, 0);
      cpu.p &= ~0x40;
    },
    ICON_TEMPORARIES,
  ),
  0xe938: fn(0x5d45, setKeyboardHigh),
  /**
   * $E93B(mode): change the input mode (MODE_CHANGES, by a switch on the
   * current mode, then tests of the new one in MODES' order); nothing when
   * it is the current one, or one the current mode has no change to. (A
   * byte pushed and 3 locals.)
   */
  0xe93b: fn(0x5ff3, () => {
    const mode = cpu.a, current = ram[KEYBOARD] & 0x0f, order = MODES[current];
    HELPERS[0xdaaa](os); // the mode passed on the software stack
    reserve(3);
    set16(0x23, current);
    if (!order) {
      // the switch's default (Y as its comparisons leave it)
      set16(0x20, MODE_TABLE + 16);
      set16(0x26, 0x6100);
      cpu.y = 1;
    } else {
      const i = MODE_ORDER.indexOf(current);
      set16(0x20, MODE_TABLE + 8 + 2 * i);
      set16(0x26, MODE_CODE[i]);
      const change = order.includes(mode) && MODE_CHANGES[`${current}>${mode}`];
      for (const m of order) {
        sec();
        sbc(mode, m);
        if (m === mode) break;
      }
      cpu.y = 3;
      if (change) change(); // (the flags it leaves are kept by the epilogue's PHP / PLP)
    }
    drop(4);
  }, ICON_TEMPORARIES), // (the icons' a mode change sets)
  0xe818: digit(0x6b19, DIGIT_ROWS[0]),
  0xe81b: digit(0x6b71, DIGIT_ROWS[1]),
  0xe81e: digit(0x6bcf, DIGIT_ROWS[2]),
  0xe821: digit(0x6c2d, DIGIT_ROWS[3]),
  /**
   * $E8E0: blank the status bar's number (the 28 segments of $E818-$E821's
   * four digits), then turn off icons 6, 7, 8 ($E824-$E82A's) and 24
   * ($E8B3's) through 6:$6753, ending as the last of those leaves things.
   */
  0xe8e0: fn(
    0x6a40,
    () => {
      for (const row of DIGIT_ROWS.flat()) {
        const a = iconRow(row);
        wr(a, (cpu.a = rd(a) & 0xfe));
      }
      for (const i of [6, 7, 8, 24]) {
        ram[0x2080] = 0;
        const a = iconRow(ICON_TABLE[i]);
        wr(a, (cpu.a = rd(a) & 0xfe));
      }
      cpu.x = cpu.y = 0;
      cmp(0, 0);
      cpu.p &= ~0x40;
    },
    ICON_TEMPORARIES,
  ),
  /**
   * $E8EF(p): the status icons' bits (bit 0 of byte 18 of each of the 96 RAM
   * rows) as 12 bytes to p: shifted in row by row through $208D-$2098 (row 0
   * ends as the top bit of $2098), then copied through $3A/$3B (at $208D)
   * and $31/$32 (p).
   */
  0xe8ef: fn(0x614c, () => {
    const p = get16(word(0x28));
    ram[0x31] = p & 0xff;
    ram[0x32] = p >> 8;
    for (let row = 0; row < 0x60; row++) {
      const v = rd(iconRow(row));
      ram[0x209a] = v >> 1;
      let c = v & 1;
      for (let i = 0; i < 12; i++) {
        const b = ram[ICON_BITS + i];
        ram[ICON_BITS + i] = ((b << 1) | c) & 0xff;
        c = b >> 7;
      }
    }
    set16(0x3a, ICON_BITS);
    for (let i = 0; i < 12; i++) wr(p + i, (cpu.a = ram[ICON_BITS + i]));
    cpu.x = 0x60;
    cpu.y = 12;
    cmp(12, 12);
    cpu.p &= ~0x40;
  }),
  /** $E8F2(p): put back the icons' bits $E8EF saved at p (12 bytes, through $208D-$2098), but row 13's. */
  0xe8f2: fn(0x61c5, () => {
    const p = get16(word(0x28));
    ram[0x31] = p & 0xff;
    ram[0x32] = p >> 8;
    set16(0x3a, ICON_BITS);
    for (let i = 0; i < 12; i++) ram[ICON_BITS + i] = rd(p + i);
    cpu.a = 0;
    for (let row = 0; row < 0x60; row++) {
      const a = iconRow(row);
      // shifted out of the top of $2098 into $209A
      let c = 0;
      for (let i = 0; i < 12; i++) {
        const b = ram[ICON_BITS + i];
        ram[ICON_BITS + i] = ((b << 1) | c) & 0xff;
        c = b >> 7;
      }
      ram[0x209a] = c;
      if (row !== 13) wr(a, (cpu.a = (rd(a) & 0xfe) | c));
      else cpu.a = 0;
    }
    cpu.x = 0x60;
    cpu.y = 0;
    cmp(0x60, 0x60); // (CPX #$60, after the last write)
    cpu.p &= ~0x40;
  }),
  0xe92c: fn(0x6c3e, () => queueMessage(false)),
  0xe92f: fn(0x6d5d, () => queueMessage(true)),
  0xea25: takeMessage,
  0xe929: emptyQueue,
  0xe8cb: saveScreen,
  0xe8ce: restoreScreen,
  0xe8e9: cursorState,
  /** $E866: turn the cursor on where it is: A = 1, or 0 if it already was. */
  0xe866: fn(0x51e9, () => {
    if (cmp(ram[CURSOR_ON], 0)) return void (cpu.a = nz(0));
    ram[CURSOR_ON] = 1;
    ram[CURSOR_SHOWN] = 0;
    startBlinking();
    cpu.a = nz(1);
  }),
  /**
   * $E86B(x in A, y): turn the cursor on at (x, y): A = 1, or 0 if it was on.
   * Off the screen, the OS pulls the A it pushed twice and returns into
   * whatever the stack then holds (a crash); Fulu returns 0.
   */
  0xe86b: fn(0x5208, () => {
    const x = cpu.a, fail = () => void (cpu.a = nz(0));
    if (cmp(ram[CURSOR_ON], 0)) return fail();
    if ((cmp(x, 0xa0), x >= 0xa0)) return fail();
    cpu.y = 0;
    const y = rd(word(0x28));
    if ((cmp(y, 0x60), y >= 0x60)) return fail();
    ram[CURSOR_X] = x;
    ram[CURSOR_Y] = y;
    ram[CURSOR_ON] = 1;
    ram[CURSOR_SHOWN] = 0;
    startBlinking();
    cpu.a = nz(1);
  }),
  /** $E86E: turn the cursor off (erasing it if shown; CT stopped unless the icons blink): A = 1, or 0 if it was off. */
  0xe86e: cursorFn(0x523c, () => {
    if (!cmp(ram[CURSOR_ON], 0)) return void (cpu.a = nz(0));
    if (cmp(ram[CURSOR_SHOWN], 0)) {
      invertCursor();
      ram[CURSOR_SHOWN] = 0;
    }
    stopBlinking();
    ram[CURSOR_ON] = 0;
    cpu.a = nz(1);
    cpu.p &= ~0x04; // CLI
  }),
  /**
   * $E871(x in A, y): move the cursor, if it is on and fits there (x + w <
   * 160, y + h - 1 < 96): erased if shown, then blinking anew. Off: CT stopped
   * unless the icons blink. A is left as the OS leaves it.
   */
  0xe871: cursorFn(0x526e, () => {
    const x = cpu.a;
    cpu.p &= ~0x04; // (SEI ... CLI)
    if (!cmp(ram[CURSOR_ON], 0)) return stopBlinking();
    cpu.x = x;
    clc();
    let v = (cpu.a = adc(x, ram[CURSOR_W]));
    if ((cmp(v, 0xa0), v >= 0xa0)) return;
    const y = (cpu.y = rd(word(0x28)));
    clc();
    v = adc(y, ram[CURSOR_H]);
    sec();
    v = sbc(v, 1);
    if ((cmp((cpu.a = v), 0x60), v >= 0x60)) return;
    ram[0x20d9] = x;
    ram[0x20db] = y;
    if (cmp(ram[CURSOR_SHOWN], 0)) {
      if (ram[CURSOR_SHOWN] !== 1) return void os.stop("The cursor's phase is neither 0 nor 1 ($E871)");
      invertCursor();
    }
    ram[CURSOR_X] = x;
    ram[CURSOR_Y] = y;
    ram[CURSOR_SHOWN] = 0;
    startBlinking();
  }),
  /**
   * $E80F(first in A, n, on): the bar graph's icons first to first + n - 1 on
   * (on ≠ 0) or off; nothing unless n < 39, first < 39, first + n < 40 and
   * neither is 0 (A the value that failed). The OS counts $2081 up and $2082
   * down as it goes.
   */
  0xe80f: fn(0x69ca, () => {
    const sp = word(0x28);
    ram[0x2081] = cpu.a;
    ram[0x2082] = rd(sp);
    ram[0x2080] = rd(sp + 1);
    cpu.y = 1;
    barRun();
  }),
  /**
   * $E8E3(value in A, 0-100): the bar graph showing it: all 38 bars off, then
   * as many on as the first threshold above the value (6:$69A4) is far in,
   * plus one (none for 0, all for 100 or more), through 6:$69DB.
   */
  0xe8e3: fn(0x6956, () => {
    const v = (ram[0x2081] = cpu.a);
    let x = 0;
    if (cmp(v, 0)) {
      if ((cmp(v, 0x64), v >= 0x64)) x = 0x26;
      else {
        while ((cmp(v, (ram[0x2082] = BAR_STEPS[x])), v >= BAR_STEPS[x])) x++;
        x++;
      }
    }
    cpu.x = x;
    ram[0x2081] = 1;
    ram[0x2082] = 0x26;
    ram[0x2080] = 0;
    barRun();
    ram[0x2081] = 1;
    ram[0x2082] = x;
    ram[0x2080] = 1;
    barRun();
  }),
  /** $E863(A, b): $20BA = A, $20BB = b, $20BE/$20BF = 0. */
  0xe863: fn(0x51d6, () => {
    ram[0x20ba] = cpu.a;
    ram[0x20bb] = rd(word(0x28));
    ram[0x20be] = ram[0x20bf] = 0;
    cpu.y = 0;
    cpu.a = nz(0);
  }),
  ...Object.fromEntries(ICON_ENTRIES.map(([entry, i]) => [entry, icon(0x66d6 + 5 * i, ICON_TABLE[i])])),
  0xe845: icon(0x672b, ICON_ROWS.e845),
  0xe848: icon(0x6730, ICON_ROWS.e848),
  0xe8d7: icon(0x6735, ICON_ROWS.e8d7),
  // $E9A1(w): $2BA8 = w
  0xe9a1: fn(0x5000, () => {
    const w = get16(word(0x28));
    set16(0x20, w);
    ram[0x2ba8] = w & 0xff;
    ram[0x2ba9] = w >> 8;
    cpu.y = 1;
    cpu.a = nz(w >> 8);
  }),
  // $E91C: clear $2200-$227F
  0xe91c: fn(0x5000, () => {
    ram.fill(0, 0x2200, 0x2280);
    cpu.a = 0;
    cpu.y = 0x80;
    cmp(0x80, 0x80);
  }),
  /**
   * $E932, the GUI's start-up: the message queue emptied, the keyboard state
   * 2 and $2B28 $0F, $2BA8 $FFFF, $2200-$227F cleared, three icons off.
   * Returns 1.
   */
  0xe932: fn(0x5000, () => {
    softPush([0, 0]); // 8:$6BC2's locals
    ram[QUEUE_READ] = ram[QUEUE_READ + 1] = ram[QUEUE_COUNT] = 0;
    softPush([QUEUE & 0xff, QUEUE >> 8, 0x18, 0, 0]);
    os.call(0xe700); // memset(QUEUE, 0, 24)
    softPop(7);
    ram[KEYBOARD] = 2;
    cpu.a = 0x0f;
    setKeyboardHigh(); // by JSR
    set16(0x20, 0xffff);
    softPush([0xff, 0xff]);
    os.call(0xe9a1);
    softPop(2);
    os.call(0xe91c);
    for (const entry of [0xe848, 0xe8d7, 0xe845]) {
      cpu.a = 0;
      os.call(entry);
    }
    cpu.a = nz(1);
  }, ICON_TEMPORARIES),

  // $E965: the keyboard's state ($2B27) and $2B28 as a word in $20/$21 ($2B28 the high byte; made by shifting it 8 left)
  /**
   * $E968 GuiSetKbdState(w): the keyboard state $2B27 = w's low byte, $2B28
   * = its high byte (through the runtime's shift right, 8 places); the three
   * keyboard icons off, then caps (bit 4), the latch (bit 5) and mode 1's
   * (bit 0) on as the state has them.
   */
  0xe968: fn(
    0x6b12,
    () => {
      const w = get16(word(0x28));
      // $20/$21 = w, & $00FF, into $2B27
      cpu.y = 1;
      ram[0x20] = cpu.a = nz(w & 0xff);
      ram[0x21] = cpu.a = nz(0);
      ram[KEYBOARD] = cpu.a = nz(ram[0x20]);
      set16(0x23, 8);
      set16(0x20, w);
      cpu.y = 1;
      cpu.a = nz(w >> 8);
      HELPERS[0xdbf2](os);
      ram[0x20] = cpu.a = nz(ram[0x20] & 0xff);
      ram[0x21] = cpu.a = nz(0);
      ram[KEYBOARD + 1] = cpu.a = nz(ram[0x20]);
      const icon = (entry: number, on: number) => ((cpu.a = on), os.call(entry));
      icon(0xe8d7, 0);
      icon(0xe845, 0);
      icon(0xe848, 0);
      const state = ram[KEYBOARD];
      cpu.a = nz(state & 0x10);
      if (state & 0x10) icon(0xe848, 1);
      cpu.a = nz(state & 0x20);
      if (state & 0x20) icon(0xe845, 1);
      cpu.a = nz(state & 0x01);
      if (state & 0x01) icon(0xe8d7, 1);
    },
    ICON_TEMPORARIES,
  ),
  0xe965: fn(0x6a79, () => {
    const hi = ram[KEYBOARD + 1];
    set16(0x23, hi << 8);
    set16(0x20, (hi << 8) | ram[KEYBOARD]);
    cpu.x = 0;
    cpu.p &= ~0x01; // the shift's last carry
    cpu.a = cpu.y = nz(hi);
  }),

  /**
   * $E93E GuiTranslateMsg(msg): a key message (type 1) becomes what the key
   * means (KEY_CLASSES, the second table while the shift latch is set): type
   * its class, parameter its code. Then, by the keyboard state ($2B27):
   *
   * - a character (class 2): a-z upper case with caps on (bit 4) or the
   *   latch (bit 5), which it releases; the parameter's high byte = whether
   *   the latch was set; returns whether $2B28 accepts it (classify);
   * - delete ($34): toggles the latch; returns 1;
   * - shift ($29, with the latch clear: latched it is $26): by the input
   *   mode (the state's low 4 bits) and $2B28, the command $29 or a change
   *   into or out of Chinese input (shiftKey);
   * - the input key with the latch ($36): caps toggled (in mode 2); returns 0;
   * - other commands release the latch; return 1.
   *
   * Fulu has no input methods of the OS's (input modes 4 and 8: the bar,
   * $E919 and $E925, which on the device take the other commands and the
   * latched shift in those modes; Fulu.type gives what the player types).
   */
  0xe93e: fn(0x6111, () => {
    const msg = get16(word(0x28));
    set16(0x26, msg);
    sec();
    sbc(rd(msg), 1);
    if (rd(msg) !== 1) return void (cpu.a = cpu.y = nz(1));
    const state = ram[KEYBOARD], latch = state & 0x20;
    const [type, translated] = KEY_CLASSES[latch ? 1 : 0][rd(msg + 1) & 0x3f];
    if (state & 0x0c && type === 2 && (isLower(translated) || (translated >= 0x41 && translated <= 0x5a))) {
      // Chinese input: a letter goes to the input method (on the device, its bar; here, the player's
      // box for the computer's own), not to the program: as the OS answers, a capital, and 0
      wr(msg, 2);
      const capital = isLower(translated) ? translated - 0x20 : translated;
      set16(0x20, capital);
      put16(msg + 1, capital);
      return void (cpu.a = cpu.y = nz(0));
    }
    let code = translated;
    wr(msg, type);
    clc();
    set16(0x23, adc(msg & 0xff, 1) | (adc(msg >> 8, 0) << 8));
    set16(0x20, code);
    put16(word(0x23), code);
    if (type === 2 && isLower(code) && state & 0x10) {
      // caps: upper case (through the parameter, as the OS does)
      code -= 0x20;
      set16(0x23, (msg + 1) & 0xffff);
      set16(0x20, code);
      put16(msg + 1, code);
    }
    if (type === 5) {
      if (code === 0x34) {
        toggleLatch();
        return void (cpu.a = cpu.y = nz(1));
      }
      if (code === 0x36) {
        if (latch) toggleLatch();
        if (ram[KEYBOARD] & 0x02) {
          ram[KEYBOARD] ^= 0x10;
          cpu.a = ram[KEYBOARD] & 0x10;
          os.call(0xe848); // the caps icon
        }
        return void (cpu.a = cpu.y = nz(0));
      }
      if (code === 0x29) {
        if (latch) toggleLatch();
        return shiftKey(msg);
      }
      if (latch) toggleLatch();
    }
    set16(0x26, msg);
    sec();
    sbc(type, 2);
    if (type !== 2) return void (cpu.a = cpu.y = nz(1));
    // a character: the latch into the parameter's high byte; with it, upper case and released
    clc();
    set16(0x23, adc(msg & 0xff, 2) | (adc(msg >> 8, 0) << 8));
    wr(msg + 2, latch ? 1 : 0);
    if (latch) {
      if (isLower(code)) {
        set16(0x23, (msg + 1) & 0xffff);
        wr(msg + 1, code - 0x20);
      }
      toggleLatch();
    }
    set16(0x26, msg);
    set16(0x20, get16(msg + 1));
    cpu.a = cpu.y = nz(classify(rd(msg + 1)));
  }, ICON_TEMPORARIES), // (the latch and caps icons')

  /**
   * $E935 GuiGetMsg(msg): wait for a message. In order: the flag events
   * (type 7, then 6: timer 1), a posted message, a key (type 1, the key's
   * code). Returns 1.
   */
  0xe935: fn(0x5093, () => {
    os.listen();
    os.feedTyped();
    if (os.retrying) farCalled(WAIT); // the trace of the OS's last time round its loop
    for (const [flag, type] of FLAG_MESSAGES) {
      if (!test(flag)) continue;
      clear(flag);
      message(type, 0);
      return;
    }
    if (ram[QUEUE_COUNT]) {
      const i = ram[QUEUE_READ], record = QUEUE + 3 * i;
      message(ram[record], ram[record + 1] | (ram[record + 2] << 8));
      ram[QUEUE_COUNT] = (ram[QUEUE_COUNT] - 1) & 7;
      ram[QUEUE_READ] = (i + 1) & 7;
      set16(0x26, 3 * i); // (the record's offset, as the runtime's multiply leaves it)
      cpu.p &= ~0x41; // C and V of the index's increment
      return;
    }
    os.call(0xe7c1); // SysGetKey
    const key = cpu.a;
    if (key !== 0xff) {
      message(1, key);
      // The system keys (0-3: power, the menu, the two dictionaries) leave the
      // program on the device, for the power-off, the OS's menu or a
      // dictionary. Fulu has none of those: the program ends.
      if (key <= 3) return void os.stop("The program ended", true);
      // the key's class, looked up
      const entry = 0x8c36 + 2 * (key & 0x3f);
      set16(0x20, entry);
      set16(0x26, entry);
      set16(0x23, key & 0x3f);
      cpu.p &= ~0x41; // C and V clear
      return;
    }
    for (const flag of OTHER_EVENTS) if (test(flag)) return void os.stop(`Fulu has no GuiGetMsg event $${flag.toString(16)} yet`);
    if (test(0x02000000)) {
      clear(0x02000000);
      message(7, 0);
      return;
    }
    // nothing: the OS halts until an interrupt (unless $2021 bit 1 is set, when it polls), and looks again
    return "wait";
  }),
};
