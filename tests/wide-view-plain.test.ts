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
