// End-to-end flows against real resources (skipped without FMJ_DATA_DIR).
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { loadRealResources, memorySaves } from "./helpers";

const res = loadRealResources();

function boot(seed = 11) {
  let s = seed;
  const saves = memorySaves();
  const e = createEngine({ resources: res!, saves, random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
  return { e, saves };
}
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 2) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };
const top = (e: Engine) => e.game.getCurScreen().constructor.name;

/** Title -> new game -> skip intro -> play until the opening script hands over control. */
function startGame(e: Engine) {
  tick(e, 400);
  press(e, Keys.ENTER, 20);
  press(e, Keys.CANCEL);
  for (let i = 0; i < 400 && (e.game.mainScene.scriptProcess.running || e.game.playerList.length === 0); i++) press(e, Keys.ENTER, 6);
  expect(e.game.mainScene.scriptProcess.running).toBe(false);
  expect(e.game.playerList.length).toBeGreaterThan(0);
}

describe.skipIf(!res)("game flows", () => {
  it("opens every in-game menu without errors", () => {
    const { e } = boot();
    startGame(e);
    /** Close everything, then open main-menu entry `n` (0 status, 1 magic, 2 goods, 3 system). */
    const openEntry = (n: number) => {
      for (let i = 0; i < 6 && top(e) !== "ScreenMainGame"; i++) press(e, Keys.CANCEL);
      press(e, Keys.CANCEL);
      expect(top(e)).toBe("ScreenGameMainMenu");
      for (let i = 0; i < n; i++) press(e, Keys.DOWN);
      press(e, Keys.ENTER);
    };
    openEntry(0); press(e, Keys.ENTER);
    expect(top(e)).toBe("ScreenActorState");
    press(e, Keys.PAGEDOWN); press(e, Keys.PAGEUP);
    openEntry(0); press(e, Keys.DOWN); press(e, Keys.ENTER);
    expect(top(e)).toBe("ScreenActorWearing");
    for (let i = 0; i < 8; i++) press(e, Keys.DOWN);
    press(e, Keys.ENTER); // opens the equipment list for the slot
    openEntry(1); // magic: opens the list only if the hero knows spells
    expect(["ScreenMagic", "ScreenGameMainMenu"]).toContain(top(e));
    openEntry(2); press(e, Keys.ENTER); // use
    openEntry(2); press(e, Keys.DOWN); press(e, Keys.ENTER); // equip
    openEntry(3);
    expect(top(e)).toBe("ScreenMenuSystem");
    press(e, Keys.ENTER);
    expect(top(e)).toBe("ScreenSaveLoadGame");
    for (let i = 0; i < 6 && top(e) !== "ScreenMainGame"; i++) press(e, Keys.CANCEL);
    expect(top(e)).toBe("ScreenMainGame");
    tick(e, 20);
  });

  it("saves from the menu and loads the save back", () => {
    const { e, saves } = boot();
    startGame(e);
    const before = e.game.playerList.map((p) => [p.name, p.level, p.hp, p.posInMap.x, p.posInMap.y]);
    const map = e.game.mainScene.currentMap?.mapName;
    press(e, Keys.CANCEL);
    for (let i = 0; i < 3; i++) press(e, Keys.DOWN); // 系统
    press(e, Keys.ENTER); // system menu
    press(e, Keys.DOWN); press(e, Keys.ENTER); // 存储进度
    expect(top(e)).toBe("ScreenSaveLoadGame");
    press(e, Keys.ENTER); // slot 1
    expect(saves.has("sav/fmjsave0")).toBe(true);
    expect(top(e)).toBe("ScreenMainGame");

    // fresh engine, same storage: title -> 再续前缘 -> slot 1
    let s = 5;
    const e2 = createEngine({ resources: res!, saves, random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
    tick(e2, 400);
    press(e2, Keys.DOWN); press(e2, Keys.ENTER);
    expect(top(e2)).toBe("ScreenSaveLoadGame");
    press(e2, Keys.ENTER);
    tick(e2, 10);
    expect(top(e2)).toBe("ScreenMainGame");
    expect(e2.game.mainScene.currentMap?.mapName).toBe(map);
    expect(e2.game.playerList.map((p) => [p.name, p.level, p.hp, p.posInMap.x, p.posInMap.y])).toEqual(before);
    tick(e2, 50);
  });

  it("wins and flees random battles without errors", () => {
    const { e } = boot(99);
    startGame(e);
    const all = DatLib.instance.listResources();
    const monsters = all.filter((r) => r.resType === 3 && r.type === 3).map((r) => r.index).slice(0, 3);
    for (const mode of ["auto", "flee", "auto"]) {
      Combat.InitFight(e.game.vm, monsters, 1, 2, 3);
      let started = false;
      for (let i = 0; i < 500 && !started; i++) started = Combat.StartNewRandomCombat();
      expect(started).toBe(true);
      for (let i = 0; i < 3000 && Combat.IsActive(); i++) {
        if (mode === "flee") { press(e, Keys.DOWN); press(e, Keys.ENTER); press(e, Keys.DOWN); press(e, Keys.DOWN); press(e, Keys.DOWN); press(e, Keys.ENTER); }
        else { press(e, Keys.DOWN); press(e, Keys.ENTER); press(e, Keys.ENTER); }
        tick(e, 5);
      }
      expect(Combat.IsActive()).toBe(false);
      if (top(e) !== "ScreenMainGame") break; // party wiped: back at the title, still fine
      e.game.playerList.forEach((p) => (p.hp = p.maxHP));
    }
  });
});
