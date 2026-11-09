// The debug menu of RPG-kit games, checked against the games' own screens:
// what KitCheats reads and writes must be what the game shows. Needs the
// games (BBK_GAMES: a folder with the 伏魔记 series and 英雄坛说) and the fonts
// (FMJ_DATA_DIR: HZK16, ASC16); none of them is committed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLib } from "../src/bbk/gam";
import { Key } from "../src/bbk/keys";
import { KitCheats } from "../src/bbk/kitCheats";
import { decodeLcd, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ } from "../src/bbk/machine";
import { readLibrary } from "../src/engine";
import { FuluDevice } from "../src/fulu/device";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "";
const have = (f: string) => !!GAMES && !!FONTS && existsSync(join(GAMES, f)) && existsSync(join(FONTS, "HZK16"));

function start(file: string) {
  const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
  const gam = new Uint8Array(readFileSync(join(GAMES, file)));
  d.launch(d.install(gam)!);
  const kit = new KitCheats(d.machine, readLibrary(gam.subarray(findLib(gam))));
  const run = (s: number) => {
    for (let n = Math.round(s * 60); n > 0; n--) d.machine.run(CPU_HZ / 60);
    kit.tick();
  };
  const press = (k: number, s = 1.5) => {
    d.press(k);
    run(s);
  };
  /** The text the screen shows. */
  const screen = () => {
    const px = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(d.machine.ram, px);
    return d.fulu.textMarks.marks(px).map((m) => m.text).join("");
  };
  /** The money the game's menu shows, or null when it is not open. */
  const shownMoney = () => {
    // (the menu draws the digits over half of its full-width colon, which then stays pixels)
    const m = /金钱[:：]?(\d+)/.exec(screen());
    return m ? Number(m[1]) : null;
  };
  return { d, kit, run, press, screen, shownMoney };
}

/** From power-on to the game's menu on its first map: a new game, the opening dialogues answered, Exit for the menu. */
function toMenu(g: ReturnType<typeof start>) {
  g.run(3);
  g.press(Key.enter, 2);
  g.press(Key.enter, 2);
  for (let i = 0; i < 120 && g.shownMoney() === null; i++) g.press(i % 2 ? Key.exit : Key.enter);
  expect(g.shownMoney()).not.toBeNull();
}

describe.each([
  ["伏魔记-1.0.gam", "柳清风"],
  ["伏魔记-1.2.gam", "柳清风"],
  ["伏魔记-1.3.gam", "柳清风"],
  ["伏魔记完美版1.0.gam", "柳清风"],
  ["伏魔记怀旧终曲v1.0(原版精修).gam", "柳清风"],
  ["英雄坛说.gam", null],
])("%s", (file, hero) => {
  it.skipIf(!have(file))("reads and writes what the game shows", () => {
    const g = start(file), { kit } = g;
    toMenu(g);
    expect(kit.ready()).toBe(true);

    // money: as the menu shows it, and changed there too
    expect(g.shownMoney()).toBe(kit.money());
    g.press(Key.exit);
    kit.setMoney(4321);
    g.press(Key.exit);
    expect(g.shownMoney()).toBe(4321);
    g.press(Key.exit);

    // the party: its stats as the game's status page shows them, and changed there
    const [first] = kit.party();
    if (hero) {
      expect(first.name).toBe(hero);
      const statusPage = () => {
        g.press(Key.exit); // the menu
        g.press(Key.enter); // 属性
        g.press(Key.enter); // 状态
        g.press(Key.pageDown); // its second page: 经验值 身法 灵力 幸运 免疫
        // (怀旧终曲 calls them 吉运 and 抗性)
        const shown = /身法灵力..(?:免疫|抗性)\/?(\d+)/.exec(g.screen())?.[1];
        g.press(Key.exit); // the menu
        g.press(Key.exit); // the map
        return shown;
      };
      expect(statusPage()).toBe(`${first.speed}${first.lingli}${first.luck}`);
      kit.setStat(0, "speed", 77);
      kit.setStat(0, "lingli", 66);
      kit.setStat(0, "luck", 55);
      expect(statusPage()).toBe("776655");
    }
    expect(first.level).toBeGreaterThanOrEqual(1);
    expect(first.hp).toBeLessThanOrEqual(first.maxHP);
    kit.setStat(0, "hp", 1);
    kit.setSwitch("alwaysFull", true);
    g.run(0.1);
    expect(kit.party()[0].hp).toBe(first.maxHP);
    kit.setSwitch("alwaysFull", false);

    // items: in and out of the inventory
    const item = kit.catalogue().find((i) => i.count === 0)!;
    kit.setItemCount(item.type, item.index, 3);
    expect(kit.inventory()).toContainEqual({ ...item, count: 3 });
    kit.setItemCount(item.type, item.index, 0);
    expect(kit.inventory().some((i) => i.type === item.type && i.index === item.index)).toBe(false);

    // flags (伏魔记 1.0 keeps them elsewhere: not offered)
    if (file === "伏魔记-1.0.gam") expect(kit.cannot("flags")).toBeTruthy();
    else {
      const flag = [...Array(2000).keys()].find((n) => n > 0 && !kit.flags().includes(n))!;
      kit.setFlag(flag, true);
      expect(kit.flags()).toContain(flag);
      kit.setFlag(flag, false);
      expect(kit.flags()).not.toContain(flag);
    }

    // random battles: kept off while asked (even when the game turns them on), the game's setting back after
    const m = g.d.machine, word = (a: number) => m.read(a) | (m.read(a + 1) << 8);
    const shift = [0, 2, -1].find((s) => word(0x1988 + 0x17 + s) === 0x4a10)!, encounters = 0x1a96 + shift;
    m.write(encounters, 1);
    kit.setSwitch("noRandomBattles", true);
    expect(m.read(encounters)).toBe(0);
    m.write(encounters, 1);
    g.run(0.1);
    expect(m.read(encounters)).toBe(0);
    kit.setSwitch("noRandomBattles", false);
    expect(m.read(encounters)).toBe(1);
  });

  it.skipIf(!have(file))("does not offer walking through walls", () => {
    const g = start(file), { kit } = g;
    toMenu(g);
    expect(kit.cannot("walkThroughWalls")).toBeTruthy();
    kit.setSwitch("walkThroughWalls", true);
    expect(kit.switches().walkThroughWalls).toBe(false);
  });
});
