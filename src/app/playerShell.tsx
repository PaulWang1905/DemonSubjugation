// What the two players share: remembered preferences, the layout queries,
// fullscreen, fitting the screen into the window, and the screen menus
// (colours, effect, size).
import { useEffect, useState, type RefObject } from "react";
import type { ScreenEffect } from "./hiresText";
import { PALETTES } from "./palettes";
import type { PlayerText } from "./playerText";

export function pref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem("fmj-react:" + key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key: string, v: string): void {
  try {
    localStorage.setItem("fmj-react:" + key, v);
  } catch {
    /* not remembered */
  }
}

export const effectOf = (v: string): ScreenEffect => (v === "lcd" || v === "lcd-shadow" || v === "smooth" ? v : "none");

export const SPEEDS = [1, 2, 4];
/** Where the keypad goes beside the screen instead of under it. */
export const SIDE_PAD_QUERY = "(orientation: landscape) and (max-height: 560px)";
/** Phones and small tablets: the full-screen play layout. */
export const TOUCH_QUERY = "(pointer: coarse) and (max-width: 1024px), (pointer: coarse) and (max-height: 600px), (max-width: 560px), (max-height: 480px)";
/** The page column's inner width (#root: 1400 px with 16 px padding). */
const PAGE_WIDTH = 1368;
/** The width the game screen starts at, at most (zoom from there). */
const DEFAULT_WIDTH = 948;

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const ch = () => setOn(m.matches);
    ch();
    m.addEventListener("change", ch);
    return () => m.removeEventListener("change", ch);
  }, [query]);
  return on;
}

/** True while the page is fullscreen. */
export function useFullscreen(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const ch = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", ch);
    return () => document.removeEventListener("fullscreenchange", ch);
  }, []);
  return on;
}

export function toggleFullscreen(): void {
  const el = document.querySelector(".player") as HTMLElement | null;
  if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
}

export interface ZoomInfo {
  /** Device pixels per game pixel now, at the default size, and the smallest and largest. */
  n: number;
  def: number;
  min: number;
  max: number;
  /** Wider than the page column. */
  wide: boolean;
}

/** The zoom (steps from the default size), remembered. */
export function useZoom(): [number, (z: number) => void] {
  const [zoom, setZoom] = useState(() => {
    const z = Number(pref<string>("zoom", ""));
    if (Number.isFinite(z) && pref<string>("zoom", "") !== "") return Math.round(z);
    const old = pref<string>("screenSize", "fit"); // the earlier Size menu
    return old === "fill" ? 99 : old === "large" ? 2 : 0;
  });
  return [
    zoom,
    (z: number) => {
      setZoom(z);
      setPref("zoom", String(z));
    },
  ];
}

/**
 * Fit a `frameW`×`frameH` screen into what is left of the window. On a
 * computer the scale is a whole number of device pixels per game pixel, so
 * the pixels stay crisp, from the default size (which fits the window and
 * DEFAULT_WIDTH) by `zoom` steps. In the phone layout the screen takes all the
 * room the controls leave: the full width when upright, the full height
 * between the controls when sideways.
 */
export function useScreenFit(
  stageRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  o: { touch: boolean; sideways: boolean; showPad: boolean; fullscreen: boolean; zoom: number; frameW: number; frameH: number },
): { scale: number; zoomInfo: ZoomInfo } {
  const [scale, setScale] = useState(3);
  const [zoomInfo, setZoomInfo] = useState<ZoomInfo>({ n: 1, def: 1, min: 1, max: 1, wide: false });
  const { touch, sideways, showPad, fullscreen, zoom, frameW, frameH } = o;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const bezel = stage.querySelector(".bezel") as HTMLElement | null;
      const frame = bezel ? bezel.offsetWidth - (canvasRef.current?.offsetWidth ?? 0) : 18;
      const size = (sel: string, wide: boolean) =>
        Math.max(0, ...Array.from(stage.querySelectorAll(sel)).map((x) => (wide ? (x as HTMLElement).offsetWidth : (x as HTMLElement).offsetHeight)));
      const quarter = (fitted: number) => Math.max(1, Math.floor(fitted * dpr * 4) / 4) / dpr;
      let w = stage.clientWidth;
      let h: number;
      if (touch) {
        h = stage.clientHeight;
        if (sideways) {
          // the widest control column, measured by its contents (grid cells stretch)
          w -= 2 * (Math.max(size(".kp-pad", true), size(".kp-ab", true), size(".kp-pages", true)) + 10);
        } else {
          // what the keypad needs at least, measured by its parts (it stretches)
          h -= Math.max(size(".kp-pad", false), size(".kp-ab", false)) + size(".kp-pages", false) + 36;
        }
        setScale(quarter(Math.min((w - frame) / frameW, (h - frame) / frameH, 8)));
        return;
      }
      const kp = stage.querySelector(".kp") as HTMLElement | null;
      if (document.fullscreenElement) {
        // fullscreen: the game takes the whole screen (above the keypad, if shown)
        h = window.innerHeight - (kp ? kp.offsetHeight + 10 : 0);
        w = window.innerWidth;
        setScale(quarter(Math.min((w - frame) / frameW, (h - frame) / frameH, 16)));
        return;
      }
      const top = stage.getBoundingClientRect().top + window.scrollY;
      h = window.innerHeight - top - 6;
      if (kp) h -= kp.offsetHeight + 10;
      else h -= 60; // leave the options bar in view
      const winW = document.documentElement.clientWidth - 32;
      const steps = (width: number) => Math.floor(Math.min((width - frame) / frameW, (h - frame) / frameH) * dpr);
      const max = Math.max(1, Math.min(steps(winW), Math.floor(16 * dpr)));
      const def = Math.max(1, Math.min(steps(Math.min(winW, DEFAULT_WIDTH)), Math.floor(8 * dpr), max));
      const min = Math.max(1, Math.min(def, Math.round(2 * dpr)));
      const n = Math.min(max, Math.max(min, def + zoom));
      setScale(n / dpr);
      setZoomInfo({ n, def, min, max, wide: (n / dpr) * frameW + frame > PAGE_WIDTH });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [stageRef, canvasRef, showPad, touch, sideways, fullscreen, zoom, frameW, frameH]);
  return { scale, zoomInfo };
}

/** The screen menus: colours, effect and (on a computer) size. */
export function ScreenOptions(p: {
  pt: PlayerText;
  name: (o: { label: string; zh: string }) => string;
  paletteId: string;
  onPalette: (id: string) => void;
  effect: ScreenEffect;
  onEffect: (e: ScreenEffect) => void;
  /** Omitted in the phone layout, which always fills the room it has. */
  zoom?: { info: ZoomInfo; change: (z: number) => void };
}) {
  const { pt, zoom } = p;
  return (
    <>
      <label className="field">
        <span className="lbl">{pt.screen}</span>
        <select
          value={p.paletteId}
          onChange={(e) => {
            p.onPalette(e.target.value);
            setPref("palette", e.target.value);
          }}
        >
          {PALETTES.map((c) => (
            <option key={c.id} value={c.id}>
              {p.name(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="field" title={pt.effectTitle}>
        <span className="lbl">{pt.effect}</span>
        <select
          value={p.effect}
          onChange={(e) => {
            p.onEffect(effectOf(e.target.value));
            setPref("effect", e.target.value);
          }}
        >
          {(["none", "lcd", "lcd-shadow", "smooth"] as const).map((v) => (
            <option key={v} value={v}>
              {pt.effects[v]}
            </option>
          ))}
        </select>
      </label>
      {zoom && (
        <span className="field zoom" title={pt.sizeTitle}>
          <span className="lbl">{pt.size}</span>
          <button
            className="ghost zoom-btn"
            onClick={() => zoom.change(zoom.info.n - 1 - zoom.info.def)}
            disabled={zoom.info.n <= zoom.info.min}
            aria-label={pt.smaller}
            title={pt.smaller}
          >
            −
          </button>
          <button className="ghost zoom-pct" onClick={() => zoom.change(0)} title={pt.usualSize}>
            {Math.round((zoom.info.n / zoom.info.def) * 100)}%
          </button>
          <button
            className="ghost zoom-btn"
            onClick={() => zoom.change(zoom.info.n + 1 - zoom.info.def)}
            disabled={zoom.info.n >= zoom.info.max}
            aria-label={pt.larger}
            title={pt.larger}
          >
            +
          </button>
        </span>
      )}
    </>
  );
}

/** The speed menu. */
export function SpeedField({ pt, speed, onSpeed }: { pt: PlayerText; speed: number; onSpeed: (s: number) => void }) {
  return (
    <label className="field">
      <span className="lbl">{pt.speed}</span>
      <select
        value={speed}
        onChange={(e) => {
          onSpeed(Number(e.target.value));
          setPref("speed", e.target.value);
        }}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </label>
  );
}
