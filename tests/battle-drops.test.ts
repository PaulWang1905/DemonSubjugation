// Winning a battle can leave the enemies' items, with the original rules
// (the default) and with fmj.kt's: the defeated enemies are no longer
// visible by then, and must still count.
import { describe, expect, it } from "vitest";
import { createEngine, Keys } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { Player } from "../src/engine/fmj/characters/Player";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };

function drops(original: boolean): { battles: number; herbs: number } {
  EngineSettings.originalDamageFormula = original;
  let s = 5;
  const e = createEngine({ resources: { datLib: writeLib(lanternPath()), ...blankFonts }, saves: memorySaves(), random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
  const tick = (k: number) => { for (let i = 0; i < k; i++) e.update(); };
  const press = (key: number, wait = 1) => { e.keyDown(key as never); tick(1); e.keyUp(key as never); tick(wait); };
  tick(120);
  press(Keys.ENTER, 10);
  for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(Keys.ENTER, 4);
  const party = e.game.playerList;
  const herbs = () => Player.sGoodsList.getGoodsNum(9, 1);
  const start = herbs();
  let battles = 0;
  for (let b = 0; b < 30; b++) {
    for (const p of party) { p.maxHP = 999; p.hp = 999; p.attack = 900; p.speed = 90; p.luck = 60; }
    Combat.InitFight(e.game.vm, [2, 2, 2], 1, 1, 1); // Shellbugs, which carry a herb
    let started = false;
    for (let i = 0; i < 400 && !started; i++) started = Combat.StartNewRandomCombat();
    expect(started).toBe(true);
    for (let i = 0; i < 3000 && Combat.IsActive(); i++) press(Keys.ENTER, 4);
    expect(Combat.IsActive()).toBe(false);
    battles++;
  }
  EngineSettings.originalDamageFormula = true;
  return { battles, herbs: herbs() - start };
}

describe("battle drops", () => {
  it("leave items with the original rules", () => {
    const r = drops(true);
    expect(r.herbs).toBeGreaterThan(0);
  });
  it("leave items with fmj.kt's rules", () => {
    const r = drops(false);
    expect(r.herbs).toBeGreaterThan(0);
  });
});
