import { useState } from "react";
import { KIND_NAMES, resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";

export const keyOf = (e: { resType: number; type: number; index: number }) => `${e.resType}-${e.type}-${e.index}`;

interface Props {
  archive: LibArchive;
  selected: string | null;
  onSelect: (key: string) => void;
}

export function ResourceList({ archive, selected, onSelect }: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [q, setQ] = useState("");
  const groups = new Map<number, LibEntry[]>();
  for (const e of [...archive.entries].sort((a, b) => a.resType - b.resType || a.type - b.type || a.index - b.index)) {
    const label = `${e.type}-${e.index} ${resourceName(e.resType, e.type, e.data)}`.toLowerCase();
    if (q && !label.includes(q.toLowerCase())) continue;
    if (!groups.has(e.resType)) groups.set(e.resType, []);
    groups.get(e.resType)!.push(e);
  }
  return (
    <nav className="res-list">
      <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      {[...groups.entries()].map(([kind, list]) => (
        <div key={kind} className="group">
          <button className="ghost group-head" onClick={() => setOpen({ ...open, [kind]: !open[kind] })}>
            {open[kind] || q ? "▾" : "▸"} {KIND_NAMES[kind] ?? `Kind ${kind}`} <span className="muted">{list.length}</span>
          </button>
          {(open[kind] || q) && (
            <ul>
              {list.map((e) => {
                const k = keyOf(e);
                const n = resourceName(e.resType, e.type, e.data);
                return (
                  <li key={k}>
                    <button className={`item ${selected === k ? "sel" : ""}`} onClick={() => onSelect(k)} title={subTypeName(e.resType, e.type)}>
                      <span className="id">
                        {e.type}-{e.index}
                      </span>{" "}
                      {n || <span className="muted">{subTypeName(e.resType, e.type)}</span>}
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
