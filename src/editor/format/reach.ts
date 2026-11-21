// Where the player can get on a map, and whether what an author puts there
// can be reached: an exit or event tile, a person or object, the start, an
// arrival.
//
// How the engine moves the leader (src/engine/fmj/scene/ScreenMainGame.ts,
// lib/ResMap.ts canPlayerWalk):
// - the leader only steps onto a tile that is walkable AND at least 4 tiles
//   in from the left and right edges, 3 from the top and 2 from the bottom
//   (the view never scrolls past the map's edge, and the leader keeps its
//   place near the middle of the screen);
// - a map cell's event runs when the leader tries to step into it (even a
//   blocked one, or one beyond that band) or faces it and presses OK: so an
//   event tile works when the leader can stand next to it (or on it);
// - talking to a person or opening a chest needs the leader next to them,
//   facing them.
// So a tile is reached when it, or one of its four neighbours, is a tile the
// leader can stand on and walk to from where it enters the map (the new
// game's start, the exits' arrivals). People are not counted as walls: many
// walk about, and a placement may depend on a flag.
import type { MapCell } from "./encode";
import type { WorldIndex } from "./world";

export interface MapGrid {
  width: number;
  height: number;
  cells: readonly Pick<MapCell, "walkable" | "event">[];
}

export interface Point {
  x: number;
  y: number;
}

/** The engine's band: how far in from each edge the leader must stay. */
export const PLAYER_MARGIN = { left: 4, right: 4, top: 3, bottom: 2 } as const;

/** Whether map tile x, y is inside the band where the leader can stand (ignoring walls). */
export function inBand(x: number, y: number, w: number, h: number): boolean {
  return x >= PLAYER_MARGIN.left && x < w - PLAYER_MARGIN.right && y >= PLAYER_MARGIN.top && y < h - PLAYER_MARGIN.bottom;
}

/** Whether the leader can stand on map tile x, y (walkable and inside the band). */
export function standable(m: MapGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height && inBand(x, y, m.width, m.height) && m.cells[y * m.width + x].walkable;
}

export interface Reach {
  width: number;
  height: number;
  /** 1 where the leader can stand and get to. */
  area: Uint8Array;
  /** The area grew from where the leader enters (false: no entry is known, so every standable tile counts). */
  seeded: boolean;
}

/**
 * The tiles the leader can walk to from `seeds` (where it enters the map). The
 * seeds themselves count when they are standable; without any standable seed
 * every standable tile counts (only the band and walls decide then).
 */
export function reachArea(m: MapGrid, seeds: readonly Point[] = []): Reach {
  const { width: w, height: h } = m;
  const area = new Uint8Array(w * h);
  const stack = seeds.filter((p) => standable(m, p.x, p.y)).map((p) => p.y * w + p.x);
  const seeded = stack.length > 0;
  if (!seeded) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (standable(m, x, y)) area[y * w + x] = 1;
    return { width: w, height: h, area, seeded };
  }
  while (stack.length) {
    const i = stack.pop()!;
    if (area[i]) continue;
    area[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (standable(m, nx, ny) && !area[ny * w + nx]) stack.push(ny * w + nx);
    }
  }
  return { width: w, height: h, area, seeded };
}

const NEIGHBOURS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const;

/** Whether the leader can stand on x, y (inside the reached area). */
export function canStand(r: Reach, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < r.width && y < r.height && r.area[y * r.width + x] === 1;
}

/** Whether something on x, y can be walked into, faced or talked to: x, y or a neighbour is reached. */
export function canTouch(r: Reach, x: number, y: number): boolean {
  return canStand(r, x, y) || NEIGHBOURS.some(([dx, dy]) => canStand(r, x + dx, y + dy));
}

/**
 * The nearest tile to x, y that `ok` accepts (by straight distance; ties:
 * below, above, right, left, then below-right, below-left, above-right,
 * above-left, then the rest), within `radius`; null if none.
 */
export function nearestTile(w: number, h: number, x: number, y: number, ok: (x: number, y: number) => boolean, radius = Math.max(w, h)): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  let bestRank = Infinity;
  const rank = (dx: number, dy: number) => {
    const k = NEIGHBOURS.findIndex(([a, b]) => a === Math.sign(dx) && b === Math.sign(dy));
    return k >= 0 ? k : 4 + (dx < 0 ? 1 : 0) + (dy < 0 ? 2 : 0);
  };
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const d = dx * dx + dy * dy;
      if (d > bestD) continue;
      const rk = rank(dx, dy);
      if (d === bestD && rk >= bestRank) continue;
      if (!ok(nx, ny)) continue;
      best = { x: nx, y: ny };
      bestD = d;
      bestRank = rk;
    }
  return best;
}

/** The nearest tile to x, y the leader can walk into (for moving an exit, a person or an event tile there). */
export function nearestTouchable(r: Reach, x: number, y: number, free: (x: number, y: number) => boolean = () => true): Point | null {
  return nearestTile(r.width, r.height, x, y, (a, b) => canTouch(r, a, b) && free(a, b));
}

/** Where the leader enters a map: the new game's start and the arrivals of exits that lead there. */
export function mapEntries(world: WorldIndex, mapKey: string): Point[] {
  const out: Point[] = [];
  if (world.start?.map === mapKey) out.push({ x: world.start.x, y: world.start.y });
  for (const e of world.maps.get(mapKey)?.entrances ?? []) for (const t of e.targets) if (t.map === mapKey && t.x !== null && t.y !== null) out.push({ x: t.x, y: t.y });
  return out;
}

/** The reached area of a map of the world (from its start and arrivals). */
export function mapReach(world: WorldIndex, mapKey: string, m: MapGrid): Reach {
  return reachArea(m, mapEntries(world, mapKey));
}

/** Why the leader cannot stand on x, y, in words (null when it can). */
export function standProblem(m: MapGrid, r: Reach | null, x: number, y: number): string | null {
  if (!inBand(x, y, m.width, m.height)) return edgeReason(m, x, y);
  if (!m.cells[y * m.width + x].walkable) return "it is a blocked tile";
  if (r && r.seeded && !canStand(r, x, y)) return "blocked tiles wall it off from where the player enters this map";
  return null;
}

/** Why the leader can never get next to x, y (null when it can). */
export function touchProblem(m: MapGrid, r: Reach, x: number, y: number): string | null {
  if (canTouch(r, x, y)) return null;
  const nearBand = [[0, 0], ...NEIGHBOURS].some(([dx, dy]) => inBand(x + dx, y + dy, m.width, m.height));
  if (!nearBand) return edgeReason(m, x, y);
  return r.seeded ? "blocked tiles wall it off from where the player enters this map" : "only blocked tiles are around it";
}

function edgeReason(m: MapGrid, x: number, y: number): string {
  const { left, right, top, bottom } = PLAYER_MARGIN;
  const sides: string[] = [];
  if (x < left) sides.push(`${left} tiles from the left edge`);
  if (x >= m.width - right) sides.push(`${right} tiles from the right edge`);
  if (y < top) sides.push(`${top} tiles from the top edge`);
  if (y >= m.height - bottom) sides.push(`${bottom} tiles from the bottom edge`);
  return `it is too close to the edge: the player always keeps ${sides.join(" and ")}`;
}

export interface ReachProblem {
  map: string;
  what: "event" | "exit" | "person" | "object" | "start" | "arrival";
  x: number;
  y: number;
  /** "exit to FOREST", "Old Woman", "event 3" */
  name: string;
  reason: string;
  /** The nearest tile that would work. */
  nearest: Point | null;
  /** The script line it comes from (people, starts, arrivals). */
  script?: string;
  line?: number;
}

/**
 * What the player can never reach on each map: event tiles (exits included)
 * none of whose cells can be walked into, people and objects nobody can stand
 * next to, a start or an arrival on a tile the player cannot stand on.
 */
export function unreachable(world: WorldIndex, grids: (mapKey: string) => MapGrid | null): ReachProblem[] {
  const out: ReachProblem[] = [];
  const mapName = (k: string) => world.maps.get(k)?.name || k;
  for (const [key, info] of world.maps) {
    const m = grids(key);
    if (!m) continue;
    // a map nobody shows is reported elsewhere
    if (!info.loadedBy.length && world.start?.map !== key) continue;
    const r = mapReach(world, key, m);
    const free = (x: number, y: number) => !m.cells[y * m.width + x].event;
    for (const c of info.eventCells) {
      if (!c.handlers.length || c.cells.some((p) => canTouch(r, p.x, p.y))) continue;
      const p = c.cells[0];
      const exit = info.exits.find((e) => e.trigger.kind === "tile" && e.trigger.mapEvent === c.mapEvent);
      const to = exit ? [...new Set(exit.targets.map((t) => mapName(t.map)))].join(" / ") : "";
      out.push({ map: key, what: exit ? "exit" : "event", x: p.x, y: p.y, name: exit ? `the exit to ${to}` : `event tile ${c.mapEvent}`, reason: touchProblem(m, r, p.x, p.y)!, nearest: nearestTouchable(r, p.x, p.y, free) });
    }
    for (const p of info.people) {
      if (canTouch(r, p.x, p.y)) continue;
      out.push({ map: key, what: p.kind, x: p.x, y: p.y, name: p.name || `${p.kind} #${p.id}`, reason: touchProblem(m, r, p.x, p.y)!, nearest: nearestTouchable(r, p.x, p.y), script: p.script, line: p.line });
    }
    // the start and arrivals: checked against the band and walls only (they are the seeds)
    const own = reachArea(m);
    if (world.start?.map === key) {
      const why = standProblem(m, null, world.start.x, world.start.y);
      if (why) out.push({ map: key, what: "start", x: world.start.x, y: world.start.y, name: "the start", reason: why, nearest: nearestTile(m.width, m.height, world.start.x, world.start.y, (a, b) => canStand(own, a, b)), script: world.start.load.script, line: world.start.load.line });
    }
    for (const e of info.entrances)
      for (const t of e.targets) {
        if (t.map !== key || t.x === null || t.y === null) continue;
        const why = standProblem(m, null, t.x, t.y);
        if (why) out.push({ map: key, what: "arrival", x: t.x, y: t.y, name: `the arrival from ${mapName(e.from)}`, reason: why, nearest: nearestTile(m.width, m.height, t.x, t.y, (a, b) => canStand(own, a, b)), script: t.load.script, line: t.load.line });
      }
  }
  return out;
}
