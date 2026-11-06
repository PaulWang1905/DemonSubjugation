// Pixel fonts that come with the player, in the device's HZK16 / ASC16
// layout (built by scripts/fonts/build_fonts.py from open-source fonts; see
// public/fonts/LICENSES.md). They are loaded only when chosen.
import type { SmallFonts } from "../engine";

export type FontSetId = "retro" | "ark" | "cubic" | "unifont";

/** Each set has its own Chinese style, named in the menu. */
export const FONT_SETS: { id: FontSetId; label: string; cjk: string; latin: string }[] = [
  { id: "retro", label: "Retro 8-bit (粗体 bold)", cjk: "/fonts/retro/cjk16.bin", latin: "/fonts/retro/latin16.bin" },
  { id: "ark", label: "Ark Pixel (黑体 sans)", cjk: "/fonts/ark/cjk16.bin", latin: "/fonts/ark/latin16.bin" },
  { id: "cubic", label: "Cubic 11 (圆体 round)", cjk: "/fonts/cubic/cjk16.bin", latin: "/fonts/cubic/latin16.bin" },
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
