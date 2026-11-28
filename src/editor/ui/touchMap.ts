// A map under fingers (the map's World and Tiles views): two fingers pan the
// map and pinch it to the next zoom step and back, keeping the place between
// the fingers under them; with a tool that acts on a tap (select, place,
// fill, pick), one finger that moves pans instead, and one that does not is
// the tap, run when it lifts. A painting tool paints with one finger; a
// second finger takes the stroke back and pans instead. A mouse or a pen is
// left to the view as before.
import { useEffect, useRef } from "react";

/** How far a finger may move (px) and still be a tap. */
export const TAP_SLOP = 10;

/**
 * The zoom step for a pinch that started at zoom `start` and has spread the
 * fingers by `ratio` (1: as they started): the step nearest to start × ratio,
 * on a log scale, among `levels` and the zoom it started at (which may lie
 * between them, as "fit" does: fingers that only pan keep it).
 */
export function pinchLevel(start: number, ratio: number, levels: readonly number[]): number {
  if (!(ratio > 0) || !(start > 0)) return start;
  const want = Math.log(start * ratio);
  let best = start;
  for (const l of levels) if (Math.abs(Math.log(l) - want) < Math.abs(Math.log(best) - want)) best = l;
  return best;
}

/**
 * Where to scroll (one axis) so that the content at `at` px into the view,
 * which was there when the scroll was `scroll` at scale `from`, stays at
 * `atNow` px at scale `to`.
 */
export function anchorScroll(scroll: number, at: number, from: number, to: number, atNow = at): number {
  return ((scroll + at) * to) / from - atNow;
}

interface Options {
  /** The zoom now (a number of the levels, or between them: "fit"). */
  zoom: number;
  levels: readonly number[];
  setZoom: (z: number) => void;
  /** Two fingers came down: take back what one finger started. */
  onGesture?: () => void;
}

export interface TouchMap {
  /** Two fingers are on the map (or were, until all lift). */
  gesture: () => boolean;
  /** A one-finger touch for a tap tool came down: follow it. */
  tapDown: (e: { pointerId: number; clientX: number; clientY: number }) => void;
  /** The finger moved: true while it pans (it is no tap any more). */
  tapMove: (e: { pointerId: number; clientX: number; clientY: number }) => boolean;
  /** The finger lifted: where it tapped, or null (it panned, or a pinch took over). */
  tapUp: (e: { pointerId: number }) => { clientX: number; clientY: number } | null;
}

export function useTouchMap(scroller: React.RefObject<HTMLElement | null>, o: Options): TouchMap {
  const opts = useRef(o);
  opts.current = o;
  const pending = useRef<{ left: number; top: number } | null>(null);
  const pinching = useRef(false);
  const tap = useRef<{ id: number; x: number; y: number; left: number; top: number; panning: boolean } | null>(null);

  // after a zoom step: put the place between the fingers back under them (once the map has its new size)
  useEffect(() => {
    const p = pending.current;
    const el = scroller.current;
    if (!p || !el) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = p.left;
      el.scrollTop = p.top;
      pending.current = null;
    });
    return () => cancelAnimationFrame(id);
  }, [o.zoom, scroller]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let g: { d0: number; z0: number; mx: number; my: number; left: number; top: number; z: number } | null = null;
    const two = (t: TouchList) => {
      const r = el.getBoundingClientRect();
      const a = t[0];
      const b = t[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, mx: (a.clientX + b.clientX) / 2 - r.left, my: (a.clientY + b.clientY) / 2 - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const m = two(e.touches);
      pinching.current = true;
      tap.current = null;
      opts.current.onGesture?.();
      g = { d0: m.d, z0: opts.current.zoom, mx: m.mx, my: m.my, left: el.scrollLeft, top: el.scrollTop, z: opts.current.zoom };
    };
    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const m = two(e.touches);
      const z = pinchLevel(g.z0, m.d / g.d0, opts.current.levels);
      const left = anchorScroll(g.left, g.mx, g.z0, z, m.mx);
      const top = anchorScroll(g.top, g.my, g.z0, z, m.my);
      if (z !== g.z) {
        g.z = z;
        pending.current = { left, top };
        opts.current.setZoom(z);
      } else if (!pending.current) {
        el.scrollLeft = left;
        el.scrollTop = top;
      } else pending.current = { left, top };
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) g = null;
      if (e.touches.length === 0) pinching.current = false;
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [scroller]);

  return {
    gesture: () => pinching.current,
    tapDown: (e) => {
      const el = scroller.current;
      tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el?.scrollLeft ?? 0, top: el?.scrollTop ?? 0, panning: false };
    },
    tapMove: (e) => {
      const t = tap.current;
      const el = scroller.current;
      if (!t || t.id !== e.pointerId || !el) return false;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (!t.panning && Math.hypot(dx, dy) < TAP_SLOP) return false;
      t.panning = true;
      el.scrollLeft = t.left - dx;
      el.scrollTop = t.top - dy;
      return true;
    },
    tapUp: (e) => {
      const t = tap.current;
      if (!t || t.id !== e.pointerId) return null;
      tap.current = null;
      return t.panning || pinching.current ? null : { clientX: t.x, clientY: t.y };
    },
  };
}
