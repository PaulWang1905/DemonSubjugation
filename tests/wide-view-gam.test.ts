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

// Popup menus over the map keep the border; a page over the whole screen does not (as in the JS engine).
describe.each(["伏魔记-1.0.gam", "伏魔记-1.3.gam", "英雄坛说.gam"])("%s, menus", (file) => {
  it.skipIf(!have(file))("keeps the border around popup menus", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    d.launch(d.install(gam)!);
    const library = gam.subarray(findLib(gam));
    const kit = new KitCheats(d.machine, readLibrary(library)), wide = new WideView(library);
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    const press = (k: number, s = 1.2) => (d.press(k), run(s));
    run(3);
    for (let i = 0; i < 2; i++) press(Key.enter, 2);
    for (let i = 0; i < 120 && !kit.ready(); i++) press(i % 2 ? Key.exit : Key.enter, 1.5);
    for (let i = 0; i < 30; i++) press(Key.enter, 0.6);
    for (let i = 0; i < 2; i++) press(Key.exit, 1);
    const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT), [w, h] = WideView.size(2, 1), frame = new Uint8Array(w * h);
    const showing = () => {
      decodeLcd(d.machine.ram, lcd);
      const v = kit.mapView();
      wide.compose(lcd, v, 2, 1, frame);
      wide.compose(lcd, v, 2, 1, frame);
      return wide.showing;
    };
    expect(showing()).toBe(true);
    press(Key.exit); // the game's menu
    expect(showing()).toBe(true);
    press(Key.enter); // its first entry's popup
    expect(showing()).toBe(true);
  }, 300_000);
});

// A translation's scripts can name the scene otherwise than the library's map
// (the English 伏魔记 names 百草地 "Herb Garden"): the game is still recognised
// by its map and view, so the wider view and the debug menu keep working; a
// name that differs on a view off the map is not taken.
describe.each(["伏魔记-1.3.gam"])("%s, a renamed scene", (file) => {
  it.skipIf(!have(file))("is still recognised by its map and view", () => {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    d.launch(d.install(gam)!);
    const kit = new KitCheats(d.machine, readLibrary(gam.subarray(findLib(gam))));
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    run(3);
    for (let i = 0; i < 2; i++) (d.press(Key.enter), run(2));
    for (let i = 0; i < 120 && !kit.ready(); i++) (d.press(i % 2 ? Key.exit : Key.enter), run(1.5));
    expect(kit.ready()).toBe(true);
    // the scene's name, as a translation's script sets it (1.3 keeps it 2 bytes after $1942)
    const name = 0x1942 + 2, view = kit.mapView()!;
    new TextEncoder().encode("Herb Garden\0").forEach((b, i) => d.machine.write(name + i, b));
    expect(kit.ready()).toBe(true);
    expect(kit.mapView()?.mapIndex).toBe(view.mapIndex);
    // a view off the map, with the name not the map's: not this game's map
    d.machine.write(0x197c + 2, 250);
    expect(kit.ready()).toBe(false);
  }, 300_000);
});
