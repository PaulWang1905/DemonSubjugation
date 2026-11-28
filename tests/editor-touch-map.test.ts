// A map under fingers (touchMap.ts): pinching to the zoom steps, and keeping
// the place between the fingers under them.
import { describe, expect, it } from "vitest";
import { anchorScroll, pinchLevel } from "../src/editor/ui/touchMap";

const STEPS = [1, 2, 3, 4];

describe("pinching to a zoom step", () => {
  it("stays put while the fingers only move together", () => {
    expect(pinchLevel(2, 1, STEPS)).toBe(2);
    expect(pinchLevel(2, 1.1, STEPS)).toBe(2);
    expect(pinchLevel(2, 0.9, STEPS)).toBe(2);
  });
  it("goes up a step when the fingers spread, down when they close", () => {
    expect(pinchLevel(2, 1.5, STEPS)).toBe(3);
    expect(pinchLevel(2, 2, STEPS)).toBe(4);
    expect(pinchLevel(2, 0.5, STEPS)).toBe(1);
  });
  it("never past the first or last step", () => {
    expect(pinchLevel(4, 3, STEPS)).toBe(4);
    expect(pinchLevel(1, 0.2, STEPS)).toBe(1);
  });
  it("keeps a zoom between the steps (fit) until the fingers clearly spread or close", () => {
    expect(pinchLevel(1.5, 1, STEPS)).toBe(1.5);
    expect(pinchLevel(1.5, 1.05, STEPS)).toBe(1.5);
    expect(pinchLevel(1.5, 1.4, STEPS)).toBe(2);
    expect(pinchLevel(1.5, 0.66, STEPS)).toBe(1);
  });
  it("ignores a broken spread", () => {
    expect(pinchLevel(2, 0, STEPS)).toBe(2);
    expect(pinchLevel(2, Number.NaN, STEPS)).toBe(2);
  });
});

describe("the place between the fingers stays under them", () => {
  it("doubling the scale doubles the distance to that place", () => {
    // 100 px scrolled, the fingers 50 px into the view: that place is 150 px in; at twice the scale 300 px
    expect(anchorScroll(100, 50, 2, 4)).toBe(250);
  });
  it("the same scale with the fingers moved pans by as much", () => {
    expect(anchorScroll(100, 50, 2, 2, 80)).toBe(70);
  });
  it("halving the scale", () => {
    expect(anchorScroll(300, 100, 4, 2)).toBe(100);
  });
});
