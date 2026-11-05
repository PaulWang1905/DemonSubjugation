// NPC wandering under the original engine rules (_00215A79, _00215EDE).
import { describe, expect, it } from "vitest";
import { NPC } from "../src/engine/fmj/characters/NPC";
import { CharacterState } from "../src/engine/fmj/characters/Character";
import { Direction } from "../src/engine/fmj/characters/Direction";
import { EngineSettings } from "../src/engine/fmj/config/EngineSettings";
import { setPlatform } from "../src/engine/java";
import { memorySaves } from "./helpers";

describe("NPC wandering (original rules)", () => {
  it("waits its delay, then walks to a random spot 0-4 tiles away", () => {
    EngineSettings.originalDamageFormula = true;
    let next = [6]; // 6 % 200 = 6: facing 6 % 4 = 2 (down), distance 6 % 5 = 1
    setPlatform({ rom: new Map(), saves: memorySaves(), exit() {}, random: () => ((next.shift() ?? 0) + 0.5) / 0x10000 });
    const n = new NPC() as unknown as NPC & { mDelay: number };
    n.mDelay = 2;
    // no images in this test: a walking sprite that only keeps its state
    (n as unknown as { mWalkingSprite: unknown }).mWalkingSprite = { id: 1, step: 0, setDirection() {}, walkTo() {}, walk() {}, setStep() {}, draw() {} };
    n.setPosInMap(5, 5);
    n.state = CharacterState.PAUSE;
    const moves: string[] = [];
    n.setICanWalk({ canWalk: (x, y) => (moves.push(`${x},${y}`), true) });
    n.update(500); // idle 2 -> 1
    expect(n.state).toBe(CharacterState.PAUSE);
    n.update(500); // idle 1 -> 0: pick direction and distance
    expect([n.state, n.direction]).toEqual([CharacterState.WALKING, Direction.South]);
    n.update(500); // one step down
    expect([n.posInMap.x, n.posInMap.y]).toEqual([5, 6]);
    n.update(500); // there: wait again
    expect(n.state).toBe(CharacterState.PAUSE);
    next = [];
  });
});
