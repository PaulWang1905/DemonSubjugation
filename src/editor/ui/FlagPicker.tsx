// Pick a story flag by its name: a button showing the chosen flag ("got old
// key", flag 12), opening a searchable list of the flags the author named and
// the scripts use (with where each is set and checked), and "New flag…",
// which takes the next free number and asks for its name. A number typed in
// the search picks that flag. Used by the Visual script view's flag operands
// and the item card's "sets a flag while worn".
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { flagChoices, nextFreeFlag, searchFlags } from "../format/flags";
import { setFlagNote, type ProjectNotes } from "../format/notes";
import type { WorldIndex } from "../format/world";
import { usePopoverPlace } from "./ResourcePicker";
import "./pickers.css";
import "./authoring.css";

interface Props {
  value: number;
  onChange: (flag: number) => void;
  notes: ProjectNotes;
  setNotes: (update: (prev: ProjectNotes) => ProjectNotes) => void;
  world?: WorldIndex;
  /** Flags used here that the world index may not know yet (the script being edited). */
  extra?: Iterable<number>;
  label: string;
  /** Offer "none" (0). */
  allowNone?: boolean;
  disabled?: boolean;
}

type Row = { kind: "flag"; flag: number; name?: string; uses: string } | { kind: "none" } | { kind: "number"; flag: number } | { kind: "new" };

export function FlagPicker({ value, onChange, notes, setNotes, world, extra = [], label, allowNone, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [naming, setNaming] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const place = usePopoverPlace(open, box);
  const extraList = [...extra];
  const choices = useMemo(() => flagChoices(notes, world, extraList), [notes, world, extraList.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = value ? notes.flags[String(value)]?.name : undefined;

  const rows: Row[] = useMemo(() => {
    const hits = searchFlags(choices, q);
    const out: Row[] = [];
    const s = q.trim();
    if (allowNone && !s) out.push({ kind: "none" });
    out.push(...hits.map((c): Row => ({ kind: "flag", ...c })));
    if (/^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 2400 && !hits.some((c) => c.flag === Number(s))) out.push({ kind: "number", flag: Number(s) });
    out.push({ kind: "new" });
    return out;
  }, [choices, q, allowNone]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setNaming(null);
    setAt(Math.max(0, rows.findIndex((r) => r.kind === "flag" && r.flag === value)));
    input.current?.focus();
    // (by the path the click took: what it hit may be gone already, replaced by what it opened)
    const away = (ev: MouseEvent) => {
      const path = ev.composedPath();
      if (!path.some((n) => n === box.current || n === pop.current)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (r: Row) => {
    if (r.kind === "new") {
      const n = nextFreeFlag(notes, world, extraList);
      setNaming(n);
      setNewName(q.trim() && !/^\d+$/.test(q.trim()) ? q.trim() : "");
      return;
    }
    onChange(r.kind === "none" ? 0 : r.flag);
    setOpen(false);
  };
  const create = () => {
    if (naming === null) return;
    const n = naming;
    if (newName.trim()) setNotes((nn) => setFlagNote(nn, n, { name: newName }));
    onChange(n);
    setOpen(false);
  };

  return (
    <span className="fp" ref={box}>
      <button
        type="button"
        className="rp-btn fp-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value ? `${name ? `“${name}”, ` : ""}flag ${value}` : "none"}`}
        title={`${label}: pick a story flag by name, or make a new one`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? (
          <>
            <span className="rp-name">{name ? `“${name}”` : "unnamed flag"}</span>
            <span className="rp-num">flag {value}</span>
          </>
        ) : (
          <span className="rp-name">No flag</span>
        )}
        <span className="rp-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div className="rp-pop fp-pop" ref={pop} style={place} data-popover="">
            {naming === null ? (
              <>
                <input
                  ref={input}
                  className="rp-search"
                  placeholder="Search flags by name or number"
                  aria-label={`Search ${label}`}
                  value={q}
                  onChange={(e) => (setQ(e.target.value), setAt(0))}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(rows.length - 1, i + 1)));
                    else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
                    else if (e.key === "Enter" && rows[at]) (e.preventDefault(), choose(rows[at]));
                    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(false));
                  }}
                />
                <ul className="rp-list" role="listbox" aria-label={label}>
                  {rows.map((r, i) => (
                    <li
                      key={r.kind === "flag" || r.kind === "number" ? `${r.kind}${r.flag}` : r.kind}
                      role="option"
                      aria-selected={r.kind === "flag" ? r.flag === value : r.kind === "none" ? !value : false}
                      className={`${i === at ? "at" : ""} fp-${r.kind}`}
                      onMouseEnter={() => setAt(i)}
                      onMouseDown={(ev) => (ev.preventDefault(), choose(r))}
                      ref={i === at ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    >
                      {r.kind === "flag" ? (
                        <span className="fp-row">
                          <span className="rp-name">{r.name ? `“${r.name}”` : <span className="muted">unnamed</span>}</span>
                          <span className="rp-num">flag {r.flag}</span>
                          {r.uses && <span className="fp-uses muted small">{r.uses}</span>}
                        </span>
                      ) : r.kind === "none" ? (
                        <span className="rp-name">No flag</span>
                      ) : r.kind === "number" ? (
                        <span className="rp-name">Use flag {r.flag} (not used yet)</span>
                      ) : (
                        <span className="rp-name fp-new-row">＋ New flag…</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <form
                className="fp-newform"
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                <label className="small">
                  Name of the new flag (flag {naming}): what it remembers
                  <input
                    autoFocus
                    value={newName}
                    placeholder="e.g. got the old key"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), setNaming(null))}
                  />
                </label>
                <div className="row">
                  <button type="submit">Use flag {naming}</button>
                  <button type="button" className="ghost" onClick={() => setNaming(null)}>
                    Back
                  </button>
                </div>
              </form>
            )}
          </div>,
          box.current?.closest("dialog") ?? document.body,
        )}
    </span>
  );
}
