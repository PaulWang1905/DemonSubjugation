// One resource in a tab: its header (kind, number, name, the switch between
// its views, number / duplicate / delete) and the view picked from the
// registry (views.tsx).
import { Component, useState, type ReactNode } from "react";
import { subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { pickView, viewsFor, type EditorServices } from "./views";
import { entryTitle, kindLabel } from "./workspace";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  /** The view chosen in this tab (a view id), if any. */
  mode?: string;
  onMode: (mode: string) => void;
  onChange: (data: Uint8Array, source?: string) => void;
  services: EditorServices;
  actions?: {
    duplicate: () => void;
    /** Returns an error message, or null when done. */
    renumber: (index: number) => string | null;
    remove: () => void;
  };
}

/** Keeps a view's crash inside its tab. */
class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p className="error">Cannot show this resource: {this.state.error.message}</p> : this.props.children;
  }
}

export function ResourceView({ archive, entry, mode, onMode, onChange, services, actions }: Props) {
  const [numError, setNumError] = useState<string | null>(null);
  const views = viewsFor(entry);
  const view = pickView(entry, mode);
  const name = entryTitle(entry);
  const kind = kindLabel(entry);
  const idBase = `view-${services.key}`;
  const View = view?.component;
  return (
    <section className="res-view">
      <header>
        <h2>
          <span className="res-kind">
            {kind} {entry.type}-{entry.index}
          </span>{" "}
          <span className="name" title={subTypeName(entry.resType, entry.type)}>
            {name}
          </span>
        </h2>
        {views.length > 1 && (
          <div className="view-switch" role="tablist" aria-label="View">
            {views.map((v) => (
              <button
                key={v.id}
                id={`${idBase}-${v.id}`}
                role="tab"
                type="button"
                aria-selected={v === view}
                aria-controls={`${idBase}-body`}
                tabIndex={v === view ? 0 : -1}
                className={v === view ? "on" : undefined}
                title={v.title}
                onClick={() => onMode(v.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const at = views.indexOf(v) + (e.key === "ArrowRight" ? 1 : -1);
                  const next = views[(at + views.length) % views.length];
                  onMode(next.id);
                  requestAnimationFrame(() => document.getElementById(`${idBase}-${next.id}`)?.focus());
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        {actions && (
          <div className="res-actions">
            <label className="field" title="Other resources refer to this one by number; they are not updated">
              No.
              <input
                type="number"
                min={1}
                max={255}
                defaultValue={entry.index}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  const err = actions.renumber(Number(e.target.value));
                  setNumError(err);
                  if (err) e.target.value = String(entry.index);
                }}
                aria-label="Resource number"
              />
            </label>
            <button className="ghost" onClick={actions.duplicate}>
              Duplicate
            </button>
            <button className="ghost danger" onClick={actions.remove}>
              Delete
            </button>
          </div>
        )}
      </header>
      {numError && <p className="error small">{numError}</p>}
      <div id={`${idBase}-body`} role={views.length > 1 ? "tabpanel" : undefined} aria-labelledby={views.length > 1 && view ? `${idBase}-${view.id}` : undefined}>
        <Guard key={view?.id}>{View ? <View archive={archive} entry={entry} onChange={onChange} services={services} /> : <p className="muted">No view for this resource.</p>}</Guard>
      </div>
    </section>
  );
}
