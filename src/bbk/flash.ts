// The 4988's 2 MB NOR flash (an SST39VF160-class part): JEDEC command
// sequences for byte program, sector/block/chip erase, software ID and CFI
// query. Programming can only clear bits, as on the real chip; erasing sets
// them back to 1. Operations complete at once, so status polling (DQ7/DQ6)
// reads the final data.

export const FLASH_SIZE = 0x200000;
const SECTOR = 0x1000;
const BLOCK = 0x10000;

// CFI query table (byte addresses 0x10-0x34), also returned in software-ID mode
const CFI = new Uint8Array(0x35);
CFI.set([0x51, 0x52, 0x59, 0x01, 0x07, 0, 0, 0, 0, 0, 0], 0x10); // "QRY", command set
CFI.set([0x27, 0x36, 0, 0, 0x04, 0, 0x04, 0x06, 0x01, 0, 0x01, 0x01], 0x1b); // voltages, timing
CFI.set([0x15, 0, 0, 0, 0, 0x02, 0xff, 0x01, 0x10, 0, 0x1f, 0, 0, 0x01], 0x27); // 2 MB: 512×4 KB, 32×64 KB

/** The command state of the chip (its contents are kept separately). */
export interface FlashState {
  idMode: boolean;
  stage: number;
  erase: boolean;
}

export class Flash {
  readonly data: Uint8Array;
  /** Software-ID / CFI mode: reads return the query table instead of the array. */
  idMode = false;
  /** Called when `idMode` changes. */
  onModeChange: () => void = () => {};
  private stage = 0;
  private erase = false;

  constructor(image?: Uint8Array) {
    this.data = new Uint8Array(FLASH_SIZE).fill(0xff);
    if (image) this.data.set(image.subarray(0, FLASH_SIZE));
  }

  saveState(): FlashState {
    return { idMode: this.idMode, stage: this.stage, erase: this.erase };
  }

  loadState(s: FlashState): void {
    ({ stage: this.stage, erase: this.erase } = s);
    this.setIdMode(s.idMode);
  }

  read(off: number): number {
    return !this.idMode ? this.data[off] : off < CFI.length ? CFI[off] : 0;
  }

  write(off: number, v: number): void {
    const cmd = off & 0x7fff; // the chip decodes A14-A0 in command cycles
    switch (this.stage) {
      case 0:
      case 3:
        if (this.stage === 3 && !this.erase) {
          this.data[off] &= v; // byte program
          this.stage = 0;
        } else if (cmd === 0x5555 && v === 0xaa) this.stage++;
        else this.reset(v);
        return;
      case 1:
      case 4:
        if (cmd === 0x2aaa && v === 0x55) this.stage++;
        else this.reset(v);
        return;
      case 2:
        if (cmd !== 0x5555) return this.reset(v);
        if (v === 0xa0 || v === 0x80) {
          this.erase = v === 0x80;
          this.stage = 3;
          return;
        }
        this.stage = 0;
        if (v === 0x90 || v === 0x98) this.setIdMode(true);
        else if (v === 0xf0) this.setIdMode(false);
        return;
      case 5:
        if (v === 0x10 && cmd === 0x5555) this.data.fill(0xff);
        else if (v === 0x30) this.data.fill(0xff, off & ~(SECTOR - 1), (off & ~(SECTOR - 1)) + SECTOR);
        else if (v === 0x50) this.data.fill(0xff, off & ~(BLOCK - 1), (off & ~(BLOCK - 1)) + BLOCK);
        this.stage = 0;
        return;
    }
  }

  /** An unexpected cycle aborts the sequence; 0xF0 also leaves ID/CFI mode. */
  private reset(v: number): void {
    this.stage = 0;
    if (v === 0xf0) this.setIdMode(false);
  }

  private setIdMode(on: boolean): void {
    if (this.idMode === on) return;
    this.idMode = on;
    this.onModeChange();
  }
}
