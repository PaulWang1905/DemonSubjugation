// More text for RPG-kit games on Fulu (src/fulu/moreText.ts): each game's
// opening dialogues in 12 px (and 伏魔记 1.3 in 10 px). Every dialogue is
// taken, its pages together show its whole string (spaces aside) in order,
// and never more pages than the game's own. Needs the games (BBK_GAMES) and
// the fonts (FMJ_DATA_DIR); none of them is committed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLib } from "../src/bbk/gam";
import { Key } from "../src/bbk/keys";
import { CPU_HZ } from "../src/bbk/machine";
import { FuluDevice } from "../src/fulu/device";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "";
const have = (f: string) => !!GAMES && !!FONTS && existsSync(join(GAMES, f)) && existsSync(join(FONTS, "HZK16"));
const gbk = new TextDecoder("gbk");

describe.each([
  ["伏魔记-1.0.gam", 12],
  ["伏魔记-1.2.gam", 12],
  ["伏魔记-1.3.gam", 12],
  ["伏魔记-1.3.gam", 10],
  ["伏魔记完美版1.0.gam", 12],
  ["伏魔记怀旧终曲v1.0(原版精修).gam", 12],
  ["英雄坛说.gam", 12],
] as const)("%s at %i px", (file, size) => {
  it.skipIf(!have(file))("shows each dialogue whole, in fewer pages", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    d.launch(d.install(gam)!);
    const mt = d.fulu.moreText;
    mt.library = gam.subarray(findLib(gam));
    mt.font = { size, hzk: new Uint8Array(readFileSync(`public/fonts/small/cjk${size}.bin`)), asc: new Uint8Array(readFileSync(`public/fonts/small/latin${size}.bin`)) };

    // what each dialogue's pages show, by watching Fulu draw them
    type Say = { text: Int8Array; pages: number[]; gamePages: number; answered: number };
    const shown = new Map<Int8Array, { say: Say; chars: string[][] }>();
    const internals = mt as unknown as { say: Say | null; draw(say: Say, n: number): void; glyph(f: 0 | 1, code: number, x: number, y: number): void };
    const draw = internals.draw.bind(mt), glyph = internals.glyph.bind(mt);
    let page: string[] | null = null;
    internals.draw = (say, n) => {
      let entry = shown.get(say.text);
      if (!entry) shown.set(say.text, (entry = { say, chars: [] }));
      entry.chars[n] = page = [];
      draw(say, n);
      page = null;
    };
    internals.glyph = (f, code, x, y) => {
      page?.push(f === 1 ? String.fromCharCode(code) : gbk.decode(new Uint8Array([0xa1 + Math.floor(code / 94), 0xa1 + (code % 94)])));
      glyph(f, code, x, y);
    };

    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    // a new game, through the scrolling opening, then its dialogues
    run(3);
    for (let i = 0; i < 3; i++) (d.press(Key.enter), run(2));
    run(90);
    for (let i = 0; i < 40; i++) (d.press(Key.enter), run(1.2));
    expect(d.fulu.stopped).toBeNull();

    expect(shown.size).toBeGreaterThan(0);
    for (const { say, chars } of shown.values()) {
      const text = gbk.decode(new Uint8Array(say.text.subarray(0, -1))).replace(/ /g, "");
      expect(say.pages.length).toBeLessThanOrEqual(say.gamePages);
      // (pages the run did not reach are left out; those shown join up to the start of the string)
      const seen = chars.filter(Boolean).map((p) => p.join("")).join("").replace(/ /g, "");
      expect(text.startsWith(seen)).toBe(true);
      if (chars.length === say.pages.length && chars.every(Boolean)) expect(seen).toBe(text);
    }
  }, 300_000);
});
