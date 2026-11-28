import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage, decodeMap, type DecodedMap } from "../format/decode";
import { encodeMap, type Frame, type MapCell } from "../format/encode";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { cells as textCells } from "../format/text";
import { useToolKeys, useUndoKeys } from "./undoKeys";
import { DARK, LIGHT, blitFrame } from "./pixels";
import type { ProjectNotes } from "../format/notes";
import { inBand } from "../format/reach";
import { tileName } from "../format/tiles";
import { PAINT_TOOLS, TilePalette } from "./TilePalette";
import { useTileWalks } from "./tileHints";

type Tool = "tile" | "fill" | "walk" | "block" | "event" | "pick";

/** The tools, their names and keys (the World view's painting tools). */
const TOOLS = PAINT_TOOLS as unknown as [Tool, string, string, string][];

const HISTORY = 100;

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  onChange: (data: Uint8Array) => void;
  /** The project notes (tile names, which tiles are solid). */
  notes?: ProjectNotes;
  setNotes?: (update: (prev: ProjectNotes) => ProjectNotes) => void;
}

export function MapEditor({ archive, entry, onChange, notes, setNotes }: Props) {
  const [map, setMap] = useState<DecodedMap>(() => decodeMap(entry.data));
  const [tool, setTool] = useState<Tool>("tile");
  const [tile, setTile] = useState(0);
  const [eventNo, setEventNo] = useState(1);
  const [zoom, setZoom] = useState(2);
  const [showWalk, setShowWalk] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paintWalk, setPaintWalk] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  // Undo history of whole-map snapshots. `stroke` holds the map as it was when
  // a drag started; `lastTag` merges runs of the same edit (typing a name).
  const undo = useRef<DecodedMap[]>([]);
  const redo = useRef<DecodedMap[]>([]);
  const stroke = useRef<DecodedMap | null>(null);
  const lastTag = useRef<string | null>(null);
  const [, bump] = useState(0);

  // No reload on entry changes: the view is re-created when another resource
  // is selected, and reloading after our own saves would wipe the undo history.

  const tiles: Frame[] = useMemo(() => {
    const t = findEntry(archive, 7, 1, map.tileset);
    return t ? decodeImage(t.data).frames : [];
  }, [archive, map.tileset]);
  // painting a tile also makes the cell walkable or blocked, as the tile is (format/tiles.ts)
  const walks = useTileWalks(archive, notes, map.tileset, tiles.length);
  const paintCell = (c: MapCell): MapCell => ({ ...c, tile, walkable: paintWalk && walks[tile] ? walks[tile].walkable : c.walkable });

  // draw
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const s = 16 * zoom;
    c.width = map.width * s;
    c.height = map.height * s;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = `rgb(${LIGHT.join(",")})`;
    ctx.fillRect(0, 0, c.width, c.height);
    map.cells.forEach((cell, i) => {
      const x = (i % map.width) * s;
      const y = Math.floor(i / map.width) * s;
      const f = tiles[cell.tile];
      if (f) blitFrame(ctx, f, x, y, zoom, true);
      else {
        ctx.fillStyle = "#c33";
        ctx.fillRect(x, y, s, s);
      }
      if (showWalk && !cell.walkable) {
        ctx.fillStyle = "rgba(200,40,40,0.28)";
        ctx.fillRect(x, y, s, s);
      }
      if (showEvents && cell.event) {
        ctx.fillStyle = "rgba(20,60,200,0.75)";
        ctx.fillRect(x + 1, y + 1, s * 0.55, s * 0.45);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(9, 5 * zoom)}px system-ui`;
        ctx.fillText(String(cell.event), x + 3, y + s * 0.38);
      }
    });
    // the area the player can stand on: x 4..w-5, y 3..h-3
    ctx.strokeStyle = "rgba(20,60,200,0.6)";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(4 * s + 0.5, 3 * s + 0.5, Math.max(0, map.width - 8) * s, Math.max(0, map.height - 5) * s);
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${DARK.join(",")},0.15)`;
    for (let x = 0; x <= map.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, c.height);
      ctx.stroke();
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(c.width, y * s + 0.5);
      ctx.stroke();
    }
  }, [map, tiles, zoom, showWalk, showEvents]);

  const remember = (before: DecodedMap, tag: string | null) => {
    if (tag === null || tag !== lastTag.current) {
      undo.current.push(before);
      if (undo.current.length > HISTORY) undo.current.shift();
    }
    lastTag.current = tag;
    redo.current = [];
    bump((n) => n + 1);
  };

  const save = (next: DecodedMap) => {
    setMap(next);
    try {
      onChange(encodeMap({ ...next, cells: next.cells }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Apply an edit that can be undone. */
  const commit = (next: DecodedMap, tag: string | null = null) => {
    if (next === map) return;
    remember(map, tag);
    save(next);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(map);
    lastTag.current = null;
    save(prev);
    bump((n) => n + 1);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(map);
    lastTag.current = null;
    save(next);
    bump((n) => n + 1);
  };

  useUndoKeys(canvas, doUndo, doRedo);
  useToolKeys(canvas, {
    ...Object.fromEntries(TOOLS.map(([t, , k]) => [k.toLowerCase(), () => setTool(t)])),
    "[": () => setTile((t) => Math.max(0, t - 1)),
    "]": () => setTile((t) => Math.min(Math.max(0, tiles.length - 1), t + 1)),
  });

  /** The tile under the pointer. */
  const cellAt = (ev: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const s = (16 * zoom * r.width) / c.width;
    const x = Math.floor((ev.clientX - r.left) / s);
    const y = Math.floor((ev.clientY - r.top) / s);
    return x < 0 || y < 0 || x >= map.width || y >= map.height ? null : { x, y };
  };

  const floodFill = (x: number, y: number): DecodedMap => {
    const from = map.cells[y * map.width + x].tile;
    if (from === tile && !paintWalk) return map;
    const cells = map.cells.slice();
    const seen = new Uint8Array(cells.length);
    const stack = [y * map.width + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || map.cells[i].tile !== from) continue;
      seen[i] = 1;
      cells[i] = paintCell(cells[i]);
      const cx = i % map.width;
      if (cx > 0) stack.push(i - 1);
      if (cx < map.width - 1) stack.push(i + 1);
      if (i >= map.width) stack.push(i - map.width);
      if (i + map.width < cells.length) stack.push(i + map.width);
    }
    return { ...map, cells };
  };

  const apply = (ev: React.PointerEvent<HTMLCanvasElement>, commitNow: boolean) => {
    const at = cellAt(ev);
    if (!at) return;
    const { x, y } = at;
    const i = y * map.width + x;
    const cur = map.cells[i];
    if (tool === "fill") {
      commit(floodFill(x, y));
      return;
    }
    let nextCell: MapCell = cur;
    switch (tool) {
      case "tile":
        nextCell = paintCell(cur);
        break;
      case "walk":
        nextCell = { ...cur, walkable: true };
        break;
      case "block":
        nextCell = { ...cur, walkable: false };
        break;
      case "event":
        nextCell = { ...cur, event: cur.event === eventNo && commitNow ? 0 : eventNo };
        break;
      case "pick":
        setTile(cur.tile);
        setTool("tile");
        return;
    }
    if (nextCell === cur || (nextCell.tile === cur.tile && nextCell.walkable === cur.walkable && nextCell.event === cur.event)) return;
    const cells = map.cells.slice();
    cells[i] = nextCell;
    const next = { ...map, cells };
    if (commitNow) commit(next);
    else setMap(next); // the drag is recorded once, on pointer up
  };

  const resize = (w: number, h: number) => {
    if (!(w >= 9 && w <= 127 && h >= 6 && h <= 127)) {
      setError("Maps must be 9-127 tiles wide and 6-127 tall.");
      return;
    }
    const cells: MapCell[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) cells.push(x < map.width && y < map.height ? map.cells[y * map.width + x] : { tile: tile, walkable: false, event: 0 });
    commit({ ...map, width: w, height: h, cells });
  };

  const walkTiles = (walk: boolean) => {
    // apply the current tile's walkability everywhere it is used
    commit({ ...map, cells: map.cells.map((c) => (c.tile === tile ? { ...c, walkable: walk } : c)) });
  };

  return (
    <div className="map-editor">
      <div className="map-tools">
        <div className="seg">
          {TOOLS.map(([t, label, k, title]) => (
            <button key={t} className={tool === t ? "" : "ghost"} aria-pressed={tool === t} onClick={() => setTool(t)} title={`${title} (${k})`}>
              {label} <kbd>{k}</kbd>
            </button>
          ))}
        </div>
        {tool === "event" && (
          <label className="field">
            Event
            <input type="number" min={1} max={255} value={eventNo} onChange={(e) => setEventNo(Math.max(1, Math.min(255, Number(e.target.value) || 1)))} />
            <span className="muted">→ script event {eventNo + 40}</span>
          </label>
        )}
        <label className="field">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[1, 2, 3, 4].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>
        <div className="seg">
          <button className="ghost" onClick={doUndo} disabled={undo.current.length === 0} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="ghost" onClick={doRedo} disabled={redo.current.length === 0} title="Redo (Ctrl+Y)">
            Redo
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={showWalk} onChange={(e) => setShowWalk(e.target.checked)} /> Blocked tint
        </label>
        <label className="check">
          <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} /> Events
        </label>
      </div>

      <div className="map-body">
        <div className="map-left">
          <div className="map-canvas">
            <canvas
              ref={canvas}
              onPointerDown={(e) => {
                const drag = tool === "tile" || tool === "walk" || tool === "block";
                painting.current = drag;
                stroke.current = drag ? map : null;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                apply(e, !drag);
              }}
              onPointerMove={(e) => {
                const at = cellAt(e);
                if (at?.x !== hover?.x || at?.y !== hover?.y) setHover(at);
                if (painting.current) apply(e, false);
              }}
              onPointerLeave={() => setHover(null)}
              onPointerUp={() => {
                const before = stroke.current;
                painting.current = false;
                stroke.current = null;
                if (before && before !== map) {
                  remember(before, null);
                  save(map);
                }
              }}
            />
          </div>
          <MapStatus map={map} at={hover} name={(t) => tileName(notes, map.tileset, t)} />
        </div>
        <div className="map-props" role="group" aria-label="The map">
          <label className="field">
            Name
            <input
              value={map.name}
              maxLength={12}
              onChange={(e) => {
                if (textCells(e.target.value) <= 12) commit({ ...map, name: e.target.value }, "name");
              }}
            />
          </label>
          <label className="field">
            Size
            <input type="number" defaultValue={map.width} key={`w${map.width}`} onBlur={(e) => resize(Number(e.target.value), map.height)} />×
            <input type="number" defaultValue={map.height} key={`h${map.height}`} onBlur={(e) => resize(map.width, Number(e.target.value))} />
          </label>
          <label className="field">
            Tileset
            <input type="number" min={1} max={255} value={map.tileset} onChange={(e) => commit({ ...map, tileset: Math.max(1, Math.min(255, Number(e.target.value) || 1)) }, "tileset")} />
          </label>
          {error && <span className="error">{error}</span>}
        </div>
        <div className="map-palette">
          <TilePalette tiles={tiles} tileset={map.tileset} tile={tile} onPick={setTile} walks={walks} notes={notes} setNotes={setNotes} paintWalk={paintWalk} onPaintWalk={setPaintWalk} />
          <div className="row">
            <button className="ghost" onClick={() => walkTiles(true)}>
              Tile {tile} walkable everywhere
            </button>
            <button className="ghost" onClick={() => walkTiles(false)}>
              Tile {tile} blocked everywhere
            </button>
          </div>
          <p className="muted small">
            The dashed box is where the player can stand. A tile with a map event runs what the map's script says for that event
            when the player steps toward it or faces it and presses OK (the World view shows and changes it). Keys: B G W X E I pick a tool,
            [ ] the tile, Ctrl+Z / Ctrl+Shift+Z undo and redo.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The tile under the pointer, in words. */
function MapStatus({ map, at, name }: { map: DecodedMap; at: { x: number; y: number } | null; name: (tile: number) => string }) {
  if (!at) return <p className="map-status muted small">Point at a tile to see where it is and what it is.</p>;
  const cell = map.cells[at.y * map.width + at.x];
  const band = inBand(at.x, at.y, map.width, map.height);
  return (
    <p className="map-status small">
      <strong>
        {at.x}, {at.y}
      </strong>
      <span>{name(cell.tile)}</span>
      <span className={cell.walkable ? "" : "error"}>{cell.walkable ? "walkable" : "blocked"}</span>
      {!band && <span className="muted">too close to the edge for the player to stand on</span>}
      {!!cell.event && <span>map event {cell.event}: walking into it runs what the map's script says for it</span>}
      <span className="muted">People, chests, exits and the start are placed in the World view.</span>
    </p>
  );
}
