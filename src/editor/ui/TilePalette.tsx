// The tiles to paint with, shared by a map's World and Tiles views: big
// swatches (a red corner marks the tiles that block the player), the tile
// under the pointer shown large with its name, and the chosen tile's name and
// "when painted" walkability, which the author can set (kept in the project
// notes, see format/tiles.ts).
import { useEffect, useState } from "react";
import type { Frame } from "../format/encode";
import type { ProjectNotes } from "../format/notes";
import { setTileNote, tileName, tileNote, type TileWalk } from "../format/tiles";
import { FrameCanvas } from "./FrameStrip";
import "./authoring.css";

interface Props {
  tiles: Frame[];
  tileset: number;
  tile: number;
  onPick: (i: number) => void;
  walks: TileWalk[];
  notes?: ProjectNotes;
  setNotes?: (update: (prev: ProjectNotes) => ProjectNotes) => void;
  /** Painting a tile also sets the cell's walkability. */
  paintWalk: boolean;
  onPaintWalk: (on: boolean) => void;
  /** Swatch scale (2: 32px). */
  scale?: number;
}

/** The painting tools of a map's World and Tiles views: one set of names and keys. */
export const PAINT_TOOLS = [
  ["tile", "Tile", "B", "Paint the chosen tile (the cell also becomes walkable or blocked, as the tile is)"],
  ["fill", "Fill", "G", "Fill an area of one tile with the chosen tile"],
  ["walk", "Walkable", "W", "Let the player walk on cells"],
  ["block", "Blocked", "X", "Stop the player walking on cells"],
  ["event", "Event no.", "E", "Paint a map event number on cells: walking into one runs that event"],
  ["pick", "Pick", "I", "Pick the tile under the pointer to paint with"],
] as const;

const FROM: Record<TileWalk["from"], string> = {
  yours: "your setting",
  maps: "how your maps use it",
  template: "how the template's maps use it",
  guess: "no map uses it yet",
};

export function TilePalette({ tiles, tileset, tile, onPick, walks, notes, setNotes, paintWalk, onPaintWalk, scale = 2 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? tile;
  const w = walks[shown];
  const name = (i: number) => tileName(notes, tileset, i);
  return (
    <div className="tp">
      <div className="tp-preview" aria-live="polite">
        {tiles[shown] && <FrameCanvas frame={tiles[shown]} scale={4} />}
        <div>
          {tileNote(notes, tileset, shown)?.name ? (
            <>
              <strong>{name(shown)}</strong> <span className="muted small">tile {shown}</span>
            </>
          ) : (
            <strong>Tile {shown}</strong>
          )}
          {w && (
            <p className="small muted">
              <span className={w.walkable ? "tp-walk" : "tp-solid"}>{w.walkable ? "Walkable" : "Blocked"}</span> when painted ({FROM[w.from]})
            </p>
          )}
          {hover !== null && hover !== tile && <p className="small muted">Click to paint with it.</p>}
        </div>
      </div>
      <div className="palette-grid tp-grid" role="listbox" aria-label="Tiles" onMouseLeave={() => setHover(null)}>
        {tiles.map((f, i) => (
          <button
            key={i}
            role="option"
            className={`tilebtn tp-btn${i === tile ? " sel" : ""}${walks[i] && !walks[i].walkable ? " solid" : ""}`}
            onClick={() => onPick(i)}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            title={`${name(i)} (tile ${i}): ${walks[i]?.walkable === false ? "blocked" : "walkable"} when painted`}
            aria-label={`${name(i)}, tile ${i}, ${walks[i]?.walkable === false ? "blocked" : "walkable"}`}
            aria-selected={i === tile}
          >
            <FrameCanvas frame={f} scale={scale} />
          </button>
        ))}
        {tiles.length === 0 && <p className="muted">Tileset {tileset} is missing.</p>}
      </div>
      {setNotes && tiles[tile] && (
        <div className="tp-this">
          <TileNameField key={`${tileset}-${tile}`} value={tileNote(notes, tileset, tile)?.name ?? ""} onSave={(v) => setNotes((n) => setTileNote(n, tileset, tile, { name: v }))} label={`Name of tile ${tile}`} />
          <div className="seg tp-solidity" role="radiogroup" aria-label={`Tile ${tile} when painted`}>
            <span className="small muted">When painted:</span>
            {[true, false].map((walk) => (
              <button
                key={String(walk)}
                role="radio"
                aria-checked={walks[tile]?.walkable === walk}
                className={walks[tile]?.walkable === walk ? "small" : "ghost small"}
                onClick={() => setNotes((n) => setTileNote(n, tileset, tile, { solid: !walk }))}
              >
                {walk ? "Walkable" : "Blocked"}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="check small tp-paintwalk">
        <input type="checkbox" checked={paintWalk} onChange={(e) => onPaintWalk(e.target.checked)} /> Painting a tile also makes the cell walkable or blocked
      </label>
    </div>
  );
}

function TileNameField({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="tp-name"
      value={v}
      placeholder="Name this tile (grass, house door…)"
      aria-label={label}
      maxLength={40}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
