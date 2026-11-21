import { useEffect, useRef, type RefObject } from "react";

/** Whether a key press went to a text field (which keeps its own keys). */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/**
 * Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redoes, while `anchor` is on screen
 * and no text field has focus (text fields keep their own undo). The anchor
 * check matters because the editor stays mounted, hidden, during playtests.
 */
export function useUndoKeys(anchor: RefObject<HTMLElement | null>, undo: () => void, redo: () => void, enabled = true): void {
  const fns = useRef({ undo, redo });
  fns.current = { undo, redo };
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (typing(e)) return;
      if (!anchor.current || anchor.current.offsetParent === null) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) fns.current.undo();
      else if (k === "y" || (k === "z" && e.shiftKey)) fns.current.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, enabled]);
}

/**
 * Single-key tool shortcuts (no modifier), while `anchor` is on screen, no
 * text field has focus and no dialog is open. `keys` maps a key (lower case,
 * or "[" / "]") to its action.
 */
export function useToolKeys(anchor: RefObject<HTMLElement | null>, keys: Record<string, () => void>, enabled = true): void {
  const fns = useRef(keys);
  fns.current = keys;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || document.querySelector("dialog[open]")) return;
      if (!anchor.current || anchor.current.offsetParent === null) return;
      const f = fns.current[e.key.toLowerCase()];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, enabled]);
}
