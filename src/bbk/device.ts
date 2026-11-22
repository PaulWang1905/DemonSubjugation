// A Longman 4988 running its own firmware. Programs go into its flash file
// system the way the PC download tool put them there, and start from the OS's
// 游戏 (games) menu with the key presses a person would use, so the OS sets
// everything up exactly as on the device.
//
// Turning it on emulates many seconds of device time (the OS's start-up),
// which takes a while on a slow computer: each step is also a generator that
// stops after every emulated frame (booting, installing, launching), so a
// player can run it a slice at a time and show how far it is; the plain
// methods run the same generators to the end at once.

import type { Firmware } from "./firmware";
import { deleteFile, FileType, installFile, isFormatted, listFiles, type FlashFile } from "./flashfs";
import { gamInfo } from "./gam";
import { Key, keyCode } from "./keys";
import { CPU_HZ, Machine } from "./machine";

export const FPS = 60;
const FRAME = CPU_HZ / FPS;

/** How many times 下一页 takes the main menu from 词典 to 游戏. */
const GAMES_CATEGORY = 9;
/** Programs in the OS ROM listed before the installed ones (Eros方块). */
const BUILT_IN_GAMES = 1;

/** Device seconds a power-on takes (boot): the start-up, then 否 to 要清内存吗 and the greeting, then the menu keys. */
const BOOT_SECONDS = 1 + 15 + 1 + 1;
/** Frames (yields of `booting`) a power-on takes. */
export const BOOT_FRAMES = BOOT_SECONDS * FPS;

/** Run a device step to its end. */
export function finish<T>(steps: Generator<void, T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

export class Device {
  readonly machine: Machine;

  constructor(firmware: Firmware) {
    this.machine = new Machine(firmware);
  }

  /** Emulate `seconds` of device time. */
  run(seconds: number): void {
    finish(this.running(seconds));
  }

  /** `run`, a frame at a time. */
  private *running(seconds: number): Generator<void, void> {
    for (let n = Math.round(seconds * FPS); n > 0; n--) {
      this.machine.run(FRAME);
      yield;
    }
  }

  press(key: number): void {
    this.machine.press(key);
  }

  /**
   * Power on and go to the main menu. A cold start asks 要清内存吗 (clear the
   * memory?), which is answered 否 (no); a blank flash is formatted by the OS.
   */
  boot(): void {
    finish(this.booting());
  }

  /** `boot`, a frame at a time (BOOT_FRAMES of them). */
  *booting(): Generator<void, void> {
    this.machine.reset();
    yield* this.running(1);
    yield* this.pressing([keyCode("N")], 15); // then initialising, a holiday greeting and the start-up animation
    yield* this.pressing([Key.exit, Key.home], 1);
  }

  /** The programs in the flash, in the order the 游戏 menu lists them. */
  programs(): FlashFile[] {
    return listFiles(this.machine.flash.data).filter((f) => f.type === FileType.game);
  }

  /**
   * Put a .gam in the flash as the only program, as the download tool would
   * after deleting the others (the device holds ~2 MB), and cold-start so the
   * OS reads the new file system. A blank flash is first formatted by the OS.
   * Returns null if the program is larger than the flash.
   */
  install(gam: Uint8Array): FlashFile | null {
    return finish(this.installing(gam));
  }

  /** How many power-ons installing takes now (two on a blank flash, which the OS formats first). */
  installBoots(): number {
    return isFormatted(this.machine.flash.data) ? 1 : 2;
  }

  /** `install`, a frame at a time (BOOT_FRAMES for each of installBoots()). */
  *installing(gam: Uint8Array): Generator<void, FlashFile | null> {
    const flash = this.machine.flash.data;
    if (!isFormatted(flash)) yield* this.booting();
    for (const f of this.programs()) deleteFile(flash, f);
    const file = installFile(flash, gam, FileType.game, gamInfo(gam).rawName);
    if (file) yield* this.booting();
    return file;
  }

  /** Open an installed program from the 游戏 menu; true once the OS has mapped it in to run. */
  launch(file: FlashFile): boolean {
    return finish(this.launching(file));
  }

  /** `launch`, a frame at a time. */
  *launching(file: FlashFile): Generator<void, boolean> {
    const index = this.programs().findIndex((f) => f.entry === file.entry);
    if (index < 0) return false;
    yield* this.pressing([Key.home, ...Array(GAMES_CATEGORY).fill(Key.pageDown), ...Array(BUILT_IN_GAMES + index).fill(Key.down), Key.enter], 1);
    const first = 0x200 + (file.offset >> 12), last = first + (file.size >> 12);
    for (let n = 0; n < 10 * FPS; n++) {
      this.machine.run(FRAME);
      if (this.machine.banks().some((page) => page >= first && page <= last)) return true;
      yield;
    }
    return false;
  }

  private *pressing(keys: number[], pause: number): Generator<void, void> {
    for (const k of keys) {
      this.press(k);
      yield* this.running(pause);
    }
  }
}
