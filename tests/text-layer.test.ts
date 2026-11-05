// The text layer reports what is on screen so hosts can redraw it sharply.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { Bitmap, Canvas, Paint } from "../src/engine/graphics";
import { memorySaves } from "./helpers";

// a stand-in font: every glyph is a block of ink
const box = (n: number) => new Uint8Array(n).fill(0x7e);
const fb = { hzk: () => box(32), asc: () => box(16) };
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };

function menuOpen(): Engine {
  const e = createEngine({ resources: { datLib: writeLib(lanternPath()) }, saves: memorySaves(), fontFallback: fb, uiLanguage: "zh" });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  press(e, Keys.CANCEL, 10);
  return e;
}

describe("text layer", () => {
  it("lists the characters of the open menu", () => {
    const e = menuOpen();
    const text = e.textLayer().map((m) => m.text).join("");
    expect(text).toContain("属性");
    expect(text).toContain("系统");
    expect(e.textLayer().find((m) => m.text === "属")!.hidden).toBeNull();
  });

  it("reports the covered part when a submenu is drawn over text", () => {
    const e = menuOpen();
    press(e, Keys.ENTER, 10);
    const layer = e.textLayer();
    const xing = layer.find((m) => m.text === "性")!;
    expect(xing.hidden).not.toBeNull();
    const [x0, , x1] = xing.hidden!;
    expect(x0).toBeGreaterThan(0); // the left part is still visible
    expect(x1).toBe(16);
    expect(layer.some((m) => m.text === "状")).toBe(true);
  });

  it("follows text drawn on another bitmap and blitted, and forgets erased text", () => {
    const off = new Bitmap(32, 16);
    off.markGlyph({ x: 0, y: 0, w: 16, h: 16, font: 0, code: 1, fg: 1, bg: 2 });
    const screen = new Canvas(new Bitmap(160, 96));
    screen.drawBitmap(off, 40, 20);
    expect(screen.bitmap.glyphs).toEqual([{ x: 40, y: 20, w: 16, h: 16, font: 0, code: 1, fg: 1, bg: 2 }]);
    screen.drawColor(0);
    expect(screen.bitmap.glyphs).toEqual([]);
  });
});

describe("drawing at the edges", () => {
  it("clips images and lines left of the bitmap instead of wrapping them round", () => {
    const screen = new Bitmap(20, 4);
    const blank = screen.buffer[0];
    const img = new Bitmap(6, 2);
    img.buffer.fill(0xff000000);
    screen.drawImage(img, -3, 1); // half of it sticks out on the left
    const at = (x: number, y: number) => screen.buffer[y * 20 + x];
    expect([0, 1, 2].every((x) => at(x, 1) === 0xff000000 && at(x, 2) === 0xff000000)).toBe(true);
    expect([17, 18, 19].every((x) => at(x, 0) === blank && at(x, 1) === blank)).toBe(true); // nothing on the right
    const c = new Canvas(screen);
    const p = new Paint();
    p.color = 0xff0000ff;
    c.drawLine(-5, 3, 2, 3, p);
    expect(at(19, 2)).toBe(blank);
    expect(at(0, 3)).toBe(0xff0000ff);
  });
});
