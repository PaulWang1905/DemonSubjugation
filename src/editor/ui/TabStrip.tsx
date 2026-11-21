// The open tabs: the project home first, then resources. A preview tab
// (opened with a single click) is shown in italics and is replaced by the
// next preview; a dot marks a script with text not applied yet.
import { useEffect, useRef } from "react";
import type { LibArchive } from "../format/lib";
import { entryOf, entryTitle, HOME_TAB, kindLabel, type Tab } from "./workspace";

interface Props {
  archive: LibArchive;
  projectName: string;
  tabs: Tab[];
  active: string;
  dirty: ReadonlySet<string>;
  marks: ReadonlyMap<string, "error" | "warning">;
  onActivate: (key: string) => void;
  onPin: (key: string) => void;
  onClose: (key: string) => void;
}

export const tabId = (key: string) => `tab-${key}`;
export const panelId = (key: string) => `panel-${key}`;

export function TabStrip({ archive, projectName, tabs, active, dirty, marks, onActivate, onPin, onClose }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector(`[aria-selected="true"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const focusTab = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onActivate(t.key);
    requestAnimationFrame(() => document.getElementById(tabId(t.key))?.focus());
  };

  return (
    <div className="e-tabs" role="tablist" aria-label="Open resources" ref={strip}>
      {tabs.map((t, i) => {
        const home = t.key === HOME_TAB;
        const e = home ? undefined : entryOf(archive, t.key);
        const label = home ? "Project" : e ? entryTitle(e) : t.key;
        const kind = home ? "home" : e ? kindLabel(e) : "";
        const selected = t.key === active;
        const isDirty = dirty.has(t.key);
        const mark = marks.get(t.key);
        return (
          <div key={t.key} className={`e-tab ${selected ? "on" : ""} ${t.pinned ? "" : "preview"} ${home ? "home" : ""}`} onAuxClick={(ev) => ev.button === 1 && !home && onClose(t.key)}>
            <button
              id={tabId(t.key)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.key)}
              tabIndex={selected ? 0 : -1}
              className="e-tab-main"
              title={home ? `${projectName}: the project home` : `${label} (${kind} ${t.key.split("-").slice(1).join("-")})${t.pinned ? "" : " · preview: double-click to keep it open"}${isDirty ? " · not applied yet" : ""}`}
              onClick={() => onActivate(t.key)}
              onDoubleClick={() => onPin(t.key)}
              onKeyDown={(ev) => {
                if (ev.key === "ArrowRight") focusTab(i + 1);
                else if (ev.key === "ArrowLeft") focusTab(i - 1);
                else if (ev.key === "Home") focusTab(0);
                else if (ev.key === "End") focusTab(tabs.length - 1);
                else if (ev.key === "Delete" && !home) onClose(t.key);
                else return;
                ev.preventDefault();
              }}
            >
              {home ? (
                <span className="e-tab-home" aria-hidden="true">
                  ⌂
                </span>
              ) : (
                !label.toLowerCase().startsWith(kind) && <span className="e-tab-kind">{kind}</span>
              )}
              <span className="e-tab-label">{label}</span>
              {mark && (
                <span className={`mark ${mark}`} role="img" aria-label={mark === "error" ? "has an error" : "has a warning"}>
                  !
                </span>
              )}
            </button>
            {!home && (
              <button type="button" className={`e-tab-close ${isDirty ? "dirty" : ""}`} tabIndex={-1} aria-label={`Close ${label}`} title={isDirty ? "Not applied yet (kept when closed) · Close (Ctrl+W)" : "Close (Ctrl+W)"} onClick={() => onClose(t.key)}>
                <span className="x" aria-hidden="true">
                  ×
                </span>
                {isDirty && (
                  <span className="d" aria-hidden="true">
                    ●
                  </span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
