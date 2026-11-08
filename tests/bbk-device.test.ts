// The real firmware: boot, install every .gam in a folder and start it from the
// OS's game menu. Runs when BBK_FIRMWARE points at a folder with the firmware
// dumps (0E00.DAT, 4988.font, ...) and BBK_GAMES at one with .gam files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Device } from "../src/bbk/device";
import { addFirmwareFile, missingRegions, type Firmware } from "../src/bbk/firmware";

const FW = process.env.BBK_FIRMWARE ?? "";
const GAMES = process.env.BBK_GAMES ?? "";

function loadFirmware(files?: string[]): Firmware {
  const fw: Firmware = { regions: {} };
  for (const f of files ?? readdirSync(FW)) addFirmwareFile(fw, f, new Uint8Array(readFileSync(join(FW, f))));
  return fw;
}

describe.skipIf(!FW || !existsSync(FW))("4988 firmware", () => {
  it("boots to the main menu", () => {
    const fw = loadFirmware();
    expect(missingRegions(fw)).toEqual([]);
    const d = new Device(fw);
    d.boot();
    expect(d.machine.booted).toBe(true);
  });

  const games = GAMES && existsSync(GAMES) ? readdirSync(GAMES).filter((f) => /\.gam$/i.test(f)).sort() : [];
  it.skipIf(!games.length)("starts every game from the game menu", { timeout: 1_800_000 }, () => {
    const fw = loadFirmware();
    const failed = games.filter((g) => {
      const d = new Device(fw);
      const file = d.install(new Uint8Array(readFileSync(join(GAMES, g))));
      return !file || !d.launch(file);
    });
    expect(failed).toEqual([]);
  });

  it("works from the OS and font alone, formatting the blank flash", () => {
    const fw = loadFirmware(readdirSync(FW).filter((f) => /^(0E00\.DAT|E\.BIN|4988\.font|8\.BIN)$/i.test(f)));
    const d = new Device(fw);
    d.boot();
    expect(d.machine.booted).toBe(true);
    const gam = games[0] && readFileSync(join(GAMES, games[0]));
    if (gam) {
      const file = d.install(new Uint8Array(gam));
      expect(file && d.launch(file)).toBe(true);
    }
  });
});
