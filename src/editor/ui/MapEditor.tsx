import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage, decodeMap, type DecodedMap } from "../format/decode";
import { encodeMap, type Frame, type MapCell } from "../format/encode";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { cells as textCells } from "../format/text";
import { FrameCanvas } from "./FrameStrip";
import { useUndoKeys } from "./undoKeys";
import { DARK, LIGHT, blitFrame } from "./pixels";

type Tool = "tile" | "fill" | "walk" | "block" | "event" | "pick";

const HISTORY = 100;

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  onChange: (data: Uint8Array) => void;
}

export function MapEditor({ archive, entry, onChange }: Props) {
  const [map, setMap] = useState<DecodedMap>(() => decodeMap(entry.data));
  const [tool, setTool] = useState<Tool>("tile");
  const [tile, setTile] = useState(0);
  const [eventNo, setEventNo] = useState(1);
  const [zoom, setZoom] = useState(2);
  const [showWalk, setShowWalk] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const floodFill = (x: number, y: number): DecodedMap => {
    const from = map.cells[y * map.width + x].tile;
    if (from === tile) return map;
    const cells = map.cells.slice();
    const stack = [y * map.width + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (cells[i].tile !== from) continue;
      cells[i] = { ...cells[i], tile };
      const cx = i % map.width;
      if (cx > 0) stack.push(i - 1);
      if (cx < map.width - 1) stack.push(i + 1);
      if (i >= map.width) stack.push(i - map.width);
      if (i + map.width < cells.length) stack.push(i + map.width);
    }
    return { ...map, cells };
  };

  const apply = (ev: React.PointerEvent<HTMLCanvasElement>, commitNow: boolean) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const s = (16 * zoom * r.width) / c.width;
    const x = Math.floor((ev.clientX - r.left) / s);
    const y = Math.floor((ev.clientY - r.top) / s);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const i = y * map.width + x;
    const cur = map.cells[i];
    if (tool === "fill") {
      commit(floodFill(x, y));
      return;
    }
    let nextCell: MapCell = cur;
    switch (tool) {
      case "tile":
        nextCell = { ...cur, tile };
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
          {(
            [
              ["tile", "Paint tile"],
              ["fill", "Fill"],
              ["walk", "Walkable"],
              ["block", "Blocked"],
              ["event", "Event"],
              ["pick", "Pick tile"],
            ] as [Tool, string][]
          ).map(([t, label]) => (
            <button key={t} className={tool === t ? "" : "ghost"} onClick={() => setTool(t)}>
              {label}
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

      <div className="map-props">
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

      <div className="map-body">
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
            onPointerMove={(e) => painting.current && apply(e, false)}
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
        <div className="palette">
          <div className="palette-head">
            <strong>Tiles</strong>
            <span className="muted">tile {tile}</span>
          </div>
          <div className="palette-grid">
            {tiles.map((f, i) => (
              <button key={i} className={`tilebtn ${i === tile ? "sel" : ""}`} onClick={() => setTile(i)} title={`Tile ${i}`}>
                <FrameCanvas frame={f} scale={2} />
              </button>
            ))}
            {tiles.length === 0 && <p className="muted">Tileset {map.tileset} is missing.</p>}
          </div>
          <div className="row">
            <button className="ghost" onClick={() => walkTiles(true)}>
              Tile {tile} walkable everywhere
            </button>
            <button className="ghost" onClick={() => walkTiles(false)}>
              Tile {tile} blocked everywhere
            </button>
          </div>
          <p className="muted small">
            The dashed box is where the player can stand. Map event N runs script event N+40 when the player steps toward that
            tile or faces it and presses OK.
          </p>
        </div>
      </div>
    </div>
  );
}
