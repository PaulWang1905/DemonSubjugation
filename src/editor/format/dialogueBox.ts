// The game's text boxes, laid out exactly as the engine draws them at the
// device's 16-pixel text size (src/engine/fmj/script/ScriptVM.ts and
// graphics/TextRender.ts, Util.showMessage), so the editor can show a line
// of dialogue as the player will see it: which letters go on which line,
// where the pages break, and which words are split across lines.
//
// - `say` (ScriptVM cmd_say): a box at the bottom of the 160×96 screen, two
//   lines a page: with a portrait the first line starts after the portrait
//   (x 44: 11 letters), the second at x 14 (15 letters); without one both
//   start at x 14. A key shows the next page until the text is used up.
// - `message` / `timemsg` (Util.showMessage): one box in the middle, as many
//   lines as the text's length in 16-byte lines (at most 5), 15 letters a
//   line; what does not fit is never shown.
// - `choice`: a box in the middle with the two answers, the first selected.
// - `showgut`: text scrolling up between two pictures, 160 pixels a line.
//
// The line loop is the engine's drawTextFrom (TextRender.ts) at 16 pixels:
// a glyph is drawn while x <= right - 16; Chinese characters are 16 pixels
// wide, other bytes 8. Strings end with the NUL the assembler adds.
import { gbkBytes } from "../../engine/java";

/** A glyph drawn on the screen. */
export interface Glyph {
  x: number;
  y: number;
  /** A 16×16 Chinese character (HZK16 glyph number in `code`), else an 8×16 ASCII glyph (character code). */
  wide: boolean;
  code: number;
  /** Index of its (first) byte in the text. */
  at: number;
}

export interface BoxPage {
  glyphs: Glyph[];
  /** Bytes [from, to) of the text this page shows. */
  from: number;
  to: number;
}

/** A word split across two lines of the box: bytes [from, to) of the text, and where the line breaks it. */
export interface SplitWord {
  from: number;
  to: number;
  breakAt: number;
  /** "adven|ture". */
  text: string;
}

export interface SayLayout {
  kind: "say";
  portrait: boolean;
  bytes: Uint8Array;
  pages: BoxPage[];
  /** Where each line after the first starts (bytes), page after page. */
  lineStarts: number[];
  split: SplitWord[];
}

export interface MessageLayout {
  kind: "message";
  bytes: Uint8Array;
  /** Lines of the box (1-5) and its text's top. */
  lines: number;
  textY: number;
  page: BoxPage;
  split: SplitWord[];
  /** The first byte that is not shown (the text is longer than the box), or null. */
  cutFrom: number | null;
}

export interface ChoiceLayout {
  kind: "choice";
  /** The box: x, y, width, height. */
  x: number;
  y: number;
  w: number;
  h: number;
  first: Glyph[];
  second: Glyph[];
  /** Glyphs past the box's right edge (on the device they are drawn over the map). */
  overflow: boolean;
}

export interface ShowgutLayout {
  kind: "showgut";
  bytes: Uint8Array;
  /** The rows of text, each a line of glyphs at y = 16 × row. */
  rows: Glyph[][];
}

export type BoxLayout = SayLayout | MessageLayout | ChoiceLayout | ShowgutLayout;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

/** The say box's text lines (ScriptVM cmd_say). */
export const SAY_RECTS = {
  portrait: [rect(44, 58, 145, 75), rect(14, 76, 145, 93)],
  plain: [rect(14, 58, 145, 75), rect(14, 76, 145, 93)],
};

/**
 * A string operand's bytes as the assembler stores them: GBK, with `\xHH`
 * escapes as single bytes, and the NUL that ends it.
 */
export function textBytes(value: string): Uint8Array {
  const out: number[] = [];
  let plain = "";
  const flush = () => {
    if (plain) for (const b of gbkBytes(plain)) out.push(b & 0xff);
    plain = "";
  };
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && value[i + 1] === "x" && /^[0-9a-fA-F]{2}$/.test(value.slice(i + 2, i + 4))) {
      flush();
      out.push(parseInt(value.slice(i + 2, i + 4), 16));
      i += 3;
    } else plain += value[i];
  }
  flush();
  out.push(0);
  return Uint8Array.from(out);
}

const glyphAt = (b: Uint8Array, i: number, x: number, y: number): Glyph | null => {
  const t = b[i];
  if (t >= 0xa1) return { x, y, wide: true, code: 94 * (t - 0xa1) + ((b[i + 1] ?? 0xa1) - 0xa1), at: i };
  if (t < 128) return { x, y, wide: false, code: t, at: i };
  return null; // 0x80-0xa0: a blank half cell
};

/**
 * The engine's drawTextFrom at 16 pixels: the glyphs of `b` from byte
 * `start` that fit in `r`, the next byte, and where each following line
 * starts.
 */
export function drawTextFrom(b: Uint8Array, start: number, r: Rect): { glyphs: Glyph[]; next: number; lineStarts: number[] } {
  const glyphs: Glyph[] = [];
  const lineStarts: number[] = [];
  let i = start;
  let y = r.top;
  const yMax = r.bottom - 16;
  const xMax = r.right - 16;
  while (y <= yMax && i < b.length) {
    if (y !== r.top) lineStarts.push(i);
    let x = r.left;
    while (x <= xMax && i < b.length) {
      const g = glyphAt(b, i, x, y);
      if (g) glyphs.push(g);
      if (b[i] >= 0xa1) {
        i += 2;
        x += 16;
      } else {
        i += 1;
        x += 8;
      }
    }
    y += 16;
  }
  return { glyphs, next: i, lineStarts };
}

const isWordByte = (v: number | undefined) => v !== undefined && v > 0x20 && v < 0x7f;

/** Words broken by line starts (a letter both before and after the break). */
function splitAt(b: Uint8Array, breaks: number[]): SplitWord[] {
  const out: SplitWord[] = [];
  const end = b.indexOf(0) < 0 ? b.length : b.indexOf(0);
  for (const at of breaks) {
    if (at <= 0 || at >= end) continue;
    if (!isWordByte(b[at - 1]) || !isWordByte(b[at])) continue;
    let s = at - 1;
    while (s > 0 && isWordByte(b[s - 1])) s--;
    let e = at;
    while (e < end && isWordByte(b[e])) e++;
    out.push({ from: s, to: e, breakAt: at, text: String.fromCharCode(...b.slice(s, at)) + "|" + String.fromCharCode(...b.slice(at, e)) });
  }
  return out;
}

/** A `say` box: its pages, as a key press shows them one after another. */
export function layoutSay(text: string, portrait: boolean): SayLayout {
  const b = textBytes(text);
  const [top, bottom] = portrait ? SAY_RECTS.portrait : SAY_RECTS.plain;
  const pages: BoxPage[] = [];
  const breaks: number[] = [];
  let from = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const t = drawTextFrom(b, from, top);
    const u = drawTextFrom(b, t.next, bottom);
    pages.push({ glyphs: [...t.glyphs, ...u.glyphs], from, to: u.next });
    breaks.push(t.next);
    // (cmd_say: done when the next byte is the NUL or past it)
    if (u.next >= b.length - 1 || u.next === from) break;
    breaks.push(u.next);
    from = u.next;
  }
  const end = b.indexOf(0);
  return { kind: "say", portrait, bytes: b, pages, lineStarts: breaks.filter((x) => x < end), split: splitAt(b, breaks) };
}

/** A `message` (or `timemsg`) box (Util.showMessage). */
export function layoutMessage(text: string): MessageLayout {
  const b = textBytes(text);
  const lineNum = Math.min(4, Math.trunc(b.length / 16));
  const textY = 39 - lineNum * 8;
  const t = drawTextFrom(b, 0, rect(16, textY, 16 + 16 * 8, textY + 16 * lineNum + 16));
  const cut = t.next < b.length - 1 && b.slice(t.next, b.length - 1).some((v) => v !== 0x20) ? t.next : null;
  return { kind: "message", bytes: b, lines: lineNum + 1, textY, page: { glyphs: t.glyphs, from: 0, to: t.next }, split: splitAt(b, t.lineStarts), cutFrom: cut };
}

/** The engine's drawText: one line from (x, y), no wrapping, up to the NUL. */
function drawText(b: Uint8Array, x0: number, y: number): Glyph[] {
  const out: Glyph[] = [];
  let x = x0;
  for (let i = 0; i < b.length && b[i] !== 0; i++) {
    const g = glyphAt(b, i, x, y);
    if (g) out.push(g);
    if (b[i] >= 0xa1) {
      i++;
      x += 16;
    } else x += 8;
  }
  return out;
}

/** A `choice` box (ScriptVM cmd_choice): the shorter answer is padded to the longer one's length. */
export function layoutChoice(first: string, second: string): ChoiceLayout {
  let c1 = textBytes(first);
  let c2 = textBytes(second);
  const pad = (short: Uint8Array, len: number) => {
    const tmp = new Uint8Array(len);
    tmp.set(short);
    for (let i = short.length - 1; i < len; i++) tmp[i] = 0x20;
    tmp[len - 1] = 0;
    return tmp;
  };
  let w: number;
  if (c1.length > c2.length) {
    w = c1.length * 8 - 8 + 6;
    c2 = pad(c2, c1.length);
  } else {
    w = c2.length * 8 - 8 + 6;
    c1 = pad(c1, c2.length);
  }
  const h = 16 * 2 + 6;
  const x = Math.trunc((160 - w) / 2);
  const y = Math.trunc((96 - h) / 2);
  return { kind: "choice", x, y, w, h, first: drawText(c1, x + 3, y + 3), second: drawText(c2, x + 3, y + 3 + 16), overflow: w > 160 };
}

/** `showgut` text (TextRender.drawTextInRect): rows of 160 pixels. */
export function layoutShowgut(text: string): ShowgutLayout {
  const b = textBytes(text);
  const rows: Glyph[][] = [];
  let i = 0;
  for (let row = 0; i < b.length && row < 2000; row++) {
    const glyphs: Glyph[] = [];
    let x = 0;
    while (x < 160 && i < b.length) {
      const g = glyphAt(b, i, x, row * 16);
      if (g) glyphs.push(g);
      if (b[i] >= 0xa1) {
        i += 2;
        x += 16;
      } else {
        i++;
        x += 8;
      }
    }
    rows.push(glyphs);
  }
  return { kind: "showgut", bytes: b, rows };
}

/** The text of bytes [from, to) (for messages about split words). */
export function bytesText(b: Uint8Array, from: number, to: number): string {
  return new TextDecoder("gbk").decode(b.slice(from, to));
}
