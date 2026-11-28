// The tab strip's "⌄ N more" menu (TabStrip.tsx, tabFit.ts): which tabs are
// out of sight, moving through the menu with the keys, jumping by name.
import { describe, expect, it } from "vitest";
import { hiddenTabs, menuMove, moreLabel, tabCap, TAB_MIN, typeAhead } from "../src/editor/ui/tabFit";

describe("tabs out of sight", () => {
  const tabs = [0, 150, 300, 450, 600].map((left) => ({ left, right: left + 150 }));
  it("lists the tabs scrolled past or cut at either end", () => {
    // the strip shows 120..520: the first is cut on the left, the last two on the right
    expect(hiddenTabs(tabs, { left: 120, right: 520 })).toEqual([0, 3, 4]);
  });
  it("none when all are in view, and a cut of a pixel or two does not count", () => {
    expect(hiddenTabs(tabs, { left: 0, right: 750 })).toEqual([]);
    expect(hiddenTabs(tabs, { left: 1, right: 749 })).toEqual([]);
    expect(hiddenTabs(tabs, { left: 3, right: 750 })).toEqual([0]);
  });
  it("works with the window's frame (the strip moved right)", () => {
    const shifted = tabs.map((t) => ({ left: t.left + 300, right: t.right + 300 }));
    expect(hiddenTabs(shifted, { left: 300, right: 600 })).toEqual([2, 3, 4]);
  });
  it("says how many", () => {
    expect(moreLabel(7)).toBe("7 more");
  });
});

describe("a readable smallest tab", () => {
  it("is wide enough for about ten letters of a name", () => {
    expect(TAB_MIN).toBeGreaterThanOrEqual(130);
    // 24 tabs in a 900 px strip do not shrink to a sliver: the strip scrolls instead
    expect(tabCap(new Array(24).fill(220), 900)).toBe(TAB_MIN);
  });
});

describe("moving through the menu", () => {
  it("wraps round with the arrows", () => {
    expect(menuMove(0, "ArrowDown", 3)).toBe(1);
    expect(menuMove(2, "ArrowDown", 3)).toBe(0);
    expect(menuMove(0, "ArrowUp", 3)).toBe(2);
  });
  it("starts at an end when nothing has the focus yet", () => {
    expect(menuMove(-1, "ArrowDown", 4)).toBe(0);
    expect(menuMove(-1, "ArrowUp", 4)).toBe(3);
  });
  it("goes to the ends with Home and End (and Page Up/Down)", () => {
    expect(menuMove(2, "Home", 5)).toBe(0);
    expect(menuMove(2, "End", 5)).toBe(4);
    expect(menuMove(2, "PageUp", 5)).toBe(0);
    expect(menuMove(2, "PageDown", 5)).toBe(4);
  });
  it("ignores other keys and an empty menu", () => {
    expect(menuMove(1, "a", 3)).toBeNull();
    expect(menuMove(0, "ArrowDown", 0)).toBeNull();
  });
});

describe("typing a name to jump to it", () => {
  const names = ["Project", "Bellhaven", "BELLHAVEN", "Bell Tower", "Whisperwood", "Bram"];
  it("finds the next name starting with a letter, wrapping round", () => {
    expect(typeAhead(names, 0, "b")).toBe(1);
    expect(typeAhead(names, 1, "b")).toBe(2);
    expect(typeAhead(names, 5, "b")).toBe(1);
    expect(typeAhead(names, 0, "w")).toBe(4);
  });
  it("narrows with more letters, keeping the current one when it still matches", () => {
    expect(typeAhead(names, 1, "be")).toBe(1);
    expect(typeAhead(names, 1, "bell t")).toBe(3);
    expect(typeAhead(names, 0, "br")).toBe(5);
  });
  it("the same letter again moves on to the next name with it", () => {
    expect(typeAhead(names, 1, "bb")).toBe(2);
  });
  it("ignores case, and finds nothing for no match", () => {
    expect(typeAhead(names, 0, "WHIS")).toBe(4);
    expect(typeAhead(names, 0, "z")).toBe(-1);
    expect(typeAhead([], 0, "a")).toBe(-1);
  });
});
