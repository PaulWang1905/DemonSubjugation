// Dev tool: with FMJ_DATA_DIR and FMJ_SNAPSHOT_DIR set, plays the opening of
// the game and writes PNG frames for eyeballing. Skipped otherwise.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, Keys } from "../src/engine";
import { loadRealResources, memorySaves } from "./helpers";
import { encodePng } from "./png";

const res = loadRealResources();
const outDir = process.env.FMJ_SNAPSHOT_DIR;

describe.skipIf(!res || !outDir)("snapshots", () => {
  it("writes frames", () => {
    mkdirSync(outDir!, { recursive: true });
    let s = 7;
    const e = createEngine({
      resources: res!,
      saves: memorySaves(),
      random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32),
    });
    let n = 0;
    const shot = (label: string) => {
      const f = e.render();
      writeFileSync(join(outDir!, `${String(n++).padStart(2, "0")}-${label}.png`), encodePng(f, 160, 96, 1));
    };
    const tick = (k: number) => {
      for (let i = 0; i < k; i++) e.update();
    };
    const press = (key: number) => {
      e.keyDown(key as never);
      tick(1);
      e.keyUp(key as never);
      tick(1);
    };
    tick(30);
    shot("logo");
    tick(400);
    shot("menu");
    press(Keys.ENTER);
    tick(20);
    shot("start");
    for (let i = 0; i < 3; i++) {
      tick(60);
      shot(`story${i}`);
    }
    press(Keys.CANCEL); // skip the scrolling story
    for (let i = 0; i < 40; i++) {
      tick(25);
      if (i % 4 === 0) shot(`play${i}`);
      press(Keys.ENTER);
    }
    // wander around until something happens (random fights, events)
    const dirs = [Keys.RIGHT, Keys.DOWN, Keys.LEFT, Keys.UP];
    for (let i = 0; i < 200; i++) {
      press(dirs[Math.floor(i / 6) % 4]);
      tick(3);
      if (i % 25 === 0) shot(`walk${i}`);
      if (i % 9 === 0) press(Keys.ENTER);
    }
    expect(e.game.playerList.length).toBeGreaterThan(0);
  });
});
