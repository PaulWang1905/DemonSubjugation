// Runs the real engine against user-supplied resources (skipped without them).
import { describe, expect, it } from "vitest";
import { createEngine, inspectDatLib, Keys, type Engine } from "../src/engine";
import { loadRealResources, memorySaves } from "./helpers";

const res = loadRealResources();

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function press(e: Engine, key: number): void {
  e.keyDown(key as never);
  e.update();
  e.keyUp(key as never);
  e.update();
}

describe.skipIf(!res)("integration with real resources", () => {
  it("indexes the archive", () => {
    const info = inspectDatLib(res!.datLib);
    expect(info.resources).toBeGreaterThan(100);
    expect(info.scripts).toBeGreaterThan(0);
    expect(info.maps).toBeGreaterThan(0);
  });

  it("compiles every script", () => {
    const e = createEngine({ resources: res!, saves: memorySaves(), random: seeded(1) });
    expect(e.checkScripts()).toEqual([]);
  });

  it("boots, starts a new game and plays for a while", () => {
    const saves = memorySaves();
    const e = createEngine({ resources: res!, saves, random: seeded(42) });
    // logo animations
    for (let i = 0; i < 400; i++) e.update();
    const frame = e.render();
    expect(frame.length).toBe(160 * 96 * 4);
    // title menu -> new game
    press(e, Keys.ENTER);
    for (let i = 0; i < 50; i++) e.update();
    // advance the opening dialogue / scripts
    const dirs = [Keys.RIGHT, Keys.DOWN, Keys.LEFT, Keys.UP];
    for (let i = 0; i < 3000; i++) {
      if (i % 7 === 0) press(e, Keys.ENTER);
      else if (i % 11 === 0) press(e, dirs[(i / 11) % 4 | 0]);
      else e.update();
      e.render();
    }
    expect(e.game.playerList.length).toBeGreaterThan(0);
  });
});
