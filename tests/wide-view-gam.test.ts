// The wider map view for RPG-kit games (src/bbk/wideView.ts), in each game on
// its first map: the border shows, the middle is the game's own screen, and
// a screen that does not show the map (here a blank one) blanks the border.
// Needs the games (BBK_GAMES) and the fonts (FMJ_DATA_DIR); none is committed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLib } from "../src/bbk/gam";
import { Key } from "../src/bbk/keys";
import { KitCheats } from "../src/bbk/kitCheats";
import { decodeLcd, LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ } from "../src/bbk/machine";
import { WideView } from "../src/bbk/wideView";
import { readLibrary } from "../src/engine";
import { FuluDevice } from "../src/fulu/device";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "";
const have = (f: string) => !!GAMES && !!FONTS && existsSync(join(GAMES, f)) && existsSync(join(FONTS, "HZK16"));

describe.each(["伏魔记-1.0.gam", "伏魔记-1.2.gam", "伏魔记-1.3.gam", "伏魔记完美版1.0.gam", "伏魔记怀旧终曲v1.0(原版精修).gam", "英雄坛说.gam"])("%s", (file) => {
  it.skipIf(!have(file))("shows the map around the screen, only while the screen shows it", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    d.launch(d.install(gam)!);
    const library = gam.subarray(findLib(gam));
    const kit = new KitCheats(d.machine, readLibrary(library)), wide = new WideView(library);
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    // a new game, the opening answered, on the first map
    run(3);
    for (let i = 0; i < 2; i++) (d.press(Key.enter), run(2));
    for (let i = 0; i < 120 && !kit.ready(); i++) (d.press(i % 2 ? Key.exit : Key.enter), run(1.5));
    for (let i = 0; i < 30; i++) (d.press(Key.enter), run(0.6));
    for (let i = 0; i < 2; i++) (d.press(Key.exit), run(1));
    const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    decodeLcd(d.machine.ram, lcd);
    const view = kit.mapView();
    expect(view).not.toBeNull();

    const [w, h] = WideView.size(4, 2), frame = new Uint8Array(w * h);
    const [ox, oy] = wide.compose(lcd, view, 4, 2, frame);
    expect(wide.showing).toBe(true);
    // the middle is the game's own map area
    for (let y = 0; y < LCD_HEIGHT; y++) for (let x = 16; x < 144; x++) expect(frame[(oy + y) * w + ox + x]).toBe(lcd[y * LCD_STRIDE + x] ? 1 : 0);
    // the border holds the map (not blank: the first maps fill the view)
    let ink = 0;
    for (let y = 0; y < oy; y++) for (let x = 0; x < w; x++) ink += frame[y * w + x];
    for (let x = 0; x < ox; x++) for (let y = 0; y < h; y++) ink += frame[y * w + x];
    if (view!.viewY > 0 && view!.viewX > 0) expect(ink).toBeGreaterThan(0);

    // a screen that is not the map: the border goes (after a frame's grace) and the device's whole screen shows
    const blank = new Uint8Array(lcd.length);
    wide.compose(blank, view, 4, 2, frame);
    wide.compose(blank, view, 4, 2, frame);
    expect(wide.showing).toBe(false);
    expect(frame.every((v) => v === 0)).toBe(true);
  }, 120_000);
});

// In a dialogue the box covers the screen's lower rows: the border stays (the game's box and More text's taller one).
describe.each([
  ["伏魔记-1.0.gam", 16],
  ["伏魔记-1.3.gam", 16],
  ["伏魔记-1.3.gam", 12],
  ["伏魔记完美版1.0.gam", 10],
] as const)("%s, dialogue at %i px", (file, size) => {
  it.skipIf(!have(file))("keeps the border while a dialogue shows", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    d.launch(d.install(gam)!);
    const library = gam.subarray(findLib(gam));
    const kit = new KitCheats(d.machine, readLibrary(library)), wide = new WideView(library);
    if (size !== 16) {
      d.fulu.moreText.library = library;
      d.fulu.moreText.font = { size, hzk: new Uint8Array(readFileSync(`public/fonts/small/cjk${size}.bin`)), asc: new Uint8Array(readFileSync(`public/fonts/small/latin${size}.bin`)) };
    }
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    // a new game, through the scrolling opening, to its first dialogues
    run(3);
    for (let i = 0; i < 3; i++) (d.press(Key.enter), run(2));
    run(90);
    const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT), [w, h] = WideView.size(2, 1), frame = new Uint8Array(w * h);
    let dialogues = 0;
    for (let i = 0; i < 12; i++) {
      decodeLcd(d.machine.ram, lcd);
      const view = kit.mapView();
      // a box: its bottom line across the screen
      const box = [...Array(141).keys()].every((x) => lcd[95 * LCD_STRIDE + 9 + x]);
      if (view && box) {
        dialogues++;
        wide.compose(lcd, view, 2, 1, frame);
        wide.compose(lcd, view, 2, 1, frame);
        expect(wide.showing).toBe(true);
      }
      d.press(Key.enter);
      run(1.2);
    }
    expect(dialogues).toBeGreaterThan(0);
  }, 300_000);
});
