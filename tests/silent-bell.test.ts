// Plays through "The Silent Bell", the built-in demo, with blank fonts.
import { describe, expect, it } from "vitest";
import { createEngine, inspectDatLib, Keys, type Engine } from "../src/engine";
import { Player } from "../src/engine/fmj/characters/Player";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

function boot(seed = 7): Engine {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return createEngine({ resources: { datLib: writeLib(silentBell()), ...blankFonts }, saves: memorySaves(), random });
}
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };
const settle = (e: Engine) => { for (let i = 0; i < 300 && e.game.mainScene.scriptProcess.running && !Combat.IsActive(); i++) press(e, Keys.ENTER, 4); };
const event = (e: Engine, id: number) => { e.game.mainScene.triggerEvent(id); settle(e); };
const winFight = (e: Engine) => {
  for (let i = 0; i < 60 && !Combat.IsActive(); i++) press(e, Keys.ENTER, 3);
  expect(Combat.IsActive()).toBe(true);
  Combat.ForceWin();
  for (let i = 0; i < 600 && (Combat.IsActive() || e.game.mainScene.scriptProcess.running); i++) press(e, Keys.ENTER, 3);
};
const where = (e: Engine) => e.game.mainScene.currentMap?.mapName;
const pos = (e: Engine) => e.game.playerList[0].posInMap;

describe("The Silent Bell", () => {
  it("builds a valid archive whose scripts all compile", () => {
    const info = inspectDatLib(writeLib(silentBell()));
    expect(info).toMatchObject({ playable: true, maps: 5, scripts: 5 });
    expect(boot().checkScripts()).toEqual([]);
  });

  it("lets you walk to the elder and talk with the keys", () => {
    const e = boot();
    tick(e, 120);
    press(e, Keys.ENTER, 10);
    settle(e);
    expect(pos(e)).toMatchObject({ x: 9, y: 7 });
    for (let i = 0; i < 4; i++) press(e, Keys.RIGHT, 2);
    expect(pos(e)).toMatchObject({ x: 13, y: 7 });
    press(e, Keys.DOWN, 2); // the elder stands below: Rin turns to face her
    expect(pos(e)).toMatchObject({ x: 13, y: 7 });
    press(e, Keys.ENTER, 4);
    expect(e.game.mainScene.scriptProcess.running).toBe(true);
    settle(e);
    expect(ScriptResources.globalEvents[2]).toBe(true);
    for (let i = 0; i < 9; i++) press(e, Keys.RIGHT, 2); // along the road east
    settle(e);
    expect(where(e)).toBe("WHISPERWOOD");
  });

  it("can be played from start to finish", () => {
    const e = boot();
    tick(e, 120);
    press(e, Keys.ENTER, 10);
    settle(e);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: 9, y: 7 });
    event(e, 41); // the east road needs the elder first
    expect(where(e)).toBe("BELLHAVEN");
    event(e, 1); // quest
    expect(ScriptResources.globalEvents[2]).toBe(true);
    expect(Player.sMoney).toBe(60);
    event(e, 6); // chest
    expect(Player.sGoodsList.getGoodsNum(9, 1)).toBe(3);

    event(e, 41); // Whisperwood
    expect(where(e)).toBe("WHISPERWOOD");
    expect(pos(e)).toMatchObject({ x: 4, y: 8 });
    event(e, 3); // the stag will not fight Rin alone
    expect(Combat.IsActive()).toBe(false);
    e.game.mainScene.triggerEvent(1); // Bram and the wolves
    winFight(e);
    expect(e.game.playerList.map((p) => p.name)).toEqual(["Rin", "Bram"]);
    e.game.mainScene.triggerEvent(3); // the Hollow Stag
    winFight(e);
    expect(ScriptResources.globalEvents[31]).toBe(true);
    event(e, 41);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: 21, y: 7 });

    event(e, 7); // Bram moves the boulder
    expect(ScriptResources.globalEvents[13]).toBe(true);
    event(e, 42); // the quarry
    expect(where(e)).toBe("OLD QUARRY");
    expect(pos(e)).toMatchObject({ x: 10, y: 15 });
    event(e, 1); // wrong lever first: they reset
    expect(ScriptResources.variables[10]).toBe(0);
    if (Combat.IsActive()) winFight(e);
    event(e, 2); // the high one
    event(e, 1); // the west one
    event(e, 3); // the east one
    expect(ScriptResources.globalEvents[21]).toBe(true);
    expect(e.game.mainScene.getNPC(4).isEmpty).toBe(true); // the gate is gone
    event(e, 6);
    expect(Player.sGoodsList.getGoodsNum(2, 2)).toBe(1);
    e.game.mainScene.triggerEvent(7); // the Ore Golem
    winFight(e);
    expect(Player.sGoodsList.getGoodsNum(14, 4)).toBe(1);
    event(e, 41);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: 5, y: 3 });

    event(e, 43); // no ferry yet
    expect(where(e)).toBe("BELLHAVEN");
    event(e, 5); // Joss takes the token
    expect(ScriptResources.globalEvents[23]).toBe(true);
    event(e, 43);
    expect(where(e)).toBe("THE MIRE");
    expect(pos(e)).toMatchObject({ x: 6, y: 3 });
    e.game.playerList[0].hp = 1;
    event(e, 1); // Sela heals
    expect(e.game.playerList[0].hp).toBe(e.game.playerList[0].maxHP);
    e.game.mainScene.triggerEvent(3); // the Mire Witch
    winFight(e);
    expect(ScriptResources.globalEvents[33]).toBe(true);
    event(e, 41);
    expect(where(e)).toBe("BELLHAVEN");
    expect(pos(e)).toMatchObject({ x: 12, y: 14 });

    event(e, 44); // the tower opens
    expect(where(e)).toBe("BELL TOWER");
    expect(pos(e)).toMatchObject({ x: 8, y: 9 });
    e.game.mainScene.triggerEvent(1); // the Fog Warden
    winFight(e);
    expect(ScriptResources.globalEvents[40]).toBe(true);
    settle(e);
    expect(where(e)).toBe("BELLHAVEN");
    expect(Player.sGoodsList.getGoodsNum(14, 1)).toBe(0);
  });
});
