// A .gam built from an editor project: the project's resource library (.lib)
// in a 4988 program file, in one of two ways.
//
// - For FMJ React: the library behind a header and a program of the site's
//   own that only returns (on a device, or Fulu, it ends at once). No BBK
//   code; this site plays it with FMJ React, which reads the library.
// - With the RPG kit's engine: the program part of a .gam made with BBK's
//   RPG kit (RpgA100.eng) that the user owns, its library replaced by the
//   project's. The kit's engine reads the library from its data area ($42 in
//   the header), so the game also runs on Fulu, the original OS and (not
//   checked) a device. The kit's code comes from the user's file, never from
//   this site.
//
// Either carries, after the library, a mark: the engine this site opens it
// with and the game's full title (the OS's name holds only 10 bytes), as
// "FMJ-ENGINE:react;The Silent Bell" in UTF-8. The library is found by its
// own header, so the bytes after it are left alone by every reader.

import { gbkBytes } from "../engine/java";
import { findLib, isGam } from "./gam";
import { englishMenus as translate } from "./kitEnglish";

export type GamEngine = "react" | "fulu";

const MARK = "FMJ-ENGINE:";
const MARK_SIZE = 128;
/** The site's own program: a header, then at $5046 (file offset $46) RTS; the library at $1000. */
const ENTRY = 0x5046, CODE = 0x46, STUB_DATA = 0x1000, RTS = 0x60;

const u24 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);

/** Why `donor` cannot lend its engine, or null if it can: a .gam made with the RPG kit, its library in its data area. */
export function donorProblem(donor: Uint8Array): string | null {
  if (!isGam(donor)) return "not a .gam file";
  const lib = findLib(donor);
  if (lib < 0) return "not made with the RPG kit (it has no resource library)";
  if (lib !== u24(donor, 0x42)) return "its library is not where its program reads it";
  return null;
}

/** The .gam: `lib` named `name`, with the engine of `donor` (a kit .gam) or the site's own program; the site opens it with `prefer`. */
export function buildGam(lib: Uint8Array, name: string, prefer: GamEngine, donor?: Uint8Array, englishMenus = false): Uint8Array {
  if (donor) {
    const problem = donorProblem(donor);
    if (problem) throw new Error(`That .gam cannot lend its engine: ${problem}.`);
  } else if (prefer !== "react") throw new Error("Only a .gam with the RPG kit's engine runs on Fulu.");
  // (the kit's engine with its menus and messages in English, if asked: src/bbk/kitEnglish.ts)
  const program = donor && englishMenus ? translate(donor).gam : donor;
  const head = program ? program.subarray(0, findLib(program)) : stubProgram();
  const out = new Uint8Array(head.length + lib.length + MARK_SIZE);
  out.set(head);
  out.set(lib, head.length);
  setName(out, name);
  const enc = new TextEncoder();
  let title = name.trim();
  while (enc.encode(`${MARK}${prefer};${title}`).length > MARK_SIZE - 1) title = title.slice(0, -1);
  out.set(enc.encode(`${MARK}${prefer};${title}`), out.length - MARK_SIZE);
  return out;
}

/** The mark of a .gam built here: its engine and title, or null (any other .gam). */
function readMark(gam: Uint8Array): { engine: GamEngine; title: string } | null {
  if (gam.length < MARK_SIZE) return null;
  const tail = gam.subarray(gam.length - MARK_SIZE);
  if (!new TextDecoder().decode(tail.subarray(0, MARK.length)).startsWith(MARK)) return null;
  const end = tail.indexOf(0);
  const [engine, ...title] = new TextDecoder().decode(tail.subarray(MARK.length, end < 0 ? tail.length : end)).split(";");
  return engine === "react" || engine === "fulu" ? { engine, title: title.join(";") } : null;
}

/** The engine a .gam built here asks to be opened with, or null (any other .gam). */
export function preferredEngine(gam: Uint8Array): GamEngine | null {
  return readMark(gam)?.engine ?? null;
}

/** The full title of a .gam built here, or null. */
export function gamTitle(gam: Uint8Array): string | null {
  return readMark(gam)?.title || null;
}

/** Whether a .gam is the site's own container (its program only returns): it plays on FMJ React alone. */
export function isReactOnly(gam: Uint8Array): boolean {
  return isGam(gam) && gam[0x40] === (ENTRY & 0xff) && gam[0x41] === ENTRY >> 8 && gam[CODE] === RTS && u24(gam, 0x42) === STUB_DATA && preferredEngine(gam) === "react";
}

function stubProgram(): Uint8Array {
  const h = new Uint8Array(STUB_DATA);
  h.set([0x47, 0x41, 0x4d, 0x00, 0x10, 0x00]); // "GAM", as the kit's games have it
  h.set(new TextEncoder().encode("FMJ REACT"), 0x26);
  h[0x36] = 0x01;
  h.set(new TextEncoder().encode("Ver1.0"), 0x37);
  h[0x40] = ENTRY & 0xff;
  h[0x41] = ENTRY >> 8;
  h[0x42] = STUB_DATA & 0xff;
  h[0x43] = (STUB_DATA >> 8) & 0xff;
  h[0x44] = STUB_DATA >> 16;
  h[CODE] = RTS;
  return h;
}

/** The name the OS lists: 10 GBK bytes at 6, a double-byte character not cut. */
function setName(gam: Uint8Array, name: string): void {
  const bytes = Array.from(gbkBytes(name.trim() || "GAME"), (b) => b & 0xff);
  let n = 0;
  while (n < bytes.length) {
    const w = bytes[n] >= 0x81 ? 2 : 1;
    if (n + w > 10) break;
    n += w;
  }
  gam.fill(0, 6, 16);
  gam.set(bytes.slice(0, n), 6);
}
