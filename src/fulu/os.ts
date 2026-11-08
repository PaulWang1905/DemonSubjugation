// The OS's functions, keyed by their entry in the API table, and its
// interrupt handlers, keyed by vector.

import type { Fulu, Handler } from "./fulu";

const ISR = 0x04, TISR = 0x05, KEYCODE = 0x24e;
/** The OS keeps the last 15 keys pressed. */
const KEY_BUFFER = 15;

export const FUNCTIONS: Record<number, Handler> = {};

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

/**
 * On the device every handler is a far call into the OS that saves A, X, Y
 * and $26/$27; the far call's return leaves bank select at 8.
 */
const interrupt = (f: (os: Fulu) => void): Handler => (os) => {
  f(os);
  os.machine.write(0x0c, 8);
};

export const INTERRUPTS: Record<number, Handler> = {
  // keyboard: take the key code
  2: interrupt((os) => {
    const ram = os.machine.ram, key = ram[KEYCODE];
    os.machine.write(ISR, 0x7f);
    if (!(key & 0x80)) return;
    ram[KEYCODE] = 0;
    if (os.keys.length < KEY_BUFFER) os.keys.push(key & 0x3f);
  }),
  // timer ST1: the OS's tick
  3: interrupt((os) => {
    os.machine.write(TISR, 0xfe);
    os.ticks++;
  }),
  // timer CT: the cursor's blink
  0x12: interrupt((os) => os.machine.write(ISR, 0xfd)),
};
