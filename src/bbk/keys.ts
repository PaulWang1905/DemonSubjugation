// The 4988's keys, as its keyboard controller reports them, and how a computer
// keyboard maps onto them.

export const Key = {
  power: 0x00, // 开关
  home: 0x01, // 目录
  dualDict: 0x02, // 双解
  modern: 0x03, // 现代
  chinese: 0x04, // 汉英
  dialogue: 0x05, // 对话
  download: 0x06, // 下载
  speak: 0x07, // 发音
  input: 0x20, // 输入法
  shift: 0x28, // 中英
  help: 0x29, // 帮助
  search: 0x2a, // 查找
  insert: 0x2b, // 插入
  modify: 0x2c, // 修改
  del: 0x2d, // 删除
  exit: 0x2e, // 跳出
  enter: 0x2f, // 输入
  up: 0x35,
  left: 0x37,
  down: 0x38,
  right: 0x39,
  pageUp: 0x3a,
  pageDown: 0x3b,
  space: 0x36,
} as const;

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
export const KEYBOARD: Record<string, number> = {
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
  Backspace: Key.del,
  Delete: Key.del,
  Insert: Key.insert,
  Home: Key.home,
  Tab: Key.input,
  ShiftLeft: Key.shift,
  ShiftRight: Key.shift,
  F1: Key.help,
  F2: Key.search,
  F3: Key.modify,
  F4: Key.speak,
  F12: Key.power,
};
