// 异世大陆's keys, on Fulu and on BBK's firmware, pressed as the player's
// on-screen keys press them (DeviceInput). Runs when BBK_FIRMWARE points at
// the firmware dumps and the game is found: BBK_YISHI (the .gam), or a
// 异世大陆*.gam in BBK_GAMES or its folder's "roms" (game files are never
// committed).
//
// The RPG kit's engine (RpgA100.eng: the C reconstruction's
// _00214347_readKeyBuffer) reads GuiGetMsg, then GuiTranslateMsg: on the map
// the commands 查找, 插入, 修改 and 删除 ($33, $30, $32, $31: an arrow after
// Shift) run the game's scripts 0-6 to 0-9; Space ($20, a character) turns
// continuous walking on and off; the codes $29-$2B the row's 帮助, 查找 and
// 插入 used to send mean nothing to the 4988's OS. In a battle, R repeats the
// last round's commands.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Device } from "../src/bbk/device";
import { addFirmwareFile, type Firmware } from "../src/bbk/firmware";
import { Key, keyCode, SECOND, type Press } from "../src/bbk/keys";
import { decodeLcd, LCD_HEIGHT, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ, type Machine, type MachineState } from "../src/bbk/machine";
import { Fulu } from "../src/fulu/fulu";
import { DeviceInput, shiftLatched, type InputDevice } from "../src/app/deviceInput";

const FW = process.env.BBK_FIRMWARE ?? "";

/** The game's file, if it can be found. */
function findGame(): string | null {
  if (process.env.BBK_YISHI && existsSync(process.env.BBK_YISHI)) return process.env.BBK_YISHI;
  const dir = process.env.BBK_GAMES;
  if (!dir) return null;
  for (const d of [dir, join(dirname(dir), "roms")]) {
    if (!existsSync(d)) continue;
    const f = readdirSync(d).find((n) => n.startsWith("异世大陆") && n.toLowerCase().endsWith(".gam"));
    if (f) return join(d, f);
  }
  return null;
}
const GAME = findGame();

/**
 * Key scripts: E Enter, Z Shift, U D L R the arrows, each pressed with 0.6 s
 * after it; w waits a second. MAP: the opening scenes, a belief (秩序), the
 * opening dialogue, to the village's map. Then on each OS its own walk to the
 * maze (迷宫) east of the village, with combat mode on (修改), to a battle
 * (the NPCs and the battles are random, and the OSes' random numbers part on
 * the way).
 */
const MAP = "wwwEwwEwwwwwwwwwwwwwwwwwwwwEwEwEwwwwwwwwwwEwEwEwEwEwEwEwEwEwww";
const TO_BATTLE = {
  fulu: "wwwEwwEwwwwwwwwwwwwwwwwwwwwEwEwEwwwwwwwwwwEwEwEwEwEwEwEwEwEwwwDDDDDDDDDDDDDDwwEwEwEwDDDDDDDRDRRRDRDRRRRRRRRRRRRUURRRRRRUUwwEwEwEwZUwwEwEwDDDDUUUUUUUUUUUULLLLLLUUUUURRRRURRR",
  firmware:
    "wwwEwwEwwwwwwwwwwwwwwwwwwwwEwEwEwwwwwwwwwwEwEwEwEwEwEwEwEwEwwwZUwwEwEwDDDDDDDDDDDDDDwEwEwDDDDDDDRDRRRRRRRRRRRRRRRRDRDRRRRRRRRRRRRUURRRRRRUUwEwEwRRDDRRRRRULLLLLUUUULLL",
};
const SCRIPT_KEYS: Record<string, number> = { E: Key.enter, Z: Key.shift, U: Key.up, D: Key.down, L: Key.left, R: Key.right };

function play(m: Machine, script: string): void {
  for (const c of script) {
    if (c !== "w") m.press(SCRIPT_KEYS[c]);
    m.run(c === "w" ? CPU_HZ : CPU_HZ * 0.6);
  }
}

const screen = (m: Machine) => {
  const px = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
  decodeLcd(m.ram, px);
  return px;
};

/** The device as it is now, to go back to before each key. */
const keep = (m: Machine) => ({ state: m.saveState(), flash: m.flash.data.slice() });
const back = (m: Machine, k: { state: MachineState; flash: Uint8Array }) => {
  m.flash.data.set(k.flash);
  m.loadState(k.state);
};

/** A tap of an on-screen key, as the player gives it (no timers: a tap does not repeat). */
function tap(d: InputDevice, p: Press): void {
  const input = new DeviceInput(() => d, () => true, { set: () => 1, clear: () => {} });
  input.down(p);
  input.up(p);
}

/**
 * What a key does from a moment: the pixels that differ, 1.5 s later, from
 * the same 1.5 s without it, inside the box around them (the box the key
 * opened); empty when it changed nothing. Moving NPCs aside, which the
 * firmware and Fulu move by their own random numbers.
 */
function effect(d: InputDevice & { machine: Machine }, p: Press | null): { box: number[]; pixels: Uint8Array } {
  const m = d.machine, at = keep(m);
  m.run(CPU_HZ * 1.5);
  const quiet = screen(m);
  back(m, at);
  if (p !== null) tap(d, p);
  m.run(CPU_HZ * 1.5);
  const now = screen(m);
  back(m, at);
  let x0 = 160, y0 = 96, x1 = -1, y1 = -1;
  for (let y = 0; y < LCD_HEIGHT; y++)
    for (let x = 0; x < 159; x++)
      if (now[y * LCD_STRIDE + x] !== quiet[y * LCD_STRIDE + x]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  if (x1 < 0) return { box: [], pixels: new Uint8Array(0) };
  const pixels = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
  for (let y = y0, i = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) pixels[i++] = now[y * LCD_STRIDE + x];
  return { box: [x0, y0, x1, y1], pixels };
}

/** How many pixels of a and b differ (all, when their boxes differ). */
const apart = (a: { box: number[]; pixels: Uint8Array }, b: { box: number[]; pixels: Uint8Array }) =>
  a.box.join() !== b.box.join() ? Math.max(a.pixels.length, b.pixels.length, 1) : a.pixels.reduce((n, v, i) => n + (v !== b.pixels[i] ? 1 : 0), 0);

describe.skipIf(!FW || !existsSync(FW) || !GAME)("异世大陆's keys, on Fulu and on the firmware", () => {
  const fw: Firmware = { regions: {} };
  const gam = () => new Uint8Array(readFileSync(GAME!));
  /** The game on Fulu (with the firmware's font, so that text looks the same), after `script`. */
  const onFulu = (script: string) => {
    if (!fw.regions.os) for (const f of readdirSync(FW)) addFirmwareFile(fw, f, new Uint8Array(readFileSync(join(FW, f))));
    const f = new Fulu(undefined, fw.regions.font);
    f.start(f.install(gam())!);
    play(f.machine, script);
    return { machine: f.machine, press: (k: number) => f.machine.press(k) };
  };
  const onFirmware = (script: string) => {
    if (!fw.regions.os) for (const f of readdirSync(FW)) addFirmwareFile(fw, f, new Uint8Array(readFileSync(join(FW, f))));
    const d = new Device(fw);
    d.boot();
    expect(d.launch(d.install(gam())!)).toBe(true);
    play(d.machine, script);
    return d;
  };

  it("on the map, 删除 修改 查找 插入 open the game's own scripts, the same on both; 帮助, R and Space show nothing", { timeout: 600_000 }, () => {
    const fulu = onFulu(MAP), firmware = onFirmware(MAP);
    const keys: [string, Press, boolean][] = [
      ["删除", SECOND.del, true],
      ["修改", SECOND.modify, true],
      ["查找", SECOND.search, true],
      ["插入", SECOND.insert, true],
      ["帮助", SECOND.help, false],
      ["R", keyCode("R"), false],
      ["Space", Key.space, false],
      // what the row sent before: codes the 4988's keyboard never sends (帮助 $29, 查找 $2A, 插入 $2B), and Shift alone (删除 $2D)
      ["$29", 0x29, false],
      ["$2A", 0x2a, false],
      ["$2B", 0x2b, false],
      ["Shift alone", Key.shift, false],
    ];
    for (const [name, p, opens] of keys) {
      const a = effect(fulu, p), b = effect(firmware, p);
      // (NPCs that moved otherwise than without the key are a few pixels; a box is hundreds)
      if (opens) {
        expect(a.pixels.length, `${name} on Fulu`).toBeGreaterThan(600);
        expect(apart(a, b), `${name}: Fulu and the firmware`).toBe(0);
      } else {
        expect(a.pixels.length, `${name} on Fulu`).toBeLessThan(600);
        expect(b.pixels.length, `${name} on the firmware`).toBeLessThan(600);
      }
    }
  });

  it("Space turns continuous walking on: an arrow then walks on, on both", { timeout: 600_000 }, () => {
    for (const d of [onFulu(MAP), onFirmware(MAP)]) {
      const walked = (space: boolean) => {
        const at = keep(d.machine);
        if (space) tap(d, Key.space);
        d.machine.run(CPU_HZ * 0.3);
        tap(d, Key.down);
        d.machine.run(CPU_HZ * 2);
        const s = screen(d.machine);
        back(d.machine, at);
        return s;
      };
      // one step, or on and on: the view has moved further
      expect(walked(true).join()).not.toBe(walked(false).join());
    }
  });

  it("the device's own Shift (the row's key) sets the GUI's latch, which the player shows; the next arrow is then its second meaning, on both", { timeout: 600_000 }, () => {
    for (const d of [onFulu(MAP), onFirmware(MAP)]) {
      const m = d.machine, at = keep(m);
      expect(shiftLatched(m.ram)).toBe(false);
      tap(d, Key.shift);
      m.run(CPU_HZ * 0.3);
      expect(shiftLatched(m.ram)).toBe(true);
      // Shift and ← apart: 删除 opens the game's screen, as the row's 删除 does
      const del = effect(d, Key.left);
      back(m, at);
      expect(apart(del, effect(d, SECOND.del))).toBe(0);
      expect(del.pixels.length).toBeGreaterThan(600);
      // pressed again, Shift lets go of the latch
      tap(d, Key.shift);
      m.run(CPU_HZ * 0.3);
      tap(d, Key.shift);
      m.run(CPU_HZ * 0.3);
      expect(shiftLatched(m.ram)).toBe(false);
      back(m, at);
    }
  });

  // What the device does with an arrow held while continuous walking is on. The engine
  // (_00214000_runMapLoop) toggles walking on every message of the same arrow: the first starts
  // it, the next stops it. Its OS passes every key the keyboard sends as a new press: the keyboard
  // interrupt (7:$764D) puts each code into the ring masked to six bits, with nothing to tell a
  // repeat from a press, and repeats nothing itself. So a held arrow's repeats toggle walking on
  // the firmware as they do with the player's repeats (DeviceInput); the player is left as it is.
  it("with continuous walking on, each press of the arrow toggles walking, a held arrow's repeats too, on both", { timeout: 600_000 }, () => {
    for (const d of [onFulu(MAP), onFirmware(MAP)]) {
      const m = d.machine;
      const at = keep(m);
      /** Run `ms` of device time in 10 ms steps, the player's timers with it. */
      const clock = { t: 0, q: [] as { at: number; f: () => void; id: number }[], n: 0 };
      const timers = {
        set: (f: () => void, ms: number) => (clock.q.push({ at: clock.t + ms, f, id: ++clock.n }), clock.n),
        clear: (id: number) => void (clock.q = clock.q.filter((e) => e.id !== id)),
      };
      const run = (ms: number) => {
        for (let k = 0; k < ms / 10; k++) {
          m.run(CPU_HZ / 100);
          clock.t += 10;
          for (let due; (due = clock.q.find((e) => e.at <= clock.t)); ) {
            clock.q.splice(clock.q.indexOf(due), 1);
            due.f();
          }
        }
      };
      // (the presses the program gets: those sent, less a repeat taken back unread when the arrow is let go)
      const sent: number[] = [];
      const counting: InputDevice = {
        press: (k) => (sent.push(k), d.press(k)),
        machine: {
          ram: m.ram,
          keysWaiting: () => m.keysWaiting(),
          dropKey: (k) => {
            const waiting = m.keysWaiting();
            m.dropKey(k);
            if (waiting && !m.keysWaiting()) sent.pop();
          },
        },
      };
      const input = new DeviceInput(() => counting, () => true, timers);
      /**
       * Whether the hero walks on by itself: over the next 1.5 s its tile of the screen (4, 3)
       * changes, as the view moves or, against a wall or a person, as its feet step in place.
       */
      const hero = () => {
        const px = screen(m), out: number[] = [];
        for (let y = 48; y < 64; y++) for (let x = 64; x < 80; x++) out.push(px[y * LCD_STRIDE + x]);
        return out.join("");
      };
      const walksOn = () => {
        let last = hero(), changes = 0;
        for (let k = 0; k < 15; k++) {
          run(100);
          const now = hero();
          if (now !== last) changes++;
          last = now;
        }
        return changes > 0;
      };
      tap(d, Key.space);
      run(300);
      // a tap walks on; a second tap stops
      input.down(Key.down);
      input.up(Key.down);
      run(300);
      expect(walksOn()).toBe(true);
      input.down(Key.down);
      input.up(Key.down);
      run(300);
      expect(walksOn()).toBe(false);
      // held: every repeat the program read was a press, and walking is on after it is let go
      // when they were an odd number (on, off, on, ...), off when even
      // (up and down in turn, to stay near; both an odd and an even number of presses come up)
      const counts = new Set<number>();
      for (const [holdMs, arrow] of [[700, Key.up], [800, Key.down], [900, Key.up], [1000, Key.down]]) {
        sent.length = 0;
        input.down(arrow);
        run(holdMs);
        input.up(arrow);
        const presses = sent.length;
        counts.add(presses % 2);
        expect(presses).toBeGreaterThan(2);
        run(300);
        expect(walksOn(), `held ${holdMs} ms: ${presses} presses`).toBe(presses % 2 === 1);
        // (stop it for the next)
        if (presses % 2 === 1) {
          input.down(arrow);
          input.up(arrow);
          run(300);
        }
      }
      expect(counts.size).toBe(2);
      back(m, at);
    }
  });

  it("in a battle, R ends the choosing of commands at once, on both; another letter does nothing", { timeout: 600_000 }, () => {
    for (const [d, os] of [
      [onFulu(TO_BATTLE.fulu), "Fulu"],
      [onFirmware(TO_BATTLE.firmware), "the firmware"],
    ] as const) {
      expect(effect(d, keyCode("R")).pixels.length, `R on ${os}`).toBeGreaterThan(600);
      // (the command cursor's blinking may restart: a few pixels)
      expect(effect(d, keyCode("Q")).pixels.length, `Q on ${os}`).toBeLessThan(100);
    }
  });
});
