import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

const HOLD_MS = 2000;
/** The ring appears only after this long, so normal taps show nothing. */
const SHOW_AFTER_MS = 500;
const SLOP_PX = 12;

/**
 * Press and hold (mouse or finger) for two seconds to call `onHold`. Returns
 * pointer handlers for the target and a ring that fills while holding.
 */
export function useLongPress(onHold: () => void): { bind: Record<string, (e: PointerEvent<HTMLElement>) => void>; ring: ReactNode } {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const timer = useRef(0);
  const [ring, setRing] = useState<{ x: number; y: number; t: number } | null>(null);

  const cancel = useCallback(() => {
    start.current = null;
    window.clearTimeout(timer.current);
    setRing(null);
  }, []);
  useEffect(() => cancel, [cancel]);

  const bind = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      const box = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (!start.current) return;
        setRing({ x, y, t: start.current.t });
        timer.current = window.setTimeout(() => {
          cancel();
          onHold();
        }, HOLD_MS - SHOW_AFTER_MS);
      }, SHOW_AFTER_MS);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      if (s && s.id === e.pointerId && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // no long-press menu or text selection on touch screens
    onContextMenu(e: PointerEvent<HTMLElement>) {
      e.preventDefault();
    },
  };

  return {
    bind,
    ring: ring && (
      <svg className="hold-ring" style={{ left: ring.x, top: ring.y }} viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" className="track" />
        <circle cx="22" cy="22" r="18" className="fill" style={{ animationDuration: `${HOLD_MS - SHOW_AFTER_MS}ms` }} />
      </svg>
    ),
  };
}
