// The 4988's keys, as its keyboard controller reports them, and how a computer
// keyboard maps onto them.
//
// The 4988 has no keys of their own for 删除 (delete), 修改 (modify), 查找
// (search), 插入 (insert), 帮助 (help) or Caps: they are printed beside other
// keys (the four arrows, 中英符 and 输入法) and are those keys pressed after
// Shift. The OS's GUI keeps Shift as a latch (GuiTranslateMsg, $2B27 bit 5):
// the next key gives its second meaning (删除 the command $31, 修改 $32, 查找
// $33, 插入 $30, 帮助 $26). The codes $29-$2C, which other BBK dictionaries
// use for such keys, mean nothing to the 4988's OS (its key table, 8:$8C36,
// gives them no class), and its keyboard never sends them.

export const Key = {
  power: 0x00, // 开关
  home: 0x01, // 目录
  dualDict: 0x02, // 双解
  modern: 0x03, // 现代 (现汉)
  chinese: 0x04, // 汉英
  dialogue: 0x05, // 对话
  download: 0x06, // 下载
  speak: 0x07, // 发音
  input: 0x20, // 输入法 (after Shift: Caps)
  lang: 0x28, // 中英符: the input mode, Chinese / English / digits (after Shift: 帮助)
  shift: 0x2d, // Shift: the next key's second meaning
  exit: 0x2e, // 跳出 (Exit)
  enter: 0x2f, // 输入 (Enter)
  up: 0x35, // (after Shift: 修改)
  left: 0x37, // (after Shift: 删除)
  down: 0x38, // (after Shift: 查找)
  right: 0x39, // (after Shift: 插入)
  pageUp: 0x3a,
  pageDown: 0x3b,
  space: 0x36, // 空格
} as const;

/** A press of a key, or of a key after Shift ({ second }: its second meaning). */
export type Press = number | { second: number };

/** The keys printed beside other keys: those keys after Shift. */
export const SECOND = {
  del: { second: Key.left }, // 删除
  modify: { second: Key.up }, // 修改
  search: { second: Key.down }, // 查找
  insert: { second: Key.right }, // 插入
  help: { second: Key.lang }, // 帮助
  caps: { second: Key.input }, // Caps
} as const;

/** The key codes a press sends, in order. (Without the GUI's latch: see DeviceInput.) */
export const pressCodes = (p: Press): number[] => (typeof p === "number" ? [p] : [Key.shift, p.second]);

/** Letter and digit keys in keyboard order, with their codes. */
const LETTERS = "1234567890QWERTYUIOPASDFGHJKLZXCVBNM";
const LETTER_CODES = [
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x30, 0x31, // 1-9, 0
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x32, 0x33, // Q-P
  0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x34, // A-L
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, // Z-M
];

export const keyCode = (ch: string): number => LETTER_CODES[LETTERS.indexOf(ch.toUpperCase())];

/** The letter or digit key with this code (upper case), if it is one. */
export const keyChar = (code: number): string | undefined => LETTERS[LETTER_CODES.indexOf(code)];

/** KeyboardEvent.code → device key. */
export const KEYBOARD: Record<string, Press> = {
  ...Object.fromEntries([...LETTERS].map((c, i) => [/\d/.test(c) ? `Digit${c}` : `Key${c}`, LETTER_CODES[i]])),
  ArrowUp: Key.up,
  ArrowDown: Key.down,
  ArrowLeft: Key.left,
  ArrowRight: Key.right,
  PageUp: Key.pageUp,
  PageDown: Key.pageDown,
  Enter: Key.enter,
  NumpadEnter: Key.enter,
  Escape: Key.exit,
  Space: Key.space,
  Backspace: SECOND.del,
  Delete: SECOND.del,
  Insert: SECOND.insert,
  Home: Key.home,
  Tab: Key.input,
  ShiftLeft: Key.lang,
  ShiftRight: Key.lang,
  F1: SECOND.help,
  F2: SECOND.search,
  F3: SECOND.modify,
  F4: Key.speak,
  F12: Key.power,
};
