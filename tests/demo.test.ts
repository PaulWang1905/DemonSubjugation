// Plays through the original "Lantern Path" demo built by the editor's
// template code. Runs without any real game files (blank fonts).
import { describe, expect, it } from "vitest";
import { createEngine, inspectDatLib, Keys, type Engine } from "../src/engine";
import { Player } from "../src/engine/fmj/characters/Player";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

function boot(seed = 7): Engine {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return createEngine({ resources: { datLib: writeLib(lanternPath()), ...blankFonts }, saves: memorySaves(), random });
}
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };
const settle = (e: Engine) => { for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4); };
const event = (e: Engine, id: number) => { e.game.mainScene.triggerEvent(id); settle(e); };
const top = (e: Engine) => e.game.getCurScreen().constructor.name;

describe("Lantern Path demo", () => {
  it("builds a valid, playable archive", () => {
    const lib = writeLib(lanternPath());
    const info = inspectDatLib(lib);
    expect(info.playable).toBe(true);
    expect(info.maps).toBe(2);
    expect(boot().checkScripts()).toEqual([]);
  });

  it("can be played to the end", () => {
    const e = boot();
    tick(e, 120); // logos
    expect(top(e)).toBe("ScreenMenu");
    press(e, Keys.ENTER, 10);
    settle(e);
    const scene = () => e.game.mainScene;
    expect(scene().currentMap?.mapName).toBe("HAMLET");
    expect(e.game.playerList.map((p) => p.name)).toEqual(["Mira"]);
    expect(e.game.playerList[0].posInMap).toMatchObject({ x: 7, y: 7 });

    // leaving before talking to the elder is refused
    event(e, 41);
    expect(scene().currentMap?.mapName).toBe("HAMLET");

    event(e, 1); // elder gives the quest
    expect(ScriptResources.globalEvents[2]).toBe(true);

    event(e, 3); // chest
    expect(Player.sGoodsList.getGoodsNum(9, 1)).toBe(1);
    expect(Player.sGoodsList.getGoodsNum(9, 2)).toBe(1);
    event(e, 3); // already empty
    expect(Player.sGoodsList.getGoodsNum(9, 1)).toBe(1);

    scene().triggerEvent(2); // shop opens a goods list
    for (let i = 0; i < 20 && top(e) === "ScreenMainGame"; i++) press(e, Keys.ENTER, 3);
    expect(top(e)).toBe("ScreenGoodsList");
    for (let i = 0; i < 5 && top(e) !== "ScreenMainGame"; i++) press(e, Keys.CANCEL, 3);
    settle(e);

    event(e, 41); // to the glade
    expect(scene().currentMap?.mapName).toBe("GLADE");
    expect(e.game.playerList[0].posInMap).toMatchObject({ x: 5, y: 7 });

    scene().triggerEvent(1); // the stone: scripted fight
    for (let i = 0; i < 50 && !Combat.IsActive(); i++) press(e, Keys.ENTER, 3);
    expect(Combat.IsActive()).toBe(true);
    Combat.ForceWin();
    for (let i = 0; i < 400 && (Combat.IsActive() || scene().scriptProcess.running); i++) press(e, Keys.ENTER, 3);
    expect(Player.sGoodsList.getGoodsNum(14, 1)).toBe(1);
    expect(ScriptResources.globalEvents[4]).toBe(true);

    event(e, 41); // back home
    expect(scene().currentMap?.mapName).toBe("HAMLET");
    expect(e.game.playerList[0].posInMap).toMatchObject({ x: 15, y: 7 });

    event(e, 1); // hand over the stone
    expect(ScriptResources.globalEvents[9]).toBe(true);
    expect(Player.sGoodsList.getGoodsNum(14, 1)).toBe(0);
    expect(scene().getNPC(4).step).toBe(1); // lantern lit
  });

  it("random battles in the glade can be won", () => {
    const e = boot();
    tick(e, 120);
    press(e, Keys.ENTER, 10);
    settle(e);
    event(e, 1);
    event(e, 41);
    let started = false;
    for (let i = 0; i < 400 && !started; i++) started = Combat.StartNewRandomCombat();
    expect(started).toBe(true);
    for (let i = 0; i < 3000 && Combat.IsActive(); i++) {
      press(e, Keys.ENTER, 2);
      if (i % 20 === 0) e.game.playerList[0].hp = e.game.playerList[0].maxHP; // keep Mira alive
    }
    expect(Combat.IsActive()).toBe(false);
    expect(e.game.playerList[0].currentExp + e.game.playerList[0].level).toBeGreaterThan(1);
  });
});
