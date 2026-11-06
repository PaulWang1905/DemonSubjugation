// The bundled pixel fonts and switching fonts while a game runs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { boldSmallFonts, FONT_SETS } from "../src/app/fonts";
import { memorySaves } from "./helpers";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { Bitmap, Canvas } from "../src/engine/graphics";
import { Global } from "../src/engine/fmj/Global";

const file = (url: string) => new Uint8Array(readFileSync("public" + url));
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };

describe("bundled pixel fonts", () => {
  it("are in the device's HZK16 / ASC16 layout", () => {
    for (const f of FONT_SETS) {
      const cjk = file(f.cjk);
      const latin = file(f.latin);
      expect(cjk.length).toBe(267616);
      expect(latin.length).toBe(4096);
      // 啊 (GB2312 B0A1, the first hanzi) and "A" have pixels
      const han = ((0xb0 - 0xa1) * 94 + (0xa1 - 0xa1)) * 32;
      expect(cjk.subarray(han, han + 32).some((b) => b !== 0)).toBe(true);
      expect(latin.subarray(0x41 * 16, 0x42 * 16).some((b) => b !== 0)).toBe(true);
    }
  });

  it("can be swapped in while the game runs", () => {
    const [a, b] = FONT_SETS.filter((f) => f.id === "unifont" || f.id === "retro");
    const e = createEngine({ resources: { datLib: writeLib(lanternPath()), hzk16: file(a.cjk), asc16: file(a.latin) }, saves: memorySaves(), random: () => 0.5 });
    tick(e, 120);
    press(e, Keys.ENTER, 10);
    for (let i = 0; i < 50 && !e.textLayer().some((m) => /[A-Za-z]/.test(m.text)); i++) press(e, Keys.ENTER, 6);
    expect(e.textLayer().some((m) => /[A-Za-z]/.test(m.text))).toBe(true); // letters on screen
    const before = Array.from(e.render());
    const screen = e.game.getCurScreen();
    e.setFonts(file(b.cjk), file(b.latin));
    e.redraw();
    expect(Array.from(e.render())).not.toEqual(before); // the letters changed
    expect(e.game.getCurScreen()).toBe(screen); // the game did not restart
    e.setFonts(file(a.cjk), file(a.latin));
    e.redraw();
    expect(Array.from(e.render())).toEqual(before);
  });

  it("draws More text with the fonts made for 12 and 10 pixels", () => {
    const small = { hzk12: file("/fonts/small/cjk12.bin"), asc12: file("/fonts/small/latin12.bin"), hzk10: file("/fonts/small/cjk10.bin"), asc10: file("/fonts/small/latin10.bin") };
    expect([small.hzk12.length, small.asc12.length, small.hzk10.length, small.asc10.length]).toEqual([8363 * 24, 256 * 12, 8363 * 20, 256 * 10]);
    const set = FONT_SETS[0];
    const e = createEngine({ resources: { datLib: writeLib(lanternPath()), hzk16: file(set.cjk), asc16: file(set.latin) }, saves: memorySaves() });
    e.setFonts(file(set.cjk), file(set.latin), small);
    for (const size of [12, 10] as const) {
      const canvas = new Canvas(new Bitmap(32, 16));
      TextRender.withSize(size, () => TextRender.drawText(canvas, "A", 0, 0));
      const asc = size === 12 ? small.asc12 : small.asc10;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size / 2; c++) {
          const ink = (asc[0x41 * size + r] & (0x80 >> c)) !== 0;
          expect(canvas.bitmap.buffer[r * 32 + c] === Global.fgColor, `A at ${size}px, row ${r} col ${c}`).toBe(ink);
        }
      }
    }
  });

  it("makes a bold More text that keeps the gaps between strokes", () => {
    const small = { hzk12: file("/fonts/small/cjk12.bin"), asc12: file("/fonts/small/latin12.bin"), hzk10: file("/fonts/small/cjk10.bin"), asc10: file("/fonts/small/latin10.bin") };
    const bold = boldSmallFonts(small);
    const bits = (n: number) => [...n.toString(2)].filter((c) => c === "1").length;
    for (const k of ["hzk12", "asc12", "hzk10", "asc10"] as const) {
      const a = small[k];
      const b = bold[k];
      expect(b.length).toBe(a.length);
      let more = 0;
      for (let i = 0; i < a.length; i++) {
        expect(b[i] & a[i]).toBe(a[i]); // nothing taken away
        more += bits(b[i]) - bits(a[i]);
      }
      expect(more).toBeGreaterThan(0);
    }
    // (vertical strokes:) one-pixel gaps stay open, a stroke with room to its right grows into it
    const bin = (s: string) => parseInt(s.replace(/#/g, "1").replace(/\./g, "0").padEnd(8, "0"), 2);
    const glyph = (rows: string[]) => {
      const asc12 = new Uint8Array(12);
      rows.forEach((r, i) => (asc12[i] = bin(r)));
      return boldSmallFonts({ hzk12: new Uint8Array(24), asc12, hzk10: new Uint8Array(20), asc10: new Uint8Array(10) }).asc12;
    };
    const bars = (r: string) => glyph(Array(12).fill(r))[5];
    expect(bars("#.#.#")).toBe(bin("#.#.##"));
    expect(bars("#..#")).toBe(bin("##.##"));
    // dots (as in ……) stay dots
    expect(Array.from(glyph(["", "", "#..#..#"]).subarray(0, 4))).toEqual([0, 0, bin("#..#..#"), 0]);
  });
});
