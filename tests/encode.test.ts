import { describe, expect, it } from "vitest";
import {
  encodeGoods, encodeImage, encodeLevelChain, encodeMagic, encodeMagicChain, encodeMap, encodeMonster,
  encodeNpc, encodePlayer, encodeSceneObj, encodeSrs, frameFromArt,
} from "../src/editor/format/encode";
import { writeLib } from "../src/editor/format/lib";
import { Colors } from "../src/engine/graphics";
import { setPlatform } from "../src/engine/java";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";
import type { ResImage } from "../src/engine/fmj/lib/ResImage";
import type { ResMap } from "../src/engine/fmj/lib/ResMap";
import type { ResSrs } from "../src/engine/fmj/lib/ResSrs";
import { registerResources } from "../src/engine/fmj/registry";
import type { Player } from "../src/engine/fmj/characters/Player";
import type { NPC } from "../src/engine/fmj/characters/NPC";
import type { Monster } from "../src/engine/fmj/characters/Monster";
import type { GoodsEquipment } from "../src/engine/fmj/goods/GoodsEquipment";
import type { GoodsMedicine } from "../src/engine/fmj/goods/GoodsMedicine";
import type { ResMagicChain } from "../src/engine/fmj/magic/ResMagicChain";
import type { ResLevelupChain } from "../src/engine/fmj/characters/ResLevelupChain";
import { memorySaves } from "./helpers";

const sprite = (n: number) => Array.from({ length: n }, (_, i) => frameFromArt([i % 2 ? "#." : ".#", "  "]));

function load(entries: { resType: number; type: number; index: number; data: Uint8Array }[]) {
  const lib = writeLib({ titleBytes: new Uint8Array(), entries });
  registerResources();
  setPlatform({ rom: new Map([["DAT.LIB", new Int8Array(lib.buffer)]]), saves: memorySaves(), exit() {}, random: Math.random });
  DatLib.reset();
}

describe("resource encoders (decoded by the engine)", () => {
  it("images, opaque and transparent", () => {
    load([
      { resType: 11, type: 1, index: 1, data: encodeImage(1, 1, [frameFromArt(["#.#.#.#.#", "........."])]) },
      { resType: 11, type: 1, index: 2, data: encodeImage(1, 2, [frameFromArt(["# .", ". #"]), frameFromArt(["   ", "###"])]) },
    ]);
    const a = DatLib.getRes(ResType.PIC, 1, 1) as ResImage;
    expect([a.width, a.height, a.number]).toEqual([9, 2, 1]);
    const pa = a.getBitmap(0)!.buffer;
    expect([pa[0], pa[1], pa[8], pa[9]]).toEqual([Colors.BLACK, Colors.WHITE, Colors.BLACK, Colors.WHITE]);
    const b = DatLib.getRes(ResType.PIC, 1, 2) as ResImage;
    const f0 = b.getBitmap(0)!.buffer;
    const f1 = b.getBitmap(1)!.buffer;
    expect([...f0]).toEqual([Colors.BLACK, Colors.TRANSP, Colors.WHITE, Colors.WHITE, Colors.TRANSP, Colors.BLACK]);
    expect([...f1]).toEqual([Colors.TRANSP, Colors.TRANSP, Colors.TRANSP, Colors.BLACK, Colors.BLACK, Colors.BLACK]);
  });

  it("maps", () => {
    load([{ resType: 2, type: 1, index: 3, data: encodeMap({ type: 1, index: 3, tileset: 2, name: "Meadow", width: 2, height: 1, cells: [{ tile: 5, walkable: true, event: 9 }, { tile: 1, walkable: false }] }) }]);
    const m = DatLib.getRes(ResType.MAP, 1, 3) as ResMap;
    expect([m.mapName, m.mapWidth, m.mapHeight, m.canWalk(0, 0), m.canWalk(1, 0), m.getEventNum(0, 0)]).toEqual(["Meadow", 2, 1, true, false, 9]);
  });

  it("players, NPCs, scene objects and monsters", () => {
    load([
      { resType: 8, type: 1, index: 4, data: encodeImage(1, 4, sprite(12)) },
      { resType: 8, type: 2, index: 5, data: encodeImage(2, 5, sprite(12)) },
      { resType: 8, type: 4, index: 6, data: encodeImage(4, 6, sprite(2)) },
      { resType: 8, type: 3, index: 7, data: encodeImage(3, 7, sprite(3)) },
      { resType: 11, type: 3, index: 1, data: encodeImage(3, 1, sprite(12)) },
      { resType: 3, type: 1, index: 1, data: encodePlayer({ index: 1, name: "Ren", walkSprite: 4, level: 2, maxHP: 120, hp: 100, maxMP: 30, attack: 15, defend: 9, speed: 12, lingli: 5, luck: 7, x: 3, y: 4, facing: 2 }) },
      { resType: 3, type: 2, index: 2, data: encodeNpc({ index: 2, name: "Elder", sprite: 5, state: 2, delay: 5, facing: 3 }) },
      { resType: 3, type: 4, index: 3, data: encodeSceneObj({ index: 3, name: "Chest", sprite: 6, step: 1 }) },
      { resType: 3, type: 3, index: 4, data: encodeMonster({ index: 4, name: "Slime", sprite: 7, level: 1, maxHP: 40, attack: 8, defend: 2, speed: 5, money: 12, exp: 6, drop: { type: 9, index: 1, count: 1 } }) },
    ]);
    const p = DatLib.getRes(ResType.ARS, 1, 1) as Player;
    expect([p.name, p.level, p.maxHP, p.hp, p.maxMP, p.attack, p.defend, p.speed, p.lingli, p.luck, p.posInMap.x, p.posInMap.y, p.direction]).toEqual(["Ren", 2, 120, 100, 30, 15, 9, 12, 5, 7, 3, 4, 2]);
    const n = DatLib.getRes(ResType.ARS, 2, 2) as NPC;
    expect([n.name, n.state, n.walkingSpriteId]).toEqual(["Elder", 2, 5]);
    const o = DatLib.getRes(ResType.ARS, 4, 3) as NPC;
    expect([o.name, o.step]).toEqual(["Chest", 1]);
    const m = DatLib.getRes(ResType.ARS, 3, 4) as Monster;
    expect([m.name, m.maxHP, m.hp, m.attack, m.defend, m.money, m.exp]).toEqual(["Slime", 40, 40, 8, 2, 12, 6]);
  });

  it("goods, magic and chains", () => {
    const icon = (t: number) => ({ resType: 9, type: t, index: 1, data: encodeImage(t, 1, [frameFromArt(["#"])]) });
    load([
      icon(7), icon(9),
      { resType: 6, type: 7, index: 1, data: encodeGoods({ type: 7, index: 1, name: "Oak Staff", icon: 1, description: "A sturdy staff.", buy: 40, sell: 20, attack: 6, defend: -1 }) },
      { resType: 6, type: 9, index: 1, data: encodeGoods({ type: 9, index: 1, name: "Herb", icon: 1, description: "Restores 30 HP.", buy: 10, sell: 5, hp: 30 }) },
      { resType: 5, type: 2, index: 1, data: encodeSrs(2, 1, [{ x: 0, y: 0, show: 4, next: 2, image: 0 }], [frameFromArt(["##"])]) },
      { resType: 4, type: 1, index: 1, data: encodeMagic({ type: 1, index: 1, name: "Spark", description: "A small bolt.", cost: 3, animation: 1, hp: 25 }) },
      { resType: 12, type: 1, index: 1, data: encodeMagicChain(1, [{ type: 1, index: 1 }]) },
      { resType: 12, type: 2, index: 1, data: encodeLevelChain(1, [{ maxHP: 100, maxMP: 20, attack: 10, defend: 5, nextExp: 30, speed: 8, lingli: 4, luck: 6, magics: 1 }, { maxHP: 120, maxMP: 26, attack: 13, defend: 7, nextExp: 80, speed: 9, lingli: 5, luck: 6, magics: 1 }]) },
    ]);
    const w = DatLib.getRes(ResType.GRS, 7, 1) as unknown as GoodsEquipment & { mat: number; mdf: number };
    expect([w.name, w.description, w.buyPrice, w.sellPrice, w.isWeapon(), w.canPlayerUse(1)]).toEqual(["Oak Staff", "A sturdy staff.", 40, 20, true, true]);
    expect([w.mat, w.mdf]).toEqual([6, -1]);
    const h = DatLib.getRes(ResType.GRS, 9, 1) as GoodsMedicine;
    expect(h.name).toBe("Herb");
    const s = DatLib.getRes(ResType.MRS, 1, 1) as unknown as { magicName: string; magicDescription: string; costMp: number; isForAll: boolean; mHp: number };
    expect([s.magicName, s.magicDescription, s.costMp, s.isForAll, s.mHp]).toEqual(["Spark", "A small bolt.", 3, false, 25]);
    const mc = DatLib.getMlr(1, 1)!;
    expect((mc as ResMagicChain).getMagic(0)!.magicName).toBe("Spark");
    const lc = DatLib.getRes(ResType.MLR, 2, 1) as ResLevelupChain;
    expect([lc.maxLevel, lc.getMaxHP(2), lc.getNextLevelExp(1), lc.getLearnMagicNum(1)]).toEqual([2, 120, 30, 1]);
    const a = DatLib.getRes(ResType.SRS, 2, 1) as ResSrs;
    a.start();
    expect(a.update(40)).toBe(true);
  });

  it("validates input", () => {
    expect(() => encodePlayer({ index: 1, name: "A very long name indeed", walkSprite: 1, level: 1, maxHP: 1, maxMP: 0, attack: 1, defend: 1, speed: 1, lingli: 1, luck: 1 })).toThrow(/too long/);
    expect(() => encodeMap({ type: 1, index: 1, tileset: 1, name: "x", width: 200, height: 1, cells: [] })).toThrow(/map width/);
  });
});

import { decodeImage, decodeMap } from "../src/editor/format/decode";
describe("editor decoders", () => {
  it("decode what the encoders write", () => {
    const f = [frameFromArt(["# . #", "#####"]), frameFromArt(["     ", "  #  "])];
    const back = decodeImage(encodeImage(1, 1, f)).frames;
    expect(back.map((x) => [...x.pixels])).toEqual(f.map((x) => [...x.pixels]));
    const opaque = [frameFromArt(["#.#.#.#.#.", ".........#"])];
    expect([...decodeImage(encodeImage(1, 1, opaque)).frames[0].pixels]).toEqual([...opaque[0].pixels]);
    const cells = [{ tile: 3, walkable: true, event: 2 }, { tile: 9, walkable: false, event: 0 }];
    const m = decodeMap(encodeMap({ type: 1, index: 4, tileset: 2, name: "Glade", width: 2, height: 1, cells }));
    expect(m).toEqual({ type: 1, index: 4, tileset: 2, name: "Glade", width: 2, height: 1, cells });
  });
});

import { floodFill, resizeFrame, rgbaToFrame, sliceSheet } from "../src/editor/ui/pixels";
describe("pixel helpers", () => {
  it("convert PNG pixels, slice sheets, fill and resize", () => {
    // 4x2 RGBA: black, white, transparent, dark grey / white x4
    const rgba = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 60, 60, 60, 255, ...Array(16).fill(255)];
    const f = rgbaToFrame(rgba, 4, 2);
    expect([...f.pixels]).toEqual([1, 0, 2, 1, 0, 0, 0, 0]);
    expect(sliceSheet(f, 2, 2).map((p) => [...p.pixels])).toEqual([[1, 0, 0, 0], [2, 1, 0, 0]]);
    expect([...floodFill(f, 0, 1, 1).pixels]).toEqual([1, 1, 2, 1, 1, 1, 1, 1]);
    const r = resizeFrame(f, 5, 1, 2);
    expect([...r.pixels]).toEqual([1, 0, 2, 1, 2]);
  });
});
