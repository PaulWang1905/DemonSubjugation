// The experimental compact text layout: line breaks only (no drawing).
import { describe, expect, it } from "vitest";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { gbkBytes, gbkString } from "../src/engine/java";
import { SAY_WITH_PORTRAIT, wrapForBox } from "../src/editor/format/text";
import { createEngine } from "../src/engine";
import { Bitmap, Canvas } from "../src/engine/graphics";
import { writeLib } from "../src/editor/format/lib";
import { lanternPath } from "../src/editor/template/demo";
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
    const text = wrapForBox("Bram the woodcutter went into the Whisperwood yesterday. Look for him.", SAY_WITH_PORTRAIT);
    expect(text).toContain("wentinto");
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
});
