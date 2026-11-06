// Pixel fonts that come with the player, in the device's HZK16 / ASC16
// layout (built by scripts/fonts/build_fonts.py from open-source fonts; see
// public/fonts/LICENSES.md). They are loaded only when chosen.
import type { SmallFonts } from "../engine";

export type FontSetId = "retro" | "ark" | "unifont";

/**
 * Each set has its own Chinese style, named in the menu. `boldSmall`: More
 * text (12 and 10 pixels) is drawn in bold too.
 */
export const FONT_SETS: { id: FontSetId; label: string; cjk: string; latin: string; boldSmall?: boolean }[] = [
  { id: "retro", label: "Retro 8-bit (粗体 bold)", cjk: "/fonts/retro/cjk16.bin", latin: "/fonts/retro/latin16.bin", boldSmall: true },
  { id: "ark", label: "Ark Pixel (黑体 sans)", cjk: "/fonts/ark/cjk16.bin", latin: "/fonts/ark/latin16.bin" },
  { id: "unifont", label: "Unifont (宋体 serif)", cjk: "/fonts/unifont/cjk16.bin", latin: "/fonts/unifont/latin16.bin" },
];

export function isFontSet(id: string): id is FontSetId {
  return FONT_SETS.some((f) => f.id === id);
}

/**
 * Bump when the font files are rebuilt: browsers keep /fonts/ for a year
 * (vercel.json), and the version makes them fetch the new files.
 */
const FONT_VERSION = 2;

const files = new Map<string, Promise<Uint8Array>>();

function file(url: string): Promise<Uint8Array> {
  let p = files.get(url);
  if (!p) {
    p = fetch(`${url}?v=${FONT_VERSION}`).then(async (r) => {
      if (!r.ok) throw new Error(`Could not load the font (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => files.delete(url)); // try again next time
    files.set(url, p);
  }
  return p;
}

/** Fonts drawn for the 12- and 10-pixel cells of More text (any Text choice). */
export const SMALL_FONT_CREDIT = "Cubic 11 and Boutique Bitmap 9×9 for Chinese, X11 fixed for letters";

/**
 * A pixel-font bold of the small fonts, as the Retro set's Chinese is made
 * (scripts/fonts/build_fonts.py): strokes one pixel wider to the right,
 * except where that would close the one-pixel gap to the next stroke.
 */
export function boldSmallFonts(f: SmallFonts): SmallFonts {
  return { hzk12: bold(f.hzk12, 2, 12), asc12: bold(f.asc12, 1, 12), hzk10: bold(f.hzk10, 2, 10), asc10: bold(f.asc10, 1, 10) };
}

function bold(src: Uint8Array, bytesPerRow: 1 | 2, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  const w = bytesPerRow * 8;
  const glyph = bytesPerRow * h;
  const px = new Uint8Array(w * h);
  const mark = new Int16Array(w * h);
  const stack: number[] = [];
  for (let g = 0; g + glyph <= src.length; g += glyph) {
    for (let r = 0; r < h; r++) for (let x = 0; x < w; x++) px[r * w + x] = (src[g + r * bytesPerRow + (x >> 3)] >> (7 - (x & 7))) & 1;
    // dots (marks of up to four pixels, as in …… and ，) are kept as they are
    mark.fill(0);
    for (let i = 0; i < px.length; i++) {
      if (!px[i] || mark[i]) continue;
      const part: number[] = [];
      stack.push(i);
      mark[i] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        part.push(k);
        const kx = k % w;
        const ky = (k - kx) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = kx + dx;
            const ny = ky + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (px[n] && !mark[n]) {
              mark[n] = 1;
              stack.push(n);
            }
          }
        }
      }
      if (part.length <= 4) for (const k of part) mark[k] = 2;
    }
    for (let r = 0; r < h; r++) {
      for (let x = 0; x < w; x++) {
        const i = r * w + x;
        // inked, or grown from the stroke on its left unless that closes a one-pixel gap
        const on = px[i] || (x > 0 && px[i - 1] && mark[i - 1] !== 2 && !(x + 1 < w && px[i + 1]));
        if (on) out[g + r * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

export async function loadSmallFonts(): Promise<SmallFonts> {
  const [hzk12, asc12, hzk10, asc10] = await Promise.all(
    ["cjk12", "latin12", "cjk10", "latin10"].map((n) => file(`/fonts/small/${n}.bin`)),
  );
  return { hzk12, asc12, hzk10, asc10 };
}

/** The set's HZK16- and ASC16-layout fonts. */
export async function loadFontSet(id: FontSetId): Promise<{ hzk16: Uint8Array; asc16: Uint8Array }> {
  const set = FONT_SETS.find((f) => f.id === id)!;
  const [hzk16, asc16] = await Promise.all([file(set.cjk), file(set.latin)]);
  return { hzk16, asc16 };
}
