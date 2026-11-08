// A Longman 4988 with Fulu for its OS: what the device player needs of a
// device (as src/bbk/device.ts gives with the firmware), without firmware.

import type { FlashFile } from "../bbk/flashfs";
import type { Machine } from "../bbk/machine";
import { FAR_CALL, Fulu } from "./fulu";
import { fontRom } from "./glyphs";

/** What saved devices are kept under, so that one saved on the firmware does not resume on Fulu, nor the other way. */
export const FULU_OS = "fulu-1";

export class FuluDevice {
  readonly fulu: Fulu;

  /** With a font ROM made from HZK16- and ASC16-layout fonts. */
  constructor(fonts: { hzk16: Uint8Array; asc16: Uint8Array }) {
    this.fulu = new Fulu(undefined, fontRom(fonts.hzk16, fonts.asc16));
  }

  get machine(): Machine {
    return this.fulu.machine;
  }

  /** Why the program stopped (it ended, or needs an OS function Fulu does not have yet), or null. */
  get stopped(): string | null {
    return this.fulu.stopped;
  }

  /** Put a .gam in the flash; null if it does not fit. */
  install(gam: Uint8Array): FlashFile | null {
    return this.fulu.install(gam);
  }

  /** Start the program, as the OS's launcher leaves it. */
  launch(file: FlashFile): boolean {
    this.fulu.start(file);
    return true;
  }

  /**
   * After the machine is restored from a saved state: an OS function that
   * was waiting (the CPU halted at the far call) is asked again when it wakes.
   */
  resumed(): void {
    const m = this.machine;
    this.fulu.waiting = m.cpu.pc === FAR_CALL && (m.ram[0x200] & 0x08) !== 0;
  }

  press(key: number): void {
    this.machine.press(key);
  }
}
