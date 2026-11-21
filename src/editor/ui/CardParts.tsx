// Pieces of the record cards (CardView.tsx) and the gallery (GalleryView.tsx):
// a record's picture (animated on hover), one field's control, the "used by"
// list and the author's notes.
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage, decodeSrs, resourceName } from "../format/decode";
import type { Frame } from "../format/encode";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { resourceNote, setResourceNote } from "../format/notes";
import { readField, readMagicChain, writeField, type Field } from "../format/schema";
import { buildWorld, parseKey, resKey, type WorldIndex } from "../format/world";
import { checkValue, controlFor, fieldHelp, fieldLabel, recordKind, refValue, spellListNames, userBits, writeRef, type Control, type Issue, type PictureSource, type UsedBy } from "./cardModel";
import { blitFrame, LIGHT } from "./pixels";
import { ResourcePicker } from "./ResourcePicker";
import type { EditorServices } from "./views";
import { viewsFor } from "./views";

// ---------------------------------------------------------------------------
// The world index, shared by every card (rebuilt when the project changes)

let worldCache: { entries: readonly LibEntry[]; version: number; world: WorldIndex } | null = null;

/** The project's world index, with scripts as the author sees them (unapplied text included). */
export function useWorld(archive: LibArchive, services: EditorServices): WorldIndex {
  return useMemo(() => {
    if (worldCache && worldCache.entries === archive.entries && worldCache.version === services.version) return worldCache.world;
    const sources: Record<string, string> = {};
    for (const e of archive.entries) {
      if (e.resType !== 1) continue;
      const k = resKey(1, e.type, e.index);
      const t = services.scriptText(k);
      if (t !== undefined) sources[k] = t;
    }
    let world: WorldIndex;
    try {
      world = buildWorld(archive, sources);
    } catch {
      world = buildWorld(archive, {});
    }
    worldCache = { entries: archive.entries, version: services.version, world };
    return world;
    // (services.scriptText reads the editor's current state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, archive.entries, services.version]);
}

/** Open what a "used by" row or a picker points at, with the view that suits it. */
export function openKey(services: EditorServices, key: string, line?: number): void {
  const r = parseKey(key);
  let mode: string | undefined;
  if (r.resType === 1) mode = viewsFor(r).some((v) => v.id === "script.visual") ? "script.visual" : undefined;
  else if (recordKind(r)) mode = "record.card";
  services.openResource(key, { line, mode });
}

// ---------------------------------------------------------------------------
// Pictures

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The frames of an image resource, or of an animation's pictures (its first frame's picture first). */
function framesOf(archive: LibArchive, key: string): Frame[] {
  const { resType, type, index } = parseKey(key);
  const e = findEntry(archive, resType, type, index);
  if (!e) return [];
  try {
    if (resType === 5) {
      const s = decodeSrs(e.data);
      const order = [...new Set(s.frames.map((f) => f.image))].filter((i) => i < s.images.length);
      return order.map((i) => decodeImage(s.images[i]).frames[0]).filter(Boolean);
    }
    return decodeImage(e.data).frames;
  } catch {
    return [];
  }
}

/**
 * A picture on the game's screen colours, scaled to fit `box` pixels; on
 * hover (or keyboard focus of its parent) it plays `walk`.
 */
export function Picture({ archive, source, box = 96, label, animate = true }: { archive: LibArchive; source: PictureSource | null; box?: number; label: string; animate?: boolean }) {
  const frames = useMemo(() => (source ? framesOf(archive, source.key) : []), [archive, archive.entries, source?.key]);
  const [step, setStep] = useState(-1);
  const ref = useRef<HTMLCanvasElement>(null);
  const walk = source && animate && !reduceMotion() ? source.walk.filter((i) => i < frames.length) : [];
  const shown = frames[step >= 0 && walk.length ? walk[step % walk.length] : (source?.still ?? 0)] ?? frames[0];
  const w = Math.max(1, ...frames.map((f) => f.width));
  const h = Math.max(1, ...frames.map((f) => f.height));
  const scale = Math.max(1, Math.min(4, Math.floor(box / Math.max(w, h))));
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (shown) blitFrame(ctx, shown, Math.floor((w - shown.width) / 2) * scale, (h - shown.height) * scale, scale);
  }, [shown, w, h, scale]);
  useEffect(() => {
    if (step < 0 || walk.length < 2) return;
    const t = window.setTimeout(() => setStep((s) => (s < 0 ? s : s + 1)), 180);
    return () => clearTimeout(t);
  }, [step, walk.length]);
  if (!source || !frames.length)
    return (
      <div className="cv-pic none" style={{ width: box, height: box }} aria-label={`${label}: none`} role="img">
        <span>No picture</span>
      </div>
    );
  return (
    <div
      className="cv-pic"
      style={{ width: box, height: box, background: `rgb(${LIGHT.join(",")})` }}
      role="img"
      aria-label={label}
      title={walk.length > 1 ? `${label} (hover to animate)` : label}
      onMouseEnter={() => walk.length > 1 && setStep(0)}
      onMouseLeave={() => setStep(-1)}
    >
      <canvas ref={ref} width={w * scale} height={h * scale} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One field

interface FieldProps {
  archive: LibArchive;
  entry: { resType: number; type: number; index: number };
  field: Field;
  fields: readonly Field[];
  data: Uint8Array;
  /** Store new bytes (only called when they differ). */
  onWrite: (next: Uint8Array) => void;
  services: EditorServices;
  /** A problem between fields (cross checks). */
  extra?: Issue;
  /** Show it as a big number (the card's top). */
  big?: boolean;
  /** Override the label. */
  label?: string;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A field with its label, its control, what is allowed and what is wrong. */
export function FieldRow(p: FieldProps) {
  const { archive, entry, field: f, fields, data, onWrite } = p;
  const kind = recordKind(entry) ?? "item";
  const control = controlFor(entry, f, fields, data);
  const [error, setError] = useState<string | null>(null);
  if (control.kind === "hidden") return null;
  const id = `cv-${resKey(entry.resType, entry.type, entry.index)}-${f.key}`;
  const issue = checkValue(archive, entry, f, fields, data) ?? p.extra ?? null;
  const label = p.label ?? fieldLabel(kind, entry.type, f);
  const help = fieldHelp(kind, entry.type, f);
  const write = (make: () => Uint8Array): boolean => {
    try {
      const next = make();
      setError(null);
      if (!same(next, data)) onWrite(next);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };
  const helpId = `${id}-help`;
  const ctl = (
    <Ctl {...p} control={control} id={id} label={label} describedBy={helpId} write={write} invalid={!!error || issue?.level === "error"} />
  );
  if (p.big)
    return (
      <div className={`cv-stat${issue || error ? " bad" : ""}`}>
        <label htmlFor={id}>{label}</label>
        {ctl}
        {(error || issue) && (
          <p id={helpId} className={`cv-msg ${error || issue?.level === "error" ? "error" : "warn"}`}>
            {error ?? issue?.text}
          </p>
        )}
      </div>
    );
  const grouped = control.kind === "checks";
  return (
    <div className="cv-row" role={grouped ? "group" : undefined} aria-labelledby={grouped ? `${id}-l` : undefined}>
      {grouped ? (
        <span className="cv-label" id={`${id}-l`}>
          {label}
        </span>
      ) : (
        <label className="cv-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="cv-ctl">{ctl}</div>
      <p id={helpId} className={`cv-help ${error || issue?.level === "error" ? "error" : issue ? "warn" : "muted"}`}>
        {error ?? issue?.text ?? help ?? rangeHelp(control)}
      </p>
    </div>
  );
}

function rangeHelp(c: Control): string | undefined {
  if (c.kind === "number") return `${c.min} to ${c.max}${c.unit ? ` ${c.unit}` : ""}.`;
  if (c.kind === "text") return `Up to ${c.maxBytes} letters (a Chinese character takes 2).`;
  return undefined;
}

function Ctl(p: FieldProps & { control: Control; id: string; label: string; describedBy: string; write: (make: () => Uint8Array) => boolean; invalid: boolean }) {
  const { archive, field: f, data, control: c, id, write, services } = p;
  const v = readField(data, f);
  const aria = { id, "aria-describedby": p.describedBy, "aria-invalid": p.invalid || undefined };
  switch (c.kind) {
    case "text":
      return <TextInput {...aria} value={String(v)} multiline={c.multiline} onCommit={(t) => write(() => writeField(data, f, t))} />;
    case "number":
      return (
        <span className="cv-num">
          <NumberInput {...aria} value={Number(v)} min={c.min} max={c.max} big={p.big} onCommit={(n) => write(() => writeField(data, f, n))} />
          {c.unit && <span className="cv-unit">{c.unit}</span>}
        </span>
      );
    case "select": {
      const n = Number(v);
      const known = c.options.some(([x]) => x === n);
      return (
        <select {...aria} value={n} onChange={(e) => write(() => writeField(data, f, Number(e.target.value)))}>
          {!known && <option value={n}>⚠ {n} (not a choice)</option>}
          {c.options.map(([x, l]) => (
            <option key={x} value={x}>
              {l}
            </option>
          ))}
        </select>
      );
    }
    case "checks": {
      const n = Number(v);
      const bits = f.key === "users" ? userBits(archive) : c.bits;
      return (
        <span className="cv-checks" id={id}>
          {bits.map(([bit, l]) => (
            <label key={bit} className="cv-check">
              <input type="checkbox" checked={(n & bit) !== 0} onChange={(e) => write(() => writeField(data, f, e.target.checked ? n | bit : n & ~bit))} />
              {l}
            </label>
          ))}
        </span>
      );
    }
    case "toggle":
      return <input type="checkbox" {...aria} checked={v === 1} onChange={(e) => write(() => writeField(data, f, e.target.checked ? 1 : 0))} />;
    case "ref": {
      const value = refValue(f, c, data);
      const exists = value && findEntry(archive, c.resType, value.type, value.index);
      return (
        <span className="cv-ref">
          <ResourcePicker archive={archive} resType={c.resType} types={c.types} value={value} allowNone label={p.label} onChange={(nv) => write(() => writeRef(data, f, c, nv))} />
          {exists && (
            <button type="button" className="ghost cv-open" title="Open it" aria-label={`Open ${p.label}`} onClick={() => openKey(services, resKey(c.resType, value!.type, value!.index))}>
              ↗
            </button>
          )}
        </span>
      );
    }
    case "spellList":
      return <SpellListSelect {...p} aria={aria} />;
    default:
      return null;
  }
}

function SpellListSelect(p: FieldProps & { aria: { id: string; "aria-describedby": string }; write: (make: () => Uint8Array) => boolean }) {
  const { archive, field: f, data, write, services } = p;
  const n = Number(readField(data, f));
  const lists = archive.entries.filter((e) => e.resType === 12 && e.type === 1).sort((a, b) => a.index - b.index);
  const known = lists.some((e) => e.index === n);
  const names = spellListNames(archive, n);
  return (
    <span className="cv-spells">
      <span className="cv-ref">
        <select {...p.aria} value={n} onChange={(e) => write(() => writeField(data, f, Number(e.target.value)))}>
          <option value={0}>None</option>
          {!known && n !== 0 && <option value={n}>⚠ Missing list 1-{n}</option>}
          {lists.map((e) => {
            const s = spellListNames(archive, e.index);
            return (
              <option key={e.index} value={e.index}>
                List 1-{e.index}: {s.length ? s.join(", ") : "no spells"}
              </option>
            );
          })}
        </select>
        {known && (
          <button type="button" className="ghost cv-open" title="Open the list" aria-label="Open the spell list" onClick={() => services.openResource(resKey(12, 1, n))}>
            ↗
          </button>
        )}
      </span>
      {names.length > 0 && (
        <span className="cv-spell-names">
          {names.map((s, i) => (
            <span key={i} className="cv-chip">
              {s}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** A text input that stores on blur / Enter. */
function TextInput({ value, multiline, onCommit, ...aria }: { value: string; multiline: boolean; onCommit: (t: string) => boolean; id: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return multiline ? (
    <textarea {...aria} rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input {...aria} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

/** A number input that stores on blur / Enter; a wrong number stays shown with the message. */
function NumberInput({ value, min, max, big, onCommit, ...aria }: { value: number; min: number; max: number; big?: boolean; onCommit: (n: number) => boolean; id: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    if (text.trim() === String(value)) return;
    onCommit(text.trim() === "" ? NaN : Number(text));
  };
  return (
    <input
      {...aria}
      className={big ? "cv-big" : undefined}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(String(value));
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Used by

export function UsedByList({ list, summary, services }: { list: readonly UsedBy[]; summary: string; services: EditorServices }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 12);
  return (
    <section className="cv-used" aria-label="Used by">
      <h3>
        Used by <span className="muted small">{summary}</span>
      </h3>
      {list.length === 0 ? (
        <p className="muted small">Nothing refers to it yet: no script, shop, monster or party member uses it.</p>
      ) : (
        <ul>
          {shown.map((u, i) => (
            <li key={i}>
              <button type="button" className="cv-link" onClick={() => openKey(services, u.open.key, u.open.line)} title={u.open.line ? `Open ${u.from} at line ${u.open.line}` : `Open ${u.from}`}>
                <span className={`cv-tag ${u.group}`}>{u.group === "script" ? `line ${u.open.line}` : u.group}</span>
                <span className="cv-where">{u.title}</span>
                {u.detail && <span className="cv-what">: {u.detail}</span>}
                {u.count > 1 && <span className="muted"> ×{u.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 12 && (
        <button type="button" className="ghost small" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notes

/** The author's notes on a resource (kept with the project, not in the game). */
export function NotesBox({ resourceKey, services }: { resourceKey: string; services: EditorServices }) {
  const stored = resourceNote(services.notes, resourceKey)?.note ?? "";
  const [text, setText] = useState(stored);
  const timer = useRef<number | null>(null);
  const latest = useRef(text);
  latest.current = text;
  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const t = latest.current;
    services.setNotes((n) => ((resourceNote(n, resourceKey)?.note ?? "") === t ? n : setResourceNote(n, resourceKey, { note: t })));
  };
  // (saved when typing pauses, on blur, and when the card closes)
  useEffect(() => () => void (timer.current && save()), []);
  const id = `cv-notes-${resourceKey}`;
  return (
    <section className="cv-notes">
      <label htmlFor={id}>
        <h3>
          Notes <span className="muted small">for you, not in the game</span>
        </h3>
      </label>
      <textarea
        id={id}
        rows={3}
        placeholder="Ideas, where it appears, what to change…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = window.setTimeout(save, 700);
        }}
        onBlur={save}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Party members: what they use by number

export function ByNumber({ archive, index, services }: { archive: LibArchive; index: number; services: EditorServices }) {
  const portrait = findEntry(archive, 11, 1, index);
  const battle = findEntry(archive, 11, 3, index);
  const table = findEntry(archive, 12, 2, index);
  const levels = useMemo(() => {
    if (!table) return null;
    const n = table.data[2] ?? 0;
    const hp = (l: number) => (table.data[4 + l * 20] ?? 0) | ((table.data[5 + l * 20] ?? 0) << 8);
    return { n, first: hp(0), last: hp(Math.max(0, n - 1)) };
  }, [table]);
  const item = (key: string, what: string, has: boolean, body: React.ReactNode) => (
    <li>
      <button type="button" className={`cv-bynum${has ? "" : " missing"}`} onClick={() => has && services.openResource(key)} disabled={!has} title={has ? `Open ${what}` : `${what} is missing`}>
        {body}
        <span>
          <b>{what}</b>
          <span className="muted small">{has ? key.split("-").slice(1).join("-") : "missing"}</span>
        </span>
      </button>
    </li>
  );
  return (
    <section className="cv-group">
      <h3>Used by number</h3>
      <p className="muted small">Party member {index} always uses these; to change them, edit them (or renumber the member).</p>
      <ul className="cv-bynums">
        {item(resKey(11, 1, index), "Portrait", !!portrait, <Picture archive={archive} source={portrait ? { key: resKey(11, 1, index), still: 0, walk: [] } : null} box={48} label="Portrait" />)}
        {item(resKey(11, 3, index), "In battle", !!battle, <Picture archive={archive} source={battle ? { key: resKey(11, 3, index), still: 0, walk: battle ? [0, 1, 2, 3, 4] : [] } : null} box={48} label="Battle sprite" />)}
        {item(
          resKey(12, 2, index),
          "Level table",
          !!table,
          <span className="cv-table-sum" aria-hidden="true">
            {levels ? (
              <>
                {levels.n}
                <small>levels</small>
              </>
            ) : (
              "–"
            )}
          </span>,
        )}
      </ul>
      {levels && levels.n > 0 && (
        <p className="muted small">
          Max HP {levels.first} at level 1, {levels.last} at level {levels.n}.
        </p>
      )}
    </section>
  );
}

/** The spells of a spell list as names (for a card's top). */
export function spellsOf(archive: LibArchive, list: number): { names: string[]; count: number } {
  const e = list ? findEntry(archive, 12, 1, list) : undefined;
  return { names: spellListNames(archive, list), count: e ? readMagicChain(e.data).length : 0 };
}

export const nameOf = (e: LibEntry) => resourceName(e.resType, e.type, e.data);
