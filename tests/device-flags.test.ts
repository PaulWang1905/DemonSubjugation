// The original's music switch, MUSIC command, coordinate display and
// enhancement magic with the original battle rules off.
import { afterEach, describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { assemble, disassemble } from "../src/editor/format/gut";
import { encodeMagic } from "../src/editor/format/encode";
import { lanternPath } from "../src/editor/template/demo";
import { DeviceFlags } from "../src/engine/fmj/config/DeviceFlags";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { MagicEnhance } from "../src/engine/fmj/magic/MagicEnhance";
import * as R from "../src/engine/fmj/combat/OriginalRules";
import type { FightingCharacter } from "../src/engine/fmj/characters/FightingCharacter";
import type { ObjectInput, ObjectOutput } from "../src/engine/java";
import { memorySaves } from "./helpers";

const fonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };
const top = (e: Engine) => e.game.getCurScreen().constructor.name;

/** The Lantern Path demo, with `lines` added at the start of its first script. */
function demo(lines: string[] = []): Uint8Array {
  const lib = lanternPath();
  if (lines.length) {
    const e = lib.entries.find((x) => x.resType === 1 && x.type === 1 && x.index === 1)!;
    const asm = disassemble(e.data).split("\n");
    const first = asm.findIndex((l) => /^\s{2}\S/.test(l));
    asm.splice(first, 0, ...lines.map((l) => "  " + l));
    e.data = assemble(asm.join("\n"));
  }
  return writeLib(lib);
}

function inGame(lib: Uint8Array): Engine {
  let s = 7;
  const e = createEngine({ resources: { datLib: lib, ...fonts }, saves: memorySaves(), random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  expect(top(e)).toBe("ScreenMainGame");
  return e;
}

afterEach(() => {
  EngineSettings.originalDamageFormula = true;
  DeviceFlags.reset();
});

describe("music", () => {
  it("MUSIC keeps the melody and its plays as the original does", () => {
    DeviceFlags.playMusic(3, 0);
    expect([DeviceFlags.melody, DeviceFlags.repeat]).toEqual([3, 0xff]); // 0 plays: for ever
    DeviceFlags.playMusic(4, 2);
    expect([DeviceFlags.melody, DeviceFlags.repeat]).toEqual([4, 2]);
    DeviceFlags.playMusic(0, 5);
    expect(DeviceFlags.repeat).toBe(0); // melody 0 stops
    DeviceFlags.setMusic(false);
    DeviceFlags.playMusic(6, 1);
    expect([DeviceFlags.melody, DeviceFlags.repeat]).toEqual([6, 0]); // music off: stopped
  });

  it("the system menu's Settings switches music off and on", () => {
    const e = inGame(demo());
    const settings = (choice: number) => {
      for (let i = 0; i < 6 && top(e) !== "ScreenMainGame"; i++) press(e, Keys.CANCEL);
      press(e, Keys.CANCEL);
      expect(top(e)).toBe("ScreenGameMainMenu");
      for (let i = 0; i < 3; i++) press(e, Keys.DOWN);
      press(e, Keys.ENTER);
      expect(top(e)).toBe("ScreenMenuSystem");
      press(e, Keys.DOWN);
      press(e, Keys.DOWN);
      press(e, Keys.ENTER);
      expect(top(e)).toBe("ScreenCommonMenu");
      for (let i = 0; i < choice; i++) press(e, Keys.DOWN);
      press(e, Keys.ENTER);
      expect(top(e)).toBe("ScreenMenuSystem");
    };
    settings(1);
    expect(DeviceFlags.music).toBe(false);
    settings(0);
    expect(DeviceFlags.music).toBe(true);
  });

  it("is saved, and older saves load with the defaults", () => {
    const bytes: number[] = [];
    const out = { writeInt: (v: number) => bytes.push(v & 0xff, (v >> 8) & 0xff), writeByte: (v: number) => bytes.push(v & 0xff) } as unknown as ObjectOutput;
    const reader = (b: number[]) => {
      let i = 0;
      return {
        remaining: () => b.length - i,
        readInt: () => b[i++] | (b[i++] << 8),
        readByte: () => b[i++],
      } as unknown as ObjectInput;
    };
    DeviceFlags.playMusic(5, 3);
    DeviceFlags.setMusic(false);
    DeviceFlags.showPos = true;
    DeviceFlags.write(out);
    DeviceFlags.reset();
    DeviceFlags.read(reader(bytes));
    expect([DeviceFlags.melody, DeviceFlags.repeat, DeviceFlags.music, DeviceFlags.showPos]).toEqual([5, 3, false, true]);
    DeviceFlags.read(reader([]));
    expect([DeviceFlags.melody, DeviceFlags.music, DeviceFlags.showPos]).toEqual([0, true, false]);
  });
});

describe("coordinate display", () => {
  it("ENABLESHOWPOS and MUSIC run from scripts", () => {
    inGame(demo(["enableshowpos", "music 3, 0"]));
    expect(DeviceFlags.showPos).toBe(true);
    expect([DeviceFlags.melody, DeviceFlags.repeat]).toEqual([3, 0xff]);
  });

  it("draws the map position in the top-left corner", () => {
    const e = inGame(demo());
    const corner = () => {
      e.redraw();
      const px = e.render();
      const out: number[] = [];
      for (let y = 8; y < 16; y++) for (let x = 15; x < 45; x++) out.push(px[(y * 160 + x) * 4]);
      return out.join(",");
    };
    const plain = corner();
    DeviceFlags.showPos = true;
    expect(corner()).not.toBe(plain);
    DeviceFlags.showPos = false;
    expect(corner()).toBe(plain);
  });
});

describe("enhancement magic with the original rules off", () => {
  it("raises the stat for its rounds, then wears off", () => {
    createEngine({ resources: { datLib: demo(), ...fonts }, saves: memorySaves(), random: () => 0.5 });
    EngineSettings.originalDamageFormula = false;
    const b = encodeMagic({ type: 2, index: 1, name: "Might", description: "", cost: 5, animation: 1 });
    b[0x17] = 50; // attack +50%
    b[0x18] = 2 << 4; // for 2 rounds
    const m = new MagicEnhance();
    m.setData(Int8Array.from(b, (v) => (v << 24) >> 24), 0);
    class Hero {
      attack = 40; defend = 10; speed = 10; hp = 100; maxHP = 100; mp = 20; isPlayer = true; isVisiable = true;
      ostatus = new Uint8Array(7).fill(0xff);
      odelta = { attack: 0, defend: 0, speed: 0 };
      get battleAttack(): number { return this.attack + this.odelta.attack; }
    }
    const hero = new Hero() as unknown as FightingCharacter;
    R.setBattleSides([hero], []);
    m.use(hero, hero);
    expect(hero.mp).toBe(15);
    expect(hero.battleAttack).toBeGreaterThan(40);
    R.tickStatus(hero);
    expect(hero.battleAttack).toBeGreaterThan(40);
    R.tickStatus(hero);
    expect(hero.battleAttack).toBe(40);
  });
});
