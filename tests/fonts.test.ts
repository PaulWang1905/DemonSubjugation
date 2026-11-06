// The bundled pixel fonts and switching fonts while a game runs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { FONT_SETS } from "../src/app/fonts";
import { memorySaves } from "./helpers";

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
});
