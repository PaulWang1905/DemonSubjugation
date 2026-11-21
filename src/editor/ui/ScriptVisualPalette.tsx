// "Add a step": the instructions by plain name, searchable, by category.
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, commandsIn, searchCommands, type Category, type CommandInfo } from "../format/commands";

interface Props {
  /** Where the step goes, in words ("after “Give Herb”"). */
  where: string;
  onPick: (name: string) => void;
  onClose: () => void;
}

const COMMON = ["say", "message", "choice", "gaingoods", "gainmoney", "setevent", "if", "enterfight", "loadmap", "createnpc", "facetoface", "callback"];

export function StepPalette({ where, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "Common">("Common");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus();
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [onClose]);
  const list: CommandInfo[] = useMemo(() => {
    // (plain names first: a title word that starts with the words typed, the common steps
    // before the rare ones; the ones that do nothing in this engine last)
    if (q.trim()) {
      const words = q.trim().toLowerCase().split(/\s+/);
      const rank = (c: CommandInfo) => {
        const title = c.title.toLowerCase().split(/\W+/);
        const hits = words.filter((w) => title.some((t) => t.startsWith(w))).length;
        return (c.noEffect ? 100 : 0) - hits * 10 - (COMMON.includes(c.name) ? 1 : 0);
      };
      return [...searchCommands(q)].map((c, i) => ({ c, i, r: rank(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
    }
    if (cat === "Common") return COMMON.map((n) => searchCommands(n)[0]).filter(Boolean);
    return commandsIn(cat);
  }, [q, cat]);
  useEffect(() => setAt(0), [q, cat]);
  const pick = (c: CommandInfo | undefined) => c && onPick(c.name);
  return (
    <div className="sv-palette" ref={box} role="dialog" aria-label="Add a step">
      <div className="sv-palette-head">
        <input
          ref={input}
          className="sv-palette-search"
          placeholder="What should happen? (give, say, battle, flag…)"
          aria-label="Search steps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(list.length - 1, i + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
            else if (e.key === "Enter") (e.preventDefault(), pick(list[at]));
            else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onClose());
          }}
        />
        <span className="muted small">Adds {where}.</span>
      </div>
      {!q.trim() && (
        <div className="sv-cats" role="tablist" aria-label="Categories">
          {(["Common", ...CATEGORIES] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={cat === c} className={`ghost small${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <ul className="sv-palette-list" role="listbox" aria-label="Steps">
        {list.length === 0 && <li className="muted">Nothing matches “{q}”.</li>}
        {list.map((c, i) => (
          <li
            key={c.name}
            role="option"
            aria-selected={i === at}
            className={i === at ? "at" : undefined}
            onMouseEnter={() => setAt(i)}
            onMouseDown={(e) => (e.preventDefault(), pick(c))}
            ref={i === at ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
          >
            <span className="sv-p-title">
              {c.title}
              {c.noEffect && <span className="sv-tag">no effect</span>}
            </span>
            <span className="sv-p-help muted small">{c.help}</span>
            <span className="sv-p-cat muted small">{c.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
