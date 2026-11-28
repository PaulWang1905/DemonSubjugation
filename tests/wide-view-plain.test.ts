// The device player's wider map view (src/bbk/wideView.ts) on plain ground
// and under the hero's position: the border shows wherever the screen shows
// the map. Where fewer than three patterned tiles are in sight (a cave floor,
// a snowfield) the plain tiles and the hero in his place prove the map; the
// box with the hero's position some kit games draw over the map's top left
// tiles (怀旧终曲, 异世大陆) is left out of the count, as a dialogue box is.
// Synthetic screens from The Silent Bell's library with a plain tile added
// (no game files needed).
import { describe, expect, it } from "vitest";
import type { KitMapView } from "../src/bbk/kitCheats";
import { LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { decodePic, WideView } from "../src/bbk/wideView";
import { findEntry, writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";

// BELLHAVEN (map 1-1) with a plain white tile added to its tile set, and a
// clearing of it: columns 4-20, rows 4-13 (the view (6, 5) sees nothing else),
// and columns 13-18, rows 1-3 (the view (10, 1) sees the forest only in its
// top left 3 × 3 tiles)
const archive = silentBell();
const til = findEntry(archive, 7, 1, 1)!, map = findEntry(archive, 2, 1, 1)!;
const PLAIN = til.data[4], MISSING = 0x7f;
{
  const frame = Math.ceil(til.data[2] / 8) * til.data[5] * til.data[3];
  const data = new Uint8Array(til.data.length + frame);
  data.set(til.data);
  data[4] = PLAIN + 1;
  til.data = data;
  const width = map.data[0x10];
  for (let y = 1; y <= 13; y++) for (let x = y < 4 ? 13 : 4; x <= (y < 4 ? 18 : 20); x++) map.data[0x12 + (y * width + x) * 2] = (map.data[0x12 + (y * width + x) * 2] & 0x80) | PLAIN;
  // and, past the clearing, a cell whose tile the set lacks (as some in 异世大陆's 异族之地)
  map.data[0x12 + (8 * width + 22) * 2] = MISSING;
}
const library = writeLib(archive);
const tiles = decodePic(new Int8Array(til.data.buffer, til.data.byteOffset, til.data.byteLength))!;
const width = map.data[0x10];
const tileAt = (x: number, y: number) => map.data[0x12 + (y * width + x) * 2] & 0x7f;
const hero = decodePic(new Int8Array(findEntry(archive, 8, 1, 1)!.data.slice().buffer))!;

const MX = 2, MY = 1, [W, H] = WideView.size(MX, MY);

/** The device's screen showing the map at (vx, vy) from x `left`, with the hero at (4, 3) unless `noHero`. */
function screen(vx: number, vy: number, { left = 8, noHero = false } = {}): Uint8Array {
  const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
  for (let ty = 0; ty < 6; ty++)
    for (let tx = 0; tx < 9; tx++) {
      const px = tiles.frames[tileAt(vx + tx, vy + ty)] ?? tiles.frames[0]; // (a tile the set lacks: what the game draws is not known)
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) lcd[(ty * 16 + y) * LCD_STRIDE + left + tx * 16 + x] = px[y * 16 + x];
    }
  if (!noHero) {
    const f = hero.frames[7];
    for (let y = 0; y < hero.h; y++) for (let x = 0; x < hero.w; x++) if (f[y * hero.w + x] !== 2) lcd[(64 - hero.h + y) * LCD_STRIDE + left + 64 + x] = f[y * hero.w + x];
  }
  return lcd;
}

/** A box over the screen (white inside a black frame): the hero's position at the top left, or a popup menu. */
function box(lcd: Uint8Array, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lcd[y * LCD_STRIDE + x] = y === y0 || y === y1 || x === x0 || x === x1 ? 1 : 0;
  return lcd;
}

/** A page over the whole screen: lines of "text" everywhere. */
function page(): Uint8Array {
  const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
  for (let y = 2; y < LCD_HEIGHT; y += 6) for (let x = 0; x < LCD_STRIDE; x++) lcd[y * LCD_STRIDE + x] = (x * 7 + y) % 3 === 0 ? 1 : 0;
  return lcd;
}

const view = (vx: number, vy: number, position = false): KitMapView => ({ mapType: 1, mapIndex: 1, viewX: vx, viewY: vy, actors: [], position });

/** Whether the border shows the map (some black outside the device's screen). */
const inked = (out: Uint8Array) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((y < 16 * MY || y >= H - 16 * MY || x < 16 * MX || x >= W - 16 * MX) && out[y * W + x]) return true;
  return false;
};

describe("the wider view on plain ground", () => {
  it("shows the border where every tile in sight is plain, with the hero in his place", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(true);
    expect(inked(out)).toBe(true); // (the clearing's edges and beyond)
    // walking on
    wide.compose(screen(7, 5), view(7, 5), MX, MY, out);
    expect(wide.drawn?.viewX).toBe(7);
  });

  it("does not take a blank screen, or one without the hero, for the plain ground", () => {
    for (const lcd of [new Uint8Array(LCD_STRIDE * LCD_HEIGHT), screen(6, 5, { noHero: true })]) {
      const wide = new WideView(library), out = new Uint8Array(W * H);
      wide.compose(lcd, view(6, 5), MX, MY, out);
      expect(wide.showing).toBe(false);
    }
  });

  it("keeps the border under a popup menu that leaves the hero in sight, and drops it for a page over the whole screen", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    for (let i = 0; i < 5; i++) {
      wide.compose(box(screen(6, 5), 4, 2, 70, 92), view(6, 5), MX, MY, out);
      expect(wide.showing).toBe(true);
    }
    wide.compose(page(), view(6, 5), MX, MY, out);
    wide.compose(page(), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(false);
    expect(inked(out)).toBe(false);
  });

  it("finds the map area's left edge (x 7 in 伏魔记 1.0 and 1.2) once patterned tiles tell, not on plain ground", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5, { left: 7 }), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(true);
    // to where the clearing ends: the border is drawn from x 7, as the screen
    const v = view(13, 5);
    wide.compose(screen(13, 5, { left: 7 }), v, MX, MY, out);
    expect(wide.showing).toBe(true);
    const plain = new Uint8Array(W * H);
    const fresh = new WideView(library);
    fresh.compose(screen(13, 5, { left: 7 }), v, MX, MY, plain);
    expect(fresh.showing).toBe(true);
    expect(out).toEqual(plain);
  });
});

describe("the wider view where the map has a tile its tile set lacks", () => {
  it("leaves that cell out of the count, and the border shows at the screen's view", () => {
    expect(tileAt(22, 8)).toBe(MISSING);
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(16, 5), view(16, 5), MX, MY, out);
    expect(wide.showing).toBe(true);
    expect(wide.drawn?.viewX).toBe(16);
  });
});

describe("the wider view under the hero's position", () => {
  const patternedAt = (vx: number, vy: number) => {
    const at: string[] = [];
    for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 9; tx++) if (!tiles.plain[tileAt(vx + tx, vy + ty)]) at.push(`${tx},${ty}`);
    return at;
  };

  it("leaves the tiles under the position's box out of the count", () => {
    expect(patternedAt(10, 1)).toEqual(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "0,2", "1,2", "2,2"]);
    const lcd = box(screen(10, 1), 12, 4, 47, 17);
    // (the game's memory says the position shows: the box is no evidence against the map)
    let wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(lcd, view(10, 1, true), MX, MY, out);
    expect(wide.showing).toBe(true);
    // (without it, six patterned tiles of nine covered: too few left to tell, as at 伏魔洞's 15, 26)
    wide = new WideView(library);
    wide.compose(lcd, view(10, 1), MX, MY, out);
    wide.compose(lcd, view(10, 1), MX, MY, out);
    expect(wide.showing).toBe(false);
  });

  it("still drops the border for a page over the whole screen", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(box(screen(10, 1), 12, 4, 47, 17), view(10, 1, true), MX, MY, out);
    expect(wide.showing).toBe(true);
    wide.compose(page(), view(10, 1, true), MX, MY, out);
    wide.compose(page(), view(10, 1, true), MX, MY, out);
    expect(wide.showing).toBe(false);
  });
});

// A popup menu over the hero on plain ground (怀旧终曲's 属性 submenu in
// 伏魔洞, 完美版's on 摩天顶): no patterned tile in sight and the hero only in
// part. The border stays while what differs of him is inside a box drawn on
// the screen; a page over the whole screen still drops it at once.
describe("the wider view with a popup over the hero on plain ground", () => {
  /** A popup's box with "text" inside, over the left part of the hero (x 72-87, y 48-63), with a shadow right of it and below. */
  const popup = (lcd: Uint8Array, right = 77) => {
    box(lcd, 40, 20, right, 56);
    for (let y = 24; y < 52; y += 4) for (let x = 44; x < right - 2; x += 3) lcd[y * LCD_STRIDE + x] = 1;
    for (let y = 22; y <= 57; y++) lcd[y * LCD_STRIDE + right + 1] = 1;
    for (let x = 42; x <= right + 1; x++) lcd[57 * LCD_STRIDE + x] = 1;
    return lcd;
  };

  it("keeps the border while the popup covers part of the hero", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(true);
    const lcd = popup(screen(6, 5));
    // (the hero is not whole: the first check alone would drop the border)
    expect(lcd.subarray(48 * LCD_STRIDE + 72, 48 * LCD_STRIDE + 88)).not.toEqual(screen(6, 5).subarray(48 * LCD_STRIDE + 72, 48 * LCD_STRIDE + 88));
    for (let i = 0; i < 8; i++) {
      wide.compose(lcd, view(6, 5), MX, MY, out);
      expect(wide.showing).toBe(true);
    }
    // the screen as it is, beside the border
    for (let y = 0; y < LCD_HEIGHT; y++) for (let x = 8; x < 152; x++) expect(out[(16 * MY + y) * W + 16 * MX + x]).toBe(lcd[y * LCD_STRIDE + x]);
    // closed: still there
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(true);
  });

  it("drops it for a page over the whole screen, or a box over a screen that is not the map", () => {
    for (const lcd of [page(), popup(page()), box(screen(6, 5), 0, 0, 159, 95), popup(screen(6, 5, { noHero: true }))]) {
      const wide = new WideView(library), out = new Uint8Array(W * H);
      wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
      wide.compose(lcd, view(6, 5), MX, MY, out);
      wide.compose(lcd, view(6, 5), MX, MY, out);
      expect(wide.showing).toBe(false);
      expect(inked(out)).toBe(false);
    }
  });

  it("does not keep it where the view moved", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    for (let i = 0; i < 3; i++) wide.compose(popup(screen(6, 5)), view(7, 5), MX, MY, out);
    expect(wide.showing).toBe(false);
  });
});

// On the firmware the game's screen reaches the device's over two frames: at
// a battle's start one frame is the map with the battle's first rows over it.
// That frame shows the last one again (as a screen mid-step does), and the
// border still goes by the battle's second frame.
describe("the wider view while the screen is being drawn", () => {
  /** The battle's screen (dithered), its first `rows` pixel rows over the map. */
  const battle = (rows = LCD_HEIGHT) => {
    const lcd = screen(6, 5);
    for (let y = 0; y < rows; y++) for (let x = 0; x < LCD_STRIDE; x++) lcd[y * LCD_STRIDE + x] = (x + y) & 1;
    return lcd;
  };
  /** A view with patterned tiles in sight (outside the clearing). */
  const patterned = (() => {
    for (let vy = 0; vy + 6 <= 18; vy++)
      for (let vx = 0; vx + 9 <= width; vx++) {
        let n = 0;
        for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 9; tx++) n += tileAt(vx + tx, vy + ty) < tiles.frames.length && !tiles.plain[tileAt(vx + tx, vy + ty)] ? 1 : 0;
        if (n >= 30) return [vx, vy] as const;
      }
    throw new Error("no patterned view");
  })();

  it("shows the last frame again while a battle's screen is drawn, and drops the border as soon as before", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 5), view(6, 5), MX, MY, out);
    const before = out.slice();
    // its first rows: the map (and the hero) still prove the view, but the screen is half drawn
    wide.compose(battle(2), view(6, 5), MX, MY, out);
    expect(out).toEqual(before);
    expect(wide.showing).toBe(true);
    // the whole battle: the last frame once more, then the device's screen alone
    wide.compose(battle(), view(6, 5), MX, MY, out);
    expect(out).toEqual(before);
    wide.compose(battle(), view(6, 5), MX, MY, out);
    expect(wide.showing).toBe(false);
    expect(inked(out)).toBe(false);
  });

  it("shows a popup once it is drawn, and a change inside it at once", () => {
    const [vx, vy] = patterned, v = view(vx, vy);
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(vx, vy), v, MX, MY, out);
    expect(wide.showing).toBe(true);
    const menu = box(screen(vx, vy), 90, 4, 150, 60), half = screen(vx, vy);
    half.set(menu.subarray(0, 30 * LCD_STRIDE));
    // drawn over two frames: they show the last frame again; once the screen stays, it shows
    const before = out.slice();
    wide.compose(half, v, MX, MY, out);
    expect(out).toEqual(before);
    wide.compose(menu, v, MX, MY, out);
    wide.compose(menu, v, MX, MY, out);
    expect(out).not.toEqual(before);
    for (let x = 90; x <= 150; x++) expect(out[(16 * MY + 60) * W + 16 * MX + x]).toBe(1);
    expect(wide.showing).toBe(true);
    // its cursor moves: shown at once
    const moved = menu.slice();
    for (let x = 100; x < 140; x++) moved[20 * LCD_STRIDE + x] = 1;
    wide.compose(moved, v, MX, MY, out);
    for (let x = 100; x < 140; x++) expect(out[(16 * MY + 20) * W + 16 * MX + x]).toBe(1);
  });

  it("never holds a screen that keeps changing for more than a few frames", () => {
    const [vx, vy] = patterned, v = view(vx, vy);
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(vx, vy), v, MX, MY, out);
    let held = 0;
    for (let i = 0; i < 10; i++) {
      // (a box growing down the screen)
      const lcd = box(screen(vx, vy), 90, 4, 150, 14 + 4 * i);
      const before = out.slice();
      wide.compose(lcd, v, MX, MY, out);
      if (out.every((p, k) => p === before[k])) held++;
    }
    expect(held).toBeLessThanOrEqual(4);
    expect(wide.showing).toBe(true);
  });
});
