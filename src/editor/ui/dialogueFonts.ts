// The 16-pixel fonts the dialogue preview draws with: the same ones the
// player (and so the editor's Playtest) uses. The player draws with the
// HZK16 / ASC16 files added to it when the player's text setting says so
// (its default when they were added), else with a bundled pixel font (Retro
// 8-bit by default), for Chinese and for letters separately.
import { getFont } from "../../storage/db";
import { FONT_SETS, loadPixelFonts, type FontSetId } from "../../app/fonts";
import { readTextChoice } from "../../app/textChoice";

export interface PreviewFonts {
  /** HZK16 layout: 32 bytes a glyph (94 per GB2312 row). */
  hzk: Uint8Array | null;
  /** ASC16 layout: 16 bytes a character code. */
  asc: Uint8Array | null;
  /** Which fonts, for the preview's note. */
  label: string;
}

let pending: Promise<PreviewFonts> | null = null;

const setLabel = (id: FontSetId) => FONT_SETS.find((f) => f.id === id)?.label.replace(/\s*\(.*\)$/, "") ?? id;

async function load(): Promise<PreviewFonts> {
  let files: [ArrayBuffer | null, ArrayBuffer | null] = [null, null];
  try {
    files = await Promise.all([getFont("HZK16"), getFont("ASC16")]);
  } catch {
    /* no stored fonts */
  }
  const hasOriginal = !!(files[0] && files[1]);
  const choice = readTextChoice((k) => {
    try {
      return localStorage.getItem("fmj-react:" + k);
    } catch {
      return null;
    }
  }, hasOriginal);
  const cjk = choice.pixelChinese;
  const latin = choice.pixelEnglish;
  let hzk: Uint8Array | null = cjk === "original" && files[0] ? new Uint8Array(files[0]) : null;
  let asc: Uint8Array | null = latin === "original" && files[1] ? new Uint8Array(files[1]) : null;
  if (!hzk || !asc) {
    const c = cjk === "original" ? (latin === "original" ? "retro" : latin) : cjk;
    const l = latin === "original" ? c : latin;
    const f = await loadPixelFonts(c, l);
    hzk ??= f.hzk16;
    asc ??= f.asc16;
  }
  const name = (v: typeof cjk) => (v === "original" ? "the HZK16 / ASC16 files" : setLabel(v));
  const label = cjk === latin ? `${name(cjk)}, as the player draws it` : `${name(latin)} letters and ${name(cjk)} Chinese, as the player draws them`;
  return { hzk, asc, label };
}

/** The fonts (loaded once). */
export function previewFonts(): Promise<PreviewFonts> {
  pending ??= load().catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}
