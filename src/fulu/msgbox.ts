// GuiMsgBox ($E953): the OS's message box, compiled C (9:$8A7C, a wrapper,
// and its body at 9:$8195), done here as the OS does it, through its calls
// to the other OS functions. Its locals live on the software stack, as the
// OS's do, so that when it waits for a key it can go on from them.

import { adc, clc, cpu, fn, get16, nz, os, put16, ram, rd, sbc, sec, set16, softPop, softPush, word, wr } from "./alu";
import { HEAP } from "./heap";
import { compare } from "./runtime";
import { SCREEN } from "./screen";
import { TEXT } from "./text";
import type { OsFunction } from "./fulu";

/** The body's locals: 57 bytes, below the wrapper's 5 bytes of arguments (text, timeout, a flag to restore the screen). */
const LOCALS = 57, FRAME = LOCALS + 5;
// where in the frame
const OLD_PERIOD = 0, RESULT = 1, TICKS = 2, SIZE = 4, MSG = 6, SAVED = 9, LENGTH = 11, INDEX = 12;
const DOUBLE = 14, COLUMN = 15, CURSOR = 16, LINES = 18, LAST = 32, BOTTOM = 33, TOP = 34, BUFFER = 35;
const TEXT_ARG = 57, TIMEOUT = 59, RESTORE = 61;
/** The box: from x = 11 to 148 (its shadow to 148), 16 rows a line, at most 5 lines of 16 bytes. */
const LEFT = 0x0b, RIGHT = 0x92, SHADOW = 0x94, TEXT_X = 0x0f, COLUMNS = 16, MAX_LINES = 5;

const CALLEES = [0xe874, 0xe877, 0xe85d, 0xe79a, 0xe797, 0xe87d, 0xe87a, 0xe947, 0xe94a];
const FUNCS: Record<number, OsFunction> = { ...SCREEN, ...TEXT, ...HEAP };
/** What the functions it calls use as temporaries. */
const TEMPORARIES = CALLEES.flatMap((e) => FUNCS[e].temporaries ?? []);

let frame = 0;
const L = (i: number) => rd(frame + i);
const setL = (i: number, v: number) => wr(frame + i, v);
const L16 = (i: number) => get16(frame + i);
const setL16 = (i: number, v: number) => put16(frame + i, v);

/** Call an OS function with A and these bytes pushed on the software stack, as the compiled code does. */
function call(entry: number, a: number, args: number[] = [], resumed = false): void | "wait" {
  set16(0x28, frame);
  softPush(args);
  cpu.a = a;
  const r = os.call(entry, resumed);
  if (r === "wait") return r;
  softPop(args.length);
}

/** The rectangle the box takes, with its shadow, for saving and restoring the screen. */
const area = () => [L(TOP), SHADOW, (L(BOTTOM) + 2) & 0xff];

/** How the body returns A, through the epilogue and the wrapper (which keep A in Y and in X). */
function finish(a: number, caller: number): void {
  set16(0x28, caller);
  cpu.a = cpu.x = cpu.y = a;
}

/** Break the text into lines of 16 bytes, not splitting a double-byte character: their starts in lines[], and the index of the last. */
function wrap(text: number): void {
  setL(COLUMN, 0);
  setL16(CURSOR, text);
  setL(DOUBLE, 0);
  setL(LAST, 0);
  setL16(LINES, text);
  for (;;) {
    const cursor = L16(CURSOR), last = L(LAST);
    if (last >= MAX_LINES || !rd(cursor)) break;
    setL(DOUBLE, rd(cursor) > 0x80 ? (L(DOUBLE) + 1) & 0xff : 0);
    setL(COLUMN, (L(COLUMN) + 1) & 0xff);
    if (L(COLUMN) === COLUMNS) {
      setL(LAST, last + 1);
      // the line breaks after this byte, unless it starts a double-byte character
      const odd = L(DOUBLE) & 1;
      setL16(LINES + 2 * (last + 1), (cursor + (odd ? 0 : 1)) & 0xffff);
      setL(COLUMN, odd);
      setL(DOUBLE, odd);
    }
    setL16(CURSOR, (L16(CURSOR) + 1) & 0xffff);
  }
  if (L(LAST) < MAX_LINES) setL16(LINES + 2 * (L(LAST) + 1), L16(CURSOR));
  else setL(LAST, L(LAST) - 1);
}

/** The box drawn, with the screen under it saved first if asked: false if there was no memory to save it in. */
function draw(): boolean {
  const lines = L(LAST) + 1;
  const top = (((0x5a - ((lines * 16) & 0xff)) & 0xff) >> 1) & 0xff;
  setL(TOP, top);
  setL(BOTTOM, (lines * 16 + top + 4) & 0xff);
  const bottom = L(BOTTOM);
  if (L(RESTORE) === 1) {
    call(0xe874, LEFT, [...area(), (frame + SIZE) & 0xff, (frame + SIZE) >> 8]);
    const size = L16(SIZE);
    call(0xe947, size >> 8, [size & 0xff, size >> 8]);
    setL16(SAVED, word(0x20));
    if (!L16(SAVED)) {
      set16(0x23, 0);
      compare(0x20, 0x23, 2);
      return false;
    }
    const p = L16(SAVED);
    call(0xe877, LEFT, [...area(), p & 0xff, p >> 8]);
  }
  call(0xe85d, LEFT, area());
  for (let i = 0; i <= L(LAST); i++) {
    setL(INDEX, i);
    const from = L16(LINES + 2 * i), n = (L16(LINES + 2 * i + 2) - from) & 0xff;
    setL(LENGTH, n);
    const buffer = (frame + BUFFER) & 0xffff;
    call(0xe72d, 0, [buffer & 0xff, buffer >> 8, from & 0xff, from >> 8, n, 0]);
    wr(buffer + n, 0);
    call(0xe79a, TEXT_X, [(top + 2 + 16 * i) & 0xff, buffer & 0xff, buffer >> 8]);
  }
  call(0xe797, LEFT, [top, RIGHT, bottom]);
  call(0xe87d, 0x0e, [bottom, RIGHT, (bottom + 2) & 0xff]);
  call(0xe87d, RIGHT, [(top + 3) & 0xff, SHADOW, (bottom + 2) & 0xff]);
  return true;
}

/** $E953 GuiMsgBox(text, timeout): show text in a box until a key, or timeout ticks of timer 1 (if not 0). Returns 1. */
export const GuiMsgBox: OsFunction = fn(
  0x8a7c,
  () => {
    const caller = word(0x28);
    frame = (caller - FRAME) & 0xffff;
    if (!os.retrying) {
      const text = get16(caller), timeout = get16(caller + 2);
      setL16(TEXT_ARG, text);
      setL16(TIMEOUT, timeout);
      setL(RESTORE, 1);
      setL(RESULT, 1);
      call(0xe71e, text >> 8, [text & 0xff, text >> 8]);
      const n = ram[0x20];
      setL(13, n);
      clc();
      const t = adc(n, 1);
      sec();
      sbc(t, 1);
      if (!n) return finish(nz(0xff), caller);
      wrap(text);
      if (!draw()) return finish(nz(0xfe), caller);
      if (timeout) {
        call(0xe7b8, 0);
        setL(OLD_PERIOD, cpu.a);
        if (L(OLD_PERIOD) >= 1) call(0xe7b5, (L(OLD_PERIOD) - 1) & 0xff);
        call(0xe7b2, 1);
        setL16(TICKS, 0);
      }
    }
    // its loop round GuiGetMsg, which waits; when it does, so does this (the next time it goes on from here)
    let retrying = os.retrying;
    for (;;) {
      const msg = (frame + MSG) & 0xffff;
      os.retrying = retrying;
      if (call(0xe935, msg >> 8, [msg & 0xff, msg >> 8], retrying) === "wait") {
        set16(0x28, caller);
        return "wait";
      }
      retrying = false;
      const type = L(MSG);
      if (type === 1) break;
      if (type === 0x0a && L(MSG + 1) === 3) {
        os.stop("Fulu has no $E92F (GuiMsgBox's message $0A 3) yet");
        return;
      }
      if (type === 6 && L16(TIMEOUT)) {
        setL16(TICKS, (L16(TICKS) + 1) & 0xffff);
        if (L16(TICKS) === L16(TIMEOUT)) break;
      }
    }
    if (L16(TIMEOUT)) {
      call(0xe7b5, 0);
      if (L(OLD_PERIOD) >= 1) call(0xe7b2, L(OLD_PERIOD));
    }
    if (L(RESTORE) === 1) {
      const p = L16(SAVED);
      call(0xe87a, LEFT, [...area(), p & 0xff, p >> 8]);
      set16(0x20, p);
      call(0xe94a, p >> 8, [p & 0xff, p >> 8]);
    }
    cpu.y = 1;
    finish(nz(L(RESULT)), caller);
  },
  TEMPORARIES,
);
