// Pick a resource by its picture and name instead of its numbers: a button
// showing the chosen one (thumbnail, name, number), opening a searchable list
// of every resource of that kind. Shared by the editor's views (events,
// the world, the cards) so a map, a person or an item is chosen the same way
// everywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import { resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { hasThumb, Thumb } from "./Thumb";
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
  return resourceName(e.resType, e.type, e.data).trim() || `${subTypeName(e.resType, e.type) || "#"} ${num(e)}`;
}

export function ResourcePicker({ archive, resType, types, value, onChange, allowNone, noneLabel = "None", label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

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
    input.current?.focus();
    const away = (ev: MouseEvent) => !box.current?.contains(ev.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
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
      {open && (
        <div className="rp-pop">
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
        </div>
      )}
    </div>
  );
}
