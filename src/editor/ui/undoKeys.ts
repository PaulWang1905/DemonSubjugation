import { useEffect, useRef, type RefObject } from "react";

const field = (t: Element | null): boolean => {
  const h = t as HTMLElement | null;
  return !!h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.tagName === "SELECT" || h.isContentEditable);
};

/** Whether a key press went to a text field (which keeps its own keys): the event's target or the focused element. */
export function typing(e: KeyboardEvent): boolean {
  return field(e.target as Element | null) || field(document.activeElement);
}

/** Whether a picker's list (a popover) or a dialog is open: single keys belong to it then. */
export function popoverOpen(): boolean {
  return !!document.querySelector("[data-popover], dialog[open], [aria-expanded='true'][aria-haspopup]");
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
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e) || popoverOpen()) return;
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
