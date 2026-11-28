// The world map: every map of the project as a card with its picture and
// name, maps joined by exits laid out near each other (worldMapLayout.ts),
// one line per pair of joined maps with an arrow at each end an exit leads
// to. It zooms (buttons, Ctrl/⌘ + wheel or a pinch of a trackpad or two
// fingers, "Fit all") and pans (drag,
// scroll); the zoom is remembered per project in this browser. Hovering,
// focusing or selecting a map lights up its links and fades the rest; a
// selected map shows where its exits go, and opens with a double click or
// "Open". Exits whose map is known only at run time, or that lead to a map
// that does not exist, are marked on the map they leave. Shown on the
// project home. Also the small map an author clicks on to pick a tile of
// another map (an exit's arrival).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { decodeMap } from "../format/decode";
import { findEntry, type LibArchive } from "../format/lib";
import { buildWorld, type WorldIndex } from "../format/world";
import { mapCanvas, mapThumb } from "./worldArt";
import { clampZoom, fitZoom, linkLine, neighbours, worldMapOf, ZOOM_MAX, type Box } from "./worldMapLayout";
import "./world.css";
import "./worldmap.css";

const CELL_W = 236;
const CELL_H = 176;
const BOX_W = 176;
const BOX_H = 128;
const PAD = 28;
/** Room above the maps no exit joins, for their heading. */
const ALONE_GAP = 34;

const zoomKey = (id: string) => `fmj-editor-worldmap:${id}`;

function loadZoom(id: string | undefined): { z: number; cx: number; cy: number } | null {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(zoomKey(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as { z?: unknown; cx?: unknown; cy?: unknown };
    if (typeof v.z !== "number" || !isFinite(v.z)) return null;
    return {
      z: v.z,
      cx: typeof v.cx === "number" ? v.cx : NaN,
      cy: typeof v.cy === "number" ? v.cy : NaN,
    };
  } catch {
    return null;
  }
}

function saveZoom(id: string | undefined, v: { z: number; cx: number; cy: number }): void {
  if (!id) return;
  try {
    localStorage.setItem(
      zoomKey(id),
      JSON.stringify({
        z: Math.round(v.z * 1000) / 1000,
        cx: Math.round(v.cx),
        cy: Math.round(v.cy),
      }),
    );
  } catch {
    /* private mode: the zoom is not remembered */
  }
}

const mapLabel = (world: WorldIndex, key: string) => {
  const m = world.maps.get(key);
  return m?.name || `Map ${key.split("-").slice(1).join("-")}`;
};

interface MapProps {
  archive: LibArchive;
  /** The world index, or the scripts' texts to build one. */
  world?: WorldIndex;
  sources?: Record<string, string>;
  onOpen: (key: string) => void;
  /** Remember the zoom under this project (in this browser). */
  projectId?: string;
}

export function WorldMap({ archive, world: given, sources, onOpen, projectId }: MapProps) {
  const world = useMemo(() => given ?? buildWorld(archive, sources ?? {}), [given, archive, sources]);
  // (laid out once per index: worldMapLayout.ts worldMapOf)
  const { graph, layout } = useMemo(() => worldMapOf(world), [world]);

  // the heading over the maps no exit joins (none for a lone map)
  const aloneHeading = layout.aloneRow === null ? null : layout.nodes.some((n) => n.group >= 0) ? "On their own: no exit joins these maps to another" : layout.nodes.length > 1 ? "No exit joins these maps yet" : null;
  // world coordinates
  const boxes = useMemo(() => {
    const m = new Map<string, Box>();
    for (const n of layout.nodes) {
      const extra = aloneHeading && layout.aloneRow !== null && n.row >= layout.aloneRow ? ALONE_GAP : 0;
      m.set(n.key, {
        x: PAD + n.col * CELL_W + (CELL_W - BOX_W) / 2,
        y: PAD + extra + n.row * CELL_H + (CELL_H - BOX_H) / 2,
        w: BOX_W,
        h: BOX_H,
      });
    }
    return m;
  }, [layout, aloneHeading]);
  const W = layout.cols * CELL_W + PAD * 2;
  const H = layout.rows * CELL_H + PAD * 2 + (aloneHeading ? ALONE_GAP : 0);

  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setView((v) => (v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.nodes.length > 0]);

  const fit = view.w ? fitZoom(W, H, view.w, view.h, 1) : 1;
  const minZoom = Math.min(0.1, fit);
  const [zoom, setZoom] = useState<number | null>(null);
  const z = zoom ?? fit;
  // where the world's top left is drawn in the scrolled area (centred while it is smaller than the view)
  const offset = (zz: number) => ({
    x: Math.max(0, (view.w - W * zz) / 2),
    y: Math.max(0, (view.h - H * zz) / 2),
  });
  const off = offset(z);

  // a scroll position to set once the new size is drawn
  const pending = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el || !pending.current) return;
    el.scrollLeft = pending.current.left;
    el.scrollTop = pending.current.top;
    pending.current = null;
  });

  /** Zoom to `nz`, keeping the world point under (ax, ay) of the view where it is (default: the middle). */
  const zoomTo = useCallback(
    (nz: number, ax?: number, ay?: number) => {
      const el = viewRef.current;
      if (!el) return;
      const target = clampZoom(nz, minZoom);
      const px = ax ?? el.clientWidth / 2;
      const py = ay ?? el.clientHeight / 2;
      const o = offset(z);
      const wx = (el.scrollLeft + px - o.x) / z;
      const wy = (el.scrollTop + py - o.y) / z;
      const o2 = offset(target);
      pending.current = {
        left: wx * target + o2.x - px,
        top: wy * target + o2.y - py,
      };
      setZoom(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [z, minZoom, view.w, view.h, W, H],
  );

  /** Show a world point in the middle of the view. */
  const centreOn = useCallback(
    (wx: number, wy: number, zz = z) => {
      const el = viewRef.current;
      if (!el) return;
      const o = offset(zz);
      pending.current = {
        left: wx * zz + o.x - el.clientWidth / 2,
        top: wy * zz + o.y - el.clientHeight / 2,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [z, view.w, view.h, W, H],
  );

  // the remembered zoom (once the view has a size), else fit all
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !view.w) return;
    restored.current = true;
    const saved = loadZoom(projectId);
    if (!saved || saved.z === 0) return; // (0: fit all)
    const zz = clampZoom(saved.z, Math.min(0.1, fit));
    setZoom(zz);
    const el = viewRef.current!;
    const o = offset(zz);
    const cx = isFinite(saved.cx) ? saved.cx : W / 2;
    const cy = isFinite(saved.cy) ? saved.cy : H / 2;
    pending.current = {
      left: cx * zz + o.x - el.clientWidth / 2,
      top: cy * zz + o.y - el.clientHeight / 2,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.w]);

  // remember the zoom and the middle of the view (after a pause)
  const chosen = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const remember = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const el = viewRef.current;
      // nothing to keep until the author zooms (or asks to fit all)
      if (!el || (zoom === null && !chosen.current)) return;
      const o = offset(z);
      saveZoom(projectId, {
        z: zoom === null ? 0 : z,
        cx: (el.scrollLeft + el.clientWidth / 2 - o.x) / z,
        cy: (el.scrollTop + el.clientHeight / 2 - o.y) / z,
      });
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, z, zoom, view.w, view.h]);
  useEffect(() => remember(), [remember]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  /** Fit every map in the view (and keep fitting as the view changes size). */
  const fitAll = () => {
    chosen.current = true;
    setZoom(null);
    pending.current = { left: 0, top: 0 };
    remember();
  };

  // Ctrl / ⌘ + wheel (and a trackpad pinch) zooms where the pointer is; the wheel alone scrolls
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const zRef = useRef(z);
  zRef.current = z;
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      zoomRef.current(zRef.current * k, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [layout.nodes.length > 0]);

  // two fingers pinch to zoom where they are (one finger pans: the view scrolls)
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    let g: { d0: number; z0: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) g = { d0: spread(e.touches), z0: zRef.current };
    };
    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const r = el.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      zoomRef.current(g.z0 * (spread(e.touches) / g.d0), (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) g = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [layout.nodes.length > 0]);

  // drag anywhere to pan (a drag that starts on a card does not open it)
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const el = viewRef.current!;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
    dragged.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    const el = viewRef.current!;
    if (!d.moved) {
      d.moved = true;
      dragged.current = true;
      setGrabbing(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      setGrabbing(false);
      remember();
    }
  };

  // hover, keyboard focus and selection light up a map's links
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected && !world.maps.has(selected)) setSelected(null);
  }, [world, selected]);
  const active = hover ?? focus ?? selected;
  const near = useMemo(() => new Set(active ? neighbours(graph, active).map((n) => n.key) : []), [graph, active]);

  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const select = (key: string, show = false) => {
    setSelected(key);
    if (show) {
      const b = boxes.get(key);
      const el = viewRef.current;
      if (b && el) {
        // bring it into view when it is outside
        const o = offset(z);
        const sx = b.x * z + o.x - el.scrollLeft;
        const sy = b.y * z + o.y - el.scrollTop;
        if (sx < 0 || sy < 0 || sx + b.w * z > el.clientWidth || sy + b.h * z > el.clientHeight) {
          centreOn(b.x + b.w / 2, b.y + b.h / 2); // applied as the selection is drawn
        }
      }
      cardRefs.current.get(key)?.focus({ preventScroll: true });
    }
  };

  // arrow keys move between maps; + and - zoom; 0 fits all
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomTo(z * 1.25);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomTo(z / 1.25);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      fitAll();
      return;
    }
    if (e.key === "Escape" && selected) {
      setSelected(null);
      return;
    }
    const dir = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    }[e.key];
    const from = focus && boxes.get(focus);
    if (!dir || !from) return;
    e.preventDefault();
    let best: string | null = null;
    let bestD = Infinity;
    for (const [k, b] of boxes) {
      if (k === focus) continue;
      const dx = b.x - from.x;
      const dy = b.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0) continue;
      const across = Math.abs(dx * dir[1] - dy * dir[0]);
      const d = along + across * 2;
      if (d < bestD) ((bestD = d), (best = k));
    }
    if (best) cardRefs.current.get(best)?.focus();
  };

  if (!layout.nodes.length) return <p className="muted">No maps yet.</p>;

  const S = (b: Box): Box => ({
    x: b.x * z + off.x,
    y: b.y * z + off.y,
    w: b.w * z,
    h: b.h * z,
  });
  const far = z < 0.62;
  const nameSize = Math.max(13, 12 / z);
  const badgeSize = Math.max(11, 10.5 / z);
  const sel = selected ? world.maps.get(selected) : undefined;
  const selLinks = selected ? neighbours(graph, selected) : [];

  return (
    <div className={`wmap${active ? " has-active" : ""}`}>
      <div className="wmap-bar" role="toolbar" aria-label="World map view">
        <div className="seg" role="group" aria-label="Zoom">
          <button type="button" className="ghost" onClick={() => zoomTo(z / 1.25)} disabled={z <= minZoom + 1e-6} title="Zoom out (−)" aria-label="Zoom out">
            −
          </button>
          <span className="wmap-zoom" aria-live="polite" title="Zoom">
            {Math.round(z * 100)}%
          </span>
          <button type="button" className="ghost" onClick={() => zoomTo(z * 1.25)} disabled={z >= ZOOM_MAX - 1e-6} title="Zoom in (+)" aria-label="Zoom in">
            +
          </button>
        </div>
        <button
          type="button"
          className="ghost small"
          aria-pressed={zoom === null}
          onClick={fitAll}
          title="Show every map (0)"
        >
          Fit all
        </button>
        <button type="button" className="ghost small" onClick={() => zoomTo(1)} disabled={Math.abs(z - 1) < 1e-3} title="Cards at full size">
          100%
        </button>
        <span className="wmap-hint muted small">Drag or scroll to move · Ctrl + wheel zooms</span>
        {(graph.links.length > 0 || graph.unknown.size > 0 || graph.missing.size > 0) && (
          <span className="wmap-legend muted small" aria-hidden="true">
            <svg width="34" height="10">
              <line x1="2" y1="5" x2="26" y2="5" className="wmap-line" />
              <path d="M24,1 L32,5 L24,9 z" className="wmap-head" />
            </svg>
            one way
            <svg width="40" height="10">
              <path d="M10,1 L2,5 L10,9 z" className="wmap-head" />
              <line x1="8" y1="5" x2="32" y2="5" className="wmap-line" />
              <path d="M30,1 L38,5 L30,9 z" className="wmap-head" />
            </svg>
            both ways
            {graph.unknown.size > 0 && (
              <>
                <span className="wmap-q">?</span> to a map set at run time
              </>
            )}
            {graph.missing.size > 0 && (
              <>
                <span className="wmap-q missing">!</span> to a missing map
              </>
            )}
          </span>
        )}
      </div>

      <div className="wmap-stage">
        <div
          ref={viewRef}
          className={`wmap-view${grabbing ? " grabbing" : ""}`}
          style={{ height: `min(72vh, ${Math.max(220, H + 52)}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onScroll={remember}
          onKeyDown={onKeyDown}
          onClickCapture={(e) => {
            if (dragged.current) {
              e.stopPropagation();
              e.preventDefault();
              dragged.current = false;
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList?.contains("wmap-canvas")) setSelected(null);
          }}
        >
          <div
            className="wmap-canvas"
            style={{
              width: Math.max(W * z, view.w),
              height: Math.max(H * z, view.h),
            }}
          >
            <svg className="wmap-lines" width={Math.max(W * z, view.w)} height={Math.max(H * z, view.h)} aria-hidden="true">
              <defs>
                <marker id="wmap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="wmap-head" />
                </marker>
                <marker id="wmap-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="wmap-head on" />
                </marker>
              </defs>
              {graph.links.map((l) => {
                const a = boxes.get(l.a);
                const b = boxes.get(l.b);
                if (!a || !b) return null;
                const on = active !== null && (l.a === active || l.b === active);
                const p = linkLine(S(a), S(b), 3);
                const m = on ? "url(#wmap-arrow-on)" : "url(#wmap-arrow)";
                return <line key={`${l.a}|${l.b}`} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} className={`wmap-line${on ? " on" : active ? " dim" : ""}`} markerEnd={l.ab ? m : undefined} markerStart={l.ba ? m : undefined} />;
              })}
              {/* exits that lead to a map set at run time, or to a missing map: a short dashed stub */}
              {layout.nodes.map((n) => {
                const unknown = graph.unknown.get(n.key) ?? 0;
                const missing = graph.missing.get(n.key)?.length ?? 0;
                if (!unknown && !missing) return null;
                const b = S(boxes.get(n.key)!);
                const x = b.x + b.w + 2;
                const y = b.y + Math.min(18, b.h / 4);
                const dim = active !== null && active !== n.key;
                return (
                  <g key={`stub-${n.key}`} className={`wmap-stub${missing ? " missing" : ""}${dim ? " dim" : ""}`}>
                    <line x1={x} y1={y} x2={x + 16} y2={y - 10} />
                    <circle cx={x + 22} cy={y - 14} r={7} />
                    <text x={x + 22} y={y - 10.5} textAnchor="middle">
                      {missing ? "!" : "?"}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div
              className="wmap-layer"
              style={{
                width: W,
                height: H,
                transform: `translate(${off.x}px, ${off.y}px) scale(${z})`,
              }}
            >
              {aloneHeading && layout.aloneRow !== null && (
                <div
                  className="wmap-alone"
                  style={{
                    left: PAD + (CELL_W - BOX_W) / 2,
                    top: PAD + layout.aloneRow * CELL_H,
                    fontSize: Math.max(13, 12 / z),
                  }}
                >
                  {aloneHeading}
                </div>
              )}
              {layout.nodes.map((n) => {
                const b = boxes.get(n.key)!;
                const e = findEntry(archive, 2, ...(n.key.split("-").slice(1).map(Number) as [number, number]));
                const m = world.maps.get(n.key)!;
                const links = neighbours(graph, n.key);
                const goes = links.filter((x) => x.out).length;
                const unknown = graph.unknown.get(n.key) ?? 0;
                const missing = graph.missing.get(n.key) ?? [];
                const start = n.key === graph.start;
                const name = mapLabel(world, n.key);
                const state = active === null ? "" : n.key === active ? " active" : near.has(n.key) ? " near" : " dim";
                const tip = [
                  `${name} (map ${n.key.split("-").slice(1).join("-")})${start ? ", where the game starts" : ""}`,
                  `${m.people.length} ${m.people.length === 1 ? "person or object" : "people and objects"}`,
                  links.length ? `joined to ${links.length} ${links.length === 1 ? "map" : "maps"}` : "no exit joins it to another map",
                  unknown ? `${unknown} ${unknown === 1 ? "exit leads" : "exits lead"} to a map set at run time` : "",
                  missing.length ? `exits lead to missing ${missing.length === 1 ? "map" : "maps"} ${missing.map((k) => k.split("-").slice(1).join("-")).join(", ")}` : "",
                  "Click to see its links; double-click to open it",
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <button
                    key={n.key}
                    ref={(el) => {
                      if (el) cardRefs.current.set(n.key, el);
                      else cardRefs.current.delete(n.key);
                    }}
                    type="button"
                    className={`wmap-card${start ? " start" : ""}${selected === n.key ? " selected" : ""}${far ? " far" : ""}${state}`}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    aria-pressed={selected === n.key}
                    aria-label={`${name}${start ? ", the start" : ""}: joined to ${links.length} ${links.length === 1 ? "map" : "maps"}`}
                    title={tip}
                    onClick={() => select(n.key)}
                    onDoubleClick={() => onOpen(n.key)}
                    onPointerEnter={(ev) => ev.pointerType !== "touch" && !drag.current?.moved && setHover(n.key)}
                    onPointerLeave={() => setHover((h) => (h === n.key ? null : h))}
                    onFocus={() => setFocus(n.key)}
                    onBlur={() => setFocus((f) => (f === n.key ? null : f))}
                  >
                    <span className="wmap-pic">{e && <img src={mapThumb(archive, e.data, 160)} alt="" draggable={false} />}</span>
                    <span className="wmap-name" style={{ fontSize: nameSize }}>
                      {start && (
                        <span className="wmap-start" aria-hidden="true">
                          ▶{" "}
                        </span>
                      )}
                      {name}
                    </span>
                    {!far && (
                      <span className="wmap-meta muted">
                        {[
                          `${m.people.length} ${m.people.length === 1 ? "person" : "people"}`,
                          goes ? `exits to ${goes} ${goes === 1 ? "map" : "maps"}` : unknown || missing.length ? "" : "no exits out",
                          unknown ? `${unknown} set at run time` : "",
                          missing.length ? `${missing.length} to a missing map` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {(unknown > 0 || missing.length > 0) && far && (
                      <span className={`wmap-badge${missing.length ? " missing" : ""}`} style={{ fontSize: badgeSize }} aria-hidden="true">
                        {missing.length ? "!" : "?"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {sel && selected && (
          <div className="wmap-detail" role="region" aria-label={`Links of ${mapLabel(world, selected)}`}>
            <div className="wmap-detail-head">
              <strong>
                {selected === graph.start && <span className="wmap-start">▶ </span>}
                {mapLabel(world, selected)}
              </strong>
              <span className="muted small"> map {selected.split("-").slice(1).join("-")}</span>
              <span className="spacer" />
              <button type="button" className="small" onClick={() => onOpen(selected)}>
                Open map
              </button>
              <button type="button" className="ghost small" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </div>
            <LinkList title="Exits go to" world={world} items={selLinks.filter((x) => x.out).map((x) => ({ key: x.key, n: x.out, back: x.in > 0 }))} onPick={(k) => select(k, true)} />
            <LinkList title="Comes from" world={world} items={selLinks.filter((x) => x.in && !x.out).map((x) => ({ key: x.key, n: x.in, back: false }))} onPick={(k) => select(k, true)} />
            {(graph.unknown.get(selected) ?? 0) > 0 && (
              <p className="small">
                <span className="wmap-q">?</span> {graph.unknown.get(selected)} {graph.unknown.get(selected) === 1 ? "exit leads" : "exits lead"} to a map set at run time (the scripts it switches to cannot be followed all the way): open the
                map to see them.
              </p>
            )}
            {(graph.missing.get(selected)?.length ?? 0) > 0 && (
              <p className="small error">
                Exits lead to {graph.missing.get(selected)!.length === 1 ? "a map that does not exist" : "maps that do not exist"}:{" "}
                {graph.missing
                  .get(selected)!
                  .map((k) => `map ${k.split("-").slice(1).join("-")}`)
                  .join(", ")}
                .
              </p>
            )}
            {!selLinks.length && !(graph.unknown.get(selected) ?? 0) && <p className="small muted">No exit joins this map to another yet. Open it to place an exit.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function LinkList({ title, items, world, onPick }: { title: string; items: { key: string; n: number; back: boolean }[]; world: WorldIndex; onPick: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <p className="wmap-links small">
      <span className="muted">{title}:</span>{" "}
      {items.map((x, i) => (
        <span key={x.key}>
          {i > 0 && ", "}
          <button type="button" className="link" onClick={() => onPick(x.key)} title={`${x.n} ${x.n === 1 ? "exit" : "exits"}${x.back ? ", and back" : ""}`}>
            {mapLabel(world, x.key)}
          </button>
          {x.back ? (
            <span className="muted" aria-label=" and back">
              {" "}
              ↔
            </span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

/** The project home's world map section. */
export function WorldMapCard({ archive, sources, onOpen, projectId }: { archive: LibArchive; sources: Record<string, string>; onOpen: (key: string) => void; projectId?: string }) {
  const world = useMemo(() => buildWorld(archive, sources), [archive, sources]);
  const graph = useMemo(() => worldMapOf(world).graph, [world]);
  const alone = graph.keys.filter((k) => !graph.links.some((l) => l.a === k || l.b === k)).length;
  return (
    <section className="p-card wm-card">
      <h3>World map</h3>
      <p className="muted small">
        Every map, near the maps its exits join; an arrow points where an exit leads. Click a map to light up its links, double-click (or Open map) to see who is there and to place people, chests and exits.
        {graph.keys.length > 1 && (
          <>
            {" "}
            {graph.keys.length} maps, {graph.links.length} {graph.links.length === 1 ? "pair" : "pairs"} joined
            {alone ? `, ${alone} on ${alone === 1 ? "its" : "their"} own` : ""}.
          </>
        )}
      </p>
      <WorldMap archive={archive} world={world} onOpen={onOpen} projectId={projectId} />
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
