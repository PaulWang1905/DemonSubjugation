import { describe, expect, it } from "vitest";
import { encodeGoods, encodeLevelChain, encodeMagic, encodeMonster, encodePlayer } from "../src/editor/format/encode";
import { fieldsFor, readField, readLevels, writeField, writeLevels, type Field } from "../src/editor/format/schema";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";
import { registerResources } from "../src/engine/fmj/registry";
import { setPlatform } from "../src/engine/java";
import type { Player } from "../src/engine/fmj/characters/Player";
import type { Monster } from "../src/engine/fmj/characters/Monster";
import type { ResLevelupChain } from "../src/engine/fmj/characters/ResLevelupChain";
import { writeLib } from "../src/editor/format/lib";
import { encodeImage, frameFromArt } from "../src/editor/format/encode";
import { memorySaves } from "./helpers";

const field = (rt: number, t: number, key: string): Field => fieldsFor(rt, t)!.find((f) => f.key === key)!;
const set = (b: Uint8Array, rt: number, t: number, values: Record<string, number | string>) =>
  Object.entries(values).reduce((acc, [k, v]) => writeField(acc, field(rt, t, k), v), b);

function decode<T>(resType: number, type: number, index: number, data: Uint8Array, extra: { resType: number; type: number; index: number; data: Uint8Array }[] = []): T {
  const lib = writeLib({ titleBytes: new Uint8Array(), entries: [{ resType, type, index, data }, ...extra] });
  registerResources();
  setPlatform({ rom: new Map([["DAT.LIB", new Int8Array(lib.buffer)]]), saves: memorySaves(), exit() {}, random: Math.random });
  DatLib.reset();
  return DatLib.getRes(resType, type, index) as T;
}

const sprite = (rt: number, t: number, n: number, frames: number) => ({ resType: rt, type: t, index: n, data: encodeImage(t, n, Array.from({ length: frames }, () => frameFromArt(["#."]))) });

describe("form fields", () => {
  it("edit party members in place", () => {
    let b = encodePlayer({ index: 1, name: "Ren", walkSprite: 1, level: 1, maxHP: 50, maxMP: 5, attack: 5, defend: 5, speed: 5, lingli: 5, luck: 5 });
    b[0x21] = 0x5a; // an unmodelled byte must survive edits
    b = set(b, 3, 1, { name: "Kai", level: 3, maxHP: 321, attack: 77, luck: 42 });
    expect(b[0x21]).toBe(0x5a);
    const p = decode<Player>(ResType.ARS, 1, 1, b, [sprite(8, 1, 1, 12), sprite(11, 3, 1, 12)]);
    expect([p.name, p.level, p.maxHP, p.attack, p.luck]).toEqual(["Kai", 3, 321, 77, 42]);
    expect(readField(b, field(3, 1, "name"))).toBe("Kai");
  });

  it("edit monsters, including signed and flag fields", () => {
    let b = encodeMonster({ index: 2, name: "Bat", sprite: 1, level: 1, maxHP: 10, attack: 3, defend: 1, speed: 3, money: 1, exp: 1 });
    b = set(b, 3, 3, { name: "Vampire Bat", maxHP: 250, hp: 250, money: 99, immune: 8 | 1 });
    const m = decode<Monster>(ResType.ARS, 3, 2, b, [sprite(8, 3, 1, 2)]);
    expect([m.name, m.maxHP, m.hp, m.money]).toEqual(["Vampire Bat", 250, 250, 99]);
    expect(m.hasBuff(8)).toBe(true);
    expect(m.hasBuff(4)).toBe(false);
  });

  it("edit items and magic with signed and masked fields", () => {
    let g = encodeGoods({ type: 7, index: 1, name: "Stick", icon: 1, description: "x", buy: 1, sell: 1 });
    g = set(g, 6, 7, { defend: -4, attack: 9, desc: "A heavy club." });
    expect(readField(g, field(6, 7, "defend"))).toBe(-4);
    expect(readField(g, field(6, 7, "desc"))).toBe("A heavy club.");
    let m = encodeMagic({ type: 1, index: 1, name: "Bolt", description: "x", cost: 2, animation: 1, rounds: 3 });
    m = set(m, 4, 1, { all: 1, rounds: 5, hp: -40 });
    expect(m[3]).toBe(0x80 | 5);
    expect(readField(m, field(4, 1, "hp"))).toBe(-40);
  });

  it("rejects bad values with readable messages", () => {
    const b = encodePlayer({ index: 1, name: "A", walkSprite: 1, level: 1, maxHP: 1, maxMP: 0, attack: 1, defend: 1, speed: 1, lingli: 1, luck: 1 });
    expect(() => set(b, 3, 1, { maxHP: 5000 })).toThrow(/Max HP must be a whole number from 0 to 999/);
    expect(() => set(b, 3, 1, { name: "我的名字太长太长了" })).toThrow(/too long/);
  });

  it("level tables can be edited and resized", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ maxHP: 10 + i, maxMP: 5, attack: 3, defend: 2, nextExp: 10 * (i + 1), speed: 4, lingli: 1, luck: 1, magics: i }));
    const b = encodeLevelChain(1, rows);
    const r = readLevels(b);
    expect(r).toHaveLength(3);
    r.push([...r[2]]);
    r[3][0] = 99;
    const out = writeLevels(b, r);
    const lc = decode<ResLevelupChain>(ResType.MLR, 2, 1, out);
    expect([lc.maxLevel, lc.getMaxHP(4), lc.getHP(4), lc.getNextLevelExp(2)]).toEqual([4, 99, 99, 20]);
  });
});
