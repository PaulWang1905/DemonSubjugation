// The title screen preview on the project home shows the title animation at
// its fullest moment, not only its first frame (伏魔记's starts with a speck
// and wipes in).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findEntry, readLib } from "../src/editor/format/lib";
import { logoEntry } from "../src/editor/template/titleLogo";
import { logoStill } from "../src/editor/ui/TitleScreenCard";

const dark = (px: Uint8Array | null) => (px ? px.reduce((n, v) => n + (v === 1 ? 1 : 0), 0) : 0);

describe("title screen preview", () => {
  it("shows the editor's own logo", () => {
    expect(dark(logoStill(logoEntry("HARBOR").data))).toBeGreaterThan(50);
  });

  const dat = process.env.FMJ_DATA_DIR ? join(process.env.FMJ_DATA_DIR, "DAT.LIB") : "";
  it.skipIf(!dat || !existsSync(dat))("shows 伏魔记's title, which its first frame does not", () => {
    const a = readLib(new Uint8Array(readFileSync(dat)));
    const data = findEntry(a, 5, 1, 248)!.data;
    expect(dark(logoStill(data, 1))).toBeLessThan(20); // the first tick: a speck
    expect(dark(logoStill(data))).toBeGreaterThan(500); // the logo, 106×32
  });
});
