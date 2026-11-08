// The 4988's LCD: 159×96 pixels plus a column of status icons, refreshed from
// RAM $0400-$0FFF (96 rows of 32 bytes, most significant bit leftmost).
//
// The controller's lines are wired out of order: RAM rows 0-65 are display rows
// 65-0 (bottom up) and rows 66-95 follow in order. Each row's bytes 0-18 are
// display bytes 1-19, while byte 19 holds display byte 0 with its rows shifted
// by one (RAM row 95 lands on display row 65). RAM row 0's byte 0 is replaced
// by $1000. Pixel 159 of each row is not shown: bit 0 of byte 18 lights status
// icon `row`.

export const LCD_WIDTH = 159;
export const LCD_HEIGHT = 96;
/** Decoded pixels per row, including the icon column. */
export const LCD_STRIDE = 160;

/** Decode the screen into `out` (160×96, 1 = dark), leaving column 159 for the icon bits. */
export function decodeLcd(ram: Uint8Array, out: Uint8Array): void {
  for (let r = 0; r < 96; r++) {
    const src = 0x400 + r * 32;
    const y = r < 66 ? 65 - r : r;
    for (let c = 0; c < 19; c++) put(out, y, c + 1, r === 0 && c === 0 ? ram[0x1000] : ram[src + c]);
    put(out, r < 65 ? 64 - r : r === 95 ? 65 : r + 1, 0, ram[src + 19]);
  }
}

/** Status icon `i` (0-95): bit 0 of byte 18 of RAM row `i`. */
export function iconOn(ram: Uint8Array, i: number): boolean {
  return (ram[0x412 + i * 32] & 1) !== 0;
}

function put(out: Uint8Array, y: number, byte: number, v: number): void {
  const o = y * LCD_STRIDE + byte * 8;
  for (let b = 0; b < 8; b++) out[o + b] = (v >> (7 - b)) & 1;
}
