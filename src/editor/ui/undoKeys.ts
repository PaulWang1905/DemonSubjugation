import { useEffect, useRef, type RefObject } from "react";

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
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
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
