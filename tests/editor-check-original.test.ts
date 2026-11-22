// The project check on a finished game: which script handles a map's cells
// (the one running while the player walks there, not the one that showed the
// map), what the player can reach, and dialogue that may break anywhere.
// The original game's checks are skipped without FMJ_DATA_DIR; the engine
// plays the cases the check is about.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEngine, Keys, type Engine } from "../src/engine";
import { SaveLoadGame } from "../src/engine/fmj/scene/SaveLoadGame";
import { assemble } from "../src/editor/format/gut";
import { encodeMap, encodeSceneObj, type MapCell } from "../src/editor/format/encode";
import { findEntry, putEntry, readLib, type LibArchive } from "../src/editor/format/lib";
import { decodeMap } from "../src/editor/format/decode";
import { reachArea, canStand, unreachable } from "../src/editor/format/reach";
import { checkDialogue, splitWords } from "../src/editor/format/scriptHelp";
import { checkProject } from "../src/editor/format/validate";
import { buildWorld } from "../src/editor/format/world";
import { mapOverlay, mapSetups } from "../src/editor/format/worldEdit";
import { blankProject, blankSources } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { loadRealResources, memorySaves } from "./helpers";

/** A blank game plus scripts (by key "1-1-n") and maps. */
function project(scripts: Record<string, string>, maps: { index: number; name: string; cells?: (x: number, y: number) => Partial<MapCell> }[] = []): { a: LibArchive; texts: Record<string, string> } {
  const a = blankProject("TEST");
  for (const m of maps) {
    const cells: MapCell[] = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) cells.push({ tile: 0, walkable: true, event: 0, ...m.cells?.(x, y) });
    putEntry(a, { resType: 2, type: 1, index: m.index, data: encodeMap({ type: 1, index: m.index, tileset: 1, name: m.name, width: 20, height: 14, cells }) });
  }
  for (const [k, src] of Object.entries(scripts)) putEntry(a, { resType: 1, type: 1, index: Number(k.split("-")[2]), data: assemble(src) });
  return { a, texts: scripts };
}

/** A door: map 1's script shows map 2 and switches to map 2's own script, which handles map 2's cells. */
const DOOR = {
  "1-1-1": [".gut 1 1", ".events 41", ".event 41 @door", "  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  callback", "@door:", "  loadmap 1, 2, 4, 4", "  startchapter 1, 2", "  callback", ""].join("\n"),
  "1-1-2": [".gut 1 2", ".events 42", ".event 42 @well", "  createbox 1, 1, 9, 9", "  callback", "@well:", '  message "A well."', "  callback", ""].join("\n"),
};
const doorMaps = [
  { index: 1, name: "TOWN", cells: (x: number, y: number) => ({ event: x === 10 && y === 7 ? 1 : 0 }) },
  { index: 2, name: "YARD", cells: (x: number, y: number) => ({ event: x === 12 && y === 8 ? 2 : x === 6 && y === 8 ? 3 : 0 }) },
];

describe("which script handles a map's cells", () => {
  it("is the script running there: the door's map script, not the script that showed the map", () => {
    const { a, texts } = project(DOOR, doorMaps);
    const world = buildWorld(a, texts);
    const yard = world.maps.get("2-1-2")!;
    expect(yard.loadedBy.map((l) => l.script)).toEqual(["1-1-1"]);
    expect(yard.runBy).toEqual(["1-1-2"]);
    expect(world.scripts.get("1-1-2")!.runsOn).toEqual(["2-1-2"]);
    expect(yard.eventCells.map((c) => [c.mapEvent, c.handlers.map((h) => `${h.script} ${h.label}`)])).toEqual([
      [2, ["1-1-2 well"]],
      [3, []],
    ]);
    // the yard's script's start code places its people on the yard
    expect(yard.people.map((p) => p.script)).toEqual(["1-1-2"]);
    // the map view sets the yard up with the yard's own script
    expect(mapSetups(world, "2-1-2").map((s) => [s.script, s.where])).toEqual([["1-1-2", "the script running here"]]);
    expect(mapOverlay(world, a, "2-1-2", "1-1-2").cells.map((c) => [c.mapEvent, c.script, c.phrase])).toEqual([
      [2, "1-1-2", "message"],
      [3, null, "nothing handles it"],
    ]);
    // so only event 3 is reported, naming the script that should handle it
    const p = checkProject(a, texts).filter((x) => x.message.startsWith("map event"));
    expect(p.map((x) => [x.key, x.tile, x.message])).toEqual([
      ["2-1-2", { x: 6, y: 8 }, "map event 3 on tile 6, 8 does nothing: script 1-2, the script running on this map, has no event 43. Add what happens there, or clear the event from the tiles"],
    ]);
  });

  it("follows a script that switches to another without showing a map, and one that runs again later", () => {
    const scripts = {
      ...DOOR,
      // the yard's script hands over to a later version of the yard (no loadmap)
      "1-1-2": [".gut 1 2", ".events 42", ".event 42 @well", "  startchapter 1, 3", "@well:", "  callback", ""].join("\n"),
      "1-1-3": [".gut 1 3", ".events 43", ".event 43 @shed", "  callback", "@shed:", '  message "A shed."', "  callback", ""].join("\n"),
    };
    const { a, texts } = project(scripts, doorMaps);
    const world = buildWorld(a, texts);
    expect(world.maps.get("2-1-2")!.runBy).toEqual(["1-1-3"]);
    expect(world.maps.get("2-1-2")!.eventCells.map((c) => c.handlers.map((h) => h.script))).toEqual([[], ["1-1-3"]]);
  });

  it("a map shared by several scripts: a cell is handled when any of them handles it", () => {
    const scripts = {
      "1-1-1": [".gut 1 1", ".events 42", ".event 41 @a", ".event 42 @b", "  loadmap 1, 1, 4, 4", "  createactor 1, 4, 3", "  callback", "@a:", "  loadmap 1, 2, 4, 4", "  startchapter 1, 2", "@b:", "  loadmap 1, 2, 4, 4", "  startchapter 1, 3", ""].join("\n"),
      "1-1-2": [".gut 1 2", ".events 42", ".event 42 @x", "  callback", "@x:", "  callback", ""].join("\n"),
      "1-1-3": [".gut 1 3", ".events 43", ".event 43 @y", "  callback", "@y:", "  callback", ""].join("\n"),
    };
    const { a, texts } = project(scripts, [{ index: 1, name: "TOWN", cells: (x, y) => ({ event: y === 7 && (x === 10 || x === 11) ? (x === 10 ? 1 : 2) : 0 }) }, doorMaps[1]]);
    const world = buildWorld(a, texts);
    expect(world.maps.get("2-1-2")!.runBy).toEqual(["1-1-2", "1-1-3"]);
    expect(checkProject(a, texts).filter((x) => x.message.startsWith("map event"))).toEqual([]);
  });
});

describe("what the player can reach", () => {
  const grid = (blocked: (x: number, y: number) => boolean) => {
    const cells = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) cells.push({ walkable: !blocked(x, y), event: 0 });
    return { width: 20, height: 14, cells };
  };

  it("an arrival on a blocked tile (a doorway) is fine when the player can step off it", () => {
    // a wall along row 5 with the arrival in it: the player walks down off it
    const m = grid((_, y) => y === 5);
    const r = reachArea(m, [{ x: 8, y: 5 }]);
    expect(r.seeded).toBe(true);
    expect(canStand(r, 8, 6)).toBe(true);
    expect(canStand(r, 8, 4)).toBe(true);
    // walled in on every side: stuck
    const box = grid((x, y) => Math.abs(x - 8) + Math.abs(y - 6) <= 1);
    expect(reachArea(box, [{ x: 8, y: 6 }]).seeded).toBe(false);
  });

  it("reports only arrivals that leave the player stuck, and people the player could talk to", () => {
    const scripts = {
      ...DOOR,
      // arrives on 8, 7 (view 4, 4 + screen 4, 3); a sign nobody talks to behind the wall, a chest outside the map
      "1-1-2": [".gut 1 2", ".events 22", ".event 22 @chest", "  createbox 1, 1, 8, 2", "  createbox 22, 1, 30, 30", "  callback", "@chest:", "  gaingoods 1, 1", "  callback", ""].join("\n"),
    };
    const { a, texts } = project(scripts, [doorMaps[0], { index: 2, name: "YARD", cells: (x, y) => ({ walkable: !(y === 7 && x === 8) && y !== 3 }) }]);
    putEntry(a, { resType: 3, type: 4, index: 1, data: encodeSceneObj({ index: 1, name: "Chest", sprite: 1, step: 0 }) });
    const found = checkProject(a, texts).filter((x) => x.key === "2-1-2");
    expect(found.map((x) => x.message)).toEqual(["Chest at 30, 30 can never be reached: it is outside the map, which is 20 × 14 tiles. The nearest tile that works is 15, 12."]);
  });

  it("a word split across the box's lines is reported, a run of symbols is not", () => {
    expect(splitWords("Abcdefghijk #$%!#@!@#", [15])).toEqual([]);
    expect(splitWords("Abcdefghijklmnopqrst", [15])).toEqual(["Abcdefghijklmno|pqrst"]);
    expect(checkDialogue('  say 1, "哇，好大的腥味#$%!#@!@#"')).toEqual([]);
  });
});

describe("the templates", () => {
  it("have no problems, and every painted event is handled by a script running on its map", () => {
    for (const [a, texts] of [
      [blankProject("TEST"), blankSources()],
      [lanternPath(), lanternPathSources()],
      [silentBell(), silentBellSources()],
    ] as const) {
      expect(checkProject(a, texts)).toEqual([]);
      const world = buildWorld(a, texts);
      for (const map of world.maps.values()) {
        if (map.loadedBy.length) expect(map.runBy.length).toBeGreaterThan(0);
        for (const c of map.eventCells) expect(c.handlers.length).toBeGreaterThan(0);
      }
    }
  });
});

const DATA = process.env.FMJ_DATA_DIR ?? "";
const HAS = !!DATA && existsSync(`${DATA}/DAT.LIB`);

describe.skipIf(!HAS)("伏魔记's project check", () => {
  const a = HAS ? readLib(new Uint8Array(readFileSync(`${DATA}/DAT.LIB`))) : (null as never);

  it("三清宫's cells are handled by script 1-2, which the doors switch to", () => {
    const world = buildWorld(a);
    const map = world.maps.get("2-1-1")!;
    expect(map.name.trim()).toBe("三清宫");
    // shown by doors in a dozen scripts, none of which handles its cells
    expect(map.loadedBy.length).toBeGreaterThan(10);
    expect(map.runBy).toContain("1-1-2");
    expect(map.eventCells.map((c) => c.mapEvent)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const c of map.eventCells) expect(c.handlers.length, `event ${c.mapEvent}`).toBeGreaterThan(0);
    // event 3 (无机阁's door): script 1-2's event 43 shows map 2-8 and switches to script 1-3
    const e3 = map.eventCells.find((c) => c.mapEvent === 3)!;
    expect(e3.handlers.find((h) => h.script === "1-1-2")?.label).toBe("event43");
    expect(map.exits.find((e) => e.script === "1-1-2" && e.event === 43)?.targets.map((t) => t.map)).toEqual(["2-2-8"]);
    // the map view sets it up with a script that runs there, so no tile says "nothing handles it"
    const setups = mapSetups(world, "2-1-1");
    expect(setups.every((s) => map.runBy.includes(s.script) || map.people.some((p) => p.script === s.script))).toBe(true);
    for (const s of setups) expect(mapOverlay(world, a, "2-1-1", s.script).cells.filter((c) => c.phrase === "nothing handles it")).toEqual([]);
    // and its boxes are on it
    expect(map.people.filter((p) => p.script === "1-1-2").map((p) => [p.x, p.y])).toContainEqual([19, 43]);
  });

  it("reports only the game's true problems (247 before the check knew which script runs on a map)", () => {
    const p = checkProject(a);
    const kinds = new Map<string, number>();
    const kind = (m: string) =>
      /^map event \d+ on .* does nothing/.test(m) ? "event nothing handles" : /can never be reached: it is outside the map/.test(m) ? "outside the map" : /can never be reached/.test(m) ? "cannot be reached" : /dialogue box covers/.test(m) ? "speaker behind the box" : /^uses tile/.test(m) ? "tile not in tileset" : m;
    for (const x of p) kinds.set(kind(x.message), (kinds.get(kind(x.message)) ?? 0) + 1);
    expect(Object.fromEntries(kinds)).toEqual({
      // 通用迷宫 (the maze six chapters share; none of them uses these 8), 新野客栈 (2), 酆都城 (1)
      "event nothing handles": 11,
      // 蛇窟山洞 is 25 × 25; script 12-2 puts three chests at the maze's coordinates
      "outside the map": 3,
      // 忘忧村's hidden chest at 6, 2 (above the wall line)
      "cannot be reached": 1,
      "speaker behind the box": 4,
      // 慕容主房's wall uses tile 127 of a 127-tile tileset
      "tile not in tileset": 1,
    });
    expect(p.every((x) => x.level === "warning")).toBe(true);
    expect(p.filter((x) => x.key === "2-1-1")).toEqual([]);
    const maze = p.filter((x) => x.key === "2-3-10");
    expect(maze[0].message).toBe("map event 2 on tile 13, 8 does nothing: none of the scripts running on this map (script 1-4, script 5-17, script 8-9, script 9-12, script 13-1, script 14-10) has an event 42. Add what happens there, or clear the event from the tiles");
    expect(p.find((x) => x.key === "2-2-21")?.message).toBe("map event 2 on tile 15, 9 does nothing: script 5-10, the script running on this map, has no event 42. Add what happens there, or clear the event from the tiles");
    // the shops' keepers stand behind the counter; the counter's tile runs the shop
    expect(p.some((x) => x.key === "2-2-16" || x.key === "2-2-17")).toBe(false);
    // 蛇窟山洞 really is 25 × 25
    expect(decodeMap(findEntry(a, 2, 3, 7)!.data)).toMatchObject({ width: 25, height: 25 });
    // the curses ("#$%!#@!@#") break anywhere
    expect(p.some((x) => /split across lines/.test(x.message))).toBe(false);
    // what the reach check reports comes from the world as the engine plays it
    expect(unreachable(buildWorld(a), (k) => decodeMap(findEntry(a, 2, Number(k.split("-")[1]), Number(k.split("-")[2]))!.data)).length).toBe(4);
  });
});

const RES = HAS ? loadRealResources() : null;

describe.skipIf(!RES)("伏魔记 in the engine", () => {
  const tick = (e: Engine, n: number) => {
    for (let i = 0; i < n; i++) e.update();
  };
  const press = (e: Engine, k: number, wait = 2) => {
    e.keyDown(k as never);
    e.update();
    e.keyUp(k as never);
    tick(e, wait);
  };
  /** A new game, played until the opening hands over control. */
  function boot(): Engine {
    let s = 11;
    const e = createEngine({ resources: RES!, saves: memorySaves(), random: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) });
    tick(e, 400);
    press(e, Keys.ENTER, 20);
    press(e, Keys.CANCEL);
    for (let i = 0; i < 400 && (e.game.mainScene.scriptProcess.running || e.game.playerList.length === 0); i++) press(e, Keys.ENTER, 6);
    return e;
  }
  /** Run the running script until the player has control again. */
  const settle = (e: Engine) => {
    for (let i = 0; i < 200 && e.game.mainScene.scriptProcess.running; i++) press(e, Keys.ENTER, 4);
  };
  const where = (e: Engine) => {
    const m = e.game.mainScene.currentMap!;
    const p = e.game.playerList[0].posInMap;
    return { map: `${m.type}-${m.index}`, x: p.x, y: p.y, script: `${SaveLoadGame.ScriptType}-${SaveLoadGame.ScriptIndex}` };
  };

  it("walking into 三清宫's event 3 runs script 1-2's event 43 (the check said nothing handles it)", () => {
    const e = boot();
    const scene = e.game.mainScene;
    // script 1-3's event 41: the door to 三清宫 (shows map 1-1, switches to script 1-2)
    scene.startChapter(1, 3);
    settle(e);
    scene.triggerEvent(41);
    settle(e);
    expect(where(e)).toEqual({ map: "1-1", x: 22, y: 9, script: "1-2" });
    // 22, 8 above the leader is painted with event 3
    expect(scene.currentMap!.getEventNum(22, 8)).toBe(3);
    press(e, Keys.UP, 4);
    settle(e);
    expect(where(e)).toMatchObject({ map: "2-8", script: "1-3" });
  });

  it("an event no running script handles does nothing (新野客栈's event 3)", () => {
    const e = boot();
    const scene = e.game.mainScene;
    // script 5-1 shows the inn and switches to script 5-10 (its only event is 41, the way out)
    scene.loadMap(2, 21, 3, 2);
    scene.startChapter(5, 10);
    settle(e);
    expect(where(e)).toEqual({ map: "2-21", x: 7, y: 5, script: "5-10" });
    expect(scene.currentMap!.getEventNum(7, 4)).toBe(3);
    press(e, Keys.UP, 4);
    expect(scene.scriptProcess.running).toBe(false);
    expect(where(e)).toEqual({ map: "2-21", x: 7, y: 5, script: "5-10" });
  });
});
