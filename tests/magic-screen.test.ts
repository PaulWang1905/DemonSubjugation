// The magic list shows the description and cost of the magic by the cursor.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenMagic } from "../src/engine/fmj/magic/ScreenMagic";
import type { BaseMagic } from "../src/engine/fmj/magic/BaseMagic";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { Global } from "../src/engine/fmj/Global";
import { Bitmap, Canvas } from "../src/engine/graphics";

const magic = (magicName: string, magicDescription: string, costMp: number) => ({ magicName, magicDescription, costMp }) as unknown as BaseMagic;

afterEach(() => vi.restoreAllMocks());

describe("magic list", () => {
  it("describes the highlighted magic", () => {
    const texts: string[] = [];
    vi.spyOn(TextRender, "drawText").mockImplementation((_c, t) => void texts.push(String(t)));
    const blocks: string[] = [];
    vi.spyOn(TextRender, "drawBlock").mockImplementation((_c, t) => (blocks.push(String(t)), 0));
    const s = new ScreenMagic({} as never, [magic("A", "first", 3), magic("B", "second", 7), magic("C", "third", 9)], () => {});
    const canvas = new Canvas(new Bitmap(160, 96));
    const shown = () => {
      texts.length = blocks.length = 0;
      s.draw(canvas);
      return { desc: blocks[0], cost: texts.find((t) => t.endsWith("3") || t.endsWith("7") || t.endsWith("9")) };
    };
    expect(shown()).toMatchObject({ desc: "first" });
    s.onKeyDown(Global.KEY_DOWN); // the cursor to the second row; the list does not scroll
    expect(shown().desc).toBe("second");
    expect(shown().cost?.endsWith("7")).toBe(true);
    s.onKeyDown(Global.KEY_DOWN); // scrolls: B and C, cursor on C
    expect(shown().desc).toBe("third");
    s.onKeyDown(Global.KEY_UP);
    expect(shown().desc).toBe("second");
  });
});
