// The Visual script view's list of events ("When the game starts",
// "Talking to Wen (#1)", "Stepping on tile event 3 (map BELLHAVEN 13,4)"),
// with "Add event": talking to someone the script places or a free number,
// or a free map tile event.
import { useState } from "react";
import { freeId, freeMapEvent, type ScriptModel } from "../format/scriptModel";
import type { EventEntry } from "./scriptVisualLogic";

interface Props {
  entries: EventEntry[];
  current: string | null;
  onSelect: (key: string) => void;
  model: ScriptModel;
  /** People and objects this script places: id → name and kind. */
  placed: Map<number, { name: string; kind: "person" | "object" }>;
  disabled: boolean;
  onAdd: (a: { kind: "talk"; id: number } | { kind: "tile"; mapEvent: number }) => void;
}

export function EventList({ entries, current, onSelect, model, placed, disabled, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  return (
    <nav className="sv-events" aria-label="Events of this script">
      <h3>Events</h3>
      <ul>
        {entries.map((e) => (
          <li key={e.key}>
            <button type="button" className={`sv-event${e.key === current ? " on" : ""} k-${e.kind}`} aria-current={e.key === current ? "true" : undefined} onClick={() => onSelect(e.key)} title={e.detail}>
              <span className="sv-event-title">{e.title}</span>
              <span className="sv-event-meta small">
                {e.kind === "raw" ? (
                  <span className="warn-text">{e.detail}</span>
                ) : (
                  <>
                    {e.steps} step{e.steps === 1 ? "" : "s"}
                    {e.problems > 0 && <span className="sv-badge">⚠ {e.problems}</span>}
                    {e.detail && <span className="muted"> · {e.detail}</span>}
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {entries.length <= 1 && !adding && (
        <p className="muted small sv-events-empty">
          {entries.length ? "Only the start so far." : "No events yet."} Events run when the player talks to someone this script places or steps on a map tile: add one here, or put someone on a map with its World view (Add person).
        </p>
      )}
      {adding ? (
        <AddEvent model={model} placed={placed} onCancel={() => setAdding(false)} onAdd={(a) => (setAdding(false), onAdd(a))} />
      ) : (
        <button type="button" className="ghost sv-add-event" disabled={disabled} onClick={() => setAdding(true)}>
          + Add event
        </button>
      )}
    </nav>
  );
}

function AddEvent({ model, placed, onAdd, onCancel }: { model: ScriptModel; placed: Props["placed"]; onAdd: Props["onAdd"]; onCancel: () => void }) {
  const has = new Set(model.events.map((e) => e.number));
  const waiting = [...placed.entries()].filter(([id]) => !has.has(id)).sort((a, b) => a[0] - b[0]);
  const free = freeId(model);
  const [kind, setKind] = useState<"talk" | "tile">("talk");
  const [who, setWho] = useState<string>(waiting.length ? String(waiting[0][0]) : free ? "free" : "");
  const [freeNo, setFreeNo] = useState(String(free ?? ""));
  let tile = 1;
  try {
    tile = freeMapEvent(model);
  } catch {
    tile = 0;
  }
  const [tileNo, setTileNo] = useState(String(tile));
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (kind === "talk") {
      const id = who === "free" ? Number(freeNo) : Number(who);
      if (!Number.isInteger(id) || id < 1 || id > 40) return setErr("A person or object number is 1-40.");
      if (has.has(id)) return setErr(`#${id} already has an event.`);
      onAdd({ kind: "talk", id });
    } else {
      const m = Number(tileNo);
      if (!Number.isInteger(m) || m < 1 || m > 215) return setErr("A map event number is 1-215.");
      if (has.has(40 + m)) return setErr(`Map event ${m} already has an event.`);
      onAdd({ kind: "tile", mapEvent: m });
    }
  };
  return (
    <form
      className="sv-add-form"
      aria-label="Add an event"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}
    >
      <fieldset>
        <legend>What starts it?</legend>
        <label className="sv-radio">
          <input type="radio" name="sv-kind" checked={kind === "talk"} onChange={() => setKind("talk")} />
          Talking to a person or object
        </label>
        {kind === "talk" && (
          <div className="sv-sub">
            <select aria-label="Who" value={who} onChange={(e) => setWho(e.target.value)} autoFocus>
              {waiting.map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name} (#{id}, placed by this script)
                </option>
              ))}
              <option value="free">Another number…</option>
            </select>
            {who === "free" && (
              <label className="small">
                Number{" "}
                <input className="sv-num" value={freeNo} onChange={(e) => setFreeNo(e.target.value)} inputMode="numeric" aria-label="Person or object number (1-40)" style={{ width: "5ch" }} />
                <span className="muted"> (place someone as this number to talk to them)</span>
              </label>
            )}
            {!waiting.length && <p className="muted small">Everyone this script places already has an event.</p>}
          </div>
        )}
        <label className="sv-radio">
          <input type="radio" name="sv-kind" checked={kind === "tile"} onChange={() => setKind("tile")} />
          Stepping on a map tile
        </label>
        {kind === "tile" && (
          <div className="sv-sub">
            <label className="small">
              Map event{" "}
              <input className="sv-num" value={tileNo} onChange={(e) => setTileNo(e.target.value)} inputMode="numeric" aria-label="Map event number" style={{ width: "5ch" }} />
            </label>
            <p className="muted small">Then paint this number on the map's cells (the map's Tiles view, Event tool).</p>
          </div>
        )}
      </fieldset>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button type="submit">Add</button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
