// The wider map view for games made with BBK's RPG kit (F5): around the
// device's screen, more of the map, drawn from the fmj library the .gam
// carries, at the place the game's memory gives (KitCheats.mapView).
//
// The game's own screen is never changed: its map area (9 × 6 tiles from
// x 8, or x 7 in 伏魔记 1.0 and 1.2) goes in the middle of a larger frame, and the border around it
// shows the map's other tiles and the characters on them. The border is
// shown only while the game's screen confirms it: the tiles the game shows
// must be the library's for that place (most of them; sprites and boxes
// cover some). Battles, menus over the whole screen, scene pictures, or a
// build whose memory is not as expected fail the check, and the frame then
// shows the device's whole screen with a blank border.

import { DatLib, ResType } from "../engine/fmj/lib/DatLib";
import type { KitMapView } from "./kitCheats";
import { LCD_HEIGHT, LCD_STRIDE, LCD_WIDTH } from "./lcd";

const TILE = 16, COLS = 9, ROWS = 6;
/** Where builds start the map area on the screen. */
const LEFTS = [8, 7];
/** How many of the screen's 54 map tiles must be the library's (see confirms()). */
const MIN_MATCH = 27;
/** A failed check blanks the border only from the second frame in a row (a frame caught mid-draw is not a scene change). */
const GRACE = 2;

/** An image's frames as pixels: 0 white, 1 black, 2 transparent; and which frames are one colour. */
interface Pic {
  w: number;
  h: number;
  frames: Uint8Array[];
  plain: boolean[];
}

/** Of the screen's map tiles: how many are the library's, how many of those have a pattern, how many have one. */
interface Count {
  same: number;
  patterned: number;
  patterns: number;
}

/** Whether a count confirms the view: most tiles, and of the patterned ones at least half (and 3). */
const confirms = (c: Count) => c.same >= MIN_MATCH && c.patterned >= Math.max(3, c.patterns / 2);

export class WideView {
  private readonly lib: DatLib;
  private readonly pics = new Map<string, Pic | null>();
  private fails = GRACE;
  /** Whether the last frame showed the border. */
  showing = false;
  /** Where this game's map area starts on the screen, once seen. */
  private left: number | null = null;

  /** `library`: the fmj library in the .gam (from findLib). */
  constructor(library: Uint8Array) {
    this.lib = new DatLib(new Int8Array(library.buffer, library.byteOffset, library.byteLength));
  }

  /** The frame's size for `mx` extra tile columns on each side and `my` rows above and below. */
  static size(mx: number, my: number): [number, number] {
    return [LCD_STRIDE + 2 * TILE * mx, LCD_HEIGHT + 2 * TILE * my];
  }

  /**
   * Compose the frame (0 white, 1 black, `w` × `h` from size()) from the
   * device's screen (`lcd`, LCD_STRIDE wide) and the game's map view.
   * Returns where the device's screen is in the frame.
   */
  compose(lcd: Uint8Array, view: KitMapView | null, mx: number, my: number, out: Uint8Array): [number, number] {
    const [w, h] = WideView.size(mx, my), ox = TILE * mx, oy = TILE * my;
    const map = view && this.map(view.mapType, view.mapIndex);
    const shown = !!map && (this.left !== null ? this.matches(lcd, map, view!, this.left) : this.find(lcd, map, view!));
    const LEFT = this.left ?? LEFTS[0];
    this.fails = shown ? 0 : this.fails + 1;
    this.showing = this.showing ? this.fails < GRACE : shown;
    out.fill(0, 0, w * h);
    if (this.showing && map && view) {
      // the map's tiles, on the device's grid (blank past the map's edges)
      const left = view.viewX - Math.ceil((ox + LEFT) / TILE), top = view.viewY - Math.ceil(oy / TILE);
      const x0 = ox + LEFT - (view.viewX - left) * TILE, y0 = oy - (view.viewY - top) * TILE;
      for (let ty = top, y = y0; y < h; ty++, y += TILE) {
        for (let tx = left, x = x0; x < w; tx++, x += TILE) {
          const t = map.tile(tx, ty);
          if (t >= 0) this.blit(out, w, h, map.tiles.frames[t], TILE, TILE, x, y);
        }
      }
      // the characters, the lower ones over the higher (the game draws its own on its screen)
      for (const a of [...view.actors].sort((p, q) => p.y - q.y)) {
        const pic = this.pic(ResType.ACP, a.type, a.res);
        if (!pic || pic.w < 8) continue; // (1 × 1 pictures mark events)
        const frame = a.type === 2 ? (a.facing - 1) * 3 + (a.step === 3 ? 1 : a.step) : 0;
        if (frame < 0 || frame >= pic.frames.length) continue;
        const x = ox + LEFT + (a.x - view.viewX) * TILE, y = oy + (a.y - view.viewY + 1) * TILE - pic.h;
        this.blit(out, w, h, pic.frames[frame], pic.w, pic.h, x, y);
      }
      // the game's own map area on top
      for (let y = 0; y < LCD_HEIGHT; y++) out.set(lcd.subarray(y * LCD_STRIDE + LEFT, y * LCD_STRIDE + LEFT + COLS * TILE), (oy + y) * w + ox + LEFT);
    } else {
      for (let y = 0; y < LCD_HEIGHT; y++) out.set(lcd.subarray(y * LCD_STRIDE, y * LCD_STRIDE + LCD_WIDTH), (oy + y) * w + ox);
    }
    for (let i = 0, n = w * h; i < n; i++) out[i] = out[i] ? 1 : 0;
    return [ox, oy];
  }

  /** The map area's left edge, found from the first screen that shows the view. */
  private find(lcd: Uint8Array, map: MapData, view: KitMapView): boolean {
    // (the edge where the screen shows the most of the library's patterned tiles)
    const counts = LEFTS.map((l) => this.count(lcd, map, view, l));
    const best = counts.reduce((b, c, i) => (c.patterned > counts[b].patterned ? i : b), 0);
    if (!confirms(counts[best])) return false;
    this.left = LEFTS[best];
    return true;
  }

  /** Whether the device's screen shows the library's tiles for this view, with the map area from x = `left`. */
  private matches(lcd: Uint8Array, map: MapData, view: KitMapView, left: number): boolean {
    return confirms(this.count(lcd, map, view, left));
  }

  /** How many of the screen's map tiles are the library's: all, and those with a pattern (a plain tile proves little). */
  private count(lcd: Uint8Array, map: MapData, view: KitMapView, left: number): Count {
    const c: Count = { same: 0, patterned: 0, patterns: 0 };
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = map.tile(view.viewX + tx, view.viewY + ty);
        if (t < 0) return { same: 0, patterned: 0, patterns: 0 }; // (the view is always on the map)
        const px = map.tiles.frames[t], plain = map.tiles.plain[t];
        let same = true;
        for (let y = 0; y < TILE && same; y++) {
          const row = (ty * TILE + y) * LCD_STRIDE + left + tx * TILE;
          for (let x = 0; x < TILE; x++) if ((lcd[row + x] ? 1 : 0) !== px[y * TILE + x]) { same = false; break; }
        }
        if (!plain) c.patterns++;
        if (same) (c.same++, plain || c.patterned++);
      }
    }
    return c;
  }

  private blit(out: Uint8Array, w: number, h: number, px: Uint8Array, pw: number, ph: number, x: number, y: number): void {
    for (let j = Math.max(0, -y); j < ph && y + j < h; j++) {
      for (let i = Math.max(0, -x); i < pw && x + i < w; i++) {
        const v = px[j * pw + i];
        if (v !== 2) out[(y + j) * w + x + i] = v;
      }
    }
  }

  private readonly maps = new Map<number, MapData | null>();

  private map(type: number, index: number): MapData | null {
    const key = (type << 8) | index;
    if (!this.maps.has(key)) {
      const b = this.lib.bytes(ResType.MAP, type, index);
      const tiles = b && this.pic(ResType.TIL, 1, b[2] & 0xff);
      this.maps.set(key, b && tiles && b.length >= 0x12 ? new MapData(b, tiles) : null);
    }
    return this.maps.get(key)!;
  }

  /** An image resource (type, width, height, frames, 1: opaque or 2: with transparency, then the frames). */
  private pic(resType: ResType, type: number, index: number): Pic | null {
    const key = `${resType}:${type}:${index}`;
    if (!this.pics.has(key)) this.pics.set(key, decodePic(this.lib.bytes(resType, type, index)));
    return this.pics.get(key)!;
  }
}

class MapData {
  readonly width: number;
  readonly height: number;

  constructor(
    private readonly b: Int8Array,
    readonly tiles: Pic,
  ) {
    this.width = b[0x10] & 0xff;
    this.height = b[0x11] & 0xff;
  }

  /** The tile at (x, y), or -1 past the map's edges or for a tile the set lacks. */
  tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    const i = 0x12 + (y * this.width + x) * 2;
    if (i >= this.b.length) return -1;
    const t = this.b[i] & 0x7f;
    return t < this.tiles.frames.length ? t : -1;
  }
}

function decodePic(b: Int8Array | null): Pic | null {
  if (!b || b.length < 6) return null;
  const w = b[2] & 0xff, h = b[3] & 0xff, n = b[4] & 0xff, bpp = b[5];
  if (!w || !h || (bpp !== 1 && bpp !== 2)) return null;
  const row = Math.ceil(w / 8) * bpp, size = row * h, frames: Uint8Array[] = [];
  for (let f = 0; f < n; f++) {
    const base = 6 + f * size;
    if (base + size > b.length) break;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = x * bpp, byte = b[base + y * row + (bit >> 3)] << (bit & 7);
        // (with transparency: a pair of bits, transparent then black)
        px[y * w + x] = bpp === 1 ? (byte >> 7) & 1 : byte & 0x80 ? 2 : (byte << 1) & 0x80 ? 1 : 0;
      }
    }
    frames.push(px);
  }
  return { w, h, frames, plain: frames.map((f) => f.every((v) => v === f[0])) };
}
