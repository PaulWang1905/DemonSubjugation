// Pick a resource by its picture and name instead of its numbers: a button
// showing the chosen one (thumbnail, name, number), opening a searchable list
// of every resource of that kind. Shared by the editor's views (events,
// the world, the cards) so a map, a person or an item is chosen the same way
// everywhere.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { hasThumb, Thumb } from "./Thumb";
import { useNotedName } from "./names";
import "./pickers.css";

export interface ResValue {
  type: number;
  index: number;
}

interface Props {
  archive: LibArchive;
  /** The kind (resType): 1 scripts, 2 maps, 3 characters/NPCs/monsters/boxes, 4 magic, 6 items, 8 sprites, 9 icons, 11 pictures... */
  resType: number;
  /** Only these sub-types (e.g. [2] for NPC people); all when left out. */
  types?: number[];
  value: ResValue | null;
  onChange: (v: ResValue | null) => void;
  /** Offer "none" (the engine's 0). */
  allowNone?: boolean;
  noneLabel?: string;
  /** For screen readers and the button's title. */
  label: string;
  disabled?: boolean;
}

const num = (e: { resType: number; type: number; index: number }) => `${e.type}-${e.index}`;

/** "Old man" for a person, "map 1-2" when a resource has no name. */
export function entryLabel(e: LibEntry): string {
  return baseLabel(e);
}

function baseLabel(e: LibEntry): string {
  return resourceName(e.resType, e.type, e.data).trim() || `${subTypeName(e.resType, e.type) || "#"} ${num(e)}`;
}

export function ResourcePicker({ archive, resType, types, value, onChange, allowNone, noneLabel = "None", label, disabled }: Props) {
  // the author's names for resources the game stores without one (sprites, pictures)
  const noted = useNotedName();
  const entryLabel = (e: LibEntry) => noted(`${e.resType}-${e.type}-${e.index}`) || baseLabel(e);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const place = usePopoverPlace(open, box);

  const all = useMemo(
    () =>
      archive.entries
        .filter((e) => e.resType === resType && (!types || types.includes(e.type)))
        .sort((a, b) => a.type - b.type || a.index - b.index),
    [archive, resType, types],
  );
  const chosen = value ? all.find((e) => e.type === value.type && e.index === value.index) : undefined;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? all.filter((e) => `${entryLabel(e)} ${num(e)} ${subTypeName(e.resType, e.type)}`.toLowerCase().includes(s)) : all;
    return allowNone && !s ? [null, ...list] : list;
  }, [all, q, allowNone]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    const i = shown.findIndex((e) => (e ? e === chosen : !value));
    setAt(Math.max(0, i));
    // (once the list is placed and shown: a hidden field cannot take the focus)
    const raf = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    // (by the path the click took: what it hit may be gone already, replaced by what it opened)
    const away = (ev: MouseEvent) => {
      const path = ev.composedPath();
      if (!path.some((n) => n === box.current || n === pop.current)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", away);
    };
    // (only when it opens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (e: LibEntry | null) => {
    onChange(e ? { type: e.type, index: e.index } : null);
    setOpen(false);
  };

  const missing = value && !chosen && (value.type || value.index);
  return (
    <div className="rp" ref={box}>
      <button
        type="button"
        className={`rp-btn${missing ? " missing" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${chosen ? entryLabel(chosen) : missing ? `missing ${value!.type}-${value!.index}` : noneLabel}`}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {chosen && hasThumb(chosen.resType) && (
          <span className="rp-thumb">
            <Thumb archive={archive} entry={chosen} />
          </span>
        )}
        <span className="rp-name">{chosen ? entryLabel(chosen) : missing ? `Missing ${value!.type}-${value!.index}` : noneLabel}</span>
        {chosen && <span className="rp-num">{num(chosen)}</span>}
        <span className="rp-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div className="rp-pop" ref={pop} style={place} data-popover="">
            <input
              ref={input}
              className="rp-search"
              placeholder="Search by name or number"
              aria-label={`Search ${label}`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAt(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(shown.length - 1, i + 1)));
                else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
                else if (e.key === "Enter" && shown[at] !== undefined) (e.preventDefault(), pick(shown[at]));
                else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(false));
              }}
            />
            <ul className="rp-list" role="listbox" aria-label={label}>
              {shown.length === 0 && <li className="rp-empty">Nothing matches.</li>}
              {shown.map((e, i) => (
                <li
                  key={e ? `${e.type}-${e.index}` : "none"}
                  role="option"
                  aria-selected={e ? e === chosen : !value}
                  className={i === at ? "at" : undefined}
                  onMouseEnter={() => setAt(i)}
                  onMouseDown={(ev) => (ev.preventDefault(), pick(e))}
                  ref={i === at ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                >
                  {e && hasThumb(e.resType) ? (
                    <span className="rp-thumb">
                      <Thumb archive={archive} entry={e} />
                    </span>
                  ) : (
                    <span className="rp-thumb" />
                  )}
                  <span className="rp-name">{e ? entryLabel(e) : noneLabel}</span>
                  {e && <span className="rp-num">{num(e)}</span>}
                </li>
              ))}
            </ul>
          </div>,
          // (inside a modal dialog the list must stay in it, above its backdrop)
          box.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}

/**
 * Where a popover goes: fixed to the viewport under its button (above it when
 * there is no room below), as wide as the button or 260px, kept on screen, so
 * no panel's overflow clips it. It follows the button when the page scrolls.
 */
export function usePopoverPlace(open: boolean, anchor: React.RefObject<HTMLElement | null>, height = 330): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(420, vw - 16, Math.max(260, r.width));
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const below = vh - r.bottom - 8;
      const above = r.top - 8;
      const up = below < Math.min(height, 220) && above > below;
      const room = Math.max(120, (up ? above : below) - 4);
      setStyle(up ? { position: "fixed", left, width, bottom: vh - r.top + 4, maxHeight: room } : { position: "fixed", left, width, top: r.bottom + 4, maxHeight: room });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor, height]);
  return style;
}
