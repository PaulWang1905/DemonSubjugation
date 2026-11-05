// The original's scrolling list (_00210D5B): rows, scrolling and wrapping.
import { describe, expect, it } from "vitest";
import { ScrollList } from "../src/engine/fmj/views/ScrollList";
import { Global } from "../src/engine/fmj/Global";

describe("ScrollList (original list widget)", () => {
  it("shows five rows from y=10, four with arrows when it scrolls", () => {
    expect(new ScrollList(40, 10, 4, ["a", "b", "c", "d", "e"]).visible).toBe(5);
    expect(new ScrollList(40, 10, 4, ["a", "b", "c", "d", "e", "f"]).visible).toBe(4);
    expect(new ScrollList(40, 10, 4, ["a", "b", "c", "d", "e", "f", "g", "h"]).visible).toBe(4);
  });

  it("scrolls, wraps both ways, and treats Left/Right as Up/Down", () => {
    const l = new ScrollList(40, 10, 4, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    l.key(Global.KEY_UP);
    expect([l.sel, l.top]).toEqual([7, 4]);
    l.key(Global.KEY_RIGHT);
    expect([l.sel, l.top]).toEqual([0, 0]);
    for (let i = 0; i < 4; i++) l.key(Global.KEY_DOWN);
    expect([l.sel, l.top]).toEqual([4, 1]);
    l.key(Global.KEY_LEFT);
    expect([l.sel, l.top]).toEqual([3, 1]);
  });
});
