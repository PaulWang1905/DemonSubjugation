// Keys for the FMJ React player's engine, from the keyboard and the
// on-screen keypad. Held keys repeat at one fixed rate whatever sends them,
// so walking feels the same everywhere; each repeat is one more key message,
// as on the device (one step on the map, one line in a menu). While the game
// is paused (the debug menu or the options sheet) keys are not passed on,
// and Esc closes what paused it.
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { Keys, type Engine, type EngineKey } from "../engine";
import { KEYMAP } from "./keys";

/** Key repeat: first repeat after this long, then one every REPEAT_RATE ms. */
const REPEAT_DELAY = 250;
const REPEAT_RATE = 100;
const REPEATS = new Set<EngineKey>([Keys.UP, Keys.DOWN, Keys.LEFT, Keys.RIGHT, Keys.PAGEUP, Keys.PAGEDOWN]);

export interface EngineKeyInput {
  keyDown: (k: EngineKey) => void;
  keyUp: (k: EngineKey) => void;
  /** Let go of every key the game still thinks is held (before pausing it). */
  releaseKeys: () => void;
}

export function useEngineKeys(options: {
  engine: MutableRefObject<Engine | null>;
  /** True while the game is paused. */
  paused: MutableRefObject<boolean>;
  /** Esc while paused: close what paused the game. */
  onEscapePaused: () => void;
  /** The engine threw while handling a key. */
  onError: (e: unknown) => void;
}): EngineKeyInput {
  const { engine, paused } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  // Keys the game has seen pressed: only their releases are passed on, so the
  // Esc that closes the debug menu does not reach the game.
  const pressed = useRef(new Set<EngineKey>());
  const repeat = useRef<{ key: EngineKey; t: number } | null>(null);

  const send = useCallback(
    (k: EngineKey, down: boolean) => {
      try {
        if (down) engine.current?.keyDown(k);
        else engine.current?.keyUp(k);
        return true;
      } catch (e) {
        callbacks.current.onError(e);
        return false;
      }
    },
    [engine],
  );
  const stopRepeat = useCallback(() => {
    if (repeat.current) window.clearTimeout(repeat.current.t);
    repeat.current = null;
  }, []);
  const startRepeat = useCallback(
    (k: EngineKey, delay: number) => {
      stopRepeat();
      const fire = () => {
        if (!repeat.current || paused.current) return;
        if (!send(k, true)) return;
        repeat.current.t = window.setTimeout(fire, REPEAT_RATE);
      };
      repeat.current = { key: k, t: window.setTimeout(fire, delay) };
    },
    [stopRepeat, send, paused],
  );

  const keyDown = useCallback(
    (k: EngineKey) => {
      if (paused.current || pressed.current.has(k)) return;
      pressed.current.add(k);
      send(k, true);
      if (REPEATS.has(k)) startRepeat(k, REPEAT_DELAY);
    },
    [startRepeat, send, paused],
  );
  const keyUp = useCallback(
    (k: EngineKey) => {
      if (!pressed.current.delete(k)) return;
      if (repeat.current?.key === k) {
        stopRepeat();
        // another held direction takes over, as on a keyboard
        const other = [...pressed.current].reverse().find((x) => REPEATS.has(x));
        if (other !== undefined) startRepeat(other, REPEAT_DELAY);
      }
      if (!paused.current) send(k, false);
    },
    [startRepeat, stopRepeat, send, paused],
  );
  const releaseKeys = useCallback(() => {
    stopRepeat();
    for (const k of pressed.current) engine.current?.keyUp(k);
    pressed.current.clear();
  }, [stopRepeat, engine]);
  useEffect(() => stopRepeat, [stopRepeat]);

  // The keyboard. The browser's own auto-repeat is ignored: holding a key
  // repeats at the same rate as the keypad.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (paused.current) {
        if (e.code === "Escape") callbacks.current.onEscapePaused();
        return;
      }
      const k = KEYMAP[e.code];
      if (k === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) keyDown(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code];
      if (k === undefined) return;
      e.preventDefault();
      keyUp(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [keyDown, keyUp, paused]);

  return { keyDown, keyUp, releaseKeys };
}
