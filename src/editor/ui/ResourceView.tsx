// One resource in a tab: its header (kind, number, name, the switch between
// its views, number / duplicate / delete) and the view picked from the
// registry (views.tsx).
import { Component, useContext, type ReactNode } from "react";
import { subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { useRenumber, type RenumberActions } from "./RenumberControl";
import { pickView, viewsFor, type EditorServices } from "./views";
import { entryTitle, keyOf, kindLabel } from "./workspace";
import { LabelsContext } from "./names";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  /** The view chosen in this tab (a view id), if any. */
  mode?: string;
  onMode: (mode: string) => void;
  onChange: (data: Uint8Array, source?: string) => void;
  services: EditorServices;
  actions?: RenumberActions & {
    duplicate: () => void;
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
  const views = viewsFor(entry);
  const view = pickView(entry, mode);
  // (art has no name in the game: the author's, else one from what uses it)
  const name = useContext(LabelsContext)?.get(keyOf(entry)) ?? entryTitle(entry);
  const kind = kindLabel(entry);
  const renumber = useRenumber(entry, actions, kind);
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
            {renumber.input}
            <button className="ghost" onClick={actions.duplicate}>
              Duplicate
            </button>
            <button className="ghost danger" onClick={actions.remove}>
              Delete
            </button>
          </div>
        )}
      </header>
      {renumber.panel}
      <div id={`${idBase}-body`} role={views.length > 1 ? "tabpanel" : undefined} aria-labelledby={views.length > 1 && view ? `${idBase}-${view.id}` : undefined}>
        <Guard key={view?.id}>{View ? <View archive={archive} entry={entry} onChange={onChange} services={services} /> : <p className="muted">No view for this resource.</p>}</Guard>
      </div>
    </section>
  );
}
