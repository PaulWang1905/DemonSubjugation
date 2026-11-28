// The wider map view for games made with BBK's RPG kit (F5): around the
// device's screen, more of the map, drawn from the fmj library the .gam
// carries, at the place the game's memory gives (KitCheats.mapView).
//
// The game's own screen is never changed: its map area (9 × 6 tiles from
// x 8, or x 7 in 伏魔记 1.0 and 1.2) goes in the middle of a larger frame, and the border around it
// shows the map's other tiles and the characters on them. The border is
// shown only while the game's screen confirms it: the tiles the game shows
// must be the library's for that place (most of them; sprites and boxes
// cover some, and the box with the hero's position some games show at the
// top left is left out). On plain ground, with hardly a patterned tile in
// sight, the plain tiles must be and the hero must stand in his place. Once
// shown, it stays while the view is the same and some of the map still
// shows (a popup menu over most of it, the hero beside it, or the hero with
// a popup's box over part of him: 怀旧终曲's 属性 submenu even clears the
// map's tiles around it). Battles, menus over the whole screen, scene
// pictures, or a build whose memory is not as expected fail the check, and
// the frame then shows the device's whole screen with a blank border (from
// the second frame of a failed check).
//
// The border and the middle show the same moment. The game moves its view
// in memory first and draws its screen some frames later (伏魔记 eight, 异世大陆
// two or three), and on the firmware the drawing itself takes two or three
// frames. So the border is drawn at the view the screen shows: the memory's,
// or the one it showed last (with that moment's characters), or one between
// them; a screen caught mid-redraw shows the last frame again (border and
// middle) for at most HOLD frames: part one view and part another, or the
// map with tiles that were the map's a frame ago now something else (on the
// firmware, a battle's or a page's first rows over the map).

import { DatLib, ResType } from "../engine/fmj/lib/DatLib";
import type { KitMapView } from "./kitCheats";
import { LCD_HEIGHT, LCD_STRIDE, LCD_WIDTH } from "./lcd";

const TILE = 16, COLS = 9, ROWS = 6;
/** Where builds start the map area on the screen. */
const LEFTS = [8, 7];
/** How many of the screen's map tiles must be the library's, at least (see confirms()). */
const MIN_MATCH = 9;
/** The hero's position the game can show at the top left (KitMapView.position): the box's left, top, right and bottom on the screen. */
const POSITION = [12, 4, 47, 17];
/** A dialogue box (SAY's, or More text's taller one): its frame's sides at x 9 and 149, its bottom at y 95. */
const BOX_LEFT = 9, BOX_RIGHT = 149, BOX_BOTTOM = 95, BOX_MIN = 20;
/** A failed check blanks the border from the second frame in a row (the first shows the last frame again: a frame caught mid-draw is not a scene change). */
const GRACE = 2;
/** A screen caught mid-redraw between two views shows the last frame again, for at most this many frames in a row. */
const HOLD = 4;
/** Patterned tiles of each of two views, where the other has other tiles, that make a screen mid-redraw. */
const TORN = 2;
/** Tiles of the map in the last frame that are now neither the map's nor under a character, that make a screen mid-redraw. */
const STRAY = 3;
/** How far around the game's view the screen's is looked for, in tiles each way (it walks on before it draws, and can turn back). */
const MAX_BEHIND = 2;
/** For how many frames without the map the view shown last is still a candidate (past a battle, the memory's view is the screen's). */
const STALE = 30;

/** An image's frames as pixels: 0 white, 1 black, 2 transparent; and which frames are one colour. */
export interface Pic {
  w: number;
  h: number;
  frames: Uint8Array[];
  plain: boolean[];
}

/** Of the screen's map tiles not under a dialogue box or the hero's position: how many, how many are the library's, how many of those have a pattern, how many have one. */
interface Count {
  seen: number;
  same: number;
  patterned: number;
  patterns: number;
  /** (asked with `covered`) those not the library's nor covered. */
  stray: number;
}

/** The hero's tile in the view, and how many black pixels a picture of it must have to tell (not a blank screen). */
const HERO_X = 4, HERO_Y = 3, MIN_INK = 24;
/** Patterned tiles at their places that prove the map whatever covers the rest (a popup menu over half the screen). */
const PROOF = 6;
/**
 * Whether a count confirms the view: PROOF patterned tiles where the map has
 * them (no battle or picture shows that), or, on maps with few patterns, half
 * the tiles seen (and 9) and of the patterned ones at least half (and 3).
 * Where fewer than 3 patterned tiles are in sight (plain ground), the plain
 * ones and the hero must do: three quarters of the tiles seen (and 9), every
 * patterned one, and the hero in its place (`hero`, asked only then).
 */
const confirms = (c: Count, hero: () => boolean) =>
  c.patterned >= PROOF ||
  (c.same >= Math.max(MIN_MATCH, c.seen / 2) && c.patterned >= Math.max(3, c.patterns / 2)) ||
  (c.patterns < 3 && c.patterned === c.patterns && c.same >= Math.max(MIN_MATCH, (c.seen * 3) / 4) && hero());

/** Whether two views are the same place on the same map. */
const samePlace = (a: KitMapView, b: KitMapView) => a.mapType === b.mapType && a.mapIndex === b.mapIndex && a.viewX === b.viewX && a.viewY === b.viewY;

/** The top of a dialogue box on the screen, or null: its frame's two sides run up from its bottom line. */
function boxTop(lcd: Uint8Array): number | null {
  for (let x = BOX_LEFT; x <= BOX_RIGHT; x++) if (!lcd[BOX_BOTTOM * LCD_STRIDE + x]) return null;
  let top = BOX_BOTTOM;
  while (top > 0 && lcd[(top - 1) * LCD_STRIDE + BOX_LEFT] && lcd[(top - 1) * LCD_STRIDE + BOX_RIGHT]) top--;
  return BOX_BOTTOM - top >= BOX_MIN ? top : null;
}

/** Whether two screens are the same. */
function sameScreen(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0, n = LCD_STRIDE * LCD_HEIGHT; i < n; i++) if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) return false;
  return true;
}

const black = (lcd: Uint8Array, x: number, y: number) => x >= 0 && y >= 0 && x < LCD_STRIDE && y < LCD_HEIGHT && !!lcd[y * LCD_STRIDE + x];
/** Whether the column x is black from y0 to y1; the row y from x0 to x1. */
const blackColumn = (lcd: Uint8Array, x: number, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) if (!black(lcd, x, y)) return false;
  return true;
};
const blackRow = (lcd: Uint8Array, y: number, x0: number, x1: number) => {
  for (let x = x0; x <= x1; x++) if (!black(lcd, x, y)) return false;
  return true;
};
/** A box drawn on the screen (a popup menu's): left, top, right, bottom, its frame black. */
type Box = [number, number, number, number];
/** The smallest box a popup can be, each way; how many corners boxAround() tries at most. */
const BOX_SIDE = 8, BOX_WORK = 4000;
/** A box's shadow: up to this many pixels right of it and below. */
const SHADOW = 2;

/** A box (a black frame, BOX_SIDE or more each way) on the screen around the point (x, y), its frame included, or null. */
function boxAround(lcd: Uint8Array, x: number, y: number): Box | null {
  // (its left side: a black column through y; its top: a black row from there past x; its right side and bottom close it;
  // a screen mostly black, which has no popup, gives up after BOX_WORK tries)
  let work = 0;
  for (let l = x; l >= 0; l--) {
    if (!black(lcd, l, y)) continue;
    for (let t = y; t >= 0 && black(lcd, l, t); t--) {
      for (let r = Math.max(x, l + BOX_SIDE - 1); r < LCD_STRIDE && black(lcd, r, t); r++) {
        if (++work > BOX_WORK) return null;
        if (!blackColumn(lcd, r, t, y) || !blackRow(lcd, t, l, r)) continue;
        for (let b = Math.max(y, t + BOX_SIDE - 1); b < LCD_HEIGHT && black(lcd, l, b) && black(lcd, r, b); b++) {
          if (++work > BOX_WORK) return null;
          if (blackRow(lcd, b, l, r)) return [l, t, r, b];
        }
      }
    }
  }
  return null;
}

export class WideView {
  private readonly lib: DatLib;
  private readonly pics = new Map<string, Pic | null>();
  private fails = GRACE;
  /** Whether the last frame showed the border. */
  showing = false;
  /** Where this game's map area starts on the screen, once seen; and where the last border was drawn from (meanwhile a guess). */
  private left: number | null = null;
  private edge: number = LEFTS[0];
  /** The view the screen last showed, with the characters at that moment (a copy). */
  private good: KitMapView | null = null;
  /** The last frame composed with the border, and its size: shown again while the screen is mid-redraw. */
  private last: Uint8Array | null = null;
  private lastSize = "";
  /** Frames in a row shown again from `last`. */
  private held = 0;
  /** The screen at the last call, and which of its tiles were stray() (map cells, y * 256 + x). */
  private prev: Uint8Array | null = null;
  private strays = new Set<number>();
  /** The view (and characters) the last frame's border was drawn at, or null for a blank border. */
  drawn: KitMapView | null = null;

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
   * Returns where the device's screen is in the frame. Call it once for
   * each new screen (its holds and grace count calls).
   */
  compose(lcd: Uint8Array, view: KitMapView | null, mx: number, my: number, out: Uint8Array): [number, number] {
    const [w, h] = WideView.size(mx, my), ox = TILE * mx, oy = TILE * my, size = `${w}x${h}`;
    let at: KitMapView | null = null, torn = false, changing = false;
    // (whether the screen changed since the last call: a screen being drawn does)
    const changed = !this.prev || !sameScreen(lcd, this.prev);
    if (!this.prev) this.prev = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    this.prev.set(lcd.subarray(0, LCD_STRIDE * LCD_HEIGHT));
    if (view && this.map(view.mapType, view.mapIndex)) {
      const left = this.left ?? this.find(lcd, view);
      if (left !== null) {
        this.edge = left;
        const r = this.pick(lcd, view, left);
        if (r === "torn") torn = true;
        else at = r;
      }
      // A popup menu can leave too little of the map in view to prove it. The
      // border stays while the view is the one it showed and the screen still
      // shows the map somewhere (one of its patterned tiles in place, or the
      // hero, whole or with a popup's box over part of him); a battle, a page
      // over the whole screen or a picture shows none.
      const good = this.good;
      if (!at && !torn && this.showing && good && samePlace(good, view)) {
        const c = this.count(lcd, this.map(good.mapType, good.mapIndex)!, good, this.edge);
        if (c.patterned >= 1 || this.hero(lcd, this.edge) || this.hero(lcd, this.edge, true)) at = good;
      }
      // A screen being drawn over a frame or two (the firmware copies it to
      // the screen so): the map's tiles in part, and tiles that were the map's
      // in the last frame now neither the map's nor under a character. It may
      // be the first rows of a battle's screen, or a page clearing the screen:
      // the last frame again. (A popup's cursor moving changes no tile that
      // was the map's: it shows at once.)
      if (at && changed) {
        const stray = this.stray(lcd, at, this.edge);
        let more = 0;
        for (const c of stray) if (!this.strays.has(c)) more++;
        changing = this.showing && this.held < HOLD && more >= STRAY;
        this.strays = stray;
      } else if (!at) this.strays = new Set();
    } else this.strays = new Set();
    // a screen mid-redraw, or the first frame of a failed check: the last frame again
    if (!changing) this.fails = at ? 0 : this.fails + 1;
    if (this.showing && this.last && this.lastSize === size && (changing || (!at && (torn ? this.held < HOLD : this.fails < GRACE)))) {
      this.held++;
      out.set(this.last.subarray(0, w * h));
      return [ox, oy];
    }
    if (at && at !== this.good) this.good = { ...at, actors: at.actors.map((a) => ({ ...a })) };
    this.held = 0;
    this.showing = !!at || (this.showing && this.fails < GRACE && !torn);
    const v = this.showing ? (at ?? this.good) : null;
    const map = v && this.map(v.mapType, v.mapIndex);
    const LEFT = this.edge;
    out.fill(0, 0, w * h);
    this.drawn = null;
    if (v && map) {
      this.drawn = v;
      // the map's tiles, on the device's grid (blank past the map's edges)
      const left = v.viewX - Math.ceil((ox + LEFT) / TILE), top = v.viewY - Math.ceil(oy / TILE);
      const x0 = ox + LEFT - (v.viewX - left) * TILE, y0 = oy - (v.viewY - top) * TILE;
      for (let ty = top, y = y0; y < h; ty++, y += TILE) {
        for (let tx = left, x = x0; x < w; tx++, x += TILE) {
          const t = map.tile(tx, ty);
          if (t >= 0) this.blit(out, w, h, map.tiles.frames[t], TILE, TILE, x, y);
        }
      }
      // the characters, the lower ones over the higher (the game draws its own on its screen)
      for (const a of [...v.actors].sort((p, q) => p.y - q.y)) {
        const pic = this.pic(ResType.ACP, a.type, a.res);
        if (!pic || pic.w < 8) continue; // (1 × 1 pictures mark events)
        const frame = a.type === 2 ? (a.facing - 1) * 3 + (a.step === 3 ? 1 : a.step) : 0;
        if (frame < 0 || frame >= pic.frames.length) continue;
        const x = ox + LEFT + (a.x - v.viewX) * TILE, y = oy + (a.y - v.viewY + 1) * TILE - pic.h;
        this.blit(out, w, h, pic.frames[frame], pic.w, pic.h, x, y);
      }
      // the game's own map area on top
      for (let y = 0; y < LCD_HEIGHT; y++) out.set(lcd.subarray(y * LCD_STRIDE + LEFT, y * LCD_STRIDE + LEFT + COLS * TILE), (oy + y) * w + ox + LEFT);
    } else {
      this.showing = false;
      for (let y = 0; y < LCD_HEIGHT; y++) out.set(lcd.subarray(y * LCD_STRIDE, y * LCD_STRIDE + LCD_WIDTH), (oy + y) * w + ox);
    }
    for (let i = 0, n = w * h; i < n; i++) out[i] = out[i] ? 1 : 0;
    if (this.showing) {
      if (!this.last || this.last.length < w * h) this.last = new Uint8Array(w * h);
      this.last.set(out.subarray(0, w * h));
      this.lastSize = size;
    }
    return [ox, oy];
  }

  /**
   * The view the screen shows: of the memory's (`view`), the one it showed
   * last (the game has moved on and not drawn it yet) and those around the
   * memory's, the one most of the screen's tiles are, if they confirm it
   * (a view a tile off can confirm too on a map of repeating tiles); "torn"
   * when the screen is part that view and part another (caught mid-redraw);
   * null for none.
   */
  private pick(lcd: Uint8Array, view: KitMapView, left: number): KitMapView | "torn" | null {
    const { views, maps, counts, best } = this.best(lcd, view, left);
    if (best < 0) return null;
    // part another view: tiles of one on the same map where it has others (a whole screen of one view has none)
    if (counts[best]!.patterned >= TORN)
      for (let i = 0; i < views.length; i++)
        if (i !== best && maps[i] === maps[best] && this.count(lcd, maps[i]!, views[i], left, views[best]).patterned >= TORN) return "torn";
    return confirms(counts[best]!, () => this.hero(lcd, left)) ? views[best] : null;
  }

  /** The views pick() looks at, with their maps and counts, and which most of the screen's patterned tiles are (-1 for none). */
  private best(lcd: Uint8Array, view: KitMapView, left: number) {
    const good = this.good, views = [view];
    if (good && this.fails < STALE && !samePlace(good, view)) views.push(good);
    // (around the memory's: with the memory's characters)
    for (let y = -MAX_BEHIND; y <= MAX_BEHIND; y++)
      for (let x = -MAX_BEHIND; x <= MAX_BEHIND; x++) {
        const v = { ...view, viewX: view.viewX + x, viewY: view.viewY + y };
        if ((x || y) && v.viewX >= 0 && v.viewY >= 0 && !(views[1] === good && samePlace(good, v))) views.push(v);
      }
    const maps = views.map((v) => this.map(v.mapType, v.mapIndex));
    const counts = views.map((v, i) => (maps[i] ? this.count(lcd, maps[i]!, v, left) : null));
    let best = -1;
    // (of equals, the one more of the screen's tiles are, plain ones too: on plain ground, and on repeating
    // patterns, where the screen still shows the last view; then the one with fewer of its patterned tiles not on the screen)
    const better = (c: Count, b: Count) =>
      c.patterned > b.patterned ||
      (c.patterned === b.patterned && (c.same > b.same || (c.same === b.same && c.patterns - c.patterned < b.patterns - b.patterned)));
    counts.forEach((c, i) => c && (best < 0 || better(c, counts[best]!)) && (best = i));
    return { views, maps, counts, best };
  }

  /**
   * The map area's left edge on a screen that shows the map, or null: of the
   * edges where it is confirmed, the one where the most of its patterned
   * tiles show (of equals, the most tiles). Kept once patterned tiles tell
   * the edges apart (plain ground cannot: there the hero's place tells).
   */
  private find(lcd: Uint8Array, view: KitMapView): number | null {
    const counts = LEFTS.map((l) => {
      const b = this.best(lcd, view, l);
      return b.best < 0 ? null : b.counts[b.best]!;
    });
    const score = (i: number) => (counts[i] ? counts[i]!.patterned * 100 + counts[i]!.same : -1);
    for (const i of LEFTS.map((_, i) => i).sort((a, b) => score(b) - score(a))) {
      const c = counts[i];
      if (!c || !confirms(c, () => this.hero(lcd, LEFTS[i]))) continue;
      if (c.patterned >= 3 && counts.every((o, j) => j === i || (o?.patterned ?? -1) < c.patterned)) this.left = LEFTS[i];
      return LEFTS[i];
    }
    return null;
  }

  /** The party members' walking pictures. */
  private heroes(): Pic[] {
    const pics: Pic[] = [];
    for (let i = 1; i < 256; i++) {
      const pic = this.pic(ResType.ACP, 1, i);
      if (pic) pics.push(pic);
      else if (i > 8) break; // (the pictures are numbered from 1, perhaps with gaps)
    }
    return pics;
  }

  /**
   * Whether the hero stands in its place on the screen (the view's tile
   * (HERO_X, HERO_Y), the map area from x = `left`): one of the frames of a
   * party member's walking picture, every one of its pixels; or, `boxed`,
   * every one but those inside a box drawn over him (a popup menu's), with
   * half of his ink or more outside it.
   */
  private hero(lcd: Uint8Array, left: number, boxed = false): boolean {
    for (const pic of this.heroes()) {
      const x0 = left + HERO_X * TILE, y0 = (HERO_Y + 1) * TILE - pic.h;
      if (y0 < 0 || x0 + pic.w > LCD_STRIDE) continue;
      next: for (const f of pic.frames) {
        let ink = 0, all = 0;
        const off: number[] = [];
        for (let y = 0; y < pic.h; y++)
          for (let x = 0; x < pic.w; x++) {
            const v = f[y * pic.w + x];
            if (v === 2) continue;
            all += v;
            if ((lcd[(y0 + y) * LCD_STRIDE + x0 + x] ? 1 : 0) === v) ink += v;
            else if (!boxed) continue next;
            else off.push(x0 + x, y0 + y);
          }
        if (!boxed) {
          if (ink >= MIN_INK) return true;
          continue;
        }
        // (the pixels that differ: each inside a box or its shadow, and the boxes leave half of him or more in sight)
        if (!off.length || ink < MIN_INK / 2 || ink * 2 < all) continue;
        const boxes: Box[] = [];
        for (let i = 0; i < off.length; i += 2) {
          const [x, y] = [off[i], off[i + 1]];
          if (boxes.some(([l, t, r, b]) => x >= l && x <= r + SHADOW && y >= t && y <= b + SHADOW)) continue;
          let box: Box | null = null;
          for (let d = 0; d <= 2 * SHADOW && !box; d++) for (let dy = 0; dy <= Math.min(d, SHADOW) && !box; dy++) if (d - dy <= SHADOW) box = boxAround(lcd, x - (d - dy), y - dy);
          // (not a page over the whole map area)
          if (!box || (box[0] <= left && box[2] >= left + COLS * TILE - 1 && box[1] <= 0 && box[3] >= ROWS * TILE - 1)) continue next;
          boxes.push(box);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * The screen's map tiles that are neither the view's (`view`, the map area
   * from x = `left`) nor where a character on it, or the hero, may stand over
   * them (as count(), the tiles under a dialogue box or the hero's position
   * left out): their cells on the map (y * 256 + x).
   */
  private stray(lcd: Uint8Array, view: KitMapView, left: number): Set<number> {
    const map = this.map(view.mapType, view.mapIndex), stray = new Set<number>();
    if (!map) return stray;
    const covered = new Set<number>();
    const cover = (x: number, y: number, w: number, h: number) => {
      for (let ty = y - Math.ceil(h / TILE) + 1; ty <= y; ty++) for (let tx = x; tx < x + Math.max(1, Math.ceil(w / TILE)); tx++) covered.add(ty * 64 + tx);
    };
    for (const p of this.heroes()) cover(HERO_X, HERO_Y, p.w, p.h);
    for (const v of [view, this.good])
      for (const a of v?.actors ?? []) {
        const pic = this.pic(ResType.ACP, a.type, a.res);
        if (pic) cover(a.x - view.viewX, a.y - view.viewY, pic.w, pic.h);
      }
    this.count(lcd, map, view, left, undefined, (tx, ty) => covered.has(ty * 64 + tx) || (stray.add((view.viewY + ty) * 256 + view.viewX + tx), false));
    return stray;
  }

  /**
   * How many of the screen's map tiles (the map area from x = `left`) are the
   * library's: all, and those with a pattern (a plain tile proves little).
   * With `not` (a view on the same map), only where that view's tile looks
   * otherwise. With `covered` (where a character may stand over a tile), how
   * many are not the library's elsewhere.
   */
  private count(lcd: Uint8Array, map: MapData, view: KitMapView, left: number, not?: KitMapView, covered?: (tx: number, ty: number) => boolean): Count {
    const c: Count = { seen: 0, same: 0, patterned: 0, patterns: 0, stray: 0 };
    // (the tiles a dialogue box covers say nothing)
    const box = boxTop(lcd), rows = box === null ? ROWS : Math.min(ROWS, Math.floor(box / TILE));
    const [pl, pt, pr, pb] = POSITION;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = map.tile(view.viewX + tx, view.viewY + ty);
        if (t === MISSING) continue; // (what the game draws there is not known)
        if (t < 0) return { seen: 0, same: 0, patterned: 0, patterns: 0, stray: 0 }; // (the view is always on the map)
        // (nor those the hero's position covers)
        if (view.position && left + tx * TILE <= pr && left + tx * TILE + TILE > pl && ty * TILE <= pb && ty * TILE + TILE > pt) continue;
        const px = map.tiles.frames[t], plain = map.tiles.plain[t];
        if (not) {
          const o = map.tile(not.viewX + tx, not.viewY + ty);
          if (o === t || (o >= 0 && map.tiles.frames[o].every((v, i) => v === px[i]))) continue;
        }
        let same = true;
        for (let y = 0; y < TILE && same; y++) {
          const row = (ty * TILE + y) * LCD_STRIDE + left + tx * TILE;
          for (let x = 0; x < TILE; x++) if ((lcd[row + x] ? 1 : 0) !== px[y * TILE + x]) { same = false; break; }
        }
        c.seen++;
        if (!plain) c.patterns++;
        if (same) (c.same++, plain || c.patterned++);
        else if (covered && !covered(tx, ty)) c.stray++;
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

/** A map cell whose tile the tile set lacks. */
const MISSING = -2;

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

  /** The tile at (x, y), or -1 past the map's edges, or MISSING for a tile the set lacks (异世大陆's 异族之地 has some). */
  tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    const i = 0x12 + (y * this.width + x) * 2;
    if (i >= this.b.length) return MISSING;
    const t = this.b[i] & 0x7f;
    return t < this.tiles.frames.length ? t : MISSING;
  }
}

/** An image resource's frames as pixels (type, index, width, height, frames, 1: opaque or 2: with transparency, then the frames). */
export function decodePic(b: Int8Array | null): Pic | null {
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
