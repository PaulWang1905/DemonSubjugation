// Pictures for the World view and the world map: a map's tiles as a canvas
// (cached by the map's and the tileset's bytes), small map thumbnails, and
// sprite frames as image URLs.
import { decodeImage, decodeMap, type DecodedMap } from "../format/decode";
import type { Frame } from "../format/encode";
import { findEntry, type LibArchive } from "../format/lib";
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

function frameImage(f: Frame, opaque: boolean): ImageData {
  const img = new ImageData(f.width, f.height);
  for (let i = 0; i < f.pixels.length; i++) {
    const v = f.pixels[i];
    if (v === 2 && !opaque) continue;
    img.data.set([...(v === 1 ? DARK : LIGHT), 255], i * 4);
  }
  return img;
}

const mapCache = new WeakMap<Uint8Array, { tiles: Uint8Array | null; canvas: HTMLCanvasElement }>();

/** A map drawn at 16 pixels a tile (cached while the map and its tileset are unchanged). */
export function mapCanvas(archive: LibArchive, data: Uint8Array): HTMLCanvasElement {
  const map = decodeMap(data);
  const ts = findEntry(archive, 7, 1, map.tileset)?.data ?? null;
  const hit = mapCache.get(data);
  if (hit && hit.tiles === ts) return hit.canvas;
  const canvas = drawMap(map, ts ? framesOf(ts) : []);
  mapCache.set(data, { tiles: ts, canvas });
  return canvas;
}

function drawMap(map: DecodedMap, tiles: Frame[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, map.width * 16);
  c.height = Math.max(1, map.height * 16);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = `rgb(${LIGHT.join(",")})`;
  ctx.fillRect(0, 0, c.width, c.height);
  const imgs = tiles.map((f) => frameImage(f, true));
  map.cells.forEach((cell, i) => {
    const x = (i % map.width) * 16;
    const y = Math.floor(i / map.width) * 16;
    const img = imgs[cell.tile];
    if (img) ctx.putImageData(img, x, y);
    else {
      ctx.fillStyle = "#c33";
      ctx.fillRect(x, y, 16, 16);
    }
  });
  return c;
}

const thumbCache = new WeakMap<HTMLCanvasElement, Map<number, string>>();

/** A map's picture scaled to fit `max` pixels wide / high, as an image URL. */
export function mapThumb(archive: LibArchive, data: Uint8Array, max = 160): string {
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
