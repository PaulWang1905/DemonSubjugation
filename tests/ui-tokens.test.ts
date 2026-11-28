// The design system's colour tokens (src/ui.css) keep text readable: every
// text colour meets WCAG AA (4.5:1) on the page and on panels, in light and
// dark. And a .seg keeps its hairlines between cells (the cell reset clears
// borders, so the divider rule must come after it).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/ui.css", import.meta.url), "utf8");

/** The custom properties set in the first block that matches `selector`. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector + " {");
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)) out[m[1]] = m[2];
  return out;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const light = tokens(":root");
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

describe("ui.css tokens", () => {
  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`text colours meet AA on the page and on panels (${name})`, () => {
      for (const text of ["--ink", "--muted", "--accent", "--danger", "--warn"]) {
        for (const surface of ["--bg", "--panel"]) {
          expect(contrast(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`filled controls are readable (${name})`, () => {
      expect(contrast(t["--bg"], t["--ink"]), "inked button").toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--accent-ink"], t["--accent"]), "accent fill").toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--danger-ink"], t["--danger"]), "danger fill").toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the dark theme is the same in both of its blocks", () => {
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(tokens(':root:not([data-theme="light"])')).toEqual(tokens(':root[data-theme="dark"]'));
    expect(media.length).toBeGreaterThan(0);
  });

  it("a .seg draws its hairlines after the rule that clears its cells' borders", () => {
    const reset = css.indexOf(".seg > :is(button, .button, label) {");
    const divider = css.search(/\.seg > \* \+ [^{]*\{\s*border-left:/);
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(divider).toBeGreaterThan(reset);
  });
});
