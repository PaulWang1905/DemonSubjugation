import { Keys, type EngineKey } from "../engine";

/** Keyboard layout. Mirrors the original web build (Space = cancel). */
export const KEYMAP: Record<string, EngineKey> = {
  ArrowUp: Keys.UP,
  ArrowDown: Keys.DOWN,
  ArrowLeft: Keys.LEFT,
  ArrowRight: Keys.RIGHT,
  KeyW: Keys.UP,
  KeyS: Keys.DOWN,
  KeyA: Keys.LEFT,
  KeyD: Keys.RIGHT,
  Enter: Keys.ENTER,
  NumpadEnter: Keys.ENTER,
  KeyJ: Keys.ENTER,
  KeyZ: Keys.ENTER,
  Escape: Keys.CANCEL,
  Space: Keys.CANCEL,
  Backspace: Keys.CANCEL,
  KeyK: Keys.CANCEL,
  KeyX: Keys.CANCEL,
  PageUp: Keys.PAGEUP,
  BracketLeft: Keys.PAGEUP,
  KeyQ: Keys.PAGEUP,
  PageDown: Keys.PAGEDOWN,
  BracketRight: Keys.PAGEDOWN,
  KeyE: Keys.PAGEDOWN,
};

export const KEY_HELP: [string, string][] = [
  ["Move / select", "Arrow keys · WASD"],
  ["Confirm", "Enter · J · Z"],
  ["Back / menu", "Esc · Space · K · X"],
  ["Page up / down", "[ ] · Q E · PgUp PgDn"],
];
