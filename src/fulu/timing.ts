// How long the OS takes, so that programs run at the device's pace on Fulu.
//
// Fulu answers each entry into the OS at once, but on the device the OS's
// code takes time (drawing a full-screen picture, some 250,000 cycles), and
// games that pace themselves by their work, not only by the timer, then run
// too fast: animation and walking ran 10-50% fast. So each answer is charged
// the cycles the firmware spends on it (busy cycles, not counting where it
// halts), measured on 伏魔记 1.0, 1.3 and 英雄坛说 (tests: zz runs over 370,000
// entries): constants for most, and for drawing and copying a model fitted
// to the sizes (median error 0.1-3%).

/** Cycles the firmware spends, per entry: helpers (by address) and OS functions (by table entry). */
const CONSTANT: Record<number, number> = {
  // the C runtime's helpers
  0xd340: 67, 0xd362: 124, 0xd6af: 272, 0xdcf4: 244, 0xdaaa: 46, 0xdaca: 56, 0xdcb1: 1283, 0xdb5c: 892,
  0xdcef: 149, 0xe907: 171, 0xdc80: 1246, 0xdbe1: 40, 0xda1a: 65, 0xda09: 46, 0xdcab: 303, 0xdbf2: 37,
  0xdc7b: 60, 0xe90a: 70, 0xdae6: 58,
  // OS functions
  0xe79a: 68000, 0xe935: 3551, 0xe947: 16738, 0xe94a: 35423, 0xe93e: 1875, 0xe7c1: 695, 0xe9e9: 11134,
  0xe8ec: 26642, 0xe944: 15118, 0xe932: 13852, 0xe71b: 2956, 0xe7b2: 705, 0xe965: 1053, 0xe93b: 991,
  0xe95c: 960, 0xe7b5: 679, 0xe938: 752, 0xe9c2: 750, 0xe7c4: 680, 0xe7c7: 676, 0xe7d9: 669,
  // the dialogs: their own work (what they call is charged as they call it)
  0xe953: 20000, 0xe950: 20000,
};
/** Interrupts, by vector. */
const INTERRUPT: Record<number, number> = { 2: 908, 3: 793, 0x12: 300 };
/** A far call into the program's own code, and its return. */
export const FAR_CALL_CYCLES = 441, FAR_RETURN_CYCLES = 241;
/** What is not measured: a helper, an OS function. */
const HELPER_DEFAULT = 60, FUNCTION_DEFAULT = 1000;

/** A rectangle's size as the screen functions take it (x1 in A, y1, x2, y2 on the software stack): bytes a row, rows. */
function rect(a: number, args: (i: number) => number): [number, number, number] {
  const x1 = a, y1 = args(0), x2 = args(1), y2 = args(2);
  return [Math.max(0, (x2 >> 3) - (x1 >> 3) + 1), Math.max(0, y2 - y1 + 1), Math.max(0, (x2 - x1 + 1 + 7) >> 3)];
}

/**
 * The cycles the firmware takes for an OS function (table entry) or helper
 * (address), from A and the bytes on the software stack (args(i)), and for
 * strlen the length (len()).
 */
export function cycles(entry: number, a: number, args: (i: number) => number, len: (p: number) => number, isFunction: boolean): number {
  const w16 = (i: number) => args(i) | (args(i + 1) << 8);
  const [w, h, bw] = rect(a, args);
  switch (entry) {
    case 0xe78e: // SysPicture
      return 62 * w * h + 231 * h + 62 * bw * h + 674;
    case 0xe889: // SysPictureDummy
      return Math.max(0, 340 * w * h + 60 * h + (a & 7 ? 76 : 0) * bw * h - 234 * bw * h + 2071);
    case 0xe85d: // SysLcdPartClear
    case 0xe87d: // SysFillRect
      return 66 * w * h + 162 * h + 3828;
    case 0xe860: // SysLcdReverse
      return 77 * w * h + 295 * h + 19;
    case 0xe877: // SysSaveScreen
    case 0xe87a: // SysRestoreScreen
      return 148 * w * h + 37 * h;
    case 0xe797: // SysRect
      return 1968 * (Math.abs(args(1) - a) + Math.abs(args(2) - args(0))) + 11634;
    case 0xe794: // SysLine
      return 1087 * Math.max(Math.abs(args(1) - a), Math.abs(args(2) - args(0))) + 130;
    case 0xe700: // memset
      return 262 * w16(2) + 162;
    case 0xe901: // memmove
      return 21 * w16(4) + 90;
    case 0xe71e: // strlen
      return 300 * len(w16(0)) + 200;
  }
  return CONSTANT[entry] ?? (isFunction ? FUNCTION_DEFAULT : HELPER_DEFAULT);
}

export const interruptCycles = (vector: number) => INTERRUPT[vector] ?? 300;
