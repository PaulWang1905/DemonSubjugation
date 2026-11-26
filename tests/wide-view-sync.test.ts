// The device player's wider map view (src/bbk/wideView.ts) keeps the border
// and the middle at the same moment. A kit game moves its view in memory
// first and draws its screen some frames later (and on the firmware over two
// or three frames): the border follows the screen, not the memory. Synthetic
// screens drawn from The Silent Bell's library (no game files needed).
import { describe, expect, it } from "vitest";
import { writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";
import type { KitMapView } from "../src/bbk/kitCheats";
import { LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { decodePic, WideView } from "../src/bbk/wideView";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";

const library = writeLib(silentBell());
const lib = new DatLib(new Int8Array(library.buffer, library.byteOffset, library.byteLength));
// BELLHAVEN (map 1-1): its tiles and cells
const mapBytes = lib.bytes(ResType.MAP, 1, 1)!;
const tiles = decodePic(lib.bytes(ResType.TIL, 1, mapBytes[2] & 0xff))!;
const width = mapBytes[0x10] & 0xff;
const tileAt = (x: number, y: number) => mapBytes[0x12 + (y * width + x) * 2] & 0x7f;

const MX = 2, MY = 1, [W, H] = WideView.size(MX, MY);

/** The device's screen showing the map at (vx, vy), the map area from x 8; `rows`: only the tile rows below that from this view (a screen mid-redraw), the rest from `rest`. */
function screen(vx: number, vy: number, rest?: [number, number], rows = 6): Uint8Array {
  const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
  for (let ty = 0; ty < 6; ty++)
    for (let tx = 0; tx < 9; tx++) {
      const [x0, y0] = ty < rows || !rest ? [vx, vy] : rest;
      const px = tiles.frames[tileAt(x0 + tx, y0 + ty)];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) lcd[(ty * 16 + y) * LCD_STRIDE + 8 + tx * 16 + x] = px[y * 16 + x];
    }
  return lcd;
}

/** A view with a villager on the border's left columns. */
const view = (vx: number, vy: number, npcX: number): KitMapView => ({ mapType: 1, mapIndex: 1, viewX: vx, viewY: vy, actors: [{ type: 2, res: 1, facing: 3, step: 0, x: npcX, y: vy + 2 }] });

/** The frame a consistent moment gives: the screen showing the view the memory holds. */
function consistent(v: KitMapView): Uint8Array {
  const out = new Uint8Array(W * H);
  new WideView(library).compose(screen(v.viewX, v.viewY), v, MX, MY, out);
  return out;
}

const blankBorder = (out: Uint8Array) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((y < 16 * MY || y >= H - 16 * MY || x < 16 * MX || x >= W - 16 * MX) && out[y * W + x]) return false;
  return true;
};

describe("the wider view follows the device's screen", () => {
  it("draws the border at the view the screen shows, with that moment's people, while the game's memory is ahead", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    const v0 = view(6, 4, 4), v1 = view(7, 4, 5);
    wide.compose(screen(6, 4), v0, MX, MY, out);
    expect(wide.showing).toBe(true);
    expect(out).toEqual(consistent(v0));
    // the hero steps right: the memory moves (and the villager with it) before the screen is drawn
    for (let i = 0; i < 8; i++) {
      wide.compose(screen(6, 4), v1, MX, MY, out);
      expect(out).toEqual(consistent(v0));
      expect(wide.drawn?.viewX).toBe(6);
      expect(wide.drawn?.actors[0].x).toBe(4);
    }
    // the screen drawn: the border with it
    wide.compose(screen(7, 4), v1, MX, MY, out);
    expect(out).toEqual(consistent(v1));
    // and back: the memory first again
    wide.compose(screen(7, 4), v0, MX, MY, out);
    expect(out).toEqual(consistent(v1));
    wide.compose(screen(6, 4), v0, MX, MY, out);
    expect(out).toEqual(consistent(v0));
  });

  it("shows the last frame again while the screen is mid-redraw, for a few frames at most", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    const v0 = view(6, 4, 4), v1 = view(7, 4, 5);
    wide.compose(screen(6, 4), v0, MX, MY, out);
    const before = out.slice();
    // the top half drawn at the new view, the bottom still the old (as the firmware draws it, over two frames)
    for (const rows of [3, 4]) {
      wide.compose(screen(7, 4, [6, 4], rows), v1, MX, MY, out);
      expect(out).toEqual(before);
      expect(wide.showing).toBe(true);
    }
    wide.compose(screen(7, 4), v1, MX, MY, out);
    expect(out).toEqual(consistent(v1));
    // a screen that stays torn is not held for ever: the border goes
    const torn = screen(6, 4, [7, 4], 3);
    let held = 0;
    for (let i = 0; i < 10 && wide.showing; i++) {
      wide.compose(torn, v0, MX, MY, out);
      if (wide.showing) held++;
    }
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThanOrEqual(4);
    expect(wide.showing).toBe(false);
    expect(blankBorder(out)).toBe(true);
  });

  it("drops the border by the second frame of a screen that is not the map, and brings it back at once", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    const v0 = view(6, 4, 4);
    wide.compose(screen(6, 4), v0, MX, MY, out);
    const before = out.slice();
    // a battle's screen (here: blank): its first frame shows the last frame again, the next the device's screen alone
    const battle = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    for (let y = 0; y < LCD_HEIGHT; y++) for (let x = 0; x < 159; x += 2) battle[y * LCD_STRIDE + x] = 1;
    wide.compose(battle, v0, MX, MY, out);
    expect(out).toEqual(before);
    wide.compose(battle, v0, MX, MY, out);
    expect(wide.showing).toBe(false);
    expect(blankBorder(out)).toBe(true);
    for (let y = 0; y < LCD_HEIGHT; y++) for (let x = 0; x < 159; x++) expect(out[(16 * MY + y) * W + 16 * MX + x]).toBe(battle[y * LCD_STRIDE + x]);
    // back on the map
    wide.compose(screen(6, 4), v0, MX, MY, out);
    expect(out).toEqual(consistent(v0));
  });

  it("finds the screen's view a tile from the memory's on the first frame too", () => {
    const wide = new WideView(library), out = new Uint8Array(W * H);
    wide.compose(screen(6, 4), view(7, 4, 5), MX, MY, out);
    expect(wide.drawn?.viewX).toBe(6);
  });
});
