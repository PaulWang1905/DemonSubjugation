// The world map's graph and layout (pure; WorldMap.tsx draws it).
//
// The graph: every map, and one link per pair of maps joined by exits, with
// how many exits go each way; exits whose map is only known at run time and
// exits to maps that do not exist are counted on the map they leave.
//
// The layout puts maps that exits join near each other, on a grid of cards:
// - each group of joined maps is laid out on its own: stress majorization
//   (graph distances become distances on the plane), seeded and nudged by
//   where the exits are (a map reached by an exit on the east edge goes east);
// - the positions are snapped to free grid cells (hubs first), then improved
//   by moving maps to nearby cells while that shortens the links;
// - the groups are packed side by side, largest first, and maps no exit joins
//   go on rows of their own below.
import type { Exit, MapInfo, WorldIndex } from "../format/world";

export interface MapLink {
  /** a < b. */
  a: string;
  b: string;
  /** Exits from a to b, and from b to a. */
  ab: number;
  ba: number;
}

export interface MapGraph {
  /** Every map key, in the index's order. */
  keys: string[];
  links: MapLink[];
  /** Per map: exits leading to a map known only at run time. */
  unknown: Map<string, number>;
  /** Per map: exits leading to maps that do not exist (their keys). */
  missing: Map<string, string[]>;
  /** The start map. */
  start: string | null;
}

/** The world map's graph from the index. */
export function mapGraph(world: WorldIndex): MapGraph {
  const keys = [...world.maps.keys()];
  const links = new Map<string, MapLink>();
  const unknown = new Map<string, number>();
  const missing = new Map<string, string[]>();
  for (const e of world.exits) {
    if (!world.maps.has(e.from)) continue;
    if (e.unknown) unknown.set(e.from, (unknown.get(e.from) ?? 0) + 1);
    for (const to of new Set(e.targets.map((t) => t.map))) {
      if (to === e.from) continue;
      if (!world.maps.has(to)) {
        const list = missing.get(e.from) ?? [];
        if (!list.includes(to)) list.push(to);
        missing.set(e.from, list);
        continue;
      }
      const [a, b] = e.from < to ? [e.from, to] : [to, e.from];
      const k = `${a}|${b}`;
      const l = links.get(k) ?? { a, b, ab: 0, ba: 0 };
      if (e.from === a) l.ab++;
      else l.ba++;
      links.set(k, l);
    }
  }
  const start = world.start?.map && world.maps.has(world.start.map) ? world.start.map : null;
  return { keys, links: [...links.values()], unknown, missing, start };
}

/** The maps one map is joined to, with the counts each way. */
export function neighbours(g: MapGraph, key: string): { key: string; out: number; in: number }[] {
  const out: { key: string; out: number; in: number }[] = [];
  for (const l of g.links) {
    if (l.a === key) out.push({ key: l.b, out: l.ab, in: l.ba });
    else if (l.b === key) out.push({ key: l.a, out: l.ba, in: l.ab });
  }
  return out;
}

export interface PlacedMap {
  key: string;
  col: number;
  row: number;
  /** The group of joined maps it is in (0 = the largest); -1: joined to no other map. */
  group: number;
}

export interface WorldMapLayout {
  nodes: PlacedMap[];
  cols: number;
  rows: number;
  /** The first row of the maps no exit joins (null: none). */
  aloneRow: number | null;
}

const SIDES: Record<string, [number, number]> = {
  e: [1, 0],
  w: [-1, 0],
  s: [0, 1],
  n: [0, -1],
};

/** Which side of its map an exit is on (from its cells), or null (a person, no cells). */
function exitSide(map: MapInfo | undefined, e: Exit): [number, number] | null {
  const cells = e.trigger.kind === "tile" ? e.trigger.cells : [];
  if (!map || !cells.length) return null;
  const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length / Math.max(1, map.width - 1) - 0.5;
  const cy = cells.reduce((a, c) => a + c.y, 0) / cells.length / Math.max(1, map.height - 1) - 0.5;
  if (Math.max(Math.abs(cx), Math.abs(cy)) < 0.15) return null; // a door in the middle: no side
  return Math.abs(cx) >= Math.abs(cy) ? SIDES[cx >= 0 ? "e" : "w"] : SIDES[cy >= 0 ? "s" : "n"];
}

/** Per pair of maps (a|b, a < b): where b lies from a, as the exits' sides say (summed). */
function pairDirections(world: WorldIndex): Map<string, [number, number]> {
  const dirs = new Map<string, [number, number]>();
  for (const e of world.exits) {
    const side = exitSide(world.maps.get(e.from), e);
    if (!side) continue;
    for (const to of new Set(e.targets.map((t) => t.map))) {
      if (to === e.from || !world.maps.has(to)) continue;
      const flip = e.from < to ? 1 : -1;
      const k = e.from < to ? `${e.from}|${to}` : `${to}|${e.from}`;
      const d = dirs.get(k) ?? [0, 0];
      dirs.set(k, [d[0] + side[0] * flip, d[1] + side[1] * flip]);
    }
  }
  return dirs;
}

/** Cells are wider than tall: distances on the grid count a column as this many rows. */
const ASPECT = 1.3;
/** A cell's width over its height on screen (WorldMap.tsx's cells). */
const CELL_RATIO = 236 / 176;
/** The shape big groups are stretched towards (width over height). */
const WIDE = 1.7;

/** Lay the world map out (see the top of the file). `width`: the columns to pack groups into (default: about 16:10 overall). */
export function layoutWorldMap(world: WorldIndex, graph = mapGraph(world), opts: { width?: number } = {}): WorldMapLayout {
  const keys = graph.keys;
  const index = new Map(keys.map((k, i) => [k, i]));
  const adj: Set<number>[] = keys.map(() => new Set());
  for (const l of graph.links) {
    const a = index.get(l.a)!;
    const b = index.get(l.b)!;
    adj[a].add(b);
    adj[b].add(a);
  }
  const dirs = pairDirections(world);
  // groups of joined maps (the start's group first, then by size)
  const groupOf = new Array<number>(keys.length).fill(-1);
  const groups: number[][] = [];
  const order = [...keys.keys()].sort((x, y) => (keys[x] === graph.start ? -1 : keys[y] === graph.start ? 1 : 0));
  for (const s of order) {
    if (groupOf[s] >= 0 || !adj[s].size) continue;
    const g: number[] = [];
    const queue = [s];
    groupOf[s] = groups.length;
    while (queue.length) {
      const n = queue.shift()!;
      g.push(n);
      for (const m of adj[n]) if (groupOf[m] < 0) ((groupOf[m] = groups.length), queue.push(m));
    }
    groups.push(g);
  }
  const startGroup = graph.start ? groupOf[index.get(graph.start)!] : -1;
  const ranked = groups.map((g, i) => ({ g, i })).sort((x, y) => (x.i === startGroup ? -1 : y.i === startGroup ? 1 : y.g.length - x.g.length));

  // each group on its own grid
  const blocks = ranked.map(({ g }) => layoutGroup(g, keys, adj, dirs, graph.start ? index.get(graph.start)! : -1));
  const alone = keys.map((_, i) => i).filter((i) => !adj[i].size);

  // pack: shelves of blocks, a gap of one cell between them
  const area = blocks.reduce((a, b) => a + (b.cols + 1) * (b.rows + 1), 0) + alone.length;
  const widest = Math.max(0, ...blocks.map((b) => b.cols));
  const target = Math.max(opts.width ?? Math.ceil(Math.sqrt(area * 1.25)), widest, Math.min(4, Math.max(1, alone.length)));
  const nodes: PlacedMap[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  let cols = 0;
  blocks.forEach((b, bi) => {
    if (x > 0 && x + b.cols > target) {
      y += shelf + 1;
      x = 0;
      shelf = 0;
    }
    for (const [n, [c, r]] of b.at) nodes.push({ key: keys[n], col: x + c, row: y + r, group: bi });
    cols = Math.max(cols, x + b.cols);
    x += b.cols + 1;
    shelf = Math.max(shelf, b.rows);
  });
  let rows = blocks.length ? y + shelf : 0;
  let aloneRow: number | null = null;
  if (alone.length) {
    aloneRow = blocks.length ? rows + 1 : 0;
    const per = Math.max(1, blocks.length ? Math.max(cols, Math.min(alone.length, 4)) : Math.min(alone.length, Math.max(4, Math.ceil(Math.sqrt(alone.length * 1.6)))));
    alone.forEach((n, i) =>
      nodes.push({
        key: keys[n],
        col: i % per,
        row: aloneRow! + Math.floor(i / per),
        group: -1,
      }),
    );
    rows = aloneRow + Math.ceil(alone.length / per);
    cols = Math.max(cols, Math.min(per, alone.length));
  }
  nodes.sort((p, q) => index.get(p.key)! - index.get(q.key)!);
  return { nodes, cols, rows, aloneRow };
}

interface Block {
  /** Node → [col, row] from the block's top left. */
  at: Map<number, [number, number]>;
  cols: number;
  rows: number;
}

/** One group of joined maps on a grid. */
function layoutGroup(g: number[], keys: string[], adj: Set<number>[], dirs: Map<string, [number, number]>, start: number): Block {
  const n = g.length;
  if (n === 1) return { at: new Map([[g[0], [0, 0]]]), cols: 1, rows: 1 };
  const local = new Map(g.map((v, i) => [v, i]));
  // graph distances
  const dist: number[][] = g.map((s) => {
    const d = new Array<number>(n).fill(Infinity);
    d[local.get(s)!] = 0;
    const queue = [s];
    while (queue.length) {
      const v = queue.shift()!;
      for (const w of adj[v]) {
        const j = local.get(w)!;
        if (d[j] === Infinity) ((d[j] = d[local.get(v)!] + 1), queue.push(w));
      }
    }
    return d;
  });
  // where each neighbour lies, as the exits say (unit vectors, from i to j)
  const want: { i: number; j: number; u: [number, number] }[] = [];
  for (const v of g)
    for (const w of adj[v]) {
      if (keys[v] >= keys[w]) continue;
      const d = dirs.get(`${keys[v]}|${keys[w]}`);
      if (!d) continue;
      const len = Math.hypot(d[0], d[1]);
      if (len < 0.5) continue;
      const u: [number, number] = [d[0] / len, d[1] / len];
      want.push({ i: local.get(v)!, j: local.get(w)!, u });
    }

  // seed: breadth first from the hub (the start, else the most joined map), each
  // neighbour on the side its exit says, or around the map evenly
  const hub = local.has(start) ? local.get(start)! : [...g.keys()].sort((a, b) => adj[g[b]].size - adj[g[a]].size || a - b)[0];
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const placed = new Array<boolean>(n).fill(false);
  placed[hub] = true;
  const queue = [hub];
  while (queue.length) {
    const i = queue.shift()!;
    const next = [...adj[g[i]]].map((w) => local.get(w)!).filter((j) => !placed[j]);
    next.forEach((j, k) => {
      const w = want.find((x) => (x.i === i && x.j === j) || (x.i === j && x.j === i));
      let ux: number;
      let uy: number;
      if (w) [ux, uy] = w.i === i ? w.u : [-w.u[0], -w.u[1]];
      else {
        const a = (2 * Math.PI * (k + 0.5)) / next.length + i * 0.7;
        [ux, uy] = [Math.cos(a), Math.sin(a)];
      }
      px[j] = px[i] + ux + 0.01 * ((j * 7) % 5);
      py[j] = py[i] + uy + 0.01 * ((j * 3) % 7);
      placed[j] = true;
      queue.push(j);
    });
  }

  // stress majorization (localized), with the exits' sides as soft targets
  const DIR_W = 0.6;
  const iterations = n > 150 ? 120 : 260;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const d = dist[i][j];
        if (!isFinite(d)) continue;
        const w = 1 / (d * d);
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let len = Math.hypot(dx, dy);
        if (len < 1e-6) {
          dx = 0.01 * (((i - j) % 3) - 1 || 1);
          dy = 0.01 * (((i + j) % 3) - 1 || 1);
          len = Math.hypot(dx, dy);
        }
        sx += w * (px[j] + (d * dx) / len);
        sy += w * (py[j] + (d * dy) / len);
        sw += w;
      }
      for (const x of want) {
        if (x.i === i) {
          sx += DIR_W * (px[x.j] - x.u[0]);
          sy += DIR_W * (py[x.j] - x.u[1]);
          sw += DIR_W;
        } else if (x.j === i) {
          sx += DIR_W * (px[x.i] + x.u[0]);
          sy += DIR_W * (py[x.i] + x.u[1]);
          sw += DIR_W;
        }
      }
      if (sw > 0) {
        px[i] = sx / sw;
        py[i] = sy / sw;
      }
    }
  }

  // a big group is stretched towards a wide shape (views are wider than tall)
  let stretch = 1;
  if (n >= 12) {
    const w = Math.max(...px) - Math.min(...px);
    const h = Math.max(...py) - Math.min(...py);
    // its width over its height on screen, were it snapped as it is
    const shape = ((w / ASPECT) * CELL_RATIO) / Math.max(1e-6, h);
    stretch = Math.min(1.45, Math.max(0.8, Math.sqrt(WIDE / Math.max(1e-6, shape))));
  }
  // snap to grid cells: the most joined maps first, each on the free cell nearest its place
  const SCALE = 1.15;
  const taken = new Map<string, number>();
  const cell = new Array<[number, number]>(n);
  const byDegree = [...g.keys()].sort((a, b) => adj[g[b]].size - adj[g[a]].size || a - b);
  for (const i of byDegree) {
    // (the plane's unit is one link; a column is ASPECT rows wide)
    const fx = (px[i] * SCALE * stretch) / ASPECT;
    const fy = (py[i] * SCALE) / stretch;
    const c0 = Math.round(fx);
    const r0 = Math.round(fy);
    let best: [number, number] = [c0, r0];
    let bestD = Infinity;
    for (let rad = 0; rad < 40 && bestD === Infinity; rad++) {
      for (let dc = -rad; dc <= rad; dc++)
        for (let dr = -rad; dr <= rad; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (taken.has(`${c},${r}`)) continue;
          const d = Math.hypot((c - fx) * ASPECT, r - fy);
          if (d < bestD) ((bestD = d), (best = [c, r]));
        }
    }
    cell[i] = best;
    taken.set(`${best[0]},${best[1]}`, i);
  }

  // improve: move a map to a nearby cell (or swap with the map there) while its links get shorter
  const edges: [number, number][] = [];
  for (const v of g) for (const w of adj[v]) if (v < w) edges.push([local.get(v)!, local.get(w)!]);
  const incident: number[][] = g.map(() => []);
  edges.forEach(([a, b], k) => (incident[a].push(k), incident[b].push(k)));
  const len = (k: number) => {
    const [a, b] = edges[k];
    const dx = cell[a][0] - cell[b][0];
    const dy = cell[a][1] - cell[b][1];
    // a link wants to be one cell long; longer costs, and sitting on top costs nothing extra
    return Math.max(0, Math.hypot(dx, dy) - 1) ** 2;
  };
  const costOf = (nodes: number[]) => {
    const ks = new Set(nodes.flatMap((v) => incident[v]));
    let s = 0;
    for (const k of ks) s += len(k);
    return s;
  };
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const from = cell[i];
        const to: [number, number] = [from[0] + dc, from[1] + dr];
        const other = taken.get(`${to[0]},${to[1]}`);
        const involved = other === undefined ? [i] : [i, other];
        const before = costOf(involved);
        cell[i] = to;
        if (other !== undefined) cell[other] = from;
        const after = costOf(involved);
        if (after < before - 1e-9) {
          taken.delete(`${from[0]},${from[1]}`);
          taken.set(`${to[0]},${to[1]}`, i);
          if (other !== undefined) taken.set(`${from[0]},${from[1]}`, other);
          moved = true;
        } else {
          cell[i] = from;
          if (other !== undefined) cell[other] = to;
        }
      }
    }
    if (!moved) break;
  }

  // drop empty rows and columns, from the top left
  const usedC = [...new Set(cell.map((c) => c[0]))].sort((a, b) => a - b);
  const usedR = [...new Set(cell.map((c) => c[1]))].sort((a, b) => a - b);
  const colOf = new Map(usedC.map((c, i) => [c, i]));
  const rowOf = new Map(usedR.map((r, i) => [r, i]));
  const at = new Map<number, [number, number]>();
  g.forEach((v, i) => at.set(v, [colOf.get(cell[i][0])!, rowOf.get(cell[i][1])!]));
  return { at, cols: usedC.length, rows: usedR.length };
}

// ---------------------------------------------------------------------------
// Drawing helpers

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The point where the line from a box's centre towards (tx, ty) leaves the box (plus a gap). */
export function boxEdge(b: Box, tx: number, ty: number, gap = 4): { x: number; y: number } {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const k = Math.min((b.w / 2 + gap) / Math.max(1e-9, Math.abs(dx)), (b.h / 2 + gap) / Math.max(1e-9, Math.abs(dy)));
  return { x: cx + dx * Math.min(1, k), y: cy + dy * Math.min(1, k) };
}

/** A link's line between two boxes, from edge to edge. */
export function linkLine(a: Box, b: Box, gap = 4): { x1: number; y1: number; x2: number; y2: number } {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p = boxEdge(a, bc.x, bc.y, gap);
  const q = boxEdge(b, ac.x, ac.y, gap);
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

/** The zoom that shows a `w`×`h` world in a `vw`×`vh` view (with a margin), at most `max`. */
export function fitZoom(w: number, h: number, vw: number, vh: number, max = 1, margin = 24): number {
  if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) return 1;
  return Math.min(max, (vw - margin * 2) / w, (vh - margin * 2) / h);
}

/** Zoom limits and steps. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;
export const clampZoom = (z: number, min = ZOOM_MIN) => Math.min(ZOOM_MAX, Math.max(min, z));

/** The total length of the links on the grid, in cells (for tests: lower is tighter). */
export function linkLength(layout: WorldMapLayout, graph: MapGraph): number {
  const at = new Map(layout.nodes.map((n) => [n.key, n]));
  let s = 0;
  for (const l of graph.links) {
    const a = at.get(l.a)!;
    const b = at.get(l.b)!;
    s += Math.hypot(a.col - b.col, a.row - b.row);
  }
  return s;
}
