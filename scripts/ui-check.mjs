// A quick look for layout problems on the site's pages, in a real browser.
// Not run in CI (it needs Playwright and a running preview):
//
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/ui-check.mjs http://localhost:4173
//
// At a computer, a tablet and a phone width, light and dark, it opens each
// page and lists: a page wider than the window, text below WCAG AA contrast,
// controls in one row with different heights, and (phone) controls under
// 40 px. Exits 1 if it found any.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:4173";
const PAGES = ["/", "/games", "/guide", "/fulu", "/fulu/progress", "/about", "/editor", "/nope"];
const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844, phone: true },
];

/** Runs in the page: the problems on it. */
function inspect(phone) {
  const out = [];
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`;
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page is ${document.documentElement.scrollWidth - innerWidth}px wider than the window`);
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
  };
  const lum = (c) => {
    const f = (x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const background = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none" && !cs.backgroundImage.includes("45deg")) return null; // a picture or gradient: can't tell
      const c = rgb(cs.backgroundColor);
      if (c && c.a >= 0.99) return c;
      // (a band painted by an absolutely placed ::before, as the footer's)
      const before = getComputedStyle(e, "::before"), under = rgb(before.backgroundColor);
      if (before.position === "absolute" && under && under.a >= 0.99) return under;
      if (c && c.a > 0) return null; // see-through layers: can't tell for sure
    }
    return { r: 255, g: 255, b: 255 };
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim()) continue;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (!box.width || box.top > innerHeight * 4) continue;
    if (el.closest("button:disabled, [aria-disabled=true], canvas, svg, [aria-hidden=true]")) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= +getComputedStyle(e).opacity;
    if (opacity < 0.98) continue;
    const cs = getComputedStyle(el);
    const fg = rgb(cs.color), bg = background(el);
    if (!fg || !bg) continue;
    const mix = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const [hi, lo] = [lum(mix), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66) ? 3 : 4.5;
    if (ratio < need) out.push(`contrast ${ratio.toFixed(2)} < ${need}: ${name(el)}`);
  }
  const controls = "button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), a.button, label.button, .seg";
  for (const p of document.querySelectorAll("body *")) {
    const kids = [...p.children].filter((k) => k.matches(controls) && k.getBoundingClientRect().height);
    for (let i = 1; i < kids.length; i++) {
      const [a, b] = [kids[i - 1].getBoundingClientRect(), kids[i].getBoundingClientRect()];
      const sameRow = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 6;
      if (sameRow && Math.abs(a.height - b.height) > 2 && a.height < 60 && b.height < 60) out.push(`one row, ${Math.round(a.height)} vs ${Math.round(b.height)} px: ${name(kids[i - 1])} / ${name(kids[i])}`);
    }
  }
  if (phone)
    for (const el of document.querySelectorAll("button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=tab]")) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height && b.height < 40 && getComputedStyle(el).visibility !== "hidden") out.push(`${Math.round(b.width)}x${Math.round(b.height)} px for a finger: ${name(el)}`);
    }
  return [...new Set(out)];
}

const browser = await chromium.launch();
let found = 0;
for (const size of SIZES)
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, isMobile: !!size.phone, hasTouch: !!size.phone });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const problems = await page.evaluate(inspect, !!size.phone);
      found += problems.length;
      for (const p of problems) console.log(`${size.width}x${size.height} ${scheme} ${path}: ${p}`);
    }
    await ctx.close();
  }
await browser.close();
console.log(found ? `${found} problems` : "no problems found");
process.exit(found ? 1 : 0);
