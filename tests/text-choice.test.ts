// The Text look / Chinese / English choices, and reading the older settings.
import { describe, expect, it } from "vitest";
import { readTextChoice, textChoiceEntries } from "../src/app/textChoice";

const from = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("text choice", () => {
  it("defaults to the original files when given, Retro otherwise", () => {
    expect(readTextChoice(from({}), true)).toMatchObject({ look: "pixel", pixelChinese: "original", pixelEnglish: "original" });
    expect(readTextChoice(from({}), false)).toMatchObject({ look: "pixel", pixelChinese: "retro", pixelEnglish: "retro" });
  });

  it("reads the older single Text setting and Letters", () => {
    expect(readTextChoice(from({ text: "pixel:unifont" }), false)).toMatchObject({ look: "pixel", pixelChinese: "unifont", pixelEnglish: "unifont" });
    expect(readTextChoice(from({ text: "pixel:cubic" }), false)).toMatchObject({ pixelChinese: "ark", pixelEnglish: "ark" });
    expect(readTextChoice(from({ text: "pixel" }), true)).toMatchObject({ pixelChinese: "original" });
    expect(readTextChoice(from({ text: "kai", letters: "vt323" }), false)).toMatchObject({ look: "hd", hdChinese: "kai", hdEnglish: "vt323" });
  });

  it("keeps each look's fonts, and drops the files when they are gone", () => {
    const saved = Object.fromEntries(textChoiceEntries({ look: "hd", pixelChinese: "original", pixelEnglish: "ark", hdChinese: "song", hdEnglish: "plex" }));
    expect(readTextChoice(from(saved), true)).toEqual({ look: "hd", pixelChinese: "original", pixelEnglish: "ark", hdChinese: "song", hdEnglish: "plex" });
    expect(readTextChoice(from(saved), false).pixelChinese).toBe("retro");
    expect(readTextChoice(from({ textLook: "pixel", pixelChinese: "nonsense", hdEnglish: "nope" }), false)).toMatchObject({ pixelChinese: "retro", hdEnglish: "auto" });
  });
});
