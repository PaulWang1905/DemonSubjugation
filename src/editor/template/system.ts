// Original system resources every game needs (logos, title menu, battle UI,
// digits, panels, save screens). Drawn in code for the starter template.
import { encodeImage, encodeSrs, type Frame } from "../format/encode";
import type { LibEntry } from "../format/lib";
import { B, Pix, T, W, glyph, textWidth } from "./draw";

const PIC = 11;
const SRS = 5;

const pic = (type: number, index: number, frames: Pix[]): LibEntry => ({
  resType: PIC,
  type,
  index,
  data: encodeImage(type, index, frames.map((f) => f.frame())),
});

const blank = (): Frame => new Pix(1, 1).frame();

/** A still image shown for `ticks` animation ticks. */
function stillSrs(type: number, index: number, img: Pix, x: number, y: number, ticks: number): LibEntry {
  return { resType: SRS, type, index, data: encodeSrs(type, index, [{ x, y, show: ticks, next: ticks, image: 0 }], [img.frame()]) };
}

/** Big title text: the pixel font scaled up. */
function bigText(s: string, scale: number): Pix {
  const w = textWidth(s) * scale;
  const p = new Pix(w, 5 * scale);
  let cx = 0;
  for (const ch of s) {
    const g = glyph(ch);
    g.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === "#") p.fill(cx + i * scale, j * scale, scale, scale, B);
    });
    cx += (g[0].length + 1) * scale;
  }
  return p;
}

export interface SystemOptions {
  /** Shown on the game logo (SRS 1-248). */
  title: string;
  subtitle?: string;
}

export function systemResources(opts: SystemOptions): LibEntry[] {
  const out: LibEntry[] = [];

  // --- SRS 1-247: engine logo -------------------------------------------
  {
    const p = new Pix(160, 96, W);
    const lamp = Pix.fromArt([
      "   ###   ",
      "  #...#  ",
      " #.#.#.# ",
      " #..#..# ",
      " #.#.#.# ",
      "  #...#  ",
      "   ###   ",
      "    #    ",
      "  #####  ",
    ]);
    p.blit(lamp, 76, 26);
    const t = "FMJ REACT";
    p.text(t, 80 - Math.floor(textWidth(t) / 2), 42);
    const s = "BBK RPG ENGINE";
    p.text(s, 80 - Math.floor(textWidth(s) / 2), 52);
    out.push(stillSrs(1, 247, p, 0, 0, 80));
  }

  // --- SRS 1-248: game logo ---------------------------------------------
  {
    const p = new Pix(160, 96, W);
    p.rect(4, 4, 152, 88).rect(6, 6, 148, 84);
    const t = bigText(opts.title, 2);
    p.blit(t, 80 - Math.floor(t.width / 2), 34);
    if (opts.subtitle) p.text(opts.subtitle, 80 - Math.floor(textWidth(opts.subtitle) / 2), 54);
    p.text("PRESS ENTER", 80 - Math.floor(textWidth("PRESS ENTER") / 2), 76);
    out.push(stillSrs(1, 248, p, 0, 0, 160));
  }

  // --- SRS 1-249: defeat ----------------------------------------------------
  {
    const p = new Pix(96, 24, T);
    p.panel(0, 0, 96, 24);
    const t = bigText("DEFEATED", 1);
    p.blit(t, 48 - Math.floor(t.width / 2), 9);
    out.push(stillSrs(1, 249, p, 32, 36, 90));
  }

  // --- title menu: PIC 2-14 and selector animations SRS 1-250 / 1-251 ----
  const menuW = 96;
  const menuH = 44;
  const left = (160 - menuW) / 2;
  const top = (96 - menuH) / 2;
  {
    const p = new Pix(menuW, menuH, W);
    p.rect(0, 0, menuW, menuH).rect(2, 2, menuW - 4, menuH - 4);
    p.text("NEW GAME", 30, 12);
    p.text("CONTINUE", 30, 27);
    out.push(pic(2, 14, [p]));
    const arrow = Pix.fromArt(["#   ", "##  ", "### ", "##  ", "#   "]);
    [12, 27].forEach((y, k) => {
      out.push({
        resType: SRS,
        type: 1,
        index: 250 + k,
        data: encodeSrs(
          1,
          250 + k,
          [
            { x: left + 20, y: top + y, show: 10, next: 16, image: 0 },
            { x: 0, y: 0, show: 6, next: 6, image: 1 },
          ],
          [arrow.frame(), blank()],
        ),
      });
    });
  }

  // --- buff / status icons SRS 1-240..246 (short flashes) ----------------
  ["AT+", "DF+", "SP+", "PSN", "CNF", "SEAL", "SLP"].forEach((label, k) => {
    const w = textWidth(label) + 4;
    const p = new Pix(w, 9).panel(0, 0, w, 9).text(label, 2, 2);
    out.push(stillSrs(1, 240 + k, p, 0, 0, 12));
  });

  // --- PIC 2-1: battle command cross (frame n highlights option n) -------
  {
    const icons = [
      Pix.fromArt(["    ##", "   ## ", "# ##  ", " ##   ", " ##   ", "#  #  "]), // attack (sword)
      Pix.fromArt(["  #   ", "# # # ", " ### ", "#####", " ### ", "# # #"]), // magic (star)
      Pix.fromArt([" #### ", "#....#", "######", "#....#", "#....#", "######"]), // items (bag)
      Pix.fromArt([" #  # ", "### ##", " #  # ", "######", "# ## #", "# ## #"]), // together
    ];
    const pos = [
      [13, 0],
      [0, 13],
      [13, 26],
      [26, 13],
    ];
    const frames = [0, 1, 2, 3].map((sel) => {
      const p = new Pix(38, 38);
      pos.forEach(([x, y], k) => {
        p.panel(x, y, 12, 12);
        p.blit(icons[k], x + 3, y + 3);
        if (k === sel) p.invert(x + 1, y + 1, 10, 10);
      });
      return p;
    });
    out.push(pic(2, 1, frames));
  }

  // --- PIC 2-2: party member info panel (drawn at 49,66) ------------------
  {
    const p = new Pix(72, 29);
    p.panel(0, 0, 72, 29);
    p.text("HP", 30 - 10, 7).text("MP", 30 - 10, 18);
    p.text("/", 52, 6).text("/", 52, 17);
    out.push(pic(2, 2, [p]));
  }

  // --- PIC 2-3: enemy cursor; PIC 2-4: actor/target cursors --------------
  {
    const down = Pix.fromArt(["#######", " ##### ", "  ###  ", "   #   "]);
    const f = (dy: number) => new Pix(8, 6).blit(down, 0, dy);
    out.push(pic(2, 3, [f(0), f(1), f(2), f(1)]));
    const hollow = Pix.fromArt(["#######", " #...# ", "  #.#  ", "   #   "]);
    const g = (src: Pix, dy: number) => new Pix(8, 6).blit(src, 0, dy);
    out.push(pic(2, 4, [g(down, 0), g(down, 2), g(hollow, 0), g(hollow, 2)]));
  }

  // --- PIC 2-5: small digits; 2-6 "+", 2-7 "-" ----------------------------
  {
    const digit = (c: string) => new Pix(3, 5, W).art(glyph(c), 0, 0);
    out.push(pic(2, 5, "0123456789".split("").map(digit)));
    out.push(pic(2, 6, [digit("+")]));
    out.push(pic(2, 7, [digit("-")]));
  }

  // --- PIC 2-8: message banner end caps -----------------------------------
  {
    const l = new Pix(3, 24, W);
    l.fill(0, 1, 1, 22, B).fill(1, 0, 1, 24, B);
    const r = new Pix(3, 24, W);
    r.fill(2, 1, 1, 22, B).fill(1, 0, 1, 24, B);
    out.push(pic(2, 8, [l, r]));
  }

  // --- PIC 2-9: level-up panel --------------------------------------------
  {
    const p = new Pix(124, 92, W);
    p.rect(0, 0, 124, 92).rect(2, 2, 120, 88);
    const rows = ["HP", "MP", "AT", "DF", "SP", "SPI", "LK"];
    rows.forEach((label, k) => {
      const y = 9 + 12 * k;
      p.text(label, 8, y);
      p.text(">", 74, y);
      if (k < 2) p.text("/", 51, y).text("/", 100, y);
    });
    out.push(pic(2, 9, [p]));
  }

  // --- PIC 2-10: learned-a-spell panel ------------------------------------
  {
    const p = new Pix(120, 62, W);
    p.rect(0, 0, 120, 62).rect(2, 2, 116, 58);
    p.text("LEARNED", 60 - Math.floor(textWidth("LEARNED") / 2), 29);
    out.push(pic(2, 10, [p]));
  }

  // --- PIC 2-11: battle status panel; PIC 2-12 status markers -------------
  {
    const p = new Pix(124, 66, W);
    p.rect(0, 0, 124, 66).rect(2, 2, 120, 62);
    p.text("HP", 38, 9).text("AT", 38, 21).text("LK", 75, 9).text("SP", 75, 21);
    ["AT", "DF", "SP", "PO", "CF", "SE", "SL"].forEach((l, k) => p.text(l, 9 + k * 16, 40));
    out.push(pic(2, 11, [p]));
    const m = [
      ["  #  ", " ### ", "# # #", "  #  ", "  #  "],
      ["  #  ", "  #  ", "# # #", " ### ", "  #  "],
      ["#   #", " # # ", "  #  ", " # # ", "#   #"],
      ["    #", "   # ", "#  # ", " ##  ", "  #  "],
      [" ### ", "#   #", "#  ##", "#    ", " ### "],
    ].map((a) => new Pix(8, 8, W).art(a, 1, 1));
    out.push(pic(2, 12, m));
  }

  // --- PIC 2-18: MISS (shown when an attack or spell is dodged) -----------
  {
    const label = "MISS";
    const w = textWidth(label) + 4;
    const p = new Pix(w, 9, T);
    p.fill(0, 0, w, 9, W).rect(0, 0, w, 9);
    p.text(label, 2, 2);
    out.push(pic(2, 18, [p]));
  }

  // --- PIC 2-15 / 2-16: save and load screens -----------------------------
  ["SAVE GAME", "LOAD GAME"].forEach((label, k) => {
    const p = new Pix(160, 96, W);
    p.fill(0, 0, 160, 15, B);
    p.text(label, 80 - Math.floor(textWidth(label) / 2), 5, W);
    [22, 45, 68].forEach((y, s) => {
      p.panel(4, y, 152, 21);
      p.text(String(s + 1), 9, y + 8);
    });
    out.push(pic(2, 15 + k, [p]));
  });

  return out;
}
