// The wider map view: more of the map around the device's 160x96 screen.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEngine, Keys, type Engine } from "../src/engine";
import { writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { memorySaves } from "./helpers";

const f = (n: string) => new Uint8Array(readFileSync("public/fonts/" + n));
const tick = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.update(); };
const press = (e: Engine, k: number, w = 4) => { e.keyDown(k as never); e.update(); e.keyUp(k as never); tick(e, w); };

let seed = 7;
function game(): Engine {
  seed = 7;
  const e = createEngine({ resources: { datLib: writeLib(silentBell()), hzk16: f("unifont/cjk16.bin"), asc16: f("retro/latin16.bin") }, saves: memorySaves(), random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
  tick(e, 120);
  press(e, Keys.ENTER, 10);
  return e;
}

/** The 160x96 screen inside the wide frame, and the normal frame, compared on the map area (x 8-151). */
function centreMatches(e: Engine, mx: number, my: number): boolean {
  e.setView(0, 0);
  const plain = Uint32Array.from(new Uint32Array(e.render().buffer.slice(0)));
  e.setView(mx, my);
  const wide = new Uint32Array(e.render().buffer.slice(0));
  const W = e.width;
  for (let y = 0; y < 96; y++) for (let x = 8; x < 152; x++) if (wide[(y + 16 * my) * W + x + 16 * mx] !== plain[y * 160 + x]) return false;
  return true;
}

/** Whether the left margin (inside the border stripes) is all one colour. */
function marginBlank(e: Engine, mx: number): boolean {
  const px = new Uint32Array(e.render().buffer.slice(0));
  const W = e.width;
  const first = px[8];
  for (let y = 0; y < e.height; y++) for (let x = 8; x < 16 * mx; x++) if (px[y * W + x] !== first) return false;
  return true;
}

afterEach(() => {
  if (Combat.IsActive()) Combat.FightDisable?.();
});

describe("wider map view", () => {
  it("draws more of the map and keeps dialogue and menus as on the device", () => {
    const e = game();
    for (let i = 0; i < 3; i++) press(e, Keys.ENTER, 8); // the opening dialogue
    for (const [mx, my] of [[2, 1], [4, 2]]) {
      e.setView(mx, my);
      expect([e.width, e.height]).toEqual([160 + 32 * mx, 96 + 32 * my]);
      expect(marginBlank(e, mx)).toBe(false); // map around it
      expect(centreMatches(e, mx, my)).toBe(true);
    }
    for (let i = 0; i < 300 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
    press(e, Keys.CANCEL, 4); // the main menu over the map
    expect(centreMatches(e, 4, 2)).toBe(true);
    // text positions follow the frame
    e.setView(0, 0);
    const marks = e.textLayer().map((m) => [m.x, m.y]);
    e.setView(4, 2);
    expect(e.textLayer().map((m) => [m.x, m.y])).toEqual(marks.map(([x, y]) => [x + 64, y + 32]));
  });

  it("leaves the margins plain when the screen is not the map", () => {
    const e = game();
    for (let i = 0; i < 300 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
    const all = DatLib.instance.listResources();
    const monsters = all.filter((r) => r.resType === 3 && r.type === 3).map((r) => r.index);
    const pics = all.filter((r) => r.resType === 11 && r.type === 4).map((r) => r.index);
    expect(monsters.length).toBeGreaterThan(0);
    Combat.FightEnable();
    Combat.InitFight(e.game.vm, monsters.slice(0, 3), pics[0] ?? 1, pics[1] ?? pics[0] ?? 1, pics[2] ?? pics[0] ?? 1);
    let started = false;
    for (let i = 0; i < 400 && !started; i++) started = Combat.StartNewRandomCombat();
    expect(started).toBe(true);
    tick(e, 10);
    e.setView(4, 2);
    expect(marginBlank(e, 4)).toBe(true);
    expect(centreMatches(e, 4, 2)).toBe(true);
  });
});
