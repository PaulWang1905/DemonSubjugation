// Every record of a group side by side (the party, people, monsters, objects,
// items by kind, spells): small cards with the picture, the name and two or
// three key numbers, sorted by any number, filtered by a search. Shown as a
// view of any record ("Compare"), so it needs no place of its own in the
// workspace: the record you came from is marked, a click opens another.
import { useMemo, useState } from "react";
import { resourceName } from "../format/decode";
import type { LibEntry } from "../format/lib";
import { fieldsFor } from "../format/schema";
import { describeKey, resKey } from "../format/world";
import { effectText, fieldLabel, GALLERY_GROUPS, galleryEntries, galleryGroupOf, numberOf, pictureOf, recordKind, roleOf, sortKeys, statLabel, usedBy } from "./cardModel";
import { openKey, Picture, useWorld } from "./CardParts";
import type { ViewProps } from "./views";
import "./cards.css";

const short: Record<string, string> = { maxHP: "HP", maxMP: "MP", attack: "Atk", defend: "Def", speed: "Spd", level: "Lv", buy: "Price", cost: "MP", hp: "HP", mp: "MP", pct: "%" };

export function GalleryView({ archive, entry, services }: ViewProps) {
  const [groupId, setGroupId] = useState(() => galleryGroupOf(entry)?.id ?? "3-3");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("index");
  const [desc, setDesc] = useState(false);
  const group = GALLERY_GROUPS.find((g) => g.id === groupId) ?? GALLERY_GROUPS[0];
  const all = useMemo(() => archive.entries.filter((e) => group.match(e) && fieldsFor(e.resType, e.type)), [archive, archive.entries, group, services.version]);
  const keys = useMemo(() => sortKeys(all), [all]);
  const list = useMemo(() => galleryEntries(archive, group, q, sort, desc, services.notes), [archive, archive.entries, group, q, sort, desc, services.notes, services.version]);
  const world = useWorld(archive, services);
  const here = resKey(entry.resType, entry.type, entry.index);
  // the groups that have records (and the one shown)
  const groups = GALLERY_GROUPS.filter((g) => g.id === groupId || archive.entries.some((e) => g.match(e)));
  const max = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) for (const k of group.shown) m.set(k, Math.max(m.get(k) ?? 0, Math.abs(numberOf(e, k) ?? 0)));
    return m;
  }, [all, group]);

  const placesOf = (e: LibEntry) => {
    const k = resKey(e.resType, e.type, e.index);
    const ps = world.placements.filter((p) => p.resource === k);
    const maps = [...new Set(ps.map((p) => (p.map ? world.maps.get(p.map)?.name || p.map : "no map")))];
    return ps.length ? `On ${maps.join(", ")}` : usedBy(world, archive, k, services.notes).length ? "Used, not placed" : "Not used";
  };

  return (
    <div className="gv">
      <div className="gv-bar">
        <label className="field">
          Show
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Which records">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <input type="search" className="gv-search" placeholder="Search by name or number" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="field">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            {keys.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost small" onClick={() => setDesc((d) => !d)} aria-label={desc ? "Highest first (click for lowest first)" : "Lowest first (click for highest first)"} title="Change the order">
          {desc ? "↓ Highest first" : "↑ Lowest first"}
        </button>
        <span className="muted small gv-count" role="status">
          {list.length} of {all.length}
        </span>
      </div>
      {all.length === 0 ? (
        <p className="muted">There are no {group.label.toLowerCase()} yet. Make one with “+” in the sidebar.</p>
      ) : list.length === 0 ? (
        <p className="muted">Nothing matches “{q}”.</p>
      ) : (
        <ul className="gv-grid">
          {list.map((e) => {
            const k = resKey(e.resType, e.type, e.index);
            const name = resourceName(e.resType, e.type, e.data) || describeKey(archive, k);
            const kind = recordKind(e);
            const nums = group.shown.filter((s) => numberOf(e, s) !== undefined);
            const sortField = sort !== "index" && !group.shown.includes(sort) ? fieldsFor(e.resType, e.type)?.find((f) => f.key === sort) : undefined;
            return (
              <li key={k}>
                <button type="button" className={`gv-card${k === here ? " here" : ""}`} onClick={() => openKey(services, k)} aria-current={k === here ? "true" : undefined} title={`Open ${name}`}>
                  <Picture archive={archive} source={pictureOf(archive, e)} box={56} label={name} />
                  <span className="gv-name">{name}</span>
                  <span className="gv-sub muted">
                    {group.id === "6" || group.id === "4" ? roleOf(e) : `${e.type}-${e.index}`}
                  </span>
                  {nums.length > 0 && (
                    <span className="gv-nums">
                      {nums.map((s) => {
                        const n = numberOf(e, s)!;
                        const m = max.get(s) || 1;
                        return (
                          <span key={s} className={`gv-num${s === sort ? " sorted" : ""}`} title={kind ? statLabel(s) : s}>
                            <span className="gv-k">{short[s] ?? statLabel(s)}</span>
                            <span className="gv-v">{n}</span>
                            <span className="gv-bar-v" style={{ width: `${Math.round((Math.abs(n) / m) * 100)}%` }} aria-hidden="true" />
                          </span>
                        );
                      })}
                    </span>
                  )}
                  {sortField && kind && (
                    <span className="gv-sorted small">
                      {fieldLabel(kind, e.type, sortField)}: <b>{numberOf(e, sort)}</b>
                    </span>
                  )}
                  {(kind === "item" || kind === "spell") && <span className="gv-effect small muted">{effectText(archive, e)}</span>}
                  {(kind === "person" || kind === "object") && <span className="gv-effect small muted">{placesOf(e)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
