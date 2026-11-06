/// <reference path="../css.d.ts" />
// Fonts that come with the player for Sharp text, so it looks the same on
// every device: LXGW WenKai Mono (楷体), Noto Sans SC with Noto Sans Mono (黑体)
// and Noto Serif SC with Courier Prime (宋体). Each is split into many small
// files by character range; the browser fetches only those with characters
// on screen. All are under the SIL Open Font License 1.1.
//
// Letters can also be drawn in a font of their own (LETTER_FONTS), with any
// Sharp style's Chinese.
import type { TextStyle } from "./hiresText";

/** A letter font for Sharp text; "auto" keeps the style's own. */
export type LetterFont = "auto" | "plex" | "jetbrains" | "fira" | "space" | "atkinson" | "courier" | "vt323";

/**
 * The letter fonts, all monospaced. `size`: the font size (in pixels of a
 * 16-pixel cell) at which a letter fills the 8-pixel half cell.
 */
export const LETTER_FONTS: { id: Exclude<LetterFont, "auto">; label: string; family: string; size: number; sheet: () => Promise<unknown> }[] = [
  { id: "plex", label: "IBM Plex Mono", family: '"IBM Plex Mono"', size: 13, sheet: () => import("@fontsource/ibm-plex-mono/latin-400.css") },
  { id: "jetbrains", label: "JetBrains Mono", family: '"JetBrains Mono"', size: 13, sheet: () => import("@fontsource/jetbrains-mono/latin-400.css") },
  { id: "fira", label: "Fira Mono", family: '"Fira Mono"', size: 13, sheet: () => import("@fontsource/fira-mono/latin-400.css") },
  { id: "space", label: "Space Mono", family: '"Space Mono"', size: 12.7, sheet: () => import("@fontsource/space-mono/latin-400.css") },
  { id: "atkinson", label: "Atkinson Hyperlegible Mono", family: '"Atkinson Hyperlegible Mono"', size: 12.3, sheet: () => import("@fontsource/atkinson-hyperlegible-mono/latin-400.css") },
  { id: "courier", label: "Courier Prime (typewriter)", family: '"Courier Prime"', size: 13, sheet: () => import("@fontsource/courier-prime/400.css") },
  { id: "vt323", label: "VT323 (old terminal)", family: '"VT323"', size: 18, sheet: () => import("@fontsource/vt323/latin-400.css") },
];

export function isLetterFont(id: string): id is LetterFont {
  return id === "auto" || LETTER_FONTS.some((f) => f.id === id);
}

const STYLESHEETS: Record<string, () => Promise<unknown>> = {
  kai: () => import("lxgw-wenkai-webfont/lxgwwenkaimono-regular.css"),
  hei: () => Promise.all([import("@fontsource/noto-sans-sc/chinese-simplified-400.css"), import("@fontsource/noto-sans-mono/400.css")]),
  song: () => Promise.all([import("@fontsource/noto-serif-sc/chinese-simplified-400.css"), import("@fontsource/courier-prime/400.css")]),
};

for (const f of LETTER_FONTS) STYLESHEETS[`letters:${f.id}`] = f.sheet;

const sheets = new Map<string, "loading" | "ready">();

/**
 * Whether text in `spec` (a canvas font) can be drawn with the real font of
 * `style` (a Sharp style, or `letters:<id>` for a letter font) now. If not, starts loading what it needs and calls `then` when it
 * may be ready; meanwhile the fallback fonts draw it. Device styles are always
 * ready. `pending` remembers what is already being fetched.
 */
export function loadSharpFont(style: TextStyle | `letters:${string}`, spec: string, text: string, then: () => void, pending: Set<string>): boolean {
  const sheet = STYLESHEETS[style];
  if (!sheet || typeof document === "undefined" || !document.fonts) return true;
  const state = sheets.get(style);
  if (state !== "ready") {
    if (!state) {
      sheets.set(style, "loading");
      sheet().then(
        () => sheets.set(style, "ready"),
        () => sheets.set(style, "ready"), // draw with the fallback fonts
      );
    }
    return false;
  }
  // with the stylesheet in, check() is true once the file for this character
  // is loaded (or when no file of the font covers it)
  if (document.fonts.check(spec, text)) return true;
  const key = `${spec}\u0000${text}`;
  if (!pending.has(key)) {
    pending.add(key);
    document.fonts.load(spec, text).then(
      () => {
        pending.delete(key);
        then();
      },
      () => pending.delete(key),
    );
  }
  return false;
}
