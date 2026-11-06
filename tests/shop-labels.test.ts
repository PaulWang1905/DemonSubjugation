// The shop's "名: / 价:" labels follow the interface language of the game
// that is running, also after another game (in another language) had a shop
// open in the same page.
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine, type UiLanguage } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { memorySaves } from "./helpers";

const box = (n: number) => new Uint8Array(n).fill(0x7e);
const fontFallback = { hzk: () => box(32), asc: () => box(16) };
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };
const top = (e: Engine) => e.game.getCurScreen().constructor.name;

function shopText(uiLanguage: UiLanguage): string {
  const e = createEngine({ resources: { datLib: writeLib(lanternPath()) }, saves: memorySaves(), fontFallback, uiLanguage, random: () => 0.5 });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  e.game.mainScene.triggerEvent(2); // the shop
  for (let i = 0; i < 20 && top(e) === "ScreenMainGame"; i++) press(e, Keys.ENTER, 3);
  expect(top(e)).toBe("ScreenGoodsList");
  e.render();
  return e.textLayer().map((m) => m.text).join("");
}

describe("shop labels", () => {
  it("are in the running game's interface language", () => {
    expect(shopText("zh")).toContain("名:");
    const en = shopText("en");
    expect(en).toContain("N:");
    expect(en).not.toContain("名");
    expect(shopText("zh")).toContain("价:");
  });
});
