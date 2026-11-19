// English menus for the RPG kit's engine (src/bbk/kitEnglish.ts): the
// engine's strings replaced in place, the library and the length untouched,
// and the game's own menu showing them on Fulu. Needs the games (BBK_GAMES)
// and the fonts (FMJ_DATA_DIR); none is committed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLib } from "../src/bbk/gam";
import { buildGam } from "../src/bbk/gamBuild";
import { englishMenus, hasKitEngine } from "../src/bbk/kitEnglish";
import { Key } from "../src/bbk/keys";
import { KitCheats } from "../src/bbk/kitCheats";
import { decodeLcd, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ } from "../src/bbk/machine";
import { readLibrary } from "../src/engine";
import { FuluDevice } from "../src/fulu/device";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "";
const have = (f: string) => !!GAMES && !!FONTS && existsSync(join(GAMES, f)) && existsSync(join(FONTS, "HZK16"));
const gbk = (s: string) => new Uint8Array(Array.from(new TextEncoder().encode(s)));
const has = (d: Uint8Array, needle: Uint8Array, end: number) => {
  for (let i = 0; i + needle.length <= end; i++) if (needle.every((b, k) => d[i + k] === b)) return true;
  return false;
};

describe.each(["伏魔记-1.0.gam", "伏魔记-1.3.gam", "伏魔记完美版1.0.gam", "英雄坛说.gam"])("%s", (file) => {
  it.skipIf(!have(file))("shows the engine's menus in English", () => {
    const gam = new Uint8Array(readFileSync(join(GAMES, file)));
    expect(hasKitEngine(gam)).toBe(true);
    const { gam: en, replaced } = englishMenus(gam);
    const lib = findLib(gam);
    expect(replaced).toBeGreaterThan(50);
    expect(en.length).toBe(gam.length);
    expect(en.subarray(lib)).toEqual(gam.subarray(lib)); // the library as it was
    expect(has(en, gbk("StatMag ItemSys "), lib)).toBe(true);
    // (GBK 属性魔法物品系统 is gone from the program)
    expect(has(en, new Uint8Array([0xca, 0xf4, 0xd0, 0xd4, 0xc4, 0xa7, 0xb7, 0xa8]), lib)).toBe(false);

    // on Fulu: the game's menu, read from the screen
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    d.launch(d.install(en)!);
    const kit = new KitCheats(d.machine, readLibrary(en.subarray(lib)));
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    };
    run(3);
    for (let i = 0; i < 2; i++) (d.press(Key.enter), run(2));
    for (let i = 0; i < 120 && !kit.ready(); i++) (d.press(i % 2 ? Key.exit : Key.enter), run(1.5));
    for (let i = 0; i < 30; i++) (d.press(Key.enter), run(0.6));
    for (let i = 0; i < 2; i++) (d.press(Key.exit), run(1));
    d.press(Key.exit);
    run(1.2);
    const px = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(d.machine.ram, px);
    const screen = d.fulu.textMarks.marks(px).map((m) => m.text).join("");
    expect(screen).toContain("Gold");
    expect(screen).toContain("Stat");
    expect(screen).toContain("Sys");
    expect(d.fulu.stopped).toBeNull();
  }, 300_000);
});

describe("export with English menus", () => {
  it.skipIf(!have("伏魔记-1.3.gam"))("translates the engine taken from the owned .gam", () => {
    const donor = new Uint8Array(readFileSync(join(GAMES, "伏魔记-1.3.gam")));
    const lib = donor.subarray(findLib(donor));
    const plain = buildGam(lib, "X", "fulu", donor), en = buildGam(lib, "X", "fulu", donor, true);
    expect(has(plain, gbk("StatMag ItemSys "), findLib(plain))).toBe(false);
    expect(has(en, gbk("StatMag ItemSys "), findLib(en))).toBe(true);
  });
});
