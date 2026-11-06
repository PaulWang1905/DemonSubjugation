// How the player draws text, as three plain choices: the look (Pixel: the
// device's bitmap fonts; HD: fonts drawn at the display's resolution), the
// font for Chinese and the font for English letters and numbers. Each look
// keeps its own two fonts, so switching the look back and forth keeps them.
import type { FontSetId } from "./fonts";
import type { TextStyle } from "./hiresText";
import { isLetterFont, LETTER_FONTS, type LetterFont } from "./sharpFonts";

export type TextLook = "pixel" | "hd";
/** A bundled pixel font, or the HZK16 / ASC16 files the player was given. */
export type PixelFont = FontSetId | "original";

export interface TextChoice {
  look: TextLook;
  pixelChinese: PixelFont;
  pixelEnglish: PixelFont;
  hdChinese: TextStyle;
  /** "auto": the letters that come with the Chinese font. */
  hdEnglish: LetterFont;
}

export const PIXEL_CHINESE: { id: FontSetId; label: string }[] = [
  { id: "retro", label: "粗体 Bold (Retro)" },
  { id: "ark", label: "黑体 Sans (Ark Pixel)" },
  { id: "unifont", label: "宋体 Serif (Unifont)" },
];
export const PIXEL_ENGLISH: { id: FontSetId; label: string }[] = [
  { id: "retro", label: "Retro 8-bit (Press Start 2P)" },
  { id: "ark", label: "Sans (Ark Pixel)" },
  { id: "unifont", label: "Serif (Unifont)" },
];
export const HD_CHINESE: { id: TextStyle; label: string }[] = [
  { id: "hei", label: "黑体 Sans (Noto Sans)" },
  { id: "song", label: "宋体 Serif (Noto Serif)" },
  { id: "kai", label: "楷体 Brush (LXGW WenKai)" },
  { id: "sans", label: "This device's sans" },
  { id: "serif", label: "This device's serif" },
];
export const HD_ENGLISH: { id: LetterFont; label: string }[] = [
  { id: "auto", label: "Matching the Chinese" },
  ...LETTER_FONTS.map((f) => ({ id: f.id, label: f.label })),
];
export const ORIGINAL_LABEL = "Original files (HZK16 / ASC16)";

const isPixelFont = (v: string | null): v is PixelFont => v === "original" || PIXEL_CHINESE.some((f) => f.id === v);
const isHdChinese = (v: string | null): v is TextStyle => HD_CHINESE.some((f) => f.id === v);

/**
 * The saved choice (`get` reads a saved setting), or the default: Pixel, in
 * the original fonts when the player has them, Retro 8-bit otherwise. Reads
 * the older single "text" setting (and "letters") when there is no new one.
 */
export function readTextChoice(get: (key: string) => string | null, hasOriginal: boolean): TextChoice {
  const base: PixelFont = hasOriginal ? "original" : "retro";
  const c: TextChoice = { look: "pixel", pixelChinese: base, pixelEnglish: base, hdChinese: "hei", hdEnglish: "auto" };
  const look = get("textLook");
  if (look === "pixel" || look === "hd") {
    c.look = look;
    const pc = get("pixelChinese");
    const pe = get("pixelEnglish");
    const hc = get("hdChinese");
    const he = get("hdEnglish");
    if (isPixelFont(pc)) c.pixelChinese = pc;
    if (isPixelFont(pe)) c.pixelEnglish = pe;
    if (isHdChinese(hc)) c.hdChinese = hc;
    if (he && isLetterFont(he)) c.hdEnglish = he;
  } else {
    // the older setting: "pixel" (the files), "pixel:<set>", or a Sharp style
    const old = get("text");
    const letters = get("letters");
    if (old === "pixel") c.pixelChinese = c.pixelEnglish = "original";
    else if (old?.startsWith("pixel:")) {
      const id = old.slice(6) === "cubic" ? "ark" : old.slice(6); // (Cubic 11 was taken out)
      if (isPixelFont(id)) c.pixelChinese = c.pixelEnglish = id;
    } else if (isHdChinese(old)) {
      c.look = "hd";
      c.hdChinese = old;
    }
    if (letters && isLetterFont(letters)) c.hdEnglish = letters;
  }
  // the files may have been removed since
  if (!hasOriginal) {
    if (c.pixelChinese === "original") c.pixelChinese = "retro";
    if (c.pixelEnglish === "original") c.pixelEnglish = "retro";
  }
  return c;
}

/** The settings to save for `c` (key, value). */
export function textChoiceEntries(c: TextChoice): [string, string][] {
  return [
    ["textLook", c.look],
    ["pixelChinese", c.pixelChinese],
    ["pixelEnglish", c.pixelEnglish],
    ["hdChinese", c.hdChinese],
    ["hdEnglish", c.hdEnglish],
  ];
}
