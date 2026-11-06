/// <reference path="../css.d.ts" />
// Fonts that come with the player for Sharp text, so it looks the same on
// every device: LXGW WenKai Mono (楷体), Noto Sans SC with Noto Sans Mono (黑体)
// and Noto Serif SC with Courier Prime (宋体). Each is split into many small
// files by character range; the browser fetches only those with characters
// on screen. All are under the SIL Open Font License 1.1.
import type { TextStyle } from "./hiresText";

const STYLESHEETS: Partial<Record<TextStyle, () => Promise<unknown>>> = {
  kai: () => import("lxgw-wenkai-webfont/lxgwwenkaimono-regular.css"),
  hei: () => Promise.all([import("@fontsource/noto-sans-sc/chinese-simplified-400.css"), import("@fontsource/noto-sans-mono/400.css")]),
  song: () => Promise.all([import("@fontsource/noto-serif-sc/chinese-simplified-400.css"), import("@fontsource/courier-prime/400.css")]),
};

const sheets = new Map<TextStyle, "loading" | "ready">();

/**
 * Whether text in `spec` (a canvas font) can be drawn with the style's real
 * font now. If not, starts loading what it needs and calls `then` when it
 * may be ready; meanwhile the fallback fonts draw it. Device styles are always
 * ready. `pending` remembers what is already being fetched.
 */
export function loadSharpFont(style: TextStyle, spec: string, text: string, then: () => void, pending: Set<string>): boolean {
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
