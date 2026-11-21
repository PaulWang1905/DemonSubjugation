// The world map: every map of the project as a box with its picture and
// name, joined by arrows where exits lead (from the world index), the start
// map marked; a click opens the map. Shown on the project home. Also the
// small map an author clicks on to pick a tile of another map (an exit's
// arrival).
import { useEffect, useMemo, useRef } from "react";
import { decodeMap } from "../format/decode";
import { findEntry, type LibArchive } from "../format/lib";
import { buildWorld, type WorldIndex } from "../format/world";
import { worldLayout } from "../format/worldEdit";
import { mapCanvas, mapThumb } from "./worldArt";
import "./world.css";

const CELL_W = 236;
const CELL_H = 178;
const BOX_W = 168;
const BOX_H = 124;

interface MapProps {
  archive: LibArchive;
  /** The world index, or the scripts' texts to build one. */
  world?: WorldIndex;
  sources?: Record<string, string>;
  onOpen: (key: string) => void;
}

export function WorldMap({ archive, world: given, sources, onOpen }: MapProps) {
  const world = useMemo(() => given ?? buildWorld(archive, sources ?? {}), [given, archive, sources]);
  const layout = useMemo(() => worldLayout(world), [world]);
  if (!layout.nodes.length) return <p className="muted">No maps yet.</p>;
  const center = (k: string) => {
    const n = layout.nodes.find((x) => x.key === k)!;
    return { x: n.col * CELL_W + CELL_W / 2, y: n.row * CELL_H + CELL_H / 2 };
  };
  const width = layout.cols * CELL_W;
  const height = layout.rows * CELL_H;
  // an arrow ends at the edge of the target's box
  const clip = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const k = Math.min(BOX_W / 2 / Math.max(1e-6, Math.abs(dx)), BOX_H / 2 / Math.max(1e-6, Math.abs(dy)));
    return { x: to.x - dx * k, y: to.y - dy * k };
  };
  return (
    <div className="wm-scroll">
      <div className="wm" style={{ width, height }}>
        <svg className="wm-lines" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="wm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="wm-head" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const a = center(e.from);
            const b = center(e.to);
            const p = clip(a, b);
            const q = clip(b, a);
            return <line key={`${e.from}>${e.to}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y} className="wm-line" markerEnd="url(#wm-arrow)" markerStart={e.both ? "url(#wm-arrow)" : undefined} />;
          })}
        </svg>
        {layout.nodes.map((n) => {
          const e = findEntry(archive, 2, ...(n.key.split("-").slice(1).map(Number) as [number, number]));
          const m = world.maps.get(n.key)!;
          const out = new Set(m.exits.flatMap((x) => x.targets.map((t) => t.map)).filter((k) => k !== n.key)).size;
          return (
            <button
              key={n.key}
              type="button"
              className={`wm-box${n.start ? " start" : ""}`}
              style={{ left: n.col * CELL_W + (CELL_W - BOX_W) / 2, top: n.row * CELL_H + (CELL_H - BOX_H) / 2, width: BOX_W, height: BOX_H }}
              onClick={() => onOpen(n.key)}
              title={`Open ${n.name || n.key} on the map`}
            >
              <span className="wm-pic">{e && <img src={mapThumb(archive, e.data, 150)} alt="" />}</span>
              <span className="wm-name">
                {n.start && (
                  <span className="wm-start" title="The game starts here">
                    ▶
                  </span>
                )}
                {n.name || `Map ${n.key.split("-").slice(1).join("-")}`}
              </span>
              <span className="wm-meta muted">
                {m.people.length} {m.people.length === 1 ? "person or object" : "people and objects"} · {out} {out === 1 ? "exit" : "exits"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The project home's world map section. */
export function WorldMapCard({ archive, sources, onOpen }: { archive: LibArchive; sources: Record<string, string>; onOpen: (key: string) => void }) {
  return (
    <section className="p-card wm-card">
      <h3>World map</h3>
      <p className="muted small">Every map, joined where exits lead. Click one to see who is there and to place people, chests and exits.</p>
      <WorldMap archive={archive} sources={sources} onOpen={onOpen} />
    </section>
  );
}

interface MiniProps {
  archive: LibArchive;
  mapKey: string;
  /** Tiles to mark: the picked one, and others (people). */
  marks: { x: number; y: number; kind: "pick" | "back" | "person" | "start" }[];
  onPick: (x: number, y: number) => void;
  label: string;
}

/** A small picture of a map to click a tile on (the band where the player can stand shown dashed). */
export function MiniMap({ archive, mapKey, marks, onPick, label }: MiniProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const entry = findEntry(archive, 2, ...(mapKey.split("-").slice(1).map(Number) as [number, number]));
  const map = useMemo(() => (entry ? decodeMap(entry.data) : null), [entry]);
  const s = map ? Math.max(4, Math.min(12, Math.floor(300 / map.width))) : 8;
  useEffect(() => {
    const c = ref.current;
    if (!c || !map || !entry) return;
    c.width = map.width * s;
    c.height = map.height * s;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mapCanvas(archive, entry.data), 0, 0, c.width, c.height);
    map.cells.forEach((cell, i) => {
      if (cell.walkable) return;
      ctx.fillStyle = "rgba(160,30,30,0.25)";
      ctx.fillRect((i % map.width) * s, Math.floor(i / map.width) * s, s, s);
    });
    ctx.strokeStyle = "rgba(20,60,200,0.8)";
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(4 * s + 0.5, 3 * s + 0.5, Math.max(0, map.width - 8) * s, Math.max(0, map.height - 5) * s);
    ctx.setLineDash([]);
    for (const m of marks) {
      const color = m.kind === "pick" ? "#1f7a3a" : m.kind === "back" ? "#a35a00" : m.kind === "start" ? "#2645b5" : "rgba(30,30,30,0.6)";
      ctx.fillStyle = color;
      if (m.kind === "person") ctx.fillRect(m.x * s + s / 4, m.y * s + s / 4, s / 2, s / 2);
      else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.strokeRect(m.x * s + 1, m.y * s + 1, s - 2, s - 2);
        ctx.lineWidth = 1;
      }
    }
  }, [archive, entry, map, s, marks]);
  if (!map) return <p className="error">That map is missing.</p>;
  return (
    <canvas
      ref={ref}
      className="w-mini"
      role="img"
      aria-label={label}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * map.width);
        const y = Math.floor(((e.clientY - r.top) / r.height) * map.height);
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) onPick(x, y);
      }}
      title={`Click a tile of ${map.name}: the dashed box is where the player can stand`}
    />
  );
}
