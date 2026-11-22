// Pictures for the World view and the world map: a map's tiles as a canvas
// (cached by the map's and the tileset's bytes), small map thumbnails (also
// remembered by content, so a project opened again draws none), and sprite
// frames as image URLs.
import { decodeImage, decodeMap, type DecodedMap } from "../format/decode";
import type { Frame } from "../format/encode";
import { findEntry, type LibArchive } from "../format/lib";
import { bytesHash, Lru, sameBytes } from "../format/memo";
import { DARK, LIGHT } from "./pixels";

const framesCache = new WeakMap<Uint8Array, Frame[]>();

/** An image resource's frames (cached by its bytes). */
export function framesOf(data: Uint8Array): Frame[] {
  let f = framesCache.get(data);
  if (!f) {
    try {
      f = decodeImage(data).frames;
    } catch {
      f = [];
    }
    framesCache.set(data, f);
  }
  return f;
}

/** A frame's RGBA pixels (transparent ones left clear unless `opaque`). */
export function frameRgba(f: Frame, opaque: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(f.width * f.height * 4);
  const n = Math.min(f.pixels.length, f.width * f.height);
  for (let i = 0; i < n; i++) {
    const v = f.pixels[i];
    if (v === 2 && !opaque) continue;
    const c = v === 1 ? DARK : LIGHT;
    const o = i * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = 255;
  }
  return out;
}

function frameImage(f: Frame, opaque: boolean): ImageData {
  const img = new ImageData(f.width, f.height);
  img.data.set(frameRgba(f, opaque));
  return img;
}

const tilesCache = new WeakMap<Uint8Array, Uint8ClampedArray[]>();

/** A tileset's tiles as RGBA (cached by its bytes). */
function tilesRgba(ts: Uint8Array | null): { frames: Frame[]; rgba: Uint8ClampedArray[] } {
  if (!ts) return { frames: [], rgba: [] };
  const frames = framesOf(ts);
  let rgba = tilesCache.get(ts);
  if (!rgba) tilesCache.set(ts, (rgba = frames.map((f) => frameRgba(f, true))));
  return { frames, rgba };
}

/**
 * A map at 16 pixels a tile as RGBA: each cell's tile (a missing tile in
 * red), drawn in cell order, on the screen's light colour.
 */
export function mapRgba(
  map: DecodedMap,
  tiles: Frame[],
  rgba: Uint8ClampedArray[] = tiles.map((f) => frameRgba(f, true)),
): { width: number; height: number; data: Uint8ClampedArray } {
  const W = Math.max(1, map.width * 16);
  const H = Math.max(1, map.height * 16);
  const data = new Uint8ClampedArray(W * H * 4);
  // (a pixel as one 32-bit word, in the machine's byte order)
  const words = new Uint32Array(data.buffer);
  const word = (c: readonly number[]) => new Uint32Array(Uint8ClampedArray.of(c[0], c[1], c[2], 255).buffer)[0];
  const fill = (x0: number, y0: number, w: number, h: number, c: readonly number[]) => {
    const v = word(c);
    const from = Math.max(0, x0), to = Math.min(W, x0 + w);
    if (to <= from) return;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) words.fill(v, y * W + from, y * W + to);
  };
  fill(0, 0, W, H, LIGHT);
  map.cells.forEach((cell, i) => {
    const x0 = (i % map.width) * 16;
    const y0 = Math.floor(i / map.width) * 16;
    const f = tiles[cell.tile];
    const px = rgba[cell.tile];
    if (!f || !px) return fill(x0, y0, 16, 16, [0xcc, 0x33, 0x33]);
    // (as putImageData: every pixel of the tile, clipped to the map)
    const w = Math.min(f.width, W - x0);
    if (w <= 0) return;
    for (let y = 0; y < f.height && y0 + y < H; y++) data.set(px.subarray(y * f.width * 4, (y * f.width + w) * 4), ((y0 + y) * W + x0) * 4);
  });
  return { width: W, height: H, data };
}

const mapCache = new WeakMap<Uint8Array, { tiles: Uint8Array | null; canvas: HTMLCanvasElement }>();

/** A map drawn at 16 pixels a tile (cached while the map and its tileset are unchanged). */
export function mapCanvas(archive: LibArchive, data: Uint8Array): HTMLCanvasElement {
  const map = decodeMap(data);
  const ts = findEntry(archive, 7, 1, map.tileset)?.data ?? null;
  const hit = mapCache.get(data);
  if (hit && hit.tiles === ts) return hit.canvas;
  const canvas = drawMap(map, ts);
  mapCache.set(data, { tiles: ts, canvas });
  return canvas;
}

function drawMap(map: DecodedMap, ts: Uint8Array | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, map.width * 16);
  c.height = Math.max(1, map.height * 16);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  // (the whole map at once: far faster than a putImageData per cell)
  const { frames, rgba } = tilesRgba(ts);
  const px = mapRgba(map, frames, rgba);
  ctx.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  return c;
}

const thumbCache = new WeakMap<HTMLCanvasElement, Map<number, string>>();
// thumbnails by the map's and the tileset's bytes (a project read again from storage has new arrays)
const thumbsByContent = new Lru<string, { data: Uint8Array; ts: Uint8Array | null; url: string }[]>(600);
const hashes = new WeakMap<Uint8Array, number>();
const hashOf = (b: Uint8Array) => {
  let h = hashes.get(b);
  if (h === undefined) hashes.set(b, (h = bytesHash(b)));
  return h;
};

/** A map's picture scaled to fit `max` pixels wide / high, as an image URL. */
export function mapThumb(archive: LibArchive, data: Uint8Array, max = 160): string {
  const drawn = mapCache.get(data);
  const ts = findEntry(archive, 7, 1, decodeMap(data).tileset)?.data ?? null;
  if (drawn && drawn.tiles === ts) {
    const hit = thumbCache.get(drawn.canvas)?.get(max);
    if (hit) return hit;
  }
  const key = `${max}:${data.length}:${bytesHash(data)}:${ts ? `${ts.length}:${hashOf(ts)}` : "-"}`;
  const list = thumbsByContent.get(key);
  const known = list?.find((x) => sameBytes(x.data, data) && (x.ts === ts || (!!x.ts && !!ts && sameBytes(x.ts, ts))));
  if (known) return known.url;
  const url = drawThumb(archive, data, max);
  thumbsByContent.set(key, [...(list ?? []), { data: data.slice(), ts: ts && ts.slice(), url }]);
  return url;
}

function drawThumb(archive: LibArchive, data: Uint8Array, max: number): string {
  const src = mapCanvas(archive, data);
  let m = thumbCache.get(src);
  if (!m) thumbCache.set(src, (m = new Map()));
  const hit = m.get(max);
  if (hit) return hit;
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  const url = c.toDataURL();
  m.set(max, url);
  return url;
}

const spriteCache = new WeakMap<Uint8Array, Map<number, { url: string; width: number; height: number } | null>>();

/** Frame `frame` (0-based; the first one when there are fewer) of a sprite resource as an image URL. */
export function spriteFrame(archive: LibArchive, key: string, frame: number): { url: string; width: number; height: number } | null {
  const [rt, type, index] = key.split("-").map(Number);
  const e = findEntry(archive, rt, type, index);
  if (!e) return null;
  let m = spriteCache.get(e.data);
  if (!m) spriteCache.set(e.data, (m = new Map()));
  if (m.has(frame)) return m.get(frame)!;
  const frames = framesOf(e.data);
  const f = frames[frame] ?? frames[0];
  let out: { url: string; width: number; height: number } | null = null;
  if (f && f.width && f.height) {
    const c = document.createElement("canvas");
    c.width = f.width;
    c.height = f.height;
    c.getContext("2d")?.putImageData(frameImage(f, false), 0, 0);
    out = { url: c.toDataURL(), width: f.width, height: f.height };
  }
  m.set(frame, out);
  return out;
}
