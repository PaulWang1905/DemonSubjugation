import { describe, expect, it } from "vitest";
import { decodeImage, decodeSrs, srsWarnings } from "../src/editor/format/decode";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath } from "../src/editor/template/demo";
import { blankAnimation, blankGraphic } from "../src/editor/template/newres";
import { ResSrs } from "../src/engine/fmj/lib/ResSrs";

describe("new resources", () => {
  it("shapes blank graphics like the game's existing ones", () => {
    const a = lanternPath();
    const like = a.entries.find((e) => e.resType === 11 && e.type === 3)!;
    const img = decodeImage(blankGraphic(a, 11, 3, 9));
    expect([img.frames[0].width, img.frames[0].height, img.frames.length]).toEqual([like.data[2], like.data[3], like.data[4]]);
    expect(img.frames[0].pixels.every((v) => v === 2)).toBe(true); // sprites start transparent
    const tiles = decodeImage(blankGraphic(a, 7, 1, 2));
    expect(tiles.frames[0].pixels.every((v) => v === 0)).toBe(true); // tiles start white
  });

  it("falls back to standard sizes", () => {
    const empty = { titleBytes: new Uint8Array(), entries: [] };
    const tiles = decodeImage(blankGraphic(empty, 7, 1, 1));
    expect([tiles.frames[0].width, tiles.frames[0].height, tiles.frames.length]).toEqual([16, 16, 16]);
    const bytes = blankGraphic(empty, 9, 4, 3);
    expect([bytes[0], bytes[1]]).toEqual([4, 3]);
    expect(blankProject("x").entries.length).toBeGreaterThan(0);
  });

  it("creates a blank animation that plays", () => {
    const b = blankAnimation(2, 7);
    const d = decodeSrs(b);
    expect([d.type, d.index, d.frames.length, d.images.length]).toEqual([2, 7, 1, 1]);
    expect(srsWarnings(d)).toEqual([]);
    const s = new ResSrs();
    s.setData(new Int8Array(b.buffer), 0);
    s.start();
    let ticks = 1;
    while (s.update(40)) ticks++;
    expect(ticks).toBe(10);
  });
});
