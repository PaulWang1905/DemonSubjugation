// Blank graphics and animations for the editor's "+ Add…" menu. Sizes and
// frame counts follow the first existing resource of the same kind, so a new
// sprite matches the game's other sprites.
import { encodeImage, encodeSrsParts, type Frame } from "../format/encode";
import type { LibArchive } from "../format/lib";

interface Shape {
  width: number;
  height: number;
  frames: number;
  /** 0 white (backgrounds, tiles), 2 transparent (sprites). */
  fill: 0 | 2;
}

/** Sizes used when the game has no resource of that kind yet. */
const DEFAULTS: Record<string, Shape> = {
  "7-1": { width: 16, height: 16, frames: 16, fill: 0 }, // tileset
  "8-1": { width: 16, height: 16, frames: 12, fill: 2 }, // party walk: 4 directions x 3 steps
  "8-2": { width: 16, height: 16, frames: 12, fill: 2 }, // NPC walk
  "8-3": { width: 32, height: 24, frames: 2, fill: 2 }, // monster in battle
  "8-4": { width: 16, height: 16, frames: 3, fill: 2 }, // object (chest: closed, open)
  "9": { width: 20, height: 20, frames: 1, fill: 0 }, // item icon (any item type)
  "11-1": { width: 22, height: 20, frames: 1, fill: 0 }, // portrait
  "11-3": { width: 24, height: 28, frames: 12, fill: 2 }, // party member in battle
  "11-4": { width: 160, height: 96, frames: 1, fill: 0 }, // battle background
  "11-5": { width: 160, height: 96, frames: 1, fill: 0 }, // story picture
};

function shapeFor(a: LibArchive, resType: number, type: number): Shape {
  const fallback = DEFAULTS[`${resType}-${type}`] ?? DEFAULTS[String(resType)] ?? { width: 16, height: 16, frames: 1, fill: 2 };
  const like =
    a.entries.find((e) => e.resType === resType && e.type === type) ??
    (resType === 9 ? a.entries.find((e) => e.resType === 9) : undefined);
  if (!like || like.data.length < 6) return fallback;
  return { width: like.data[2] || fallback.width, height: like.data[3] || fallback.height, frames: like.data[4] || 1, fill: fallback.fill };
}

/** A blank image resource shaped like the game's others of the same kind. */
export function blankGraphic(a: LibArchive, resType: number, type: number, index: number): Uint8Array {
  const s = shapeFor(a, resType, type);
  const frames: Frame[] = Array.from({ length: s.frames }, () => ({
    width: s.width,
    height: s.height,
    pixels: new Uint8Array(s.width * s.height).fill(s.fill),
  }));
  return encodeImage(type, index, frames);
}

/** A one-frame animation with a small spark in the middle of the screen. */
export function blankAnimation(type: number, index: number): Uint8Array {
  const spark: Frame = {
    width: 8,
    height: 8,
    pixels: Uint8Array.from({ length: 64 }, (_, i) => {
      const x = i % 8;
      const y = Math.floor(i / 8);
      return x === 3 || x === 4 || y === 3 || y === 4 ? (Math.abs(x - 3.5) + Math.abs(y - 3.5) < 3.5 ? 1 : 2) : 2;
    }),
  };
  return encodeSrsParts({
    type,
    index,
    start: 0,
    end: 0,
    frames: [{ x: 76, y: 44, show: 10, next: 10, image: 0 }],
    images: [encodeImage(1, 1, [spark])],
  });
}
