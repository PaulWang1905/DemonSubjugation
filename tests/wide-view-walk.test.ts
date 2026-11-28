// The wider map view while walking, in kit games on Fulu and on BBK's
// firmware: on every frame the border shows the same view as the middle (the
// game's own screen), and it does not blank while the screen shows the map.
// The game moves its view in memory before it draws (伏魔记 eight frames
// before, 异世大陆 two or three), and the firmware draws over two or three
// frames; src/bbk/wideView.ts follows the screen. Needs the games (BBK_GAMES,
// BBK_YISHI for 异世大陆), the fonts (FMJ_DATA_DIR) and, for the firmware,
// BBK_FIRMWARE; none is committed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeviceInput, type Timers } from "../src/app/deviceInput";
import { Device } from "../src/bbk/device";
import { addFirmwareFile, type Firmware } from "../src/bbk/firmware";
import { findLib } from "../src/bbk/gam";
import { Key } from "../src/bbk/keys";
import { KitCheats, type KitMapView } from "../src/bbk/kitCheats";
import { decodeLcd, LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ, type Machine } from "../src/bbk/machine";
import { decodePic, WideView, type Pic } from "../src/bbk/wideView";
import { readLibrary } from "../src/engine";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";
import { FuluDevice } from "../src/fulu/device";
import { buildGam } from "../src/bbk/gamBuild";
import { assemble } from "../src/editor/format/gut";
import { findEntry, readLib, writeLib } from "../src/editor/format/lib";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "", FW = process.env.BBK_FIRMWARE ?? "", YISHI = process.env.BBK_YISHI ?? "";
const path = (f: string) => (f === "异世大陆" ? YISHI : GAMES && join(GAMES, f));
const have = (os: string, f: string) => !!path(f) && existsSync(path(f)) && (os === "fulu" ? !!FONTS && existsSync(join(FONTS, "HZK16")) : !!FW && existsSync(FW));

/** Timers run by the emulated time (a held arrow's repeats). */
class Clock implements Timers {
  private t = 0;
  private n = 0;
  private q: { at: number; f: () => void; id: number }[] = [];
  set(f: () => void, ms: number) {
    this.q.push({ at: this.t + ms, f, id: ++this.n });
    return this.n;
  }
  clear(id: number) {
    this.q = this.q.filter((e) => e.id !== id);
  }
  advance(ms: number) {
    this.t += ms;
    for (let due; (due = this.q.filter((e) => e.at <= this.t).sort((a, b) => a.at - b.at)[0]); ) {
      this.q.splice(this.q.indexOf(due), 1);
      due.f();
    }
  }
}

/** Which view a part of a frame shows: of the views near `near`, the one most of its patterned tiles are (null: fewer than `min`, or a tie). */
function viewOf(lib: DatLib, px: Uint8Array, stride: number, x0: number, y0: number, near: KitMapView, cells: (tx: number, ty: number) => boolean, min: number): string | null {
  const b = lib.bytes(ResType.MAP, near.mapType, near.mapIndex);
  const tiles: Pic | null = b && decodePic(lib.bytes(ResType.TIL, 1, b[2] & 0xff));
  if (!b || !tiles) return null;
  const width = b[0x10] & 0xff, height = b[0x11] & 0xff;
  let best: string | null = null, most = min - 1, tie = false;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const vx = near.viewX + dx, vy = near.viewY + dy;
      let n = 0;
      for (let ty = -3; ty < 9; ty++)
        for (let tx = -5; tx < 14; tx++) {
          const X = x0 + tx * 16, Y = y0 + ty * 16, mx = vx + tx, my = vy + ty;
          if (!cells(tx, ty) || X < 0 || Y < 0 || X + 16 > stride || Y + 16 > px.length / stride || mx < 0 || my < 0 || mx >= width || my >= height) continue;
          const t = b[0x12 + (my * width + mx) * 2] & 0x7f;
          if (t >= tiles.frames.length || tiles.plain[t]) continue;
          const f = tiles.frames[t];
          let same = true;
          for (let y = 0; y < 16 && same; y++) for (let x = 0; x < 16; x++) if ((px[(Y + y) * stride + X + x] ? 1 : 0) !== f[y * 16 + x]) { same = false; break; }
          if (same) n++;
        }
      if (n > most) [best, most, tie] = [`${vx},${vy}`, n, false];
      else if (n === most && best) tie = true;
    }
  return tie ? null : best;
}

let firmware: Firmware | null = null;

/** The device for `os` running `gam`. */
function start(os: "fulu" | "firmware", gam: Uint8Array): { press(k: number): void; machine: Machine } {
  if (os === "fulu") {
    const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
    d.launch(d.install(gam)!);
    return d;
  }
  if (!firmware) {
    firmware = { regions: {} };
    for (const f of readdirSync(FW)) addFirmwareFile(firmware, f, new Uint8Array(readFileSync(join(FW, f))));
  }
  const d = new Device(firmware);
  d.boot();
  expect(d.launch(d.install(gam)!)).toBe(true);
  return d;
}

describe.each(["fulu", "firmware"] as const)("%s", (os) => {
  describe.each(["伏魔记-1.3.gam", "英雄坛说.gam", "异世大陆"])("%s", (file) => {
    it.skipIf(!have(os, file))("keeps the border at the screen's view while walking", () => {
      const gam = new Uint8Array(readFileSync(path(file)));
      const dev = start(os, gam);
      const m = dev.machine, library = gam.subarray(findLib(gam)), lib = new DatLib(new Int8Array(library.buffer, library.byteOffset, library.byteLength));
      const kit = new KitCheats(m, readLibrary(library)), wide = new WideView(library), clock = new Clock();
      const input = new DeviceInput(() => dev, () => true, clock);
      const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
      let check = false, frames = 0, onMap = 0, moved = 0, last = "";
      const problems: string[] = [];
      const [w, h] = WideView.size(2, 1), out = new Uint8Array(w * h);
      const frame = () => {
        m.run(CPU_HZ / 60);
        kit.tick();
        clock.advance(1000 / 60);
        if (!check) return;
        decodeLcd(m.ram, lcd);
        const v = kit.mapView();
        wide.compose(lcd, v, 2, 1, out);
        frames++;
        if (!v) return;
        // (the map area from x 8, or 7 in 伏魔记 1.0 and 1.2: the one the screen's tiles fit)
        const inMiddle = (tx: number, ty: number) => tx >= 0 && tx < 9 && ty >= 0 && ty < 6;
        const left = [8, 7].map((l) => [l, viewOf(lib, out, w, 32 + l, 16, v, inMiddle, 6)] as const).find(([, s]) => s) ?? [8, null];
        const middle = left[1];
        if (!middle) return;
        onMap++;
        if (middle !== last) (moved++, (last = middle));
        if (!wide.showing) return void problems.push(`frame ${frames}: the border blank with the map at ${middle} in the middle`);
        const border = viewOf(lib, out, w, 32 + left[0], 16, v, (tx, ty) => !inMiddle(tx, ty), 3);
        if (border && border !== middle) problems.push(`frame ${frames}: the border at ${border}, the middle at ${middle} (the memory's view ${v.viewX},${v.viewY})`);
      };
      const run = (s: number) => {
        for (let n = Math.round(s * 60); n > 0; n--) frame();
      };
      const tap = (k: number, s: number) => (input.down(k), frame(), input.up(k), run(s));
      // to the first map
      if (file === "异世大陆") for (const c of "wwwEwwEwwwwwwwwwwwwwwwwwwwwEwEwEwwwwwwwwwwEwEwEwEwEwEwEwEwEwww") c === "w" ? run(1) : tap(Key.enter, 0.6);
      else {
        run(3);
        for (let i = 0; i < 2; i++) tap(Key.enter, 2);
        for (let i = 0; i < 120 && !kit.ready(); i++) tap(i % 2 ? Key.exit : Key.enter, 1.5);
        for (let i = 0; i < 30; i++) tap(Key.enter, 0.6);
        for (let i = 0; i < 2; i++) tap(Key.exit, 1);
      }
      kit.setSwitch("noRandomBattles", true);
      check = true;
      // held arrows, taps, turning back, a talk and the menu
      for (const [k, s] of [[Key.right, 2], [Key.down, 2], [Key.left, 3], [Key.up, 3], [Key.right, 3]] as const) {
        input.down(k);
        run(s);
        input.up(k);
        run(0.5);
      }
      for (const k of [Key.right, Key.right, Key.left, Key.down, Key.down, Key.up, Key.left, Key.left]) tap(k, 0.4);
      tap(Key.enter, 1);
      tap(Key.enter, 1);
      tap(Key.exit, 1);
      tap(Key.exit, 1);
      for (const [k, s] of [[Key.down, 2], [Key.left, 2]] as const) {
        input.down(k);
        run(s);
        input.up(k);
        run(0.5);
      }
      expect(onMap).toBeGreaterThan(frames / 2);
      expect(moved).toBeGreaterThan(4); // (the view moved)
      expect(problems.slice(0, 5)).toEqual([]);
    }, 600_000);
  });
});

// 异世大陆's 精灵界 (map 9-1): repeating patterns, where a view a tile or two
// off matches most of the screen, and cells whose tile its tile set lacks.
// The game starts there (its first script replaced by one that loads the map,
// every cell walkable, no cell events) and walks about. On every frame that
// shows the map the border shows, and the middle never shows another view
// than the border was drawn at: no two cells or more of the middle are some
// other view's where that view's tile and the drawn one's differ, unless as
// many are the drawn one's.
describe.each(["fulu", "firmware"] as const)("%s, 异世大陆's 精灵界", (os) => {
  it.skipIf(!have(os, "异世大陆"))("keeps the border at the screen's view on repeating patterns", () => {
    const original = new Uint8Array(readFileSync(YISHI));
    const archive = readLib(original.subarray(findLib(original)));
    findEntry(archive, 1, 1, 1)!.data = assemble(".gut 1 1\n.events 0\n  loadmap 9, 1, 20, 5\n  createactor 1, 4, 3\n  callback\n");
    for (const e of archive.entries.filter((e) => e.resType === 2))
      for (let i = 0; i < e.data[0x10] * e.data[0x11]; i++) (e.data[0x12 + i * 2] |= 0x80), (e.data[0x12 + i * 2 + 1] = 0);
    const gam = buildGam(writeLib(archive), "wide", "fulu", original);
    const dev = start(os, gam), m = dev.machine;
    const library = gam.subarray(findLib(gam)), lib = new DatLib(new Int8Array(library.buffer, library.byteOffset, library.byteLength));
    const kit = new KitCheats(m, readLibrary(library)), wide = new WideView(library), clock = new Clock();
    const input = new DeviceInput(() => dev, () => true, clock);
    const b = lib.bytes(ResType.MAP, 9, 1)!, tiles = decodePic(lib.bytes(ResType.TIL, 1, b[2] & 0xff))!, width = b[0x10] & 0xff;
    const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= (b[0x11] & 0xff) ? -1 : b[0x12 + (y * width + x) * 2] & 0x7f);
    const known = (t: number) => t >= 0 && t < tiles.frames.length;
    const differ = (p: number, q: number) => p !== q && (!known(p) || !known(q) || tiles.frames[p].some((v, i) => v !== tiles.frames[q][i]));
    const lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT), [w, h] = WideView.size(2, 1), out = new Uint8Array(w * h);
    /** Whether the cell (tx, ty) of the map area (from x0, y0 in a picture `stride` wide) shows tile t. */
    const shows = (px: Uint8Array, stride: number, x0: number, y0: number, tx: number, ty: number, t: number) => {
      if (!known(t)) return false;
      const f = tiles.frames[t];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((px[(y0 + ty * 16 + y) * stride + x0 + tx * 16 + x] ? 1 : 0) !== f[y * 16 + x]) return false;
      return true;
    };
    /** How many cells of the frame's middle are view p's where view q's tile differs. */
    const evidence = (p: KitMapView, q: KitMapView) => {
      let n = 0;
      for (let ty = 0; ty < 6; ty++)
        for (let tx = 0; tx < 9; tx++) {
          const a = tile(p.viewX + tx, p.viewY + ty);
          if (differ(a, tile(q.viewX + tx, q.viewY + ty)) && shows(out, w, 32 + 8, 16, tx, ty, a)) n++;
        }
      return n;
    };
    const problems: string[] = [];
    let frames = 0, onMap = 0, moved = 0, last = "";
    const frame = () => {
      m.run(CPU_HZ / 60);
      kit.tick();
      clock.advance(1000 / 60);
      decodeLcd(m.ram, lcd);
      const v = kit.mapView();
      wide.compose(lcd, v, 2, 1, out);
      frames++;
      if (!v || v.mapType !== 9 || v.mapIndex !== 1) return;
      // (the device's screen shows the map: of the views near the memory's, one with 6 patterned tiles in place)
      const near: KitMapView[] = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.push({ ...v, viewX: v.viewX + dx, viewY: v.viewY + dy });
      const onScreen = near.some((n) => {
        let k = 0;
        for (let ty = 0; ty < 6; ty++)
          for (let tx = 0; tx < 9; tx++) {
            const t = tile(n.viewX + tx, n.viewY + ty);
            if (known(t) && !tiles.plain[t] && shows(lcd, LCD_STRIDE, 8, 0, tx, ty, t)) k++;
          }
        return k >= 6;
      });
      if (!onScreen) return;
      onMap++;
      if (`${v.viewX},${v.viewY}` !== last) (moved++, (last = `${v.viewX},${v.viewY}`));
      const d = wide.drawn;
      if (!wide.showing || !d) return void problems.push(`frame ${frames}: the border blank with the map in the middle`);
      for (const n of near) {
        const a = evidence(n, d);
        if (a >= 2 && a > evidence(d, n)) return void problems.push(`frame ${frames}: the middle shows ${n.viewX},${n.viewY}, the border ${d.viewX},${d.viewY} (memory ${v.viewX},${v.viewY})`);
      }
    };
    const run = (s: number) => {
      for (let n = Math.round(s * 60); n > 0; n--) frame();
    };
    const tap = (k: number, s: number) => (input.down(k), frame(), input.up(k), run(s));
    run(3);
    for (let i = 0; i < 2; i++) tap(Key.enter, 2);
    for (let i = 0; i < 30 && !kit.ready(); i++) tap(Key.enter, 1);
    kit.setSwitch("noRandomBattles", true);
    run(1);
    frames = onMap = 0;
    problems.length = 0;
    for (const [k, s] of [[Key.right, 2], [Key.down, 1], [Key.left, 4], [Key.up, 2], [Key.right, 4], [Key.down, 2], [Key.left, 2], [Key.up, 1]] as const) {
      input.down(k);
      run(s);
      input.up(k);
      run(0.3);
    }
    for (const k of [Key.right, Key.right, Key.left, Key.down, Key.up, Key.left]) tap(k, 0.4);
    expect(onMap).toBeGreaterThan(frames / 2);
    expect(moved).toBeGreaterThan(10);
    expect(problems.slice(0, 5)).toEqual([]);
  }, 600_000);
});

// A battle's start: on the firmware the game's screen reaches the device's
// over two frames, so one frame is the map with the battle's first rows over
// it. With the border shown, every frame's middle is a screen the device
// showed for two frames or more (never one caught mid-draw), and the border
// is gone within two frames of the screen first changing. Random battles on
// 完美版's and 伏魔记 1.0's 摩天顶 (plain ground; 1.0 draws its map from x 7).
describe.each(["fulu", "firmware"] as const)("%s, a battle's start", (os) => {
  describe.each([
    ["伏魔记完美版1.0.gam", 1, 9, 6, 4],
    ["伏魔记-1.0.gam", 1, 9, 6, 4],
  ] as const)("%s", (file, type, index, vx, vy) => {
    it.skipIf(!have(os, file))("never shows the border beside a screen being drawn, and drops it as soon as before", () => {
      const original = new Uint8Array(readFileSync(path(file)));
      const archive = readLib(original.subarray(findLib(original)));
      findEntry(archive, 1, 1, 1)!.data = assemble(`.gut 1 1\n.events 0\n  loadmap ${type}, ${index}, ${vx}, ${vy}\n  createactor 1, 4, 3\n  initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0\n  fightenable\n  callback\n`);
      const gam = buildGam(writeLib(archive), "wide", "fulu", original);
      const dev = start(os, gam), m = dev.machine, library = gam.subarray(findLib(gam));
      const kit = new KitCheats(m, readLibrary(library)), wide = new WideView(library), clock = new Clock();
      const input = new DeviceInput(() => dev, () => true, clock);
      const [w, h] = WideView.size(2, 1), out = new Uint8Array(w * h), lcd = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
      const log: { lcd: Uint8Array; middle: Uint8Array; showing: boolean; combat: boolean }[] = [];
      /** The map area of a screen, but for the hero's place (the firmware can catch his picture mid-draw too: no matter to the border). */
      const area = (px: Uint8Array, stride: number, x0: number, y0: number) => {
        const a = new Uint8Array(144 * 96);
        for (let y = 0; y < 96; y++) for (let x = 0; x < 144; x++) if (x < 64 || x >= 80 || y < 16 || y >= 64) a[y * 144 + x] = px[(y0 + y) * stride + x0 + x] ? 1 : 0;
        return a;
      };
      const frame = () => {
        m.run(CPU_HZ / 60);
        kit.tick();
        clock.advance(1000 / 60);
        decodeLcd(m.ram, lcd);
        wide.compose(lcd, kit.mapView(), 2, 1, out);
        // (the map area, from x 8, or 7 in 伏魔记 1.0)
        const left = file === "伏魔记-1.0.gam" ? 7 : 8;
        log.push({ lcd: area(lcd, LCD_STRIDE, left, 0), middle: area(out, w, 32 + left, 16), showing: wide.showing, combat: kit.inCombat() });
      };
      const run = (s: number) => {
        for (let n = Math.round(s * 60); n > 0; n--) frame();
      };
      run(3);
      for (let i = 0; i < 2; i++) (input.down(Key.enter), frame(), input.up(Key.enter), run(2));
      for (let i = 0; i < 30 && !kit.ready(); i++) (input.down(Key.enter), frame(), input.up(Key.enter), run(1));
      run(1);
      log.length = 0;
      for (let s = 0; s < 600 && !kit.inCombat(); s++) {
        input.down(s % 2 ? Key.left : Key.right);
        run(0.5);
        input.up(s % 2 ? Key.left : Key.right);
        run(0.2);
      }
      expect(kit.inCombat()).toBe(true);
      run(2);
      const same = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i]);
      // the screens that stayed two frames or more
      const steady = log.filter((l, i) => i > 0 && same(l.lcd, log[i - 1].lcd)).map((l) => l.lcd);
      const combatAt = log.findIndex((l) => l.combat);
      const torn = log.flatMap((l, i) => (l.showing && !steady.some((s) => same(s, l.middle)) ? [`frame ${i - combatAt} from the battle in memory`] : []));
      expect(torn).toEqual([]);
      // the battle (in the game's memory first): from the screen's first change, the border gone within two frames
      let first = combatAt;
      while (same(log[first - 1].lcd, log[first].lcd)) first++;
      let off = log.length;
      while (off > 0 && !log[off - 1].showing) off--;
      expect(off - first).toBeLessThanOrEqual(2);
      expect(log.slice(off).every((l) => !l.showing)).toBe(true);
    }, 600_000);
  });
});
