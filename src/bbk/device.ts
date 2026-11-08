// A Longman 4988 running its own firmware. Programs go into its flash file
// system the way the PC download tool put them there, and start from the OS's
// 游戏 (games) menu with the key presses a person would use, so the OS sets
// everything up exactly as on the device.

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

export class Device {
  readonly machine: Machine;

  constructor(firmware: Firmware) {
    this.machine = new Machine(firmware);
  }

  /** Emulate `seconds` of device time. */
  run(seconds: number): void {
    for (let n = Math.round(seconds * FPS); n > 0; n--) this.machine.run(FRAME);
  }

  press(key: number): void {
    this.machine.press(key);
  }

  /**
   * Power on and go to the main menu. A cold start asks 要清内存吗 (clear the
   * memory?), which is answered 否 (no); a blank flash is formatted by the OS.
   */
  boot(): void {
    this.machine.reset();
    this.run(1);
    this.keys([keyCode("N")], 15); // then initialising, a holiday greeting and the start-up animation
    this.keys([Key.exit, Key.home], 1);
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
    const flash = this.machine.flash.data;
    if (!isFormatted(flash)) this.boot();
    for (const f of this.programs()) deleteFile(flash, f);
    const file = installFile(flash, gam, FileType.game, gamInfo(gam).rawName);
    if (file) this.boot();
    return file;
  }

  /** Open an installed program from the 游戏 menu; true once the OS has mapped it in to run. */
  launch(file: FlashFile): boolean {
    const index = this.programs().findIndex((f) => f.entry === file.entry);
    if (index < 0) return false;
    this.keys([Key.home, ...Array(GAMES_CATEGORY).fill(Key.pageDown), ...Array(BUILT_IN_GAMES + index).fill(Key.down), Key.enter], 1);
    const first = 0x200 + (file.offset >> 12), last = first + (file.size >> 12);
    for (let n = 0; n < 10 * FPS; n++) {
      this.machine.run(FRAME);
      if (this.machine.banks().some((page) => page >= first && page <= last)) return true;
    }
    return false;
  }

  private keys(keys: number[], pause: number): void {
    for (const k of keys) {
      this.press(k);
      this.run(pause);
    }
  }
}
