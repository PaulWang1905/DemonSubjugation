// The 4988 hardware model, without the real firmware: a few bytes of 65C02
// code in the boot page stand in for the OS.
import { describe, expect, it } from "vitest";
import { REGION_SIZE, addFirmwareFile, missingRegions, regionOf, type Firmware } from "../src/bbk/firmware";
import { Flash } from "../src/bbk/flash";
import { deleteFile, FileType, installFile, isFormatted, listFiles } from "../src/bbk/flashfs";
import { findLib, gamInfo, isGam } from "../src/bbk/gam";
import { KEYBOARD, Key, keyCode } from "../src/bbk/keys";
import { decodeLcd, iconOn, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ, Machine, TIMER_HZ } from "../src/bbk/machine";

/** Firmware whose boot page (the OS ROM's last 256 bytes, run from $0300) holds `code` at $0350. */
function firmware(code: number[], vectors: Record<number, number> = {}): Firmware {
  const os = new Uint8Array(REGION_SIZE);
  const page = REGION_SIZE - 0x100;
  for (const [n, target] of Object.entries(vectors)) os.set([0x4c, target & 0xff, target >> 8], page + 4 * Number(n));
  os.set(code, page + 0x50);
  const font = new Uint8Array(REGION_SIZE).map((_, i) => i & 0xff);
  return { regions: { os, font } };
}

describe("firmware files", () => {
  it("recognises the dumps by name", () => {
    expect(regionOf("0E00.DAT")).toBe("os");
    expect(regionOf("e.bin")).toBe("os");
    expect(regionOf("4988.font")).toBe("font");
    expect(regionOf("dumps/0400_BF.DAT")).toBe("ch4.2");
    expect(regionOf("0600_3F.DAT")).toBe("ch6.0");
    expect(regionOf("HZK16")).toBeNull();
    const fw: Firmware = { regions: {} };
    expect(addFirmwareFile(fw, "8.BIN", new Uint8Array(100))).toBeNull(); // wrong size
    expect(addFirmwareFile(fw, "8.BIN", new Uint8Array(REGION_SIZE))).toBe("font");
    expect(missingRegions(fw)).toEqual(["os"]);
  });
});

describe("machine", () => {
  it("maps banks onto physical memory and reads through the DATA ports", () => {
    const m = new Machine(firmware([0x4c, 0x50, 0x03])); // JMP *
    m.write(0x0c, 1); // bank 1 → font ROM page 0x812
    m.write(0x0d, 0x12);
    m.write(0x0e, 0x08);
    expect(m.read(0x0d)).toBe(0x12);
    expect(m.read(0x1005)).toBe(0x05);
    m.write(0x0c, 2); // bank 2 → RAM page 7
    m.write(0x0d, 0x07);
    m.write(0x0e, 0x00);
    m.write(0x2010, 0xab);
    expect(m.ram[0x7010]).toBe(0xab);
    // DATA1 at ADDR1 = 0x800042, stepping on each read
    m.ram.set([0x42, 0x00, 0x80], 0x208);
    expect([m.read(0x00), m.read(0x00), m.read(0x00)]).toEqual([0x42, 0x43, 0x44]);
    expect(m.ram[0x208]).toBe(0x45);
  });

  it("runs timer interrupts through the vector table and wakes from halt", () => {
    // $0350: ST1 reload 0xF0, enable ST1 and its interrupt, CLI, then halt in a loop
    // $0380: count in $10, clear the flag, RTI
    const code = [
      0xa9, 0xf0, 0x8d, 0x27, 0x02, // LDA #$F0 / STA ST1LD
      0xa9, 0x01, 0x8d, 0x3b, 0x02, // LDA #1 / STA TIER
      0x8d, 0x26, 0x02, 0x58, // STA STCON / CLI
      0xa9, 0x08, 0x8d, 0x00, 0x02, 0x4c, 0x5e, 0x03, // loop: LDA #8 / STA SYSCON (halt) / JMP loop
    ];
    const handler = [0xe6, 0x10, 0xa9, 0xfe, 0x85, 0x05, 0x40]; // INC $10 / LDA #$FE / STA TISR / RTI
    const fw = firmware(code, { 3: 0x0380 });
    fw.regions.os!.set(handler, REGION_SIZE - 0x100 + 0x80);
    const m = new Machine(fw);
    m.run((CPU_HZ / TIMER_HZ) * (0x100 + 0x10 * 9) + 2000); // from 0 to the first overflow, then nine reloads from 0xF0
    expect(m.ram[0x10]).toBe(10);
  });

  it("latches key presses for the keyboard interrupt, one at a time", () => {
    const m = new Machine(firmware([0x4c, 0x50, 0x03]));
    m.press(Key.enter);
    m.press(Key.up);
    m.run(1000);
    expect(m.ram[0x24e]).toBe(Key.enter | 0x80);
    expect(m.ram[0x04] & 0x80).toBe(0x80);
    m.write(0x04, 0x7f); // the firmware takes it
    m.run(1000);
    expect(m.ram[0x24e]).toBe(Key.up | 0x80);
  });

  it("saves and restores its state", () => {
    const m = new Machine(firmware([0xe6, 0x10, 0x4c, 0x50, 0x03])); // INC $10 / JMP $0350
    m.run(5000);
    const st = m.saveState();
    m.run(5000);
    const later = m.ram[0x10];
    m.loadState(st);
    m.run(5000);
    expect(m.ram[0x10]).toBe(later);
  });
});

describe("flash chip", () => {
  const cmd = (f: Flash, ...pairs: [number, number][]) => pairs.forEach(([a, v]) => f.write(a, v));
  const unlock: [number, number][] = [[0x5555, 0xaa], [0x2aaa, 0x55]];

  it("programs bits to 0 only and erases sectors back to 1", () => {
    const f = new Flash();
    cmd(f, ...unlock, [0x5555, 0xa0], [0x12345, 0xf0]);
    cmd(f, ...unlock, [0x5555, 0xa0], [0x12345, 0x3c]);
    expect(f.read(0x12345)).toBe(0x30);
    f.write(0x12346, 0x00); // not a command: ignored
    expect(f.read(0x12346)).toBe(0xff);
    cmd(f, ...unlock, [0x5555, 0x80], ...unlock, [0x12000, 0x30]);
    expect(f.read(0x12345)).toBe(0xff);
  });

  it("answers the CFI query until told to exit", () => {
    const f = new Flash();
    cmd(f, ...unlock, [0x5555, 0x98]);
    expect([f.read(0x10), f.read(0x11), f.read(0x12)]).toEqual([0x51, 0x52, 0x59]); // "QRY"
    f.write(0, 0xf0);
    expect(f.read(0x10)).toBe(0xff);
  });
});

describe("flash file system", () => {
  const formatted = () => {
    const f = new Uint8Array(0x200000).fill(0xff);
    f.set([0xe0, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x10, 0x00, 0x2f]); // the OS's own file
    f.fill(0x04, 0x1000, 0x100e);
    return f;
  };

  it("installs files in free sectors, lists and deletes them", () => {
    const flash = formatted();
    expect(isFormatted(flash)).toBe(true);
    const a = installFile(flash, new Uint8Array(0x1800).fill(1), FileType.game, new TextEncoder().encode("GAME A"))!;
    const b = installFile(flash, new Uint8Array(10).fill(2), FileType.game, new TextEncoder().encode("GAME B"))!;
    expect([a.offset, a.size, b.offset]).toEqual([0xf000, 0x1800, 0x11000]);
    expect(listFiles(flash).map((f) => f.name)).toEqual(["", "GAME A", "GAME B"]);
    deleteFile(flash, a);
    expect(listFiles(flash).map((f) => f.name)).toEqual(["", "GAME B"]);
    const c = installFile(flash, new Uint8Array(0x1000).fill(3), FileType.game, new TextEncoder().encode("GAME C"))!;
    expect([c.entry, c.offset]).toEqual([a.entry, 0xf000]); // reuses the slot and the sectors
    expect(installFile(flash, new Uint8Array(0x200000), FileType.game, new Uint8Array(10))).toBeNull();
  });

  it("knows a blank flash is not formatted", () => {
    expect(isFormatted(new Uint8Array(0x200000).fill(0xff))).toBe(false);
  });
});

describe("LCD", () => {
  it("decodes the controller's row order and the icon column", () => {
    const ram = new Uint8Array(0x8000);
    ram[0x400 + 65 * 32 + 1] = 0x80; // RAM row 65, byte 1 → display row 0, x 16
    ram[0x400 + 70 * 32 + 19] = 0x01; // RAM row 70, byte 19 → display row 71, x 7
    ram[0x400 + 5 * 32 + 18] = 0x01; // icon 5
    const px = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(ram, px);
    expect(px[0 * LCD_STRIDE + 16]).toBe(1);
    expect(px[71 * LCD_STRIDE + 7]).toBe(1);
    expect(px.reduce((a, b) => a + b, 0)).toBe(3);
    expect(iconOn(ram, 5)).toBe(true);
  });
});

describe("keys and .gam files", () => {
  it("maps the keyboard onto the device's keys", () => {
    expect(KEYBOARD.KeyQ).toBe(0x10);
    expect(KEYBOARD.Digit0).toBe(0x31);
    expect(keyCode("n")).toBe(0x26);
    expect(KEYBOARD.Escape).toBe(Key.exit);
  });

  it("reads a .gam header", () => {
    const g = new Uint8Array(0x100);
    g.set([0x47, 0x41, 0x4d, 0, 0x10, 0]);
    g.set([0xce, 0xe5, 0xd7, 0xd3, 0xc6, 0xe5], 6); // 五子棋 (GBK)
    expect(isGam(g)).toBe(true);
    expect(gamInfo(g).name).toBe("五子棋");
    expect(findLib(g)).toBe(-1);
  });
});
