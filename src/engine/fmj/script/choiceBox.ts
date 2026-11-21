// CHOICE's box as the original engine draws it (BA4988/fmj-engine
// engine_item.c _0023ACA7), and the pixels the device's byte-wise LCD calls
// cover (middle.c SysLcdPartClear / SysLcdReverse). Pure numbers, so the
// editor's preview draws the same box.

/**
 * The columns SysLcdPartClear / SysLcdReverse change between x1 and x2: x1
 * to x2 inclusive, except that x2 is left out when it starts a byte (x2 % 8
 * is 0), as their byte loops do. Returns [from, to) (empty when from >= to).
 */
export function lcdSpan(x1: number, x2: number): [number, number] {
  if (x1 & 7 && (x1 & ~7) === (x2 & ~7)) return [x1, x2 + 1];
  return [x1, x2 & 7 ? x2 + 1 : x2];
}

/** The device's drawing calls do nothing when a corner is off the LCD (159×96). */
export const onLcd = (x1: number, y1: number, x2: number, y2: number): boolean => x1 >= 0 && y1 >= 0 && x1 < 159 && x2 < 159 && y1 < 96 && y2 < 96;

/** A rectangle of pixels: columns [x, x2), rows [y, y2). */
export interface PixelRect {
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export interface ChoiceBox {
  left: number;
  right: number;
  /** Cleared to white (SysLcdPartClear(left, 28, right, 70)); null when the box reaches past the LCD. */
  clear: PixelRect | null;
  /** The frame (SysRect(left + 1, 30, right - 1, 68)), corners inclusive; null when off the LCD. */
  frame: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Where each answer's text starts (SysPrintString). */
  first: { x: number; y: number };
  second: { x: number; y: number };
  /** The bar inverted over answer 0 or 1 (SysLcdReverse(left + 3, y, right - 3, y + 16)). */
  bar(answer: number): PixelRect | null;
}

/** At most 19 bytes of each answer are shown (the original's 20-byte buffers). */
export const CHOICE_MAX_BYTES = 19;

/** The box for answers of these byte lengths (without the NUL). */
export function choiceBox(len1: number, len2: number): ChoiceBox {
  const l1 = Math.min(len1, CHOICE_MAX_BYTES);
  const l2 = Math.min(len2, CHOICE_MAX_BYTES);
  const width = (Math.max(l1, l2) * 8 + 6) & 0xff;
  const left = ((0xa0 - width) & 0xff) >> 1;
  const right = (left + width) & 0xff;
  const span = (x1: number, y1: number, x2: number, y2: number): PixelRect | null => {
    if (!onLcd(x1, y1, x2, y2)) return null;
    const [x, xe] = lcdSpan(x1, x2);
    return { x, y: y1, x2: xe, y2: y2 + 1 };
  };
  return {
    left,
    right,
    clear: span(left, 0x1c, right, 0x46),
    frame: onLcd(left + 1, 0x1e, right - 1, 0x44) ? { x1: left + 1, y1: 0x1e, x2: right - 1, y2: 0x44 } : null,
    first: { x: left + 3, y: 0x20 },
    second: { x: left + 3, y: 0x32 },
    bar: (answer) => {
      const y = answer * 0x12 + 0x1e + 0x02;
      return span(left + 3, y, right - 3, y + 0x10);
    },
  };
}
