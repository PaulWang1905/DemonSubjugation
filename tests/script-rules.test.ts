// Script commands under the original engine rules: byte-wide variables,
// money limits, goods commands (see BA4988/fmj-engine engine_cmd_*.c).
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { assemble } from "../src/editor/format/gut";
import { putEntry, writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { Player } from "../src/engine/fmj/characters/Player";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { ScriptProcess } from "../src/engine/fmj/script/ScriptProcess";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, wait = 3) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, wait); };

/** Run `body` as the first story script of the demo and return the engine. */
function run(body: string, original = true): Engine {
  EngineSettings.originalDamageFormula = original;
  const lib = lanternPath();
  const src = `.gut 1 1\n.events 40\n@start:\n  loadmap 1, 1, 4, 4\n  createactor 1, 4, 3\n${body}\n  callback\n`;
  putEntry(lib, { resType: 1, type: 1, index: 1, data: assemble(src) });
  const e = createEngine({ resources: { datLib: writeLib(lib), ...blankFonts }, saves: memorySaves() });
  tick(e, 120);
  press(e, Keys.ENTER, 30);
  for (let i = 0; i < 50 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  EngineSettings.originalDamageFormula = true;
  return e;
}

describe("jumps", () => {
  // A one-instruction script that jumps back to itself `limit` times.
  const loop = (limit: number) => {
    let turns = 0;
    const p = new ScriptProcess([{ len: 0, run: (sp) => (++turns < limit && sp.gotoAddress(0), null) }], [], new Map([[0, 0]]), 0);
    p.start();
    p.process();
    return turns;
  };

  it("run in the same tick, as on the device (伏魔圆梦 counts money in loops)", () => {
    expect(loop(1000)).toBe(1000);
  });

  it("a script looping without waiting runs a bounded number of instructions per tick", () => {
    expect(loop(Infinity)).toBe(ScriptProcess.INSTRUCTIONS_PER_TICK);
  });
});

describe("chapters", () => {
  // CALLCHAPTER runs the chapter before the caller goes on; RETURN ends the
  // running script (handing back to the caller), as in the original.
  it("calls a chapter of type 255 (a byte, as on the device) and returns from it", () => {
    EngineSettings.originalDamageFormula = true;
    const lib = lanternPath();
    const chapter = ".gut 255 3\n.events 1\n@start:\n  set 9, 77\n  return\n  set 11, 1\n";
    const story = ".gut 1 1\n.events 40\n@start:\n  loadmap 1, 1, 4, 4\n  createactor 1, 4, 3\n  callchapter 255, 3\n  set 10, 6\n  return\n  set 12, 1\n  callback\n";
    putEntry(lib, { resType: 1, type: 255, index: 3, data: assemble(chapter) });
    putEntry(lib, { resType: 1, type: 1, index: 1, data: assemble(story) });
    const e = createEngine({ resources: { datLib: writeLib(lib), ...blankFonts }, saves: memorySaves() });
    tick(e, 120);
    press(e, Keys.ENTER, 60); // New game
    expect([9, 10, 11, 12].map((v) => ScriptResources.variables[v])).toEqual([77, 6, 0, 0]);
  });
});

describe("script commands with the original rules", () => {
  it("keeps variables in one byte", () => {
    run("  set 5, 300\n  set 6, 250\n  add 6, 10\n  set 7, 3\n  sub 7, 5");
    expect([ScriptResources.variables[5], ScriptResources.variables[6], ScriptResources.variables[7]]).toEqual([44, 4, 254]);
  });

  it("caps money at 65951 and stops spending at 0", () => {
    run("  gainmoney 70000");
    expect(Player.sMoney).toBe(65951);
    run("  usemoney 5");
    expect(Player.sMoney).toBe(0);
  });

  it("leaves money uncapped for a game made for large sums (伏魔圆梦's check)", () => {
    run("  gainmoney 2000000\n  testmoney 1000000, @abnormal\n  set 1, 1\n  callback\n@abnormal:\n  set 1, 2");
    expect([ScriptResources.variables[1], Player.sMoney]).toEqual([1, 2000000]);
  });

  it("deletegoods takes every one of the item", () => {
    run("  gaingoods 9, 1\n  gaingoods 9, 1\n  gaingoods 9, 1\n  deletegoods 9, 1, @none\n  set 1, 1\n  callback\n@none:\n  set 1, 2");
    expect(Player.sGoodsList.getGoodsNum(9, 1)).toBe(0);
    expect(ScriptResources.variables[1]).toBe(1);
  });

  it("testgoodsnum does nothing when the item is missing", () => {
    run("  set 2, 0\n  testgoodsnum 9, 1, 0, @equal, @more\n  set 2, 1\n  callback\n@equal:\n  set 2, 2\n  callback\n@more:\n  set 2, 3");
    expect(ScriptResources.variables[2]).toBe(1);
  });

  it("fmj.kt's behaviour stays available with the rules off", () => {
    run("  set 5, 300", false);
    expect(ScriptResources.variables[5]).toBe(300);
  });
});
