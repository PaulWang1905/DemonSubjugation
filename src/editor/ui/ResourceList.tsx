import { useState } from "react";
import { filterLabel, KIND_NAMES, resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";

export const keyOf = (e: { resType: number; type: number; index: number }) => `${e.resType}-${e.type}-${e.index}`;

interface Props {
  archive: LibArchive;
  selected: string | null;
  onSelect: (key: string) => void;
  /** Scripts with text not applied yet. */
  dirty?: ReadonlySet<string>;
  /** The worst problem of each resource. */
  marks?: ReadonlyMap<string, "error" | "warning">;
}

export function ResourceList({ archive, selected, onSelect, dirty, marks }: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<number, LibEntry[]>();
  for (const e of [...archive.entries].sort((a, b) => a.resType - b.resType || a.type - b.type || a.index - b.index)) {
    if (words.length) {
      const label = filterLabel(e);
      if (!words.every((w) => label.includes(w))) continue;
    }
    if (!groups.has(e.resType)) groups.set(e.resType, []);
    groups.get(e.resType)!.push(e);
  }
  return (
    <nav className="res-list" aria-label="Resources">
      <input
        id="res-filter"
        type="search"
        placeholder="Filter (Ctrl+K)…"
        title="Filter by number, name or kind (e.g. monster, npc, tileset); Esc clears"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQ("");
          // Enter opens the first match
          if (e.key === "Enter") {
            const first = [...groups.values()][0]?.[0];
            if (first) onSelect(keyOf(first));
          }
        }}
      />
      {q && groups.size === 0 && <p className="muted small res-none">Nothing matches “{q}”.</p>}
      {[...groups.entries()].map(([kind, list]) => (
        <div key={kind} className="group">
          <button className="ghost group-head" onClick={() => setOpen({ ...open, [kind]: !open[kind] })} aria-expanded={!!(open[kind] || q)}>
            {open[kind] || q ? "▾" : "▸"} {KIND_NAMES[kind] ?? `Kind ${kind}`} <span className="muted">{list.length}</span>
          </button>
          {(open[kind] || q) && (
            <ul>
              {list.map((e) => {
                const k = keyOf(e);
                const n = resourceName(e.resType, e.type, e.data);
                const mark = marks?.get(k);
                return (
                  <li key={k}>
                    <button className={`item ${selected === k ? "sel" : ""}`} onClick={() => onSelect(k)} title={subTypeName(e.resType, e.type)}>
                      <span className="id">
                        {e.type}-{e.index}
                      </span>{" "}
                      {n || <span className="muted">{subTypeName(e.resType, e.type)}</span>}
                      {dirty?.has(k) && (
                        <span className="dot" title="Changes not applied yet">
                          ●
                        </span>
                      )}
                      {mark && (
                        <span className={`mark ${mark}`} title={mark === "error" ? "Has an error (see Check)" : "Has a warning (see Check)"}>
                          !
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
