// More text for games made with BBK's RPG kit (F6): a dialogue (the kit's
// SAY) in 12 or 10 px text, so that a page holds more.
//
// The game lays its dialogue out itself, two 16 px lines a page (gitee
// fmj-engine, engine_cmd_actor.c `_002085A3`): it clears its box, draws its
// frame and portrait, prints the page's two lines and waits for a key
// (GuiGetMsg), page after page; afterwards it restores the screen. All of
// that goes through the OS, which is Fulu, so Fulu can follow it:
//
// - its box (SysLcdPartClear at the box's place) and first line
//   (SysPrintString) start a dialogue. Its whole string is in the script, at
//   the interpreter's pointer (base + PC, $1AA2 / $1AA0): found, and the
//   game's own page layout worked out from it, the first line must be the
//   one the game prints, or Fulu leaves the dialogue alone;
// - the game's lines are not printed; when it waits for a key, Fulu draws
//   its own box (as FMJ React's compact one: as tall as the page needs,
//   the portrait at its top) with a page of small text;
// - when the reader has seen Fulu's (fewer) pages, the game's remaining
//   waits are answered with a key, and the game ends the dialogue as usual.
//
// Line breaking is FMJ React's (TextRender.drawWrapped). Fonts: the
// player's bundled 12 and 10 px pixel fonts (HZK16 layout, GB2312 order).

import { TextRender } from "../engine/fmj/graphics/TextRender";
import { DatLib, ResType } from "../engine/fmj/lib/DatLib";
import { decodePic, type Pic } from "../bbk/wideView";
import { cpu, get16, os, rd, use, word, wr } from "./alu";
import type { Fulu } from "./fulu";
import { answerKey } from "./gui";
import { lcd } from "./screen";
import { Key } from "../bbk/keys";

const SYS_LCD_PART_CLEAR = 0xe85d, SYS_PRINT_STRING = 0xe79a, GUI_GET_MSG = 0xe935;
/** The box: from (9, 0x37) without a portrait, (9, 0x32) with, to (0x95, 0x5F); the first line at (0x0E or 0x2E, 0x3A). */
const BOX_LEFT = 9, BOX_RIGHT = 0x95, BOX_BOTTOM = 0x5f, TOP_PLAIN = 0x37, TOP_PORTRAIT = 0x32, LINE_Y = 0x3a;
/**
 * The interpreter's PC and its code's base: at the reconstruction's
 * addresses, or a few bytes off (伏魔记 1.3 +2, 1.0 -8). The string found
 * there must end at the PC and start with the line printed, so a wrong
 * candidate is not taken.
 */
const GUT_PC = 0x1aa0, GUT_BASE = 0x1aa2;
const SHIFTS = [0, 2, -2, 1, -1, 3, -3, 4, -4, 5, -5, 6, -6, -7, -8, -9, -10];
/** FMJ React's compact box: text from x 14 (44 beside the portrait) to 145, its last line ending at y 94. */
const LEFT = 14, LEFT_BESIDE = 44, RIGHT = 145, BOTTOM = 94;
/** The bytes of a screen row (20 of 8 pixels). */
const LCD_BYTES = 20;

export interface SmallFont {
  /** 12 or 10. */
  size: number;
  /** GB2312 glyphs, `size` rows of 2 bytes each. */
  hzk: Uint8Array;
  /** 256 ASCII glyphs, `size` rows of 1 byte. */
  asc: Uint8Array;
}

interface Dialogue {
  /** The string (GBK), with its 0. */
  text: Int8Array;
  portrait: Pic | null;
  /** Where each of Fulu's pages starts in the string. */
  pages: number[];
  /** How many pages the game shows (keys it waits for). */
  gamePages: number;
  /** The game's waits answered so far. */
  answered: number;
  /** Fulu's page shown at the current wait, or -1. */
  shown: number;
  /**
   * The screen above the game's box that Fulu's pages cover (from the
   * tallest page's top down to the game's box), as it was before the first
   * page: put back before each page, so that a shorter page leaves nothing of
   * a taller one (the game clears only its own box between pages).
   */
  under: { top: number; bottom: number; bytes: number[] } | null;
}

const gbk = new TextDecoder("gbk");

export class MoreText {
  /** The small font in use; null: the game's own text. */
  font: SmallFont | null = null;
  private lib: DatLib | null = null;
  private readonly portraits = new Map<number, Pic | null>();
  /** A box was cleared: its first line decides whether this is a dialogue to take. */
  private box: { portrait: boolean } | null = null;
  private say: Dialogue | null = null;
  /** The interpreter's address shift in this build, once found. */
  private shift: number | null = null;

  /** The fmj library in the .gam (for the portraits). */
  set library(bytes: Uint8Array | null) {
    this.lib = bytes && new DatLib(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.portraits.clear();
  }

  /**
   * Before Fulu answers an OS function the program calls: "skip" to answer
   * it with nothing done (the game's dialogue line), "key" to answer
   * GuiGetMsg with a key; otherwise it runs.
   */
  before(fulu: Fulu, entry: number): "skip" | "key" | undefined {
    if (!this.font && !this.say) return;
    use(fulu);
    if (entry === SYS_LCD_PART_CLEAR) {
      const sp = word(0x28), [x1, y1, x2, y2] = [cpu.a, rd(sp), rd(sp + 1), rd(sp + 2)];
      const isBox = x1 === BOX_LEFT && x2 === BOX_RIGHT && y2 === BOX_BOTTOM && (y1 === TOP_PLAIN || y1 === TOP_PORTRAIT);
      if (!isBox) this.say = this.box = null;
      else if (!this.say) this.box = { portrait: y1 === TOP_PORTRAIT };
      return;
    }
    if (entry === SYS_PRINT_STRING) {
      if (this.say) return "skip";
      const box = this.box;
      this.box = null;
      if (!box || !this.font) return;
      const sp = word(0x28), x = cpu.a, y = rd(sp), line = readString(get16(sp + 1), 64);
      if (y !== LINE_Y || x !== (box.portrait ? 0x2e : 0x0e)) return;
      const say = this.take(line, box.portrait);
      if (!say) return;
      this.say = say;
      return "skip";
    }
    if (entry === GUI_GET_MSG && this.say) {
      const say = this.say;
      if (say.answered < say.pages.length) {
        if (say.shown !== say.answered) {
          this.draw(say, say.answered);
          say.shown = say.answered;
        }
        return; // the reader's key
      }
      this.answered(say);
      return "key";
    }
  }

  /** After an OS function returned (not waiting): a key that ended one of the game's waits. */
  after(fulu: Fulu, entry: number): void {
    if (entry !== GUI_GET_MSG || !this.say) return;
    use(fulu);
    if (rd(get16(word(0x28))) === 1) this.answered(this.say);
  }

  /** Answer GuiGetMsg with a key (for "key"). */
  answer(fulu: Fulu): void {
    use(fulu);
    answerKey(Key.enter);
  }

  private answered(say: Dialogue): void {
    if (++say.answered >= say.gamePages) this.say = null;
  }

  /** The dialogue whose first line the game prints, if its string is found and the small text takes no more pages. */
  private take(line: number[], portrait: boolean): Dialogue | null {
    const found = this.findString(line);
    if (!found) return null;
    const { text, pos } = found;
    if ((pos !== 0) !== portrait) return null;
    const game = gamePages(text, pos);
    if (!game.firstLine.every((b, i) => b === line[i]) || game.firstLine.length !== line.length) return null;
    const head = portrait ? this.portrait(pos) : null;
    if (portrait && !head) return null;
    const pages = this.layout(text, head).map((p) => p.from);
    if (!pages.length || pages.length > game.pages) return null;
    return { text, portrait: head, pages, gamePages: game.pages, answered: 0, shown: -1, under: null };
  }

  /**
   * The SAY's string, ending just before the interpreter's PC (it has passed
   * the string's 0) and starting with `line`, and its portrait (the argument
   * before it, in a 2-byte slot).
   */
  private findString(line: number[]): { text: Int8Array; pos: number } | null {
    for (const s of this.shift === null ? SHIFTS : [this.shift]) {
      const end = (get16(GUT_BASE + s) + get16(GUT_PC + s) - 1) & 0xffff;
      if (rd(end) !== 0) continue;
      let start = end;
      while (end - start < 0x400 && start > 0 && rd(start - 1) !== 0) start--;
      // (the string follows the portrait's argument, whose bytes may not be 0)
      for (let skip = 0; skip <= 2; skip++) {
        const from = start + skip;
        if (line.every((b, i) => rd(from + i) === b)) {
          this.shift = s;
          const out = new Int8Array(end - from + 1);
          for (let i = 0; i < out.length - 1; i++) out[i] = rd(from + i);
          return { text: out, pos: rd(from - 2) };
        }
      }
    }
    return null;
  }

  private portrait(n: number): Pic | null {
    if (!this.portraits.has(n)) this.portraits.set(n, this.lib ? decodePic(this.lib.bytes(ResType.PIC, 1, n)) : null);
    return this.portraits.get(n)!;
  }

  /** Fulu's pages: each as tall as it needs (from the game's box's height), at most 4 lines at 12 px, 5 at 10 (as FMJ React's drawCompactSay). */
  private layout(text: Int8Array, head: Pic | null): { from: number; lines: number }[] {
    const len = text.length - 1, out: { from: number; lines: number }[] = [];
    for (let from = 0; from < len && out.length < 64; ) {
      const lines = this.linesFor(text, from, head);
      const next = this.wrap(text, from, head, lines);
      if (next <= from) break;
      out.push({ from, lines });
      from = next;
    }
    return out;
  }

  private rows(lines: number, head: Pic | null): { x: number; y: number; right: number }[] {
    const size = this.font!.size, textTop = BOTTOM - lines * size;
    const headBottom = head ? textTop - 12 + head.h : -1;
    return Array.from({ length: lines }, (_, row) => {
      const y = textTop + row * size;
      return { x: y < headBottom ? LEFT_BESIDE : LEFT, y, right: RIGHT };
    });
  }

  private wrap(text: Int8Array, from: number, head: Pic | null, lines: number, place?: (font: 0 | 1, code: number, x: number, y: number) => void): number {
    const device = [{ left: head ? LEFT_BESIDE : LEFT, right: RIGHT }, { left: LEFT, right: RIGHT }];
    return TextRender.withSize(this.font!.size, () => TextRender.drawWrapped(null, text, from, this.rows(lines, head), device, place).next);
  }

  private linesFor(text: Int8Array, from: number, head: Pic | null): number {
    const max = this.font!.size === 12 ? 4 : 5, full = this.wrap(text, from, head, max);
    // never shorter than the game's box (its top at 0x32 / 0x37: 36 px of lines), which would show above
    let lines = Math.ceil(36 / this.font!.size);
    while (lines < max && this.wrap(text, from, head, lines) < full) lines++;
    return lines;
  }

  /** Draw Fulu's page `n`: its box, the portrait, the text. */
  /** The top of Fulu's box for a page of `lines` lines. */
  private boxTop(lines: number, head: Pic | null): number {
    const textTop = BOTTOM - lines * this.font!.size;
    return head ? textTop - 8 : textTop - 3;
  }

  private draw(say: Dialogue, n: number): void {
    const font = this.font!, from = say.pages[n], head = say.portrait, lines = this.linesFor(say.text, from, head);
    const textTop = BOTTOM - lines * font.size, top = this.boxTop(lines, head);
    // what the pages cover above the game's box: kept from before the first, put back before each
    if (!say.under) {
      const highest = Math.min(...say.pages.map((p) => this.boxTop(this.linesFor(say.text, p, head), head)));
      const bottom = head ? TOP_PORTRAIT : TOP_PLAIN, bytes: number[] = [];
      for (let y = highest; y < bottom; y++) for (let b = 0; b < LCD_BYTES; b++) bytes.push(rd(lcd(b, y)));
      say.under = { top: highest, bottom, bytes };
    } else {
      const { top: from, bottom, bytes } = say.under;
      let i = 0;
      for (let y = from; y < bottom; y++) for (let b = 0; b < LCD_BYTES; b++) wr(lcd(b, y), bytes[i++]);
    }
    for (let y = top; y <= BOX_BOTTOM; y++) for (let x = BOX_LEFT; x <= BOX_RIGHT; x++) pixel(x, y, false);
    for (let x = BOX_LEFT; x <= BOX_RIGHT; x++) (pixel(x, top, true), pixel(x, BOX_BOTTOM, true));
    for (let y = top; y <= BOX_BOTTOM; y++) (pixel(BOX_LEFT, y, true), pixel(BOX_RIGHT, y, true));
    if (head) {
      // the portrait's tab, as the game draws it: down 6 from x 38 to 44, then across
      const tab = top + 6;
      for (let i = 0; i <= 6; i++) pixel(38 + i, top + i, true);
      for (let x = 45; x <= BOX_RIGHT; x++) pixel(x, tab, true);
      for (let j = 0; j < head.h; j++) for (let i = 0; i < head.w; i++) {
        const v = head.frames[0][j * head.w + i];
        if (v !== 2) pixel(13 + i, textTop - 12 + j, v === 1);
      }
    }
    this.wrap(say.text, from, head, lines, (f, code, x, y) => this.glyph(f, code, x, y));
  }

  /**
   * For the OS's message box (GuiMsgBox, which MESSAGE and TIMEMSG show; on
   * Fulu it is Fulu's own code, src/fulu/msgbox.ts): how many lines of the
   * small font `text` takes from x `left` to `right`, at most `max` (null
   * when More text is off, or the text does not fit).
   */
  messageLines(text: Int8Array, left: number, right: number, max: number): number | null {
    if (!this.font) return null;
    const len = text.indexOf(0) < 0 ? text.length : text.indexOf(0);
    for (let n = 1; n <= max; n++) if (this.wrapMessage(text, left, right, 0, n) >= len) return n;
    return null;
  }

  /** Draw the message's `lines` lines from (left, top). */
  drawMessage(text: Int8Array, left: number, right: number, top: number, lines: number): void {
    this.wrapMessage(text, left, right, top, lines, (f, code, x, y) => this.glyph(f, code, x, y));
  }

  private wrapMessage(text: Int8Array, left: number, right: number, top: number, lines: number, place?: (font: 0 | 1, code: number, x: number, y: number) => void): number {
    const size = this.font!.size, rows = Array.from({ length: lines }, (_, i) => ({ x: left, y: top + i * size, right }));
    return TextRender.withSize(size, () => TextRender.drawWrapped(null, text, 0, rows, undefined, place).next);
  }

  /** A small glyph at (x, y), replacing its cell, recorded for HD text. */
  private glyph(f: 0 | 1, code: number, x: number, y: number): void {
    const { size, hzk, asc } = this.font!, w = f === 0 ? size : size >> 1, rows: number[] = [];
    for (let r = 0; r < size; r++) {
      const bits = f === 0 ? ((hzk[(code * size + r) * 2] ?? 0) << 8) | (hzk[(code * size + r) * 2 + 1] ?? 0) : (asc[code * size + r] ?? 0) << 8;
      const row = bits >> (16 - w);
      rows.push(row);
      for (let c = 0; c < w; c++) pixel(x + c, y + r, ((row >> (w - 1 - c)) & 1) === 1);
    }
    const ch = f === 1 ? String.fromCharCode(code) : gbk.decode(new Uint8Array([0xa1 + Math.floor(code / 94), 0xa1 + (code % 94)]));
    os.textMarks.drawn(x, y, w, rows, rows.some((r) => r) && !ch.includes("�") ? ch : "", size);
  }
}

/** The game's own pages (SAY's loop): how many, and the first page's first line. */
export function gamePages(text: Int8Array, pos: number): { pages: number; firstLine: number[] } {
  const t = (i: number) => text[i] & 0xff, len = text.length - 1;
  let off = 0, pages = 0, firstLine: number[] = [];
  const line = (limit: number) => {
    const start = off;
    for (let n = 0; n < limit; off++, n++) {
      if (t(off) > 0x80) (off++, n++);
      else if (t(off) === 0) break;
    }
    return Array.from(text.subarray(start, off), (b) => b & 0xff);
  };
  for (;;) {
    const first = line(pos === 0 ? 15 : 11);
    if (!pages) firstLine = first;
    line(15);
    pages++;
    if (t(off) === 0 || off >= len || pages > 200) break;
  }
  return { pages, firstLine };
}

function readString(at: number, max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const b = rd(at + i);
    if (!b) break;
    out.push(b);
  }
  return out;
}

function pixel(x: number, y: number, on: boolean): void {
  if (x < 0 || x > 158 || y < 0 || y > 95) return;
  const a = lcd(x >> 3, y), bit = 0x80 >> (x & 7), v = rd(a);
  wr(a, on ? v | bit : v & ~bit);
}
