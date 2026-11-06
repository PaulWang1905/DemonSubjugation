// Pixel fonts that come with the player, in the device's HZK16 / ASC16
// layout (built by scripts/fonts/build_fonts.py from open-source fonts; see
// public/fonts/LICENSES.md). They are loaded only when chosen.

export type FontSetId = "retro" | "unifont" | "cubic";

export const FONT_SETS: { id: FontSetId; label: string; cjk: string; latin: string }[] = [
  { id: "retro", label: "Retro 8-bit", cjk: "/fonts/unifont/cjk16.bin", latin: "/fonts/retro/latin16.bin" },
  { id: "unifont", label: "Unifont", cjk: "/fonts/unifont/cjk16.bin", latin: "/fonts/unifont/latin16.bin" },
  { id: "cubic", label: "Cubic 11", cjk: "/fonts/cubic/cjk16.bin", latin: "/fonts/cubic/latin16.bin" },
];

export function isFontSet(id: string): id is FontSetId {
  return FONT_SETS.some((f) => f.id === id);
}

const files = new Map<string, Promise<Uint8Array>>();

function file(url: string): Promise<Uint8Array> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`Could not load the font (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => files.delete(url)); // try again next time
    files.set(url, p);
  }
  return p;
}

/** The set's HZK16- and ASC16-layout fonts. */
export async function loadFontSet(id: FontSetId): Promise<{ hzk16: Uint8Array; asc16: Uint8Array }> {
  const set = FONT_SETS.find((f) => f.id === id)!;
  const [hzk16, asc16] = await Promise.all([file(set.cjk), file(set.latin)]);
  return { hzk16, asc16 };
}
