// The experimental compact text layout: line breaks only (no drawing).
import { describe, expect, it } from "vitest";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { gbkBytes, gbkString } from "../src/engine/java";
import { MESSAGE_BOX, SAY_PLAIN, SAY_WITH_PORTRAIT, wrapForBox } from "../src/editor/format/text";
import { createEngine } from "../src/engine";
import { Bitmap, Canvas } from "../src/engine/graphics";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
import { silentBell } from "../src/editor/template/silentBell";
import { disassemble } from "../src/editor/format/gut";
import { memorySaves } from "./helpers";

/** Lines of `text` in `size`-pixel cells, `width` pixels wide. */
function lines(text: string, size: number, width: number): string[] {
  const b = gbkBytes(text);
  const out: string[] = [];
  let i = 0;
  TextRender.withSize(size, () => {
    while (i < b.length && out.length < 20) {
      const { next } = TextRender.drawWrapped(null, b, i, [{ x: 0, y: 0, right: width - 1 }]);
      out.push(gbkString(b.slice(i, next)).trim().replace(/ +/g, " "));
      i = next;
    }
  });
  return out;
}

describe("compact text layout", () => {
  it("folds padding spaces and keeps Latin words whole", () => {
    expect(lines("  Mira! Come      quick, the great     lantern has gone dark!", 12, 132)).toEqual([
      "Mira! Come quick, the",
      "great lantern has gone",
      "dark!",
    ]);
  });

  it("breaks Chinese anywhere but never starts a line with closing punctuation", () => {
    // 7 characters fit: "跑" would end the line and "…" start the next, so "跑" moves down
    expect(lines("小蝴蝶，不要跑……", 12, 84)).toEqual(["小蝴蝶，不要", "跑……"]);
    expect(lines("小蝴蝶，不要跑了", 12, 84)).toEqual(["小蝴蝶，不要跑", "了"]);
    expect(lines("你好。", 12, 24)).toEqual(["你", "好。"]);
  });

  it("keeps the space at a full line of the device's layout", () => {
    // wrapped for the device's portrait box: "went" ends a full 15-character
    // line, so no space separates it from "into"
    // (as games pad their text; the demos' own wrapping now always leaves a space)
    const text = "Bram the   woodcutter wentinto the   Whisperwood    yesterday. Look for him.";
    createEngine({ resources: { datLib: writeLib(lanternPath()), hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) }, saves: memorySaves() });
    const canvas = new Canvas(new Bitmap(160, 96));
    const device = [{ left: 44, right: 145 }, { left: 14, right: 145 }];
    const rows = [0, 1, 2, 3, 4].map((k) => ({ x: 10, y: k * 12, right: 141 }));
    TextRender.withSize(12, () => TextRender.drawWrapped(canvas, gbkBytes(text), 0, rows, device));
    // read the drawn characters back, a space wherever there is a gap
    const lines = rows.map((r) => {
      const gs = (canvas.bitmap.glyphs ?? []).filter((g) => g.y === r.y).sort((p, q) => p.x - q.x);
      let line = "";
      let x = r.x;
      for (const g of gs) {
        if (g.x > x) line += " ";
        line += String.fromCharCode(g.code);
        x = g.x + g.w;
      }
      return line;
    });
    expect(lines.join(" ")).toContain("went into");
    expect(lines.join(" ")).not.toContain("wentinto");
  });

  it("splits a word longer than a line", () => {
    expect(lines("abcdefghij", 10, 20)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("keeps description words whole, at both text sizes", () => {
    // the shop's description box; the device's 16-pixel lines end mid-word here
    const desc = "Calms the mind and guards against madness. Cures confusion, seal, sleep.";
    createEngine({ resources: { datLib: writeLib(lanternPath()), hzk16: new Uint8Array(267616), asc16: new Uint8Array(4096) }, saves: memorySaves() });
    for (const size of [12, 16]) {
      const canvas = new Canvas(new Bitmap(160, 96));
      const r = { left: 44, top: 40, right: 156, bottom: 94 } as never;
      const words: string[] = [];
      let at = 0;
      const b = gbkBytes(desc);
      for (let page = 0; page < 6 && at < b.length; page++) {
        canvas.bitmap.glyphs = [];
        at = TextRender.drawBlock(canvas, b, at, r, size);
        const gs = (canvas.bitmap.glyphs ?? []).slice().sort((p, q) => p.y - q.y || p.x - q.x);
        let line = "";
        let last: (typeof gs)[number] | null = null;
        for (const g of gs) {
          if (last && (g.y !== last.y || g.x > last.x + last.w)) line += " ";
          line += String.fromCharCode(g.code);
          last = g;
        }
        words.push(...line.split(" ").filter(Boolean));
      }
      expect(words.join(" ")).toBe(desc);
    }
  });

  it("wraps the demos' text so every line break keeps a space", () => {
    for (const widths of [SAY_WITH_PORTRAIT, SAY_PLAIN, MESSAGE_BOX]) {
      for (const text of [
        "The glade lies east, past the path. Rest if you are hurt.",
        "Bram the woodcutter went into the Whisperwood yesterday. Look for him.",
      ]) {
        const w = wrapForBox(text, widths);
        // the words come back exactly, whatever box they are shown in
        expect(w.split(/ +/).join(" ")).toBe(text);
      }
    }
  });
});

describe("the demos' dialogue", () => {
  it("has a space at every line break of the device's boxes", () => {
    for (const archive of [lanternPath(), silentBell()]) {
      for (const e of archive.entries) {
        if (e.resType !== 1) continue;
        for (const m of disassemble(e.data).matchAll(/^\s*(say (\d+), |message )"((?:[^"\\]|\\.)*)"/gm)) {
          const text = m[3].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          // the device's lines: beside the portrait (or not), then the full width; message boxes
          const device = m[1].startsWith("say") ? [{ left: m[2] !== "0" ? 44 : 14, right: 145 }, { left: 14, right: 145 }] : [{ left: 16, right: 144 }];
          const b = gbkBytes(text);
          for (const k of TextRender.deviceLineEnds(Int8Array.from(b), device)) {
            expect(String.fromCharCode(b[k - 1]), `«${text}» at ${k}`).toMatch(/[ -]/);
          }
        }
      }
    }
  });
});
