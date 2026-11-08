// The OS's functions, keyed by their entry in the API table, and its
// interrupt handlers, keyed by vector. Each keeps the OS's state in the OS's
// own variables (docs/fulu-notes.md) and leaves registers and flags as the
// OS does.

import { adc, clc, cmp, cpu, fn, get16, nz, put16, ram, rd, sbc, sec, set16, store, use, word, wr } from "./alu";
import { SCREEN } from "./screen";
import { TEXT } from "./text";
import { GUI } from "./gui";
import { FILES } from "./files";
import { HEAP } from "./heap";
import { GuiMsgBox } from "./msgbox";
import { compare } from "./runtime";
import type { Handler, OsFunction } from "./fulu";

const ISR = 0x04, TISR = 0x05, KEYCODE = 0x24e, STCON = 0x226;

// the OS's variables
const KEY_WRITE = 0x2003, KEY_READ = 0x2004, KEYS = 0x2008;
const TIMER_COUNT = 0x2018, TIMER_PERIOD = 0x2019, TIMER_OPEN = 0x201a;
/** Bit 2: key sound on. */
const SOUND = 0x201b;
/** Bit 0: timer 1 fired. */
const EVENTS = 0x201e;
/** The top byte of the 32-bit events at $201E: its bit 0 (event bit 24) is set when a key arrives. */
const KEY_EVENTS = 0x2021;
/** The status icons' blinking: on, and the phase. */
const BLINK = 0x20cd, BLINK_PHASE = 0x20ce;
const ICONS = [0x0f32, 0x0f52, 0x0f72];

const handler = (run: () => void): Handler => (os) => (use(os), run());

export const FUNCTIONS: Record<number, OsFunction> = {
  ...SCREEN,
  ...TEXT,
  ...GUI,
  ...HEAP,
  ...FILES,
  0xe953: GuiMsgBox,
  // memset(p, c, n), as compiled C: it counts p up and n down in its arguments
  0xe700: fn(0x5000, () => {
    const args = word(0x28), c = rd(args + 4);
    let p = get16(args), n = get16(args + 2);
    for (; n; n--, p = (p + 1) & 0xffff) wr(p, c);
    put16(args, p);
    put16(args + 2, 0);
    set16(0x20, 0);
    set16(0x23, 0);
    compare(0x20, 0x23, 2);
    cpu.y = 5;
    cpu.a = ram[0x29];
  }),
  /**
   * strcpy(dst, src), safe when they overlap (backwards when src is below
   * dst); returns dst. Nothing if either is 0. Forwards, it leaves src at
   * the string's end in its argument.
   */
  0xe71b: fn(0x6132, () => {
    const args = word(0x28), dst = get16(args);
    let src = get16(args + 2);
    const done = () => {
      set16(0x20, dst);
      cpu.a = cpu.y = nz(dst >> 8);
    };
    set16(0x23, 0);
    if (!src || !dst || src === dst) {
      cmp(0, 0);
      cpu.p &= ~0x40;
      return done();
    }
    if (((src - dst) & 0x8000) !== 0) {
      let n = 0;
      while (rd(src + n)) n++;
      n++;
      for (let i = n - 1; i >= 0; i--) wr(dst + i, rd(src + i));
      set16(0x26, src);
      cmp(0, 0);
      cpu.p &= ~0x40;
      return done();
    }
    let at = dst;
    cmp(0, 0);
    cpu.p &= ~0x40;
    for (; rd(src); ) {
      const v = rd(src);
      clc();
      src = adc(src & 0xff, 1) | (adc(src >> 8, 0) << 8);
      const to = at;
      clc();
      at = adc(at & 0xff, 1) | (adc(at >> 8, 0) << 8);
      wr(to, v);
    }
    put16(args + 2, src);
    set16(0x26, src);
    set16(0x23, at);
    wr(at, 0);
    done();
  }),
  /**
   * strncpy(dst, src, n): copies while there is a character and n > 0
   * (signed), then pads with zeros while n ≠ 0; counts src and n along in
   * its arguments. Returns dst.
   */
  0xe72d: fn(0x689d, () => {
    const args = word(0x28), dst = get16(args);
    let src = get16(args + 2), n = get16(args + 4), at = dst;
    const step = (v: number) => (clc(), adc(v & 0xff, 1) | (adc(v >> 8, 0) << 8));
    const down = (v: number) => (sec(), sbc(v & 0xff, 1) | (sbc(v >> 8, 0) << 8));
    while (rd(src) && n && !(n & 0x8000)) {
      const from = src;
      src = step(src);
      const v = rd(from), to = at;
      at = step(at);
      wr(to, v);
      n = down(n);
    }
    while (n) {
      const to = at;
      at = step(at);
      wr(to, 0);
      n = down(n);
    }
    put16(args + 2, src);
    put16(args + 4, 0);
    set16(0x26, src);
    set16(0x23, 0);
    set16(0x20, dst);
    cmp(0, 0);
    cpu.p &= ~0x40;
    cpu.a = cpu.y = nz(dst >> 8);
  }),
  // strlen(s) in $20/$21; it leaves s + length + 1 in its argument
  0xe71e: fn(0x63dd, () => {
    const args = word(0x28);
    let n = 0;
    for (;;) {
      const p = get16(args);
      clc();
      put16(args, adc(p & 0xff, 1) | (adc(p >> 8, 0) << 8));
      if (!rd(p)) break;
      n = (n + 1) & 0xffff;
    }
    set16(0x20, n);
    cpu.y = cpu.a = nz(n >> 8);
  }),
  // SysTimer1Open: A = the period in ST1 ticks; nothing if 0 or already open
  0xe7b2: fn(0x7770, () => {
    const period = cpu.a;
    if (!cmp(period, 0)) return;
    cpu.x = period;
    if (cmp((cpu.a = ram[TIMER_OPEN]), 0)) return;
    ram[TIMER_OPEN] = 1;
    ram[TIMER_PERIOD] = period;
    ram[TIMER_COUNT] = 0;
    wr(STCON, (cpu.a = nz(rd(STCON) | 1)));
  }),
  // SysTimer1Close
  0xe7b5: fn(0x7793, () => {
    ram[TIMER_OPEN] = 0;
    wr(STCON, (cpu.a = nz(rd(STCON) & 0xfe)));
  }),
  // timer 1's period, 0 if closed
  0xe7b8: fn(0x77a1, () => {
    cmp((cpu.a = ram[TIMER_OPEN]), 0);
    cpu.a = nz(cpu.a ? ram[TIMER_PERIOD] : 0);
  }),
  // SysGetKey: the next key, $FF if none
  0xe7c1: fn(0x76cc, () => {
    const i = ram[KEY_READ];
    if (!cmp(i, ram[KEY_WRITE])) return void (cpu.a = nz(0xff));
    ram[0x2f] = KEYS & 0xff;
    ram[0x30] = KEYS >> 8;
    cpu.y = i;
    const key = rd(KEYS + i);
    ram[KEY_READ] = (i + 1) & 0x0f;
    cpu.a = nz(key);
  }),
  // SysSetKeySound: A ≠ 0 turns the key sound on
  0xe7c4: fn(0x7716, () => {
    ram[SOUND] = cpu.a = nz(cmp(cpu.a, 0) ? ram[SOUND] | 0x04 : ram[SOUND] & 0xfb);
  }),
  // whether the key sound is on
  0xe7c7: fn(0x772e, () => void (cpu.a = nz(ram[SOUND] & 0x04 ? 1 : 0))),
  // the real-time clock's seconds
  0xe7d9: fn(0x759f, () => void (cpu.a = nz(rd(0x234) & 0x3f))),
  // clear four records at $2122 (their first bytes) and $216A
  0xe9c2: fn(0x6911, () => {
    ram[0x216a] = 0;
    for (let y = 0; y < 0x30; y += 0x0c) ram[0x2122 + y] = 0;
    cpu.y = cpu.a = 0x30;
    cmp(0x30, 0x30);
    cpu.p &= ~0x40;
  }),
  // (p, v, w): *(long *)p = v (unsigned), *(int *)(p + 4) = w, through the C runtime
  0xe95c: fn(0x7093, () => {
    const sp = word(0x28), p = get16(sp), v = get16(sp + 2), w = get16(sp + 4), s = word(0x2a) + 0x10;
    store(s, v); // widened in the scratch area (+$10), then copied
    store(p, v);
    clc();
    const at = adc(p & 0xff, 4) | (adc(p >> 8, 0) << 8);
    set16(0x23, at);
    set16(0x20, w);
    put16(at, w);
    cpu.y = 1;
    cpu.a = nz(w >> 8);
  }),
};

/** The SDK's names for the table's entries, where known. */
export const NAMES: Record<number, string> = {
  0xe71e: "strlen",
  0xe78e: "SysPicture",
  0xe794: "SysLine",
  0xe797: "SysRect",
  0xe79a: "SysPrintString",
  0xe7b2: "SysTimer1Open",
  0xe7b5: "SysTimer1Close",
  0xe7bb: "SysAscii",
  0xe7c1: "SysGetKey",
  0xe7c4: "SysSetKeySound",
  0xe85d: "SysLcdPartClear",
  0xe860: "SysLcdReverse",
  0xe877: "SysSaveScreen",
  0xe87a: "SysRestoreScreen",
  0xe87d: "SysFillRect",
  0xe889: "SysPictureDummy",
  0xe8a1: "SysPlayMelody",
  0xe8a4: "SysStopMelody",
  0xe935: "GuiGetMsg",
  0xe93e: "GuiTranslateMsg",
  0xe947: "SysMemAllocate",
  0xe94a: "SysMemFree",
  0xe953: "GuiMsgBox",
  0xe959: "SysRand",
  0xe968: "GuiSetKbdState",
  0xe9ce: "FileOpen",
  0xe9dd: "FileDel",
  0xe9e9: "FileNum",
  0xe9ec: "FileSearch",
};

/** Interrupt handlers. The far call that reaches them saves the registers, so only memory changes. */
export const INTERRUPTS: Record<number, Handler> = {
  // keyboard: start the key sound if on, and buffer the key (the OS keeps at most 15)
  2: handler(() => {
    wr(ISR, 0x7f);
    ram[0x2028] = ram[0x2027];
    if (ram[SOUND] & 0x04) {
      wr(0x23f, rd(0x23f) | 0xc0);
      wr(0x23b, rd(0x23b) | 0x20);
      ram[SOUND] |= 0x01;
      wr(0x22b, 0xfe);
    }
    const key = rd(KEYCODE);
    if (!(key & 0x80)) return;
    wr(KEYCODE, 0);
    const next = (ram[KEY_WRITE] + 1) & 0x0f;
    if (next === ram[KEY_READ]) return;
    wr(KEYS + ram[KEY_WRITE], key & 0x3f);
    ram[KEY_WRITE] = next;
    ram[KEY_EVENTS] |= 0x01;
  }),
  // timer ST1: timer 1's ticks
  3: handler(() => {
    wr(TISR, 0xfe);
    ram[TIMER_COUNT]++;
    if (ram[TIMER_COUNT] < ram[TIMER_PERIOD]) return;
    ram[EVENTS] |= 0x01;
    ram[TIMER_COUNT] = 0;
  }),
  // timer CT: blink the status icons
  0x12: handler(() => {
    wr(ISR, 0xfd);
    if (ram[BLINK] !== 1) return;
    const on = ram[BLINK_PHASE] !== 1;
    ram[BLINK_PHASE] = on ? 1 : 0;
    for (const a of ICONS) wr(a, (rd(a) & 0xfe) | (on ? 0 : 1));
  }),
};
