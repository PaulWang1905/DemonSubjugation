// Where the World view's name labels go, so they do not cover each other
// ("Merchan Save Stone" at 1280): each label tries its places in order
// (under its person, above them, a line lower, beside them) and takes the
// first free one; when none is free it is shortened (the full name shows on
// hover and when selected) and takes the place where it covers least.
// Pure: sizes in pixels, measured by the caller.

export type Side = "below" | "above" | "below2" | "above2" | "right" | "left";

export interface LabelRequest {
  id: string;
  /** What it labels (a person's sprite, a tile), in stage pixels. */
  anchor: { x: number; y: number; w: number; h: number };
  /** The label's size at full length. */
  w: number;
  h: number;
  /** Places to try, best first. */
  sides: readonly Side[];
}

export interface LabelPlace {
  id: string;
  /** Top-left, in stage pixels. */
  x: number;
  y: number;
  w: number;
  side: Side;
  /** Shortened (ellipsis): the full text shows on hover. */
  short: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function at(r: LabelRequest, side: Side, w: number, stage?: { w: number; h: number }): Box {
  const a = r.anchor;
  const gap = 1;
  const cx = a.x + a.w / 2 - w / 2;
  const cy = a.y + a.h / 2 - r.h / 2;
  let b: Box;
  switch (side) {
    case "below":
      b = { x: cx, y: a.y + a.h + gap, w, h: r.h };
      break;
    case "below2":
      b = { x: cx, y: a.y + a.h + gap + r.h, w, h: r.h };
      break;
    case "above":
      b = { x: cx, y: a.y - r.h - gap, w, h: r.h };
      break;
    case "above2":
      b = { x: cx, y: a.y - 2 * r.h - gap, w, h: r.h };
      break;
    case "right":
      b = { x: a.x + a.w + 2, y: cy, w, h: r.h };
      break;
    case "left":
      b = { x: a.x - w - 2, y: cy, w, h: r.h };
      break;
  }
  // (kept on the map)
  if (stage) {
    b.x = Math.max(0, Math.min(stage.w - b.w, b.x));
    b.y = Math.max(0, Math.min(stage.h - b.h, b.y));
  }
  return b;
}

/**
 * Place labels in order (the first ones are the most important) so none
 * covers another. `shortW` is the width a shortened label takes (default:
 * the anchor's width and a half, at least 40). `avoid` are boxes no label
 * should cover (the other people's sprites), counted lightly.
 */
export function placeLabels(reqs: readonly LabelRequest[], o: { stage?: { w: number; h: number }; shortW?: (r: LabelRequest) => number; avoid?: readonly (Box & { id: string })[] } = {}): LabelPlace[] {
  const placed: Box[] = [];
  const out: LabelPlace[] = [];
  // (covering another label costs most, then covering what it labels, then other people)
  const cost = (b: Box, r: LabelRequest) =>
    placed.reduce((n, p) => n + overlap(b, p), 0) * 4 + overlap(b, r.anchor) * 2 + (o.avoid ?? []).reduce((n, p) => (p.id === r.id ? n : n + overlap(b, p)), 0);
  for (const r of reqs) {
    let best: { side: Side; box: Box; c: number } | null = null;
    for (const side of r.sides) {
      const box = at(r, side, r.w, o.stage);
      const c = cost(box, r);
      if (!best || c < best.c) best = { side, box, c };
      if (c === 0) break;
    }
    let short = false;
    // (labels may not cover each other: shorten, and take the place that covers least)
    if (best && placed.some((p) => overlap(best!.box, p) > 0)) {
      const w = Math.min(r.w, o.shortW ? o.shortW(r) : Math.max(40, r.anchor.w * 1.5));
      if (w < r.w) {
        short = true;
        best = null;
        for (const side of r.sides) {
          const box = at(r, side, w, o.stage);
          const c = cost(box, r);
          if (!best || c < best.c) best = { side, box, c };
          if (c === 0) break;
        }
      }
    }
    if (!best) continue;
    placed.push(best.box);
    out.push({ id: r.id, x: best.box.x, y: best.box.y, w: best.box.w, side: best.side, short });
  }
  return out;
}

let measurer: CanvasRenderingContext2D | null | undefined;

/** A label's text width in the World view's label font (600 11px, the site's sans), in pixels. */
export function labelWidth(text: string): number {
  if (measurer === undefined) {
    try {
      measurer = document.createElement("canvas").getContext("2d");
      const family = getComputedStyle(document.documentElement).getPropertyValue("--h-sans").trim() || "system-ui, sans-serif";
      if (measurer) measurer.font = `600 11px ${family}`;
    } catch {
      measurer = null;
    }
  }
  return Math.ceil(measurer ? measurer.measureText(text).width : text.length * 6.5);
}
