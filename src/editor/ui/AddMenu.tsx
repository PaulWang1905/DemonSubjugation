// The sidebar's "+": a menu of buttons (the guided wizards first, with what
// they make, then the blank kinds), not a dropdown. It opens under the "+"
// (fixed, so the sidebar's scrolling never clips it); arrow keys move,
// Enter picks, Escape or a click elsewhere closes and gives the focus back.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./addMenu.css";

export interface AddMenuItem {
  what: string;
  label: string;
  /** What it makes, in a few words (the wizards'). */
  blurb?: string;
}

interface Props {
  /** The group's name ("World"). */
  group: string;
  guided: readonly AddMenuItem[];
  blank: readonly AddMenuItem[];
  onPick: (what: string) => void;
}

export function AddMenu({ group, guided, blank, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = `add-menu-${group.toLowerCase().replace(/\W+/g, "-")}`;

  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
  const close = (focus = true) => {
    setOpen(false);
    setPos(null);
    if (focus) button.current?.focus();
  };

  // place it under the "+" (or above, near the bottom of the window)
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const b = button.current.getBoundingClientRect();
    const h = menu.current.offsetHeight;
    const w = menu.current.offsetWidth;
    const below = window.innerHeight - b.bottom - 8;
    const top = h <= below || b.top < below ? b.bottom + 4 : Math.max(8, b.top - 4 - h);
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, b.right - w)), top, maxHeight: window.innerHeight - top - 8 });
  }, [open]);
  // (once placed and visible: the first item takes the focus)
  useEffect(() => {
    if (open && pos) items()[0]?.focus();
  }, [open, pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const gone = () => close(false);
    // (the sidebar scrolled under it: it would stand beside the wrong group)
    const scrolled = (e: Event) => !menu.current?.contains(e.target as Node) && close(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", gone);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", gone);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  const pick = (what: string) => {
    close(false);
    onPick(what);
  };

  const row = (it: AddMenuItem) => (
    <button key={it.what} type="button" role="menuitem" tabIndex={-1} className="add-item" onClick={() => pick(it.what)}>
      <span className="add-label">{it.label}</span>
      {it.blurb && <span className="add-blurb">{it.blurb}</span>}
    </button>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className="ghost group-add"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`New in ${group}`}
        title={`New in ${group}…`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) (e.preventDefault(), setOpen(true));
        }}
      >
        +
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          className="add-menu"
          role="menu"
          aria-label={`New in ${group}`}
          style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { visibility: "hidden", left: 0, top: 0 }}
          onKeyDown={(e) => {
            const list = items();
            const at = list.indexOf(document.activeElement as HTMLButtonElement);
            const go = (i: number) => list[(i + list.length) % list.length]?.focus();
            if (e.key === "ArrowDown") (e.preventDefault(), go(at + 1));
            else if (e.key === "ArrowUp") (e.preventDefault(), go(at - 1));
            else if (e.key === "Home") (e.preventDefault(), go(0));
            else if (e.key === "End") (e.preventDefault(), go(list.length - 1));
            else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), close());
            else if (e.key === "Tab") close(false);
          }}
        >
          {guided.length > 0 && (
            <div role="group" aria-label="Guided: asks what matters and places it">
              <div className="add-head" aria-hidden="true">
                Guided
              </div>
              {guided.map(row)}
            </div>
          )}
          {blank.length > 0 && (
            <div role="group" aria-label={guided.length ? "Blank" : "New"}>
              <div className="add-head" aria-hidden="true">
                {guided.length ? "Blank" : "New"}
              </div>
              {blank.map(row)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
