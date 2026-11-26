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

describe.each(["fulu", "firmware"] as const)("%s", (os) => {
  describe.each(["伏魔记-1.3.gam", "英雄坛说.gam", "异世大陆"])("%s", (file) => {
    it.skipIf(!have(os, file))("keeps the border at the screen's view while walking", () => {
      const gam = new Uint8Array(readFileSync(path(file)));
      let dev: { press(k: number): void; machine: Machine };
      if (os === "fulu") {
        const d = new FuluDevice({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });
        d.launch(d.install(gam)!);
        dev = d;
      } else {
        if (!firmware) {
          firmware = { regions: {} };
          for (const f of readdirSync(FW)) addFirmwareFile(firmware, f, new Uint8Array(readFileSync(join(FW, f))));
        }
        const d = new Device(firmware);
        d.boot();
        expect(d.launch(d.install(gam)!)).toBe(true);
        dev = d;
      }
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
