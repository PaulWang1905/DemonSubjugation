import { afterEach, describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };

function inGame(): Engine {
  let s = 7;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const e = createEngine({ resources: { datLib: writeLib(lanternPath()), ...blankFonts }, saves: memorySaves(), random });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  return e;
}

afterEach(() => {
  EngineSettings.noRandomBattles = false;
  EngineSettings.walkThroughWalls = false;
  EngineSettings.alwaysFull = false;
});

describe("debug menu cheats", () => {
  it("edits party stats within the engine's limits", () => {
    const e = inGame();
    const c = e.cheats;
    expect(c.party()).toHaveLength(1);
    c.setStat(0, "maxHP", 5000);
    c.setStat(0, "hp", 5000);
    c.setStat(0, "attack", 321);
    c.setStat(0, "level", 0);
    const p = c.party()[0];
    expect([p.maxHP, p.hp, p.attack, p.level]).toEqual([999, 999, 321, 1]);
    c.setStat(0, "maxHP", 50);
    expect(c.party()[0].hp).toBe(50);
    e.game.playerList[0].hp = 1;
    c.heal();
    expect(c.party()[0].hp).toBe(50);
    // speed, spirit and luck: to the player, at most 99
    c.setStat(0, "speed", 77);
    c.setStat(0, "lingli", 66);
    c.setStat(0, "luck", 500);
    const q = c.party()[0], pl = e.game.playerList[0];
    expect([q.speed, q.lingli, q.luck]).toEqual([77, 66, 99]);
    expect([pl.speed, pl.lingli, pl.luck]).toEqual([77, 66, 99]);
  });

  it("learns every spell in the member's list", () => {
    const c = inGame().cheats;
    c.learnAllMagic(0);
    const p = c.party()[0];
    expect(p.magicsKnown).toBe(p.magicsTotal);
  });

  it("changes money, items and story flags", () => {
    const c = inGame().cheats;
    c.setMoney(1234);
    expect(c.money()).toBe(1234);
    const item = c.catalogue()[0];
    c.setItemCount(item.type, item.index, 5);
    expect(c.inventory().find((i) => i.type === item.type && i.index === item.index)?.count).toBe(5);
    c.setItemCount(item.type, item.index, 0);
    expect(c.inventory().some((i) => i.type === item.type && i.index === item.index)).toBe(false);
    c.setFlag(77, true);
    expect(c.flags()).toContain(77);
    c.setFlag(77, false);
    expect(c.flags()).not.toContain(77);
    expect(c.location()?.map).toBe("HAMLET");
  });

  it("switches off random battles and keeps the party full", () => {
    const e = inGame();
    e.cheats.setSwitch("noRandomBattles", true);
    let started = false;
    for (let i = 0; i < 2000 && !started; i++) started = Combat.StartNewRandomCombat();
    expect(started).toBe(false);
    e.cheats.setSwitch("alwaysFull", true);
    e.game.playerList[0].hp = 1;
    e.update();
    expect(e.cheats.party()[0].hp).toBe(e.cheats.party()[0].maxHP);
  });

  it("starts each game with the switches off", () => {
    EngineSettings.walkThroughWalls = true;
    expect(inGame().cheats.switches()).toEqual({ noRandomBattles: false, walkThroughWalls: false, alwaysFull: false });
  });
});

describe("round limit of scripted battles (original rules)", () => {
  it("ends as a draw after limit + 1 rounds, without jumping", () => {
    const e = inGame();
    EngineSettings.originalDamageFormula = true;
    const party = e.game.playerList;
    for (const p of party) { p.maxHP = 999; p.hp = 999; p.attack = 1; p.defend = 999; }
    const pics = DatLib.instance.listResources().filter((r) => r.resType === 11 && r.type === 4).map((r) => r.index);
    const monster = DatLib.instance.listResources().find((r) => r.resType === 3 && r.type === 3)!.index;
    let jumped = -1;
    const goto = e.game.gotoAddress.bind(e.game);
    e.game.gotoAddress = (a: number) => { jumped = a; goto(a); };
    Combat.EnterFight(e.game.vm, 2, [monster], [pics[0], pics[0], pics[0]], [0, 0, 0], [0, 0, 0], 111, 222);
    // tough monster so nobody wins
    const m = (Combat.current as unknown as { mMonsterList: { hp: number; maxHP: number; defend: number; attack: number }[] }).mMonsterList.find((x) => x.hp > 0)!;
    m.maxHP = 999; m.hp = 999; m.defend = 999; m.attack = 1;
    let rounds = 0;
    for (let i = 0; i < 4000 && Combat.IsActive(); i++) {
      press(e, Keys.ENTER, 4);
      rounds = (Combat.current as unknown as { mRoundCnt: number } | null)?.mRoundCnt ?? rounds;
    }
    expect(Combat.IsActive()).toBe(false);
    expect(jumped).toBe(-1); // neither the win nor the loss address
    expect(rounds).toBe(2); // rounds 0, 1 and 2 were fought: the limit + 1
  });
});
