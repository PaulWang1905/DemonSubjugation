import { useEffect, useRef, useState } from "react";
import { Keys, type EngineKey } from "../engine";

interface Props {
  onDown: (k: EngineKey) => void;
  /** The keypad's names (in the site's language). */
  labels: { controls: string; pad: string; pageUp: string; pageDown: string; cancel: string; back: string; confirm: string; ok: string };
  onUp: (k: EngineKey) => void;
}

type Dir = "up" | "down" | "left" | "right";
const DIR_KEYS: Record<Dir, EngineKey> = {
  up: Keys.UP,
  down: Keys.DOWN,
  left: Keys.LEFT,
  right: Keys.RIGHT,
};
/** Inside this part of the pad's radius the direction does not change. */
const DEAD_ZONE = 0.16;
/** The other axis must win by this much before the direction turns. */
const HYSTERESIS = 1.25;

const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not allowed */
  }
};

/**
 * The direction from the pad's centre: the stronger axis wins, with some
 * hysteresis so a thumb resting near a diagonal does not flicker.
 */
function dirAt(el: HTMLElement, x: number, y: number, cur: Dir | null): Dir | null {
  const r = el.getBoundingClientRect();
  const dx = x - (r.left + r.width / 2);
  const dy = y - (r.top + r.height / 2);
  const rad = Math.min(r.width, r.height) / 2;
  if (Math.hypot(dx, dy) < rad * DEAD_ZONE) return cur;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const horizontal = cur === null ? ax > ay : cur === "left" || cur === "right" ? ay <= ax * HYSTERESIS : ax > ay * HYSTERESIS;
  if (horizontal) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/**
 * On-screen controls for touch screens. The d-pad is one surface: slide the
 * thumb to turn without lifting it. Each control follows its own finger, so
 * a direction and A can be held together. Holding keys repeats (in Player).
 */
export function Keypad({ onDown, onUp, labels }: Props) {
  const [dir, setDir] = useState<Dir | null>(null);
  const dirRef = useRef<Dir | null>(null);
  const dirPointer = useRef<number | null>(null);
  const [held, setHeld] = useState<ReadonlySet<EngineKey>>(new Set());
  const buttons = useRef(new Map<number, EngineKey>());
  const cb = useRef({ onDown, onUp });
  cb.current = { onDown, onUp };

  const setDirection = (d: Dir | null) => {
    const old = dirRef.current;
    if (old === d) return;
    if (old) cb.current.onUp(DIR_KEYS[old]);
    dirRef.current = d;
    setDir(d);
    if (d) {
      buzz();
      cb.current.onDown(DIR_KEYS[d]);
    }
  };

  // Stop the browser's own touch gestures on the controls (text selection,
  // the long-press callout, double-tap zoom, the tap flash). React's touch
  // listeners are passive, so this one is added by hand.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  // Let go of everything when unmounted or when the page is hidden.
  useEffect(() => {
    const releaseAll = () => {
      if (dirRef.current) cb.current.onUp(DIR_KEYS[dirRef.current]);
      dirRef.current = null;
      dirPointer.current = null;
      setDir(null);
      for (const k of buttons.current.values()) cb.current.onUp(k);
      buttons.current.clear();
      setHeld(new Set());
    };
    const vis = () => document.hidden && releaseAll();
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", vis);
      releaseAll();
    };
  }, []);

  const pad = {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      e.preventDefault();
      if (dirPointer.current !== null) return;
      dirPointer.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDirection(dirAt(e.currentTarget, e.clientX, e.clientY, null));
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      if (e.pointerId !== dirPointer.current) return;
      setDirection(dirAt(e.currentTarget, e.clientX, e.clientY, dirRef.current));
    },
    onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      if (e.pointerId !== dirPointer.current) return;
      dirPointer.current = null;
      setDirection(null);
    },
    onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
      if (e.pointerId !== dirPointer.current) return;
      dirPointer.current = null;
      setDirection(null);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const release = (id: number) => {
    const k = buttons.current.get(id);
    if (k === undefined) return;
    buttons.current.delete(id);
    setHeld(new Set(buttons.current.values()));
    cb.current.onUp(k);
  };
  const button = (key: EngineKey) => ({
    onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      buttons.current.set(e.pointerId, key);
      setHeld(new Set(buttons.current.values()));
      buzz();
      cb.current.onDown(key);
    },
    onPointerUp: (e: React.PointerEvent) => release(e.pointerId),
    onPointerCancel: (e: React.PointerEvent) => release(e.pointerId),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // keyboard users (or screen readers) clicking the buttons
    onClick(e: React.MouseEvent) {
      if (e.detail === 0) {
        cb.current.onDown(key);
        cb.current.onUp(key);
      }
    },
    "data-held": held.has(key) || undefined,
  });

  return (
    <div className="kp" ref={root} aria-label={labels.controls}>
      <div className="kp-dir">
        <div className="kp-pad" data-dir={dir ?? undefined} role="group" aria-label={labels.pad} {...pad}>
          <i className="arm up" />
          <i className="arm down" />
          <i className="arm left" />
          <i className="arm right" />
          <i className="hub" />
        </div>
      </div>
      <div className="kp-act">
        <div className="kp-pages">
          <button className="kp-pill" aria-label={labels.pageUp} {...button(Keys.PAGEUP)}>
            PgUp
          </button>
          <button className="kp-pill" aria-label={labels.pageDown} {...button(Keys.PAGEDOWN)}>
            PgDn
          </button>
        </div>
        <div className="kp-ab">
          <button className="kp-round b" aria-label={labels.cancel} {...button(Keys.CANCEL)}>
            <span>B</span>
            <small>{labels.back}</small>
          </button>
          <button className="kp-round a" aria-label={labels.confirm} {...button(Keys.ENTER)}>
            <span>A</span>
            <small>{labels.ok}</small>
          </button>
        </div>
      </div>
    </div>
  );
}
