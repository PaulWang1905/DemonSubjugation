// Item effects as the original engine applies them (src/engine/fmj/goods/ItemRules.ts)
// and the battle item / steal rules in OriginalRules.
import { beforeEach, describe, expect, it } from "vitest";
import { addSignedByte, applyItemChange } from "../src/engine/fmj/goods/ItemRules";
import * as R from "../src/engine/fmj/combat/OriginalRules";
import type { FightingCharacter } from "../src/engine/fmj/characters/FightingCharacter";
import type { BaseGoods } from "../src/engine/fmj/goods/BaseGoods";
import { setPlatform } from "../src/engine/java";
import { memorySaves } from "./helpers";

let next: number[] = [];
const rolls = (...v: number[]) => (next = v);
beforeEach(() => {
  next = [];
  setPlatform({ rom: new Map(), saves: memorySaves(), exit() {}, random: () => ((next.shift() ?? 0) + 0.5) / 0x10000 });
});

/** A character with clamping setters like the engine's. */
function char(o: Partial<Record<"hp" | "maxHP" | "mp" | "maxMP" | "attack" | "defend" | "speed" | "lingli" | "luck", number>> = {}) {
  const c = {
    maxHP: 100, hp: 50, maxMP: 50, mp: 10, attack: 20, defend: 20, speed: 10, lingli: 10, luck: 10,
    isPlayer: true, isVisiable: true, ostatus: new Uint8Array(7).fill(0xff), odelta: { attack: 0, defend: 0, speed: 0 },
    immuneBits: 0, ...o,
  };
  return c as unknown as FightingCharacter;
}
/** Effect bytes 0x16-0x1d. */
const raw = (b: Partial<Record<number, number>>) => Uint8Array.from({ length: 8 }, (_, i) => b[0x16 + i] ?? 0);

describe("item effects", () => {
  it("reads stat bytes as sign-and-magnitude (0x83 is -3)", () => {
    const p = char();
    applyItemChange(2, null, raw({ 0x18: 5, 0x1b: 0x83 }), p); // armour: +5 defence, -3 speed
    expect([p.defend, p.speed]).toEqual([25, 7]);
    applyItemChange(2, raw({ 0x18: 5, 0x1b: 0x83 }), null, p);
    expect([p.defend, p.speed]).toEqual([20, 10]);
  });

  it("stops subtractions at 0", () => {
    const p = char({ luck: 2 });
    applyItemChange(7, null, raw({ 0x1d: 0x85 }), p); // weapon with -5 luck
    expect(p.luck).toBe(0);
  });

  it("adds a weapon's attack and armour's defence as plain bytes", () => {
    const p = char();
    applyItemChange(7, null, raw({ 0x19: 0x9e }), p);
    expect(p.attack).toBe(20 + 0x9e);
    applyItemChange(1, null, raw({ 0x18: 0x84 }), p);
    expect(p.defend).toBe(20 + 0x84);
  });

  it("applies medicine, revival and elixirs", () => {
    const p = char();
    applyItemChange(9, null, raw({ 0x16: 30, 0x18: 100 }), p);
    expect([p.hp, p.mp]).toEqual([80, 50]); // MP capped at its maximum
    applyItemChange(10, null, raw({ 0x17: 40 }), p);
    expect(p.hp).toBe(40);
    applyItemChange(11, null, raw({ 0x17: 10, 0x1a: 0x82 }), p);
    expect([p.maxHP, p.lingli]).toEqual([110, 8]);
  });

  it("adds accessory bytes per turn without a floor, in one byte", () => {
    expect(addSignedByte(0, 5, true)).toBe(5);
    expect(addSignedByte(0, 0x83, true)).toBe(0xfd); // -3 wraps in the byte, as on the device
  });
});

describe("battle items and stealing", () => {
  const goods = (type: number, b: Partial<Record<number, number>>, sumRound = 0) => ({ type, index: 1, raw: raw(b), sumRound }) as unknown as BaseGoods;

  it("party medicine goes over every member, fallen ones too", () => {
    const a = char({ hp: 0 });
    const b = char({ hp: 10 });
    R.setBattleSides([a, b], []);
    R.useItemOnParty(goods(9, { 0x16: 20, 0x1c: 0x10 }), "all");
    expect([a.hp, b.hp]).toEqual([20, 30]);
  });

  it("stimulants raise attack and defence for some rounds", () => {
    const p = char({ attack: 100, defend: 50 });
    R.setBattleSides([p], []);
    R.useItemOnParty(goods(12, { 0x19: 20, 0x18: 10 }, 3), p);
    expect([p.odelta.attack, p.odelta.defend]).toEqual([20, 5]);
  });

  it("thrown weapons can drain, times the enemies hit", () => {
    const thrower = char({ hp: 10 });
    const e1 = char({ hp: 50 });
    const e2 = char({ hp: 50 });
    R.setBattleSides([thrower], [e1, e2]);
    const drain = (-15) & 0xffff;
    R.throwItem(thrower, goods(8, { 0x16: drain & 0xff, 0x17: drain >> 8 }), "all");
    expect([e1.hp, e2.hp, thrower.hp]).toEqual([35, 35, 40]);
  });

  it("a thrown weapon deals the original's flag value", () => {
    const e = char({ hp: 5000 });
    R.setBattleSides([char()], [e]);
    R.throwItem(char(), goods(7, { 0x19: 40 }), e); // attack byte only: 40
    expect(e.hp).toBe(5000 - 40);
    R.throwItem(char(), goods(7, { 0x19: 40, 0x1b: 2 }), e); // a speed byte adds the 0x0400 flag
    expect(e.hp).toBe(5000 - 40 - 0x400 - 40);
  });

  it("steals by luck", () => {
    const thief = char({ luck: 30 });
    const foe = char({ luck: 10 });
    R.setBattleSides([thief], [foe]);
    rolls(25); // 25 % 30 + 1 = 26 > 25 % 10 = 5, and 25 % 3 != 0
    expect(R.stealSucceeds(thief, 0, foe)).toBe(true);
    rolls(27); // 27 % 3 == 0
    expect(R.stealSucceeds(thief, 0, foe)).toBe(false);
  });
});
