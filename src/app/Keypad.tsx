import { useEffect, useRef } from "react";
import { Keys, type EngineKey } from "../engine";

interface Props {
  onDown: (k: EngineKey) => void;
  onUp: (k: EngineKey) => void;
}

const REPEAT_DELAY = 260;
const REPEAT_RATE = 110;

/** On-screen controls for touch devices; held direction keys auto-repeat. */
export function Keypad({ onDown, onUp }: Props) {
  const timers = useRef(new Map<number, { t1: number; t2: number }>());

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const { t1, t2 } of map.values()) {
        clearTimeout(t1);
        clearInterval(t2);
      }
      map.clear();
    };
  }, []);

  const bind = (key: EngineKey, repeat: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      navigator.vibrate?.(8);
      onDown(key);
      if (repeat) {
        const t1 = window.setTimeout(() => {
          const t2 = window.setInterval(() => onDown(key), REPEAT_RATE);
          const cur = timers.current.get(key);
          if (cur) cur.t2 = t2;
        }, REPEAT_DELAY);
        timers.current.set(key, { t1, t2: 0 });
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      const cur = timers.current.get(key);
      if (cur) {
        clearTimeout(cur.t1);
        clearInterval(cur.t2);
        timers.current.delete(key);
      }
      onUp(key);
    },
    onPointerCancel: () => {
      const cur = timers.current.get(key);
      if (cur) {
        clearTimeout(cur.t1);
        clearInterval(cur.t2);
        timers.current.delete(key);
      }
      onUp(key);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="keypad" aria-label="On-screen controls">
      <div className="dpad">
        <button className="k up" aria-label="Up" {...bind(Keys.UP, true)}>▲</button>
        <button className="k left" aria-label="Left" {...bind(Keys.LEFT, true)}>◀</button>
        <button className="k right" aria-label="Right" {...bind(Keys.RIGHT, true)}>▶</button>
        <button className="k down" aria-label="Down" {...bind(Keys.DOWN, true)}>▼</button>
      </div>
      <div className="pages">
        <button className="k small" aria-label="Page up" {...bind(Keys.PAGEUP, false)}>PgUp</button>
        <button className="k small" aria-label="Page down" {...bind(Keys.PAGEDOWN, false)}>PgDn</button>
      </div>
      <div className="ab">
        <button className="k b" aria-label="Cancel" {...bind(Keys.CANCEL, false)}>
          <span>B</span>
          <small>Back</small>
        </button>
        <button className="k a" aria-label="Confirm" {...bind(Keys.ENTER, false)}>
          <span>A</span>
          <small>OK</small>
        </button>
      </div>
    </div>
  );
}
