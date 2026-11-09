// The OS's message functions (its "GUI"): programs wait for keys and timer
// ticks through GuiGetMsg, a message being a type byte and a 16-bit
// parameter.

import { Key, keyChar } from "../bbk/keys";
import { adc, carry, clc, cmp, cpu, farCalled, fn, get16, long, nz, os, put16, ram, rd, sbc, sec, set16, softPop, softPush, store, word, wr } from "./alu";
import type { OsFunction } from "./fulu";

/** The OS's 32-bit event flags (bit 0 set by timer 1's interrupt). */
const EVENTS = 0x201e;
/** Messages posted to the OS: 8 records of type and parameter, a read index and a count. */
const QUEUE = 0x2b0f, QUEUE_READ = 0x2b09, QUEUE_COUNT = 0x2b0b;
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

/** The input modes $E93B switches between (the keyboard state's low 4 bits), and the modes each tests for a change to, in order. */
const MODES: Record<number, number[]> = { 2: [4, 8, 1], 4: [8, 2, 1], 8: [2, 4, 1], 1: [4, 8, 2] };
/** Where the OS keeps that switch's table (8:$8B9C: 4 modes, then their code's addresses). */
const MODE_TABLE = 0x8b9c, MODE_ORDER = [2, 4, 8, 1], MODE_CODE = [0x6028, 0x605e, 0x6094, 0x60ca];

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

/**
 * 8:$67CC, the shift key: a switch on the input mode (the state's low 4
 * bits). In modes 1 and 2 with no input method allowed ($2B28 bits 2, 3) the
 * message becomes the command $29 and it returns 1.
 */
function shiftKey(msg: number): void {
  const mode = ram[KEYBOARD] & 0x0f;
  if ((mode !== 1 && mode !== 2) || ram[KEYBOARD + 1] & 0x0c)
    return void os.stop(`Fulu has no input methods yet (the shift key in mode ${mode}, $2B28 = $${ram[KEYBOARD + 1].toString(16)})`);
  set16(0x26, 0x6811); // the switch's jump to its case
  wr(msg, 5);
  clc();
  set16(0x20, adc(msg & 0xff, 1) | (adc(msg >> 8, 0) << 8));
  set16(0x23, word(0x20));
  set16(0x20, 0x29);
  put16(word(0x23), 0x29);
  cpu.a = cpu.y = nz(1);
}

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
   * $E93B(mode): change the input mode. Fulu has only the case of no change
   * (the mode is the current one, or one the current mode has no change to).
   */
  0xe93b: fn(0x5ff3, () => {
    const mode = cpu.a, current = ram[KEYBOARD] & 0x0f, order = MODES[current];
    wr((word(0x28) - 1) & 0xffff, mode); // passed on the software stack
    set16(0x23, current);
    if (!order) {
      // the switch's default
      set16(0x20, MODE_TABLE + 16);
      set16(0x26, 0x6100);
    } else {
      const i = MODE_ORDER.indexOf(current);
      set16(0x20, MODE_TABLE + 8 + 2 * i);
      set16(0x26, MODE_CODE[i]);
      if (order.includes(mode)) return void os.stop(`Fulu has no change of input mode from ${current} to ${mode} yet`);
      for (const m of order) {
        sec();
        sbc(mode, m);
      }
      cpu.y = 3;
    }
    cpu.a = ram[0x29];
  }),
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
   * - shift ($29): by the input mode (the state's low 4 bits) and $2B28
   *   (shiftKey); with the latch, $36: caps toggled; returns 0;
   * - other commands release the latch; return 1.
   *
   * Fulu has no input methods (state bits 2 and 3, $2B28 bits 2 and 3).
   */
  0xe93e: fn(0x6111, () => {
    const msg = get16(word(0x28));
    set16(0x26, msg);
    sec();
    sbc(rd(msg), 1);
    if (rd(msg) !== 1) return void (cpu.a = cpu.y = nz(1));
    const state = ram[KEYBOARD], latch = state & 0x20;
    const [type, translated] = KEY_CLASSES[latch ? 1 : 0][rd(msg + 1) & 0x3f];
    if (state & 0x0c) return void os.stop(`Fulu has no input methods yet (GuiTranslateMsg, keyboard state $${state.toString(16)})`);
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
      if (key <= 3) return void os.stop("The program ended");
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
