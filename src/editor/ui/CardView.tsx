// A record as a card: party members, people, monsters, chests and objects,
// items and spells. Its picture, its name, its role in words, the key
// numbers big, the rest grouped with plain labels, pickers instead of
// numbers, where it is used, and the author's notes. Every edit goes through
// format/schema.ts (only the field's bytes change); opening a card writes
// nothing.
import { useMemo, useRef, useState } from "react";
import { fieldsFor, readField, type Field } from "../format/schema";
import { resKey } from "../format/world";
import { crossChecks, effectText, galleryGroupOf, pictureOf, recordKind, roleBlurb, roleOf, statLabel, topFields, usedBy, usedBySummary } from "./cardModel";
import { ByNumber, FieldRow, NotesBox, Picture, UsedByList, useWorld } from "./CardParts";
import { CompanionLink, OwnArt, SpellLearners } from "./CardParty";
import { useUndoKeys } from "./undoKeys";
import type { ViewProps } from "./views";
import "./cards.css";

const HISTORY = 100;

export function CardView({ archive, entry, onChange, services }: ViewProps) {
  const [data, setData] = useState(entry.data);
  const past = useRef<Uint8Array[]>([]);
  const future = useRef<Uint8Array[]>([]);
  const [, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const fields = fieldsFor(entry.resType, entry.type) ?? [];
  const kind = recordKind(entry)!;
  const key = resKey(entry.resType, entry.type, entry.index);
  // the record as it is now (the archive's entry is replaced by every change)
  const cur = useMemo(() => ({ ...entry, data }), [entry, data]);
  const world = useWorld(archive, services);
  const used = useMemo(() => usedBy(world, archive, key, services.notes), [world, archive, key, services.notes]);

  const write = (next: Uint8Array) => {
    past.current = [...past.current.slice(-HISTORY + 1), data];
    future.current = [];
    setData(next);
    onChange(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(data);
    setData(prev);
    onChange(prev);
    setTick((t) => t + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(data);
    setData(next);
    onChange(next);
    setTick((t) => t + 1);
  };
  useUndoKeys(root, undo, redo);

  const top = topFields(entry);
  const byKey = (k: string) => fields.find((f) => f.key === k);
  const cross = crossChecks(archive, cur);
  const nameField = byKey("name");
  const picField = byKey(top.picture);
  const shownTop = new Set(["name", top.picture, ...top.stats, ...(kind === "item" && entry.type <= 7 ? ["users"] : [])]);
  const groups: [string, Field[]][] = [];
  for (const f of fields) {
    if (shownTop.has(f.key)) continue;
    const g = f.group ?? (kind === "item" || kind === "spell" ? "About" : kind === "party" ? "Progress" : "On the map");
    const at = groups.find((x) => x[0] === g);
    if (at) at[1].push(f);
    else groups.push([g, [f]]);
  }
  // (the ungrouped fields first)
  groups.sort((a, b) => Number(!!a[1][0].group) - Number(!!b[1][0].group));

  const row = (f: Field, extra?: Partial<Parameters<typeof FieldRow>[0]>) => (
    <FieldRow key={f.key} archive={archive} entry={entry} field={f} fields={fields} data={data} onWrite={write} services={services} extra={cross.get(f.key)} {...extra} />
  );
  const gallery = galleryGroupOf(entry);
  const name = nameField ? String(readField(data, nameField)) : "";

  return (
    <div className={`cv cv-${kind}`} ref={root}>
      <div className="cv-card">
        <div className="cv-head">
          <Picture archive={archive} source={pictureOf(archive, cur)} box={kind === "item" ? 72 : 112} label={`${name || roleOf(entry)}: picture`} />
          <div className="cv-id">
            <p className="cv-role">
              {roleOf(entry)} <span className="muted">· {entry.type}-{entry.index}</span>
            </p>
            {nameField && row(nameField, { big: false, label: "Name" })}
            <p className="muted small cv-blurb">{roleBlurb(entry)}</p>
            <CompanionLink archive={archive} entry={entry} world={world} services={services} />
            {kind === "party" && <OwnArt archive={archive} index={entry.index} services={services} />}
            {(kind === "item" || kind === "spell") && (
              <p className="cv-effect">
                <span className="muted small">Effect</span> {effectText(archive, cur)}
              </p>
            )}
          </div>
          <div className="cv-tools">
            <button type="button" className="ghost small" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button type="button" className="ghost small" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)">
              Redo
            </button>
            {gallery && (
              <button type="button" className="ghost small" onClick={() => services.openResource(key, { mode: "record.gallery" })} title={`See every one of the ${gallery.label.toLowerCase()} side by side`}>
                Compare {gallery.label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
        {picField && <div className="cv-picrow">{row(picField)}</div>}
        {top.stats.length > 0 && <div className="cv-stats">{top.stats.map((k) => byKey(k)).filter((f): f is Field => !!f).map((f) => row(f, { big: true, label: statLabel(f.key) }))}</div>}
        {kind === "item" && entry.type <= 7 && byKey("users") && <div className="cv-users">{row(byKey("users")!, { label: "Who can use it" })}</div>}
      </div>

      <div className="cv-cols">
        <div className="cv-main">
          {groups.map(([g, list]) => (
            <section key={g} className="cv-group">
              <h3>{g}</h3>
              {list.map((f) => row(f))}
            </section>
          ))}
          {kind === "party" && <ByNumber archive={archive} index={entry.index} services={services} />}
          {kind === "spell" && <SpellLearners archive={archive} entry={entry} services={services} />}
        </div>
        <div className="cv-side">
          <UsedByList list={used} summary={usedBySummary(used)} services={services} />
          <NotesBox resourceKey={key} services={services} />
        </div>
      </div>
    </div>
  );
}
