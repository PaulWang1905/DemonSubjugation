// Lightweight decoders used by the editor UI (previews, forms). They mirror
// the engine's setData() code but return plain data.
import { sysGbkDecode } from "../../engine/java";
import type { Frame, MapCell } from "./encode";

function cstr(b: Uint8Array, start: number, max: number): string {
  let e = start;
  while (e < b.length && e < start + max && b[e] !== 0) e++;
  return sysGbkDecode(b.subarray(start, e));
}

/** Decode a ResImage into frames (0 white, 1 black, 2 transparent). */
export function decodeImage(b: Uint8Array, offset = 0): { frames: Frame[]; size: number } {
  const width = b[offset + 2];
  const height = b[offset + 3];
  const number = b[offset + 4];
  const transparent = b[offset + 5] === 2;
  const rowBytes = Math.ceil(width / 8) * (transparent ? 2 : 1);
  const frames: Frame[] = [];
  let p = offset + 6;
  for (let n = 0; n < number; n++) {
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (transparent) {
          const bit = x * 2;
          const v = b[p + (bit >> 3)] ?? 0;
          const t = (v << (bit & 7)) & 0x80;
          const c = (v << ((bit & 7) + 1)) & 0x80;
          pixels[y * width + x] = t ? 2 : c ? 1 : 0;
        } else {
          const v = b[p + (x >> 3)] ?? 0;
          pixels[y * width + x] = (v << (x & 7)) & 0x80 ? 1 : 0;
        }
      }
      p += rowBytes;
    }
    frames.push({ width, height, pixels });
  }
  return { frames, size: p - offset };
}

export interface DecodedMap {
  type: number;
  index: number;
  tileset: number;
  name: string;
  width: number;
  height: number;
  cells: MapCell[];
}

export function decodeMap(b: Uint8Array): DecodedMap {
  const width = b[0x10];
  const height = b[0x11];
  const cells: MapCell[] = [];
  for (let i = 0; i < width * height; i++) {
    const lo = b[0x12 + i * 2] ?? 0;
    cells.push({ tile: lo & 0x7f, walkable: (lo & 0x80) !== 0, event: b[0x13 + i * 2] ?? 0 });
  }
  return { type: b[0], index: b[1], tileset: b[2], name: cstr(b, 3, 13), width, height, cells };
}

/** Frames of an SRS animation's images (for previews). */
export function decodeSrsImages(b: Uint8Array): Frame[] {
  const frameNum = b[2];
  const imageNum = b[3];
  let p = 6 + frameNum * 5;
  const out: Frame[] = [];
  for (let i = 0; i < imageNum && p < b.length; i++) {
    const { frames, size } = decodeImage(b, p);
    out.push(...frames);
    p += size;
  }
  return out;
}

/** Human-readable name of a resource, read from its bytes. */
export function resourceName(resType: number, type: number, b: Uint8Array): string {
  try {
    switch (resType) {
      case 1:
        return cstr(b, 2, 22);
      case 2:
        return cstr(b, 3, 13);
      case 3:
        return type === 1 ? cstr(b, 0x0a, 12) : type === 3 ? cstr(b, 6, 12) : cstr(b, 9, 12);
      case 4:
      case 6:
        return cstr(b, 6, 12);
      default:
        return "";
    }
  } catch {
    return "";
  }
}

export const KIND_NAMES: Record<number, string> = {
  1: "Scripts",
  2: "Maps",
  3: "Characters",
  4: "Magic",
  5: "Animations",
  6: "Items",
  7: "Tilesets",
  8: "Sprites",
  9: "Item icons",
  10: "Effect images",
  11: "Pictures",
  12: "Tables",
};

export function subTypeName(resType: number, type: number): string {
  if (resType === 3) return ["", "Party", "NPC", "Monster", "Object"][type] ?? `type ${type}`;
  if (resType === 4) return ["", "Attack", "Enhance", "Restore", "Revive", "Special"][type] ?? `type ${type}`;
  if (resType === 6)
    return (
      ["", "Hat", "Clothes", "Shoes", "Armour", "Bracers", "Decoration", "Weapon", "Thrown", "Medicine", "Revival", "Elixir", "Stimulant", "Escape", "Story"][type] ??
      `type ${type}`
    );
  if (resType === 8) return ["", "Party walk", "NPC walk", "Monster battle", "Object"][type] ?? `type ${type}`;
  if (resType === 11)
    return ["", "Portraits", "System UI", "Party battle", "Battle backgrounds", "Story pictures"][type] ?? `type ${type}`;
  if (resType === 12) return ["", "Spell lists", "Level tables"][type] ?? `type ${type}`;
  return `type ${type}`;
}
