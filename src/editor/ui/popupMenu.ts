// A menu that opens from a button (the tab strip's "⌄ N more", the editor
// bar's "⋯" on small screens): placed under the button (fixed, so no
// scrolling area clips it), its right edge on the button's; the shown item
// or the first takes the focus; the arrow keys, Home/End and typing a name's
// first letters move through it; Escape gives the focus back to the button;
// Tab, a click elsewhere or a resize closes it. The items are elements with
// role "menuitem" or "menuitemradio" and tabIndex -1.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { menuMove, typeAhead } from "./tabFit";

export interface PopupMenu {
  open: boolean;
  toggle: () => void;
  close: (focus?: boolean) => void;
  button: React.RefObject<HTMLButtonElement | null>;
  menu: React.RefObject<HTMLDivElement | null>;
  /** The menu's place (hidden until measured). */
  style: React.CSSProperties;
  /** The menu's key handler. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export function usePopupMenu(): PopupMenu {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem], [role=menuitemradio]") ?? [])];
  const close = (focus = true) => {
    setOpen(false);
    setPos(null);
    if (focus) button.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const b = button.current.getBoundingClientRect();
    setPos({ right: Math.max(8, window.innerWidth - b.right), top: b.bottom + 4, maxHeight: Math.max(160, window.innerHeight - b.bottom - 12) });
  }, [open]);
  // (once placed: the chosen item, else the first, takes the focus)
  useEffect(() => {
    if (!open || !pos) return;
    const list = items();
    (list.find((el) => el.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
  }, [open, pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const gone = () => close(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", gone);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", gone);
    };
  }, [open]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = menuMove(at, e.key, list.length);
    if (go !== null) {
      e.preventDefault();
      list[go]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") close(false);
    else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type a name's first letters to jump to it
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key, at: now };
      const i = typeAhead(
        list.map((el) => el.dataset.name ?? el.textContent ?? ""),
        at,
        typed.current.text,
      );
      if (i >= 0) list[i]?.focus();
    }
  };
  return {
    open,
    toggle: () => (open ? close() : setOpen(true)),
    close,
    button,
    menu,
    style: pos ? { right: pos.right, top: pos.top, maxHeight: pos.maxHeight } : { visibility: "hidden", right: 0, top: 0 },
    onKeyDown,
  };
}

/** Enter or Space on a menu item runs it (the items are not buttons). */
export function itemKeys(run: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      run();
    }
  };
}
