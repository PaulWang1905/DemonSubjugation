// Dev tool: forces a random battle and snapshots it (needs FMJ_DATA_DIR + FMJ_SNAPSHOT_DIR).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, Keys } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { loadRealResources, memorySaves } from "./helpers";
import { encodePng } from "./png";

const res = loadRealResources();
const outDir = process.env.FMJ_SNAPSHOT_DIR;

describe.skipIf(!res || !outDir)("combat snapshots", () => {
  it("fights", () => {
    mkdirSync(outDir!, { recursive: true });
    let s = 3;
    const e = createEngine({ resources: res!, saves: memorySaves(), random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
    let n = 0;
    const shot = (label: string) => writeFileSync(join(outDir!, `c${String(n++).padStart(2, "0")}-${label}.png`), encodePng(e.render(), 160, 96, 1));
    const tick = (k: number) => { for (let i = 0; i < k; i++) { e.update(); e.render(); } };
    const press = (key: number) => { e.keyDown(key as never); tick(1); e.keyUp(key as never); tick(1); };
    tick(400);
    press(Keys.ENTER);
    tick(20);
    press(Keys.CANCEL);
    for (let i = 0; i < 60; i++) { tick(20); press(Keys.ENTER); }

    const all = DatLib.instance.listResources();
    const monsters = all.filter((r) => r.resType === 3 && r.type === 3).map((r) => r.index).slice(0, 4);
    const pics4 = all.filter((r) => r.resType === 11 && r.type === 4).map((r) => r.index);
    Combat.InitFight(e.game.vm, monsters, pics4[0], pics4[1] ?? pics4[0], pics4[2] ?? pics4[0]);
    let started = false;
    for (let i = 0; i < 200 && !started; i++) started = Combat.StartNewRandomCombat();
    expect(started).toBe(true);
    shot("start");
    for (let i = 0; i < 1500; i++) {
      press(Keys.ENTER);
      tick(8);
      if (i > 90 && i % 10 === 0 && n < 40) shot(`round${i}`);
      if (!Combat.IsActive()) break;
    }
    expect(Combat.IsActive()).toBe(false);
  });
});
