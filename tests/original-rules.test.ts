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

type Stats = Partial<Record<"attack" | "defend" | "speed" | "lingli" | "luck" | "hp" | "mp" | "maxHP" | "maxMP" | "mIQ" | "immune", number>> & {
  isPlayer?: boolean;
};
/** A stand-in fighter with the fields the rules read. */
const fighter = (o: Stats) => {
  const f = {
    attack: 0, defend: 0, speed: 0, lingli: 0, luck: 0, hp: 999, mp: 999, maxHP: 999, maxMP: 999, mIQ: 0, immune: 0,
    isPlayer: false, isVisiable: true, defending: false, attackStatusRounds: 0,
    ostatus: new Uint8Array(7).fill(0xff),
    odelta: { attack: 0, defend: 0, speed: 0 },
    ...o,
    get battleAttack(): number { return (this.attack + this.odelta.attack) & 0xffff; },
    get battleDefend(): number { return (this.defend + this.odelta.defend) & 0xffff; },
    get battleSpeed(): number { return (this.speed + this.odelta.speed) & 0xff; },
    get immuneBits(): number { return this.immune; },
    get hasAilment(): boolean { return [3, 4, 5, 6].some((i): boolean => this.ostatus[i] !== 0xff); },
    get isAlive(): boolean { return this.hp > 0; },
    get attackStatusBits(): number { return 0; },
  };
  return f as unknown as FightingCharacter & { mIQ: number };
};

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

describe("original statuses and enemy turns", () => {
  it("sets status slots, respects immunity and counts them down", () => {
    const f = fighter({ immune: 0x02 }); // immune to seal
    expect(R.applyStatus(f, 0x08 | 0x02 | 0x01, 3)).toBe(0x08 | 0x01); // poison and sleep take hold
    expect([R.isPoisoned(f), R.isSealed(f), R.isAsleep(f)]).toEqual([true, false, true]);
    R.tickStatus(f);
    R.tickStatus(f);
    expect(R.isAsleep(f)).toBe(true);
    R.tickStatus(f); // the third turn ends it
    expect([R.isAsleep(f), R.isPoisoned(f)]).toEqual([false, false]);
  });

  it("poison takes a quarter of the current HP", () => {
    const f = fighter({ hp: 81 });
    R.applyStatus(f, 0x08, 2);
    expect(R.poisonDamage(f)).toBe(20);
  });

  it("lands statuses when luck < rand % 90 or the roll is over 60", () => {
    rolls(50);
    expect(R.statusLands(fighter({ luck: 40 }))).toBe(true);
    rolls(50);
    expect(R.statusLands(fighter({ luck: 60 }))).toBe(false);
    rolls(70);
    expect(R.statusLands(fighter({ luck: 99 }))).toBe(true);
  });

  it("changes stats by percent and resets them when they run out", () => {
    const p = fighter({ attack: 200, defend: 50, isPlayer: true });
    expect(R.applyStatChange(p, [20, 0, 0], "+", 2)).toBe(0x40);
    expect(p.battleAttack).toBe(240);
    R.tickStatus(p);
    R.tickStatus(p);
    expect(p.battleAttack).toBe(200);
    const e = fighter({ attack: 100, defend: 80 });
    e.odelta.defend = 7;
    R.applyStatChange(e, [50, 0, 0], "-", 3); // an enemy's other changes are reset (original)
    expect([e.battleAttack, e.odelta.defend]).toEqual([50, 0]);
  });

  it("confused fighters hit themselves", () => {
    rolls(5);
    expect(R.confusedSelfHit(fighter({ attack: 40, defend: 16, isPlayer: true }))).toBe(Math.trunc(40 / 5) + (5 % 3));
    rolls(5);
    expect(R.confusedSelfHit(fighter({ attack: 40, defend: 16 }))).toBe(Math.trunc(40 / 3) + (5 % 11));
  });

  it("enemies attack or cast by their IQ", () => {
    const party = [fighter({ isPlayer: true }), null, fighter({ isPlayer: true })];
    const foes = [fighter({}), null, null];
    const spells = [{ cost: 5, type: 1, forAll: false }, { cost: 5, type: 3, forAll: false }];
    rolls(30); // 30 < 100 - 60: attack, target 30 % 3 = 0
    expect(R.chooseEnemyAction(fighter({ mIQ: 60, mp: 99 }), spells, party, foes)).toEqual({ kind: "attack", target: 0 });
    rolls(51); // 51 >= 40: spell 51 % 2 = 1 (restore) on its own side, slot 51 % 3 = 0
    expect(R.chooseEnemyAction(fighter({ mIQ: 60, mp: 99 }), spells, party, foes)).toEqual({ kind: "magic", magicIndex: 1, target: 0 });
    rolls(52); // spell 0 (attack) on party slot 52 % 3 = 1, empty, so the next one: 2
    expect(R.chooseEnemyAction(fighter({ mIQ: 60, mp: 99 }), spells, party, foes)).toEqual({ kind: "magic", magicIndex: 0, target: 2 });
    rolls(52); // not enough MP: attack instead
    expect(R.chooseEnemyAction(fighter({ mIQ: 60, mp: 1 }), spells, party, foes)).toEqual({ kind: "attack", target: 2 });
    const sealed = fighter({ mIQ: 100, mp: 99 });
    R.applyStatus(sealed, 0x02, 3);
    rolls(52);
    expect(R.chooseEnemyAction(sealed, spells, party, foes).kind).toBe("attack");
  });

  it("puts restoring casters first at 1.5x speed (8-bit)", () => {
    expect(R.turnPriority(fighter({ speed: 40 }), true)).toBe(60);
    expect(R.turnPriority(fighter({ speed: 200 }), true)).toBe(300 & 0xff);
  });

  it("sums the group attack power by distance", () => {
    const p = (attack: number) => fighter({ attack, isPlayer: true });
    expect(R.groupAttackPower(0, [p(80), p(40), p(20)])).toBe(80 + 20 + 5);
    // from the second member: itself, the third, then (index 3) wraps to the first at distance 4
    expect(R.groupAttackPower(1, [p(80), p(40), p(20)])).toBe(40 + 10 + (80 >> 4));
    expect(R.groupAttackPower(0, [p(80), p(40)])).toBe(80 + 20); // the empty slot ends the walk
  });

  it("casts attack spells with side effects, even on a dodge", () => {
    const hero = fighter({ isPlayer: true, speed: 0, lingli: 0 });
    const a = fighter({ hp: 100, luck: 0, speed: 99 }); // will dodge
    const b = fighter({ hp: 100, luck: 0 });
    R.setBattleSides([hero], [a, b]);
    const raw = new Uint8Array(8);
    raw[0] = 30; // 30 HP
    raw[6] = (2 << 4) | 0x01; // sleep for 2 rounds
    // rolls: damage a (dodge), damage b, then status rolls for each hit target
    rolls(0, 40, 70, 70);
    const res = R.castMagic(hero, { type: 1, costByte: 4, isForAll: true, raw }, [a, b]);
    expect(res.get(a)).toEqual({ miss: true, bits: 0x01 });
    expect(res.get(b)?.miss).toBe(false);
    expect([a.hp, b.hp, hero.mp]).toEqual([100, 100 - (30 + ((40 % 30) >> 4)), 995]);
    expect(R.isAsleep(a)).toBe(true);
  });

  it("revives only the fallen and heals only the standing", () => {
    const caster = fighter({ isPlayer: true });
    const down = fighter({ isPlayer: true, hp: 0, maxHP: 200 });
    const up = fighter({ isPlayer: true, hp: 50, maxHP: 200 });
    R.setBattleSides([caster, down, up], []);
    const raw = new Uint8Array(8);
    raw[0] = 50;
    R.castMagic(caster, { type: 4, costByte: 0, isForAll: true, raw }, [caster, down, up]);
    expect([down.hp, up.hp]).toEqual([100, 50]);
    R.castMagic(caster, { type: 3, costByte: 0, isForAll: false, raw }, [up]);
    expect(up.hp).toBe(100);
  });
});
