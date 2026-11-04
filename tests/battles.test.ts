// Dev tool (needs FMJ_DATA_DIR): fights many random battles in the real game
// with the original battle rules, with every monster group in the archive,
// and checks they all end. Counts enemy spells and statuses on the way.
import { describe, expect, it } from "vitest";
import { createEngine, Keys } from "../src/engine";
import { Combat } from "../src/engine/fmj/combat/Combat";
import * as R from "../src/engine/fmj/combat/OriginalRules";
import { DatLib } from "../src/engine/fmj/lib/DatLib";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { loadRealResources, memorySaves } from "./helpers";

const res = loadRealResources();

describe.skipIf(!res)("battles with the original rules (real archive)", () => {
  it("random battles across all monsters end, with enemy spells and statuses", () => {
    EngineSettings.originalDamageFormula = true;
    let s = 11;
    const e = createEngine({ resources: res!, saves: memorySaves(), random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
    const tick = (k: number) => { for (let i = 0; i < k; i++) e.update(); };
    const press = (key: number) => { e.keyDown(key as never); tick(1); e.keyUp(key as never); tick(1); };
    tick(400);
    press(Keys.ENTER);
    tick(20);
    press(Keys.CANCEL);
    for (let i = 0; i < 60; i++) { tick(20); press(Keys.ENTER); }
    expect(e.game.playerList.length).toBeGreaterThan(0);

    const counts = { battles: 0, enemySpells: 0, partyStatusTurns: 0 };
    const applyStatus = R.applyStatus;
    const monstersNow = () => ((Combat.current as unknown as { mMonsterList: { mp: number; isVisiable: boolean }[] }).mMonsterList ?? []).filter((m) => m.isVisiable);

    const all = DatLib.instance.listResources();
    const monsters = all.filter((r) => r.resType === 3 && r.type === 3).map((r) => r.index);
    const pics4 = all.filter((r) => r.resType === 11 && r.type === 4).map((r) => r.index);
    const party = e.game.playerList;
    for (let b = 0; b < 40; b++) {
      // strong party so long fights finish; refill between battles
      for (const p of party) {
        p.maxHP = 999; p.hp = 999; p.maxMP = 999; p.mp = 999; p.attack = 900; p.defend = 120; p.speed = 60;
      }
      const group = [0, 1, 2].map((k) => monsters[(b * 3 + k) % monsters.length]);
      Combat.InitFight(e.game.vm, group, pics4[0], pics4[1] ?? pics4[0], pics4[2] ?? pics4[0]);
      let started = false;
      for (let i = 0; i < 400 && !started; i++) started = Combat.StartNewRandomCombat();
      expect(started).toBe(true);
      counts.battles++;
      // keep bosses beatable for a one-member party
      for (const m of (Combat.current as unknown as { mMonsterList: { hp: number; maxHP: number }[] }).mMonsterList) {
        m.maxHP = Math.min(m.maxHP, 300);
        if (m.hp > 0) m.hp = m.maxHP;
      }
      let mpBefore = monstersNow().map((m) => m.mp);
      for (let i = 0; i < 6000 && Combat.IsActive(); i++) {
        // auto attack every round; occasionally confuse or sleep someone
        if (i % 200 === 7) applyStatus(party[0], i % 400 === 7 ? 0x04 : 0x01, 1);
        press(Keys.ENTER);
        tick(6);
        for (const p of party) if (p.ostatus.some((x, k) => k >= 3 && x !== 0xff)) counts.partyStatusTurns++;
        const mp = monstersNow().map((m) => m.mp);
        mp.forEach((v, k) => { if (mpBefore[k] !== undefined && v < mpBefore[k]) counts.enemySpells++; });
        mpBefore = mp;
        for (const p of party) if (p.hp < 300) p.hp = 999;
      }
      if (Combat.IsActive()) { const c = Combat.current as unknown as { stateName: string; mMonsterList: { name: string; hp: number; maxHP: number; defend: number; isVisiable: boolean; ostatus: Uint8Array }[]; mActionQueue: unknown[] }; console.log("STUCK", b, c.stateName, JSON.stringify(c.mMonsterList.map((m) => [m.name, m.hp, m.maxHP, m.defend, m.isVisiable, [...m.ostatus]])), c.mActionQueue.length, JSON.stringify(party.map((p) => [p.hp, [...p.ostatus]]))); }
      expect(Combat.IsActive()).toBe(false);
    }
    console.log("battles", JSON.stringify(counts));
    expect(counts.enemySpells).toBeGreaterThan(0);
  }, 120_000);
});
