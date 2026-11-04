// Builds HZK16 / ASC16-style glyphs on demand from the fonts installed on the
// player's device, so games are playable without uploading the font files.
// Each glyph is drawn once on a hidden canvas, thresholded to 1 bit and cached
// by the engine.
import type { FontFallback } from "../engine";

const CJK_FONTS =
  '"SimSun", "NSimSun", "Songti SC", "STSong", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", ' +
  '"WenQuanYi Zen Hei Sharp", "WenQuanYi Zen Hei", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
const MONO_FONTS = '"DejaVu Sans Mono", "Menlo", "Consolas", "Liberation Mono", "Courier New", monospace';

function makeContext(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c.getContext("2d", { willReadFrequently: true });
  } catch {
    return null;
  }
}

/** Pack the alpha channel of a w x 16 drawing into 1-bit rows. */
function pack(data: Uint8ClampedArray, w: number, threshold: number): Uint8Array {
  const bytesPerRow = w / 8;
  const out = new Uint8Array(16 * bytesPerRow);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  return out;
}

export function createDeviceFont(): FontFallback {
  const big = makeContext(16, 16);
  const small = makeContext(8, 16);
  let gbk: TextDecoder | null = null;
  try {
    gbk = new TextDecoder("gbk");
  } catch {
    gbk = null;
  }
  const blank32 = new Uint8Array(32);
  const blank16 = new Uint8Array(16);

  return {
    hzk(glyph: number) {
      const hi = 0xa1 + Math.floor(glyph / 94);
      const lo = 0xa1 + (glyph % 94);
      if (!big || !gbk || hi > 0xfe) return blank32;
      const ch = gbk.decode(new Uint8Array([hi, lo]));
      if (ch.length !== 1 || ch === "�" || ch.trim() === "") return blank32;
      big.clearRect(0, 0, 16, 16);
      big.fillStyle = "#000";
      big.font = `15px ${CJK_FONTS}`;
      big.textAlign = "center";
      big.textBaseline = "middle";
      big.fillText(ch, 8, 8.5);
      return pack(big.getImageData(0, 0, 16, 16).data, 16, 100);
    },
    asc(code: number) {
      if (!small || code < 0x21 || code > 0x7e) return blank16;
      small.clearRect(0, 0, 8, 16);
      small.fillStyle = "#000";
      small.font = `13px ${MONO_FONTS}`;
      small.textAlign = "center";
      small.textBaseline = "alphabetic";
      small.fillText(String.fromCharCode(code), 4, 12);
      return pack(small.getImageData(0, 0, 8, 16).data, 8, 100);
    },
  };
}
