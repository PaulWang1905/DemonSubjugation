// The original engine's battle rules (see src/engine/fmj/combat/OriginalRules.ts),
// checked with chosen random numbers against the reconstructed C code.
import { beforeEach, describe, expect, it } from "vitest";
import * as R from "../src/engine/fmj/combat/OriginalRules";
import type { Player } from "../src/engine/fmj/characters/Player";
import type { FightingCharacter } from "../src/engine/fmj/characters/FightingCharacter";
import type { Monster } from "../src/engine/fmj/characters/Monster";
import { setPlatform } from "../src/engine/java";
import { memorySaves } from "./helpers";

let next: number[] = [];
/** Make the next rand16() calls return these values. */
const rolls = (...v: number[]) => (next = v);
beforeEach(() => {
  next = [];
  setPlatform({ rom: new Map(), saves: memorySaves(), exit() {}, random: () => ((next.shift() ?? 0) + 0.5) / 0x10000 });
});

const fighter = (o: Partial<Record<"attack" | "defend" | "speed" | "lingli" | "luck" | "hp" | "mp", number>>) =>
  ({ attack: 0, defend: 0, speed: 0, lingli: 0, luck: 0, hp: 999, mp: 999, ...o }) as unknown as FightingCharacter;

describe("original battle rules", () => {
  it("player attacks: dodge by speed, attack / (def >> 3), plus rand % (atk >> 2)", () => {
    const hero = fighter({ attack: 40, speed: 20 });
    const foe = fighter({ defend: 16, speed: 10 });
    rolls(1000); // 1000 % 200 = 0 < 10 + 50 - 20 = 40: miss
    expect(R.physicalOnEnemy(hero, foe)).toBe(R.MISS);
    rolls(157); // 157 % 200 >= 40: hit; 40 / 2 + 157 % 10
    expect(R.physicalOnEnemy(hero, foe)).toBe(27);
    rolls(157); // defence under 8 divides by 1, not 0
    expect(R.physicalOnEnemy(hero, fighter({ defend: 5 }))).toBe(40 + (157 % 10));
  });

  it("enemy attacks: attack / ((def >> 3) + 1) plus rand % ((atk >> 4) + 1), halved when guarding", () => {
    const foe = fighter({ attack: 40, speed: 70 });
    const hero = fighter({ defend: 16, speed: 10 });
    rolls(157); // evade 10 + 50 = 60 is not > 70, so 10; 157 % 200 >= 10
    expect(R.physicalOnPlayer(foe, hero, false)).toBe(Math.trunc(40 / 3) + (157 % 3));
    rolls(157);
    expect(R.physicalOnPlayer(foe, hero, true)).toBe((Math.trunc(40 / 3) + (157 % 3)) >> 1);
  });

  it("spells scale with spirit and can be dodged", () => {
    const mage = fighter({ lingli: 10, speed: 30 });
    rolls(150);
    // 64 + 10 * (64 >> 6) = 74, then + (150 % 74) >> 4
    expect(R.spellDamage(mage, fighter({}), 64, 0, false)).toEqual({ hp: 74, mp: 0 });
    rolls(5); // target speed 40 + 20 - 30 = 30 > 5 % 100: dodged
    expect(R.spellDamage(mage, fighter({ speed: 40 }), 64, 0, false).hp).toBe(R.MISS);
    rolls(150); // never more than the target has
    expect(R.spellDamage(mage, fighter({ hp: 20 }), 64, 0, false).hp).toBe(20);
  });

  it("flee compares luck + speed rolls with the first enemy's", () => {
    rolls(7);
    expect(R.fleeSucceeds(fighter({ luck: 9, speed: 9 }), fighter({ luck: 3, speed: 3 }))).toBe(true); // 7+7 > 3+3
    rolls(7);
    expect(R.fleeSucceeds(fighter({ luck: 2, speed: 2 }), fighter({ luck: 9, speed: 9 }))).toBe(false); // 1+1 < 7+7
  });

  it("encounters 4 times in 100", () => {
    let hits = 0;
    for (let r = 0; r < 100; r++) {
      rolls(r);
      if (R.encounter()) hits++;
    }
    expect(hits).toBe(4);
  });

  it("drops by the leader's luck, three times in four", () => {
    const foe = { luck: 5 } as unknown as Monster;
    rolls(9); // 9 % 20 + 1 = 10 > 9 % 5 = 4, and 9 % 4 != 0
    expect(R.drops(fighter({ luck: 20 }), foe)).toBe(true);
    rolls(8); // 8 % 4 == 0
    expect(R.drops(fighter({ luck: 20 }), foe)).toBe(false);
  });

  it("recovers after victory and revives the fallen with 1 HP", () => {
    const a = fighter({ hp: 0 }) as unknown as Player;
    const b = Object.assign(fighter({ hp: 50, mp: 0 }), { maxHP: 150, maxMP: 40 }) as unknown as Player;
    rolls(5); // 5 % 10 + 15 = 20%
    expect(R.recoverAfterVictory([a, b])).toEqual([b]);
    expect([a.hp, b.hp, b.mp]).toEqual([1, 70, 8]);
  });

  it("levels up several times at once", () => {
    const table = [
      // level: maxHP, maxMP, attack, defend, speed, lingli, luck, next exp, spells
      [100, 20, 10, 10, 10, 10, 10, 10, 1],
      [120, 25, 12, 11, 11, 11, 11, 20, 1],
      [140, 30, 14, 12, 12, 12, 12, 30, 2],
      [160, 35, 16, 13, 13, 13, 13, 40, 2],
    ];
    const col = (i: number) => (l: number) => table[l - 1][i];
    const chain = {
      maxLevel: 4,
      getMaxHP: col(0), getMaxMP: col(1), getAttack: col(2), getDefend: col(3), getSpeed: col(4),
      getLingli: col(5), getLuck: col(6), getNextLevelExp: col(7), getLearnMagicNum: col(8),
    };
    const p = {
      level: 1, currentExp: 0, hp: 1, mp: 1, maxHP: 100, maxMP: 20, attack: 10, defend: 10, speed: 10, lingli: 10, luck: 10,
      levelupChain: chain, magicChain: { learnNum: 1 }, levelBefore: null,
    } as unknown as Player;
    rolls(0);
    expect(R.gainExperience(p, 35)).toBe(true); // 35 > 10, 25 > 20 -> level 3 (5 is not > 30)
    expect([p.level, p.maxHP, p.attack, p.hp, p.magicChain!.learnNum]).toEqual([3, 140, 14, 140, 2]);
    expect(p.currentExp).toBe(35 - 20); // only the last level's requirement is taken, as in the original
    expect(p.levelBefore?.maxHP).toBe(100);
    expect(R.gainExperience(p, 0)).toBe(false); // 15 is not > 30
  });
});

import { createEngine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { blankProject } from "../src/editor/template/blank";
import { RaiseAnimation } from "../src/engine/fmj/combat/anim/RaiseAnimation";
import { Canvas } from "../src/engine/graphics";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";

describe("MISS picture", () => {
  it("ships with the templates and draws, with a text fallback for games without it", () => {
    for (const lib of [lanternPath(), blankProject("T")]) {
      createEngine({ resources: { datLib: writeLib(lib), hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) }, saves: memorySaves() });
      expect(DatLib.getRes(ResType.PIC, 2, 18, true)).not.toBeNull();
      const a = new RaiseAnimation(40, 40, 0, 0, true);
      const c = new Canvas();
      expect(() => a.draw(c)).not.toThrow();
      expect(a.update(60)).toBe(true);
    }
  });
});
