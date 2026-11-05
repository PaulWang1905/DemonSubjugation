// The experimental compact text layout: line breaks only (no drawing).
import { describe, expect, it } from "vitest";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { gbkBytes, gbkString } from "../src/engine/java";

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

  it("splits a word longer than a line", () => {
    expect(lines("abcdefghij", 10, 20)).toEqual(["abcd", "efgh", "ij"]);
  });
});
