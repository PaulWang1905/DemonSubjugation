// .gam export (src/bbk/gamBuild.ts): the site's own container, played by FMJ
// React only; and, with the RPG kit's engine from a .gam the user owns (here
// 伏魔记 1.3, BBK_GAMES), a game that runs on Fulu.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLib, gamInfo, isGam } from "../src/bbk/gam";
import { buildGam, donorProblem, gamTitle, isReactOnly, preferredEngine } from "../src/bbk/gamBuild";
import { decodeLcd, LCD_STRIDE } from "../src/bbk/lcd";
import { CPU_HZ } from "../src/bbk/machine";
import { inspectDatLib } from "../src/engine";
import { FuluDevice } from "../src/fulu/device";
import { writeLib } from "../src/editor/format/lib";
import { silentBell } from "../src/editor/template/silentBell";

const GAMES = process.env.BBK_GAMES ?? "", FONTS = process.env.FMJ_DATA_DIR ?? "";
const DONOR = join(GAMES, "伏魔记-1.3.gam");
const fonts = () => ({ hzk16: new Uint8Array(readFileSync(join(FONTS, "HZK16"))), asc16: new Uint8Array(readFileSync(join(FONTS, "ASC16"))) });

describe("gam export", () => {
  const lib = writeLib(silentBell());

  it("puts the library in the site's own container, for FMJ React", () => {
    const gam = buildGam(lib, "静钟 BELL", "react");
    expect(isGam(gam)).toBe(true);
    expect(gamInfo(gam).name).toBe("静钟 BELL");
    expect(findLib(gam)).toBe(0x1000);
    expect(inspectDatLib(gam.slice(findLib(gam))).playable).toBe(true);
    expect(preferredEngine(gam)).toBe("react");
    expect(gamTitle(gam)).toBe("静钟 BELL");
    expect(gamTitle(buildGam(lib, "The Silent Bell; part one", "react"))).toBe("The Silent Bell; part one");
    expect(isReactOnly(gam)).toBe(true);
    // a name longer than 10 bytes is cut before a double-byte character
    expect(gamInfo(buildGam(lib, "静静静静静静", "react")).name).toBe("静静静静静");
    expect(() => buildGam(lib, "X", "fulu")).toThrow();
  });

  it("refuses a .gam that has no RPG kit engine to lend", () => {
    expect(donorProblem(new Uint8Array(100))).toMatch(/not a .gam/);
    expect(donorProblem(buildGam(lib, "X", "react"))).toBeNull(); // (its library is in its data area too)
    const noLib = buildGam(lib, "X", "react").slice(0, 0x1000);
    expect(donorProblem(noLib)).toMatch(/RPG kit/);
  });

  it.skipIf(!FONTS || !existsSync(join(FONTS, "HZK16")))("ends at once on a device (Fulu): it is not a program", () => {
    const d = new FuluDevice(fonts());
    d.launch(d.install(buildGam(lib, "BELL", "react"))!);
    for (let i = 0; i < 30; i++) d.machine.run(CPU_HZ / 60);
    expect(d.fulu.stopped).toBe("The program ended");
  });

  it.skipIf(!GAMES || !existsSync(DONOR) || !existsSync(join(FONTS, "HZK16")))("with the RPG kit's engine from an owned .gam, runs on Fulu", () => {
    const donor = new Uint8Array(readFileSync(DONOR));
    expect(donorProblem(donor)).toBeNull();
    const gam = buildGam(lib, "THE BELL", "fulu", donor);
    expect(gamInfo(gam).name).toBe("THE BELL");
    expect(preferredEngine(gam)).toBe("fulu");
    expect(isReactOnly(gam)).toBe(false);
    expect(findLib(gam)).toBe(findLib(donor));
    const d = new FuluDevice(fonts());
    d.launch(d.install(gam)!);
    for (let i = 0; i < 3 * 60; i++) d.machine.run(CPU_HZ / 60);
    expect(d.fulu.stopped).toBeNull();
    // its title screen: "THE SILENT BELL" drawn by the kit's engine from the project's pictures
    const px = new Uint8Array(LCD_STRIDE * 96);
    decodeLcd(d.machine.ram, px);
    expect(px.some((v) => v)).toBe(true);
  });
});
