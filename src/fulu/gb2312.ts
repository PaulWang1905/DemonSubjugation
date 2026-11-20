// Characters to their GB2312 codes (the 4988's), for text typed with the
// computer's or phone's own input method. Made once, from the platform's own
// GB18030 decoder over GB2312's rows ($A1-$F7) and columns ($A1-$FE).

let codes: Map<string, number> | null = null;

/** The GB2312 code of a character (first byte high), or null if it has none. */
export function gb2312(ch: string): number | null {
  if (!codes) {
    codes = new Map();
    const decoder = new TextDecoder("gb18030");
    for (let hi = 0xa1; hi <= 0xf7; hi++) {
      for (let lo = 0xa1; lo <= 0xfe; lo++) {
        const c = decoder.decode(new Uint8Array([hi, lo]));
        if (c.length === 1 && c !== "�" && !codes.has(c)) codes.set(c, (hi << 8) | lo);
      }
    }
  }
  return codes.get(ch) ?? null;
}
