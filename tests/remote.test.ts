// Links the "Add from a link" panel understands.
import { describe, expect, it } from "vitest";
import { fileLink, isGameFile } from "../src/app/remote";

describe("game links", () => {
  it("turns a GitHub file page into its raw download", () => {
    expect(fileLink("https://github.com/o/r/blob/main/libs/%E4%B8%83%E5%89%91.lib")).toBe(
      "https://raw.githubusercontent.com/o/r/main/libs/%E4%B8%83%E5%89%91.lib",
    );
  });

  it("treats GitHub folders and repositories as folders", () => {
    expect(fileLink("https://github.com/o/r/tree/main/games/%E6%B8%B8%E6%88%8F")).toBeNull();
    expect(fileLink("https://github.com/o/r")).toBeNull();
  });

  it("downloads direct links to game files as they are", () => {
    expect(fileLink("https://example.com/games/fmj.lib")).toBe("https://example.com/games/fmj.lib");
    expect(fileLink("https://example.com/games/")).toBeNull();
    expect(fileLink("not a link")).toBeNull();
  });

  it("knows game files and fonts by name", () => {
    expect(["a.lib", "B.LIB", "HZK16", "asc16.bin"].every(isGameFile)).toBe(true);
    expect(["readme.md", "传奇", "x.gam"].some(isGameFile)).toBe(false);
  });
});
