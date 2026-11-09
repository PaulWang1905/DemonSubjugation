// $E950 (9:$7540): a Yes / No dialog (伏魔记 1.0's "overwrite the save?").
// Compiled C, done here through the same calls to the other OS functions
// (so the screen it saves and restores, the heap and the keyboard state go
// as the OS's do), resumable while GuiGetMsg waits, as GuiMsgBox is.
//
// The OS draws a 24 × 24 icon and its two 40 × 20 buttons from pictures in
// its ROM. Fulu draws its own: the site's icon (public/favicon.svg, its 16 ×
// 16 grid at 1.5 ×) and 是 / 否 in the font ROM's glyphs (the site's font on
// Fulu's machine). Where those pictures go (the screen under them, and the
// heap blocks they pass through) is declared fromRom.
//
//   (selection in A, flag, text): the box (x 15-146, y 18-76) with the icon,
//   the text at (46, 26) (flag 0; Fulu has no other), 是 and 否 below; ← → ↑
//   ↓ switch, Enter returns the selection (0 是, 1 否), Exit $FF, y / n 0 / 1.
//   $FE if the heap has no room.

import { cpu, fn, get16, m, nz, os, ram, rd, set16, softPop, softPush, word, wr } from "./alu";
import { GUI } from "./gui";
import { HEAP } from "./heap";
import { HELPERS } from "./runtime";
import { lcd, SCREEN } from "./screen";
import { TEXT } from "./text";
import type { OsFunction } from "./fulu";

/** The pushed selection and 21 locals; the flag and the text above. */
const FRAME = 22;
const KEYBOARD_STATE = 3, SIZE = 5, SAVED = 7, ICON = 9, MSG = 12, SELECTION = 21, FLAG = 22, TEXT_ARG = 23;
/** The box, and where the icon and buttons go. */
const X1 = 0x0f, Y1 = 0x12, X2 = 0x92, Y2 = 0x4c;
const ICON_AT = [0x13, 0x16, 0x2a, 0x2d], YES_AT = [0x1d, 0x31, 0x44, 0x44], NO_AT = [0x56, 0x31, 0x7d, 0x44];

/** The site's icon (public/favicon.svg): its dark rectangles on a 16 × 16 grid, and the rounded square's outline. */
const ICON_RECTS = [
  [2, 3, 12, 8],
  [5, 6, 2, 2],
  [9, 6, 2, 2],
  [3, 12, 3, 2],
  [10, 12, 3, 2],
];
const ICON_HOLE = [3, 4, 10, 6];

/** The icon as 24 × 24 1-bit rows (3 bytes a row), the grid at 1.5 ×. */
export const ICON_BITS: Uint8Array = (() => {
  const px = (u: number) => Math.floor(u * 1.5);
  const bits = new Uint8Array(72);
  const set = (x: number, y: number, on: boolean) => {
    const i = y * 3 + (x >> 3), b = 0x80 >> (x & 7);
    bits[i] = on ? bits[i] | b : bits[i] & ~b;
  };
  const fill = ([x, y, w, h]: number[], on: boolean) => {
    for (let yy = px(y); yy < px(y + h); yy++) for (let xx = px(x); xx < px(x + w); xx++) set(xx, yy, on);
  };
  // the rounded square, as an outline
  for (let i = 2; i < 22; i++) (set(i, 0, true), set(i, 23, true), set(0, i, true), set(23, i, true));
  for (const [x, y] of [[1, 1], [22, 1], [1, 22], [22, 22]]) set(x, y, true);
  fill(ICON_RECTS[0], true);
  fill(ICON_HOLE, false);
  for (const r of ICON_RECTS.slice(1)) fill(r, true);
  return bits;
})();

/** A 40 × 20 button (5 bytes a row, in a block of $78 as the OS's): a frame and a 16 × 16 glyph, inverted when chosen. */
function button(glyph: number[], chosen: boolean): Uint8Array {
  const b = new Uint8Array(0x78);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 40; x++) {
      const edge = y === 0 || y === 19 || x === 0 || x === 39;
      const gx = x - 12, gy = y - 2;
      const ink = gx >= 0 && gx < 16 && gy >= 0 && gy < 16 && (glyph[gy * 2 + (gx >> 3)] & (0x80 >> (gx & 7))) !== 0;
      const on = edge || (chosen ? !ink : ink);
      if (on) b[y * 5 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return b;
}

/** A GB2312 hanzi's 16 × 16 glyph from the font ROM (as the OS keeps them), without going through the OS's glyph buffer. */
function hanzi(hi: number, lo: number): number[] {
  const font = (m as unknown as { roms: { font?: Uint8Array } }).roms.font;
  const at = ((hi - 0xb0) * 0x5e + (lo - 0xa1)) * 32;
  return Array.from({ length: 32 }, (_, i) => font?.[at + i] ?? 0);
}

let frame = 0;
/** Where Fulu's pictures went in this call (the screen under them, the heap blocks), for fromRom. */
let pictures: [number, number][] = [];
const L = (i: number) => rd(frame + i);
const setL = (i: number, v: number) => wr(frame + i, v);
const L16 = (i: number) => get16(frame + i);

/** Call an OS function with A and these bytes pushed, from the stack pointer `sp`. */
function call(entry: number, a: number, args: number[] = [], sp = frame, resumed = false): void | "wait" {
  set16(0x28, sp);
  softPush(args);
  cpu.a = a;
  const r = os.call(entry, resumed);
  if (r === "wait") return r;
  softPop(args.length);
}

/** The screen under a rectangle, as RAM ranges (for fromRom). */
function screenOf([x1, y1, x2, y2]: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let y = y1; y <= y2; y++) for (let b = x1 >> 3; b <= x2 >> 3; b++) out.push([lcd(b, y), lcd(b, y) + 1]);
  return out;
}

/** 9:$7F0D: the two buttons, the chosen one inverted, through a heap block of $78 as the OS does. */
function buttons(selection: number): void {
  const sp = (frame - 6) & 0xffff; // its own frame: the selection pushed, 5 locals
  call(0xe947, 0, [0x78, 0], sp);
  const block = word(0x20);
  const yes = button(hanzi(0xca, 0xc7), selection === 0), no = button(hanzi(0xb7, 0xf1), selection === 1);
  for (const [picture, at] of [[yes, YES_AT], [no, NO_AT]] as const) {
    for (let i = 0; i < 0x78; i++) wr(block + i, picture[i]);
    call(0xe78e, at[0], [at[1], at[2], at[3], block & 0xff, block >> 8, 0], sp);
    pictures.push(...screenOf([...at]));
  }
  pictures.push([block, block + 0x78]);
  call(0xe94a, block >> 8, [block & 0xff, block >> 8], sp);
}

/** Close: the screen back, its block freed, the keyboard state back; A = the result. */
function close(result: number, caller: number): void {
  const p = L16(SAVED);
  call(0xe87a, X1, [Y1, X2, Y2, p & 0xff, p >> 8]);
  call(0xe94a, p >> 8, [p & 0xff, p >> 8]);
  const k = L16(KEYBOARD_STATE);
  call(0xe968, k >> 8, [k & 0xff, k >> 8]);
  set16(0x28, caller);
  cpu.a = cpu.x = cpu.y = nz(result);
}

/** What the functions it calls use as temporaries (the screen's, the icons', the heap's). */
const FUNCS: Record<number, OsFunction> = { ...SCREEN, ...TEXT, ...HEAP, ...GUI };
const TEMPORARIES = [0xe874, 0xe877, 0xe85d, 0xe797, 0xe78e, 0xe79a, 0xe87d, 0xe87a, 0xe947, 0xe94a, 0xe968, 0xe965, 0xe938, 0xe93b, 0xe935, 0xe93e].flatMap((e) => FUNCS[e]?.temporaries ?? []);

export const YesNo: OsFunction = {
  ...fn(0x7540, () => {
    const caller = word(0x28);
    frame = (caller - FRAME) & 0xffff;
    if (!os.retrying) {
      pictures = [];
      setL(SELECTION, cpu.a);
      setL(0, 0x14);
      call(0xe965, 0);
      wr(frame + KEYBOARD_STATE, ram[0x20]);
      wr(frame + KEYBOARD_STATE + 1, ram[0x21]);
      call(0xe938, 2);
      call(0xe93b, 2);
      const size = (frame + SIZE) & 0xffff;
      call(0xe874, X1, [Y1, X2, Y2, size & 0xff, size >> 8]);
      call(0xe947, L(SIZE + 1), [L(SIZE), L(SIZE + 1)]);
      wr(frame + SAVED, ram[0x20]);
      wr(frame + SAVED + 1, ram[0x21]);
      const saved = L16(SAVED);
      const k = L16(KEYBOARD_STATE);
      if (!saved) {
        call(0xe968, k >> 8, [k & 0xff, k >> 8]);
        set16(0x28, caller);
        cpu.a = cpu.x = cpu.y = nz(0xfe);
        return;
      }
      call(0xe877, X1, [Y1, X2, Y2, saved & 0xff, saved >> 8]);
      call(0xe85d, X1, [Y1, X2, Y2]);
      call(0xe797, X1, [Y1, 0x90, 0x4a]);
      call(0xe947, 0, [0x48, 0]);
      wr(frame + ICON, ram[0x20]);
      wr(frame + ICON + 1, ram[0x21]);
      const icon = L16(ICON);
      if (!icon) {
        call(0xe94a, saved >> 8, [saved & 0xff, saved >> 8]);
        call(0xe968, k >> 8, [k & 0xff, k >> 8]);
        set16(0x28, caller);
        cpu.a = cpu.x = cpu.y = nz(0xfe);
        return;
      }
      for (let i = 0; i < 0x48; i++) wr(icon + i, ICON_BITS[i]);
      call(0xe78e, ICON_AT[0], [ICON_AT[1], ICON_AT[2], ICON_AT[3], icon & 0xff, icon >> 8, 0]);
      pictures.push(...screenOf(ICON_AT), [icon, icon + 0x48]);
      call(0xe94a, icon >> 8, [icon & 0xff, icon >> 8]);
      if (L(FLAG)) return void os.stop("Fulu has no $E950 with a laid-out text yet");
      const text = L16(TEXT_ARG);
      call(0xe79a, 0x2e, [0x1a, text & 0xff, text >> 8]);
      call(0xe87d, 0x13, [0x4a, 0x90, 0x4c]);
      call(0xe87d, 0x90, [0x16, 0x92, 0x4c]);
      buttons(L(SELECTION));
    }
    // its loop round GuiGetMsg (which waits; so does this, going on from here when asked again)
    let retrying = os.retrying;
    for (;;) {
      const msg = (frame + MSG) & 0xffff;
      os.retrying = retrying;
      if (call(0xe935, msg >> 8, [msg & 0xff, msg >> 8], frame, retrying) === "wait") {
        set16(0x28, caller);
        return "wait";
      }
      retrying = false;
      if (!cpu.a) continue;
      call(0xe93e, msg >> 8, [msg & 0xff, msg >> 8]);
      if (!cpu.a) continue;
      const type = L(MSG), code = L(MSG + 1), high = L(MSG + 2);
      if (type === 5) {
        if (code >= 0x22 && code <= 0x25) {
          // (L[21] + 1) % 2, by the runtime's division
          ram[0x23] = 2;
          cpu.a = (L(SELECTION) + 1) & 0xff;
          HELPERS[0xdcab](os);
          setL(SELECTION, cpu.a);
          buttons(L(SELECTION));
        } else if ((code === 0x20 || code === 0x21) && high) return void os.stop("Fulu has no $E8C8 yet ($E950's page keys)");
        else if (code === 0x27) return close(L(SELECTION), caller);
        else if (code === 0x28) return close(0xff, caller);
      } else if (type === 0x0a && code === 3) return void os.stop("Fulu has no $E92F ($E950's message $0A 3) yet");
      else if (type === 2) {
        if (code === 0x79 || code === 0x59) setL(SELECTION, 0);
        else if (code === 0x6e || code === 0x4e) setL(SELECTION, 1);
        else continue;
        if (L(SELECTION) <= 1) return close(L(SELECTION), caller);
      }
    }
  }),
  temporaries: TEMPORARIES,
  fromRom: { ram: () => pictures },
};
