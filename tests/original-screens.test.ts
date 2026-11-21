// Screens and pacing that follow the original engine (BA4988/fmj-engine):
// the level-up screens after a battle (engine_reward.c _0022F05D and its
// callers in engine_battle.c _0022C000) and scripted walking (MOVE,
// engine_cmd_scene.c _0020C9C5 / engine_actor.c _0020CF6D).
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { assemble } from "../src/editor/format/gut";
import { putEntry, writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";
import { gainExperience } from "../src/engine/fmj/combat/OriginalRules";
import { CombatSuccess, LearnMagicScreen, LevelupScreen, MessageBox, RewardScreens, TIMER_TICK_MS, type Layer } from "../src/engine/fmj/combat/ui/CombatSuccess";
import { MOVE_TILE_MS } from "../src/engine/fmj/script/ScriptVM";
import type { Player } from "../src/engine/fmj/characters/Player";
import { memorySaves } from "./helpers";

const blankFonts = { hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) };
const tick = (e: Engine, n: number) => {
  for (let i = 0; i < n; i++) e.update();
};
const press = (e: Engine, k: number, wait = 3) => {
  e.keyDown(k as never);
  e.update();
  e.keyUp(k as never);
  tick(e, wait);
};

/** Silent Bell with `body` as its opening script, after New game. */
function start(body: string): Engine {
  const lib = silentBell();
  putEntry(lib, { resType: 1, type: 1, index: 1, data: assemble(`.gut 1 1\n.events 40\n@start:\n${body}\n  callback\n`) });
  const e = createEngine({ resources: { datLib: writeLib(lib), ...blankFonts }, saves: memorySaves() });
  tick(e, 120);
  e.keyDown(Keys.ENTER as never);
  e.update();
  e.keyUp(Keys.ENTER as never);
  return e;
}

const stub = (name: string): Layer & { name: string } => ({ name, draw() {} });
const names = (ls: Layer[]) => ls.map((l) => (l as { name?: string }).name ?? l.constructor.name);

describe("reward screens play like the original's LCD and screen buffer", () => {
  it("boxes pile up until a flip, which leaves the flipped panel alone", () => {
    const s = new RewardScreens([
      { kind: "show", layer: stub("exp") },
      { kind: "show", layer: stub("money") },
      { kind: "wait", ticks: 5 },
      { kind: "show", layer: stub("grew") },
      { kind: "wait", ticks: 2 },
      { kind: "flip", layer: stub("panel") },
      { kind: "wait", ticks: 3 },
      { kind: "show", layer: stub("learnt") },
      { kind: "wait", ticks: 3 },
    ]);
    s.update(0);
    expect(names(s.layers)).toEqual(["exp", "money"]);
    // a wait of n ticks: n + 1 timer messages of 500 ms
    s.update(6 * TIMER_TICK_MS - 1);
    expect(names(s.layers)).toEqual(["exp", "money"]);
    s.update(1);
    expect(names(s.layers)).toEqual(["exp", "money", "grew"]);
    // ... or a key
    s.onKeyUp();
    s.update(0);
    expect(names(s.layers)).toEqual(["panel"]);
    s.onKeyUp();
    s.update(0);
    expect(names(s.layers)).toEqual(["panel", "learnt"]);
    s.onKeyUp();
    expect(s.update(0)).toBe(true);
  });

  it("puts the message boxes where _0022A8FA puts them", () => {
    start("  loadmap 1, 1, 2, 1\n  createactor 1, 4, 3");
    // picture 2-8 is 3×24: style 0 at y 18, 1 at 46, 2 (items, level-ups) at 32
    expect([0, 1, 2].map((s) => new MessageBox(s as 0 | 1 | 2, "Hi!").top)).toEqual([18, 46, 32]);
    const b = new MessageBox(2, "Hi!");
    // 80 - 3*4 - 3 - 2 .. 80 + 3*4 + 2; the text 1 pixel right of the rectangle's side, 3 below its top
    expect([b.left, b.right, b.textX, b.textY]).toEqual([63, 94, 67, 36]);
  });

  it("after a battle two members level up: Kai's 'grew' covers Mira's spell, then Kai's panel alone", () => {
    const e = start("  loadmap 1, 1, 2, 1\n  createactor 1, 4, 3\n  createactor 2, 4, 3");
    tick(e, 60);
    const party = e.game.mainScene.playerList as Player[];
    expect(party.length).toBe(2);
    const [a, b] = party;
    // the first member learns a spell at the next level (as Mira did in the test)
    const learnAt = (p: Player) => {
      for (let l = p.level + 1; l <= p.levelupChain.maxLevel; l++) if (p.levelupChain.getLearnMagicNum(l) > p.levelupChain.getLearnMagicNum(p.level)) return l;
      return 0;
    };
    const target = learnAt(a);
    expect(target).toBeGreaterThan(0);
    const expFor = (p: Player, level: number) => {
      let need = 0;
      for (let l = p.level; l < level; l++) need += p.levelupChain.getNextLevelExp(l);
      return need + 1 - p.currentExp;
    };
    expect(gainExperience(a, expFor(a, target))).toBe(true);
    expect(gainExperience(b, expFor(b, b.level + 1))).toBe(true);
    const learnt = a.levelupChain.getLearnMagicNum(a.level) - a.levelupChain.getLearnMagicNum(a.level - 1);
    expect(learnt).toBeGreaterThan(0);

    const cs = new CombatSuccess(e.game as never, 10, 5, [], [a, b]);
    const seen: string[][] = [];
    const kinds = () => cs.layers.map((l) => (l instanceof MessageBox ? "box" : l instanceof LevelupScreen ? "panel" : l instanceof LearnMagicScreen ? "learnt" : "?"));
    for (let i = 0; i < 400 && !cs.update(40); i++) {
      const k = kinds().join(" ");
      if (seen[seen.length - 1]?.join(" ") !== k) seen.push(kinds());
    }
    expect(seen.map((s) => s.join(" "))).toEqual([
      "box box", // experience and money
      "box box box", // "Mira grew!" over them
      "panel", // the flip: the battle scene and Mira's panel only
      ...Array.from({ length: learnt }, (_, i) => ["panel", ...Array(i + 1).fill("learnt")].join(" ")),
      ["panel", ...Array(learnt).fill("learnt"), "box"].join(" "), // "Kai grew!" over Mira's spell, as on the device
      "panel", // Kai's panel
    ]);
  });

  it("ACTORLAYERUP shows 'grew', then the panel, then the spells, each for some ticks or a key", () => {
    const e = start("  loadmap 1, 1, 2, 1\n  createactor 1, 4, 3\n  actorlayerup 1, 3\n  set 7, 1");
    tick(e, 30);
    const vm = e.game.mainScene.scriptProcess;
    expect(vm.running).toBe(true);
    // "grew" waits 2 ticks (up to 1.5 s), the panel 3 (2 s): still on after 1 s
    tick(e, 25);
    expect(vm.running).toBe(true);
    // keys skip the waits; without them, they end on their own
    press(e, Keys.ENTER, 2);
    tick(e, 250);
    expect(vm.running).toBe(false);
  });
});

describe("scripted walking (MOVE) goes at the original's pace", () => {
  it("takes 150 ms a tile, the first one too, stepping the walking frame each tile", () => {
    const e = start("  loadmap 1, 1, 2, 1\n  createactor 1, 4, 3\n  createnpc 1, 2, 4, 6\n  move 1, 4, 2\n  set 7, 1");
    const npc = () => e.game.mainScene.getNPC(1) as unknown as { posInMap: { x: number; y: number }; mWalkingSprite: { step: number } };
    for (let i = 0; i < 40 && !(npc() && npc().posInMap.y === 6); i++) e.update();
    const times: number[] = [];
    const steps: number[] = [];
    let y = 6;
    for (let t = 0; t <= 1000; t += 40) {
      e.update();
      if (npc().posInMap.y !== y) {
        y = npc().posInMap.y;
        times.push(t);
        steps.push(npc().mWalkingSprite.step);
      }
    }
    expect(y).toBe(2);
    expect(times.length).toBe(4);
    // one tile per 150 ms on average (40 ms engine ticks)
    expect(times[3] - times[0]).toBeGreaterThanOrEqual(3 * MOVE_TILE_MS - 40);
    expect(times[3] - times[0]).toBeLessThanOrEqual(3 * MOVE_TILE_MS + 40);
    expect(times[0]).toBeGreaterThanOrEqual(MOVE_TILE_MS - 80);
    // the walking frame advances once a tile
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBe((steps[i - 1] + 1) % 4);
  });
});
