// The OS's message functions (its "GUI"): programs wait for keys and timer
// ticks through GuiGetMsg, a message being a type byte and a 16-bit
// parameter.

import { Key, keyChar } from "../bbk/keys";
import { adc, clc, cpu, farCalled, fn, get16, long, nz, os, put16, ram, rd, sbc, sec, set16, store, word, wr } from "./alu";
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

export const GUI: Record<number, OsFunction> = {
  /**
   * $E93E GuiTranslateMsg(msg): a key message (type 1) becomes what the key
   * means (KEY_CLASSES): type its class, parameter its code (a-z upper case
   * with caps on). Returns 1. (Characters, the shift and delete keys and the
   * input methods take paths Fulu does not have yet.)
   */
  0xe93e: fn(0x6111, () => {
    const msg = get16(word(0x28));
    set16(0x26, msg);
    sec();
    sbc(rd(msg), 1);
    if (rd(msg) !== 1) return void (cpu.a = cpu.y = nz(1));
    const state = ram[KEYBOARD], [type, code] = KEY_CLASSES[state & 0x20 ? 1 : 0][rd(msg + 1) & 0x3f];
    if (type === 2 || (type === 5 && [0x34, 0x36, 0x29].includes(code)) || state & 0x2c)
      return void os.stop(`Fulu has no GuiTranslateMsg for class ${type} code $${code.toString(16)} (keyboard state $${state.toString(16)}) yet`);
    wr(msg, type);
    clc();
    set16(0x23, adc(msg & 0xff, 1) | (adc(msg >> 8, 0) << 8));
    set16(0x20, code);
    put16(word(0x23), code);
    sec();
    sbc(type, 2); // its last test: whether it is a character
    cpu.a = cpu.y = nz(1);
  }),

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
      // the key's class, looked up for the system keys (0-3: power, menu, the dictionaries)
      if (key <= 3) return void os.stop(`Fulu has no GuiGetMsg system key ${key} yet`);
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
