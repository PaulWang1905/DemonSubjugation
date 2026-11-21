// The title screen's logo (SRS 1-248) as the editor made it: the game's
// name in big letters (gameLogo). It is a picture in the game, so a new
// title does not change it by itself; this keeps it in step while it is
// still the picture the editor made, and leaves one the author drew alone.
//
// What the logo shows ("its source"):
// - "title": the title in the game file (9 letters at most);
// - "name": the project name (any length; the templates' logos and a new
//   game's show the full name, with the templates' subtitle);
// - "drawn": anything else (the author's own picture, or an imported game's);
// - "none": the game has no logo.
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { gameLogo } from "./system";

export const LOGO = { resType: 5, type: 1, index: 248 } as const;
export const LOGO_KEY = "5-1-248";

/** Subtitles the editor's logos were made with (the templates'). */
const SUBTITLES: readonly (string | undefined)[] = [undefined, "A DEMO FOR FMJ REACT"];

export type LogoSource = "title" | "name" | "drawn" | "none";

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether a picture is the one the editor makes for a text (with any of its subtitles). */
export function isLogoOf(data: Uint8Array, text: string): boolean {
  if (!text.trim()) return false;
  return SUBTITLES.some((s) => same(data, gameLogo(text, s).data));
}

/** What the title screen's logo shows: the in-file title, the project name, the author's picture, or nothing. */
export function logoSource(a: LibArchive, title: string, projectName: string): LogoSource {
  const e = findEntry(a, LOGO.resType, LOGO.type, LOGO.index);
  if (!e) return "none";
  if (isLogoOf(e.data, title)) return "title";
  if (isLogoOf(e.data, projectName)) return "name";
  return "drawn";
}

/** The editor's logo for a text. */
export function logoEntry(text: string): LibEntry {
  return gameLogo(text);
}

/**
 * The logo after the title or the project name changed: a new picture when
 * the old one showed what changed (compared with what the editor makes for
 * the old text), else null (unchanged: it shows the other name, or the
 * author drew it).
 */
export function logoAfterRename(a: LibArchive, before: { title: string; name: string }, after: { title: string; name: string }): LibEntry | null {
  const src = logoSource(a, before.title, before.name);
  if (src === "title" && after.title !== before.title) return logoEntry(after.title);
  if (src === "name" && after.name !== before.name && after.name.trim()) return logoEntry(after.name);
  return null;
}

/**
 * The title stored in the game file for a project name: in capitals, 9
 * bytes at most (`bytes` measures a text: GBK, where a Chinese character
 * takes 2); a long name is cut at a space when that keeps 4 letters or more
 * ("HARBOR TALE" → "HARBOR"), else after 9 bytes.
 */
export function fileTitle(name: string, bytes: (s: string) => number = (s) => s.length): string {
  const up = name.trim().replace(/\s+/g, " ").toUpperCase();
  if (bytes(up) <= 9) return up;
  let cut = "";
  for (const ch of up) {
    if (bytes(cut + ch) > 9) break;
    cut += ch;
  }
  const space = up.slice(0, cut.length + 1).lastIndexOf(" ");
  return (space >= 4 ? up.slice(0, space) : cut).trim();
}
