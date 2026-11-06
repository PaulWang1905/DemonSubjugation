// The site's language follows the browser: any Chinese gives Simplified Chinese.
import { describe, expect, it } from "vitest";
import { browserLang } from "../src/app/siteLang";
import { SITE_TEXT } from "../src/app/siteText";

describe("site language", () => {
  it("follows the browser's first Chinese or English choice", () => {
    expect(browserLang(["zh-CN", "en"])).toBe("zh");
    expect(browserLang(["zh-TW"])).toBe("zh");
    expect(browserLang(["en-GB", "zh-CN"])).toBe("en");
    expect(browserLang(["fr-FR", "zh-CN"])).toBe("zh");
    expect(browserLang(["de-DE"])).toBe("en");
  });

  it("has the same texts in both languages", () => {
    const shape = (o: unknown): unknown => (Array.isArray(o) ? o.map(shape) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o);
    expect(shape(SITE_TEXT.zh)).toEqual(shape(SITE_TEXT.en));
  });
});
