// The open tabs: the project home first, then resources. A preview tab
// (opened with a single click) is shown in italics and is replaced by the
// next preview; a dot marks a script with text not applied yet. Each tab
// shows its kind as an icon and its name in full while there is room; when
// there is not, the long ones shrink to the same width, never below about
// ten letters (the full name and kind are in the tooltip), and past that the
// strip scrolls: arrows at its ends, and "⌄ N more" at its end opens a menu
// of every open tab with its full name and kind (arrow keys, Home/End and
// typing a name's first letters move through it; Enter shows the tab).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./authoring.css";
import "./leftovers.css";
import "./layout.css";
import { KindIcon } from "./KindIcon";
import { hiddenTabs, moreLabel, tabCap } from "./tabFit";
import { itemKeys, usePopupMenu } from "./popupMenu";
import type { LibArchive } from "../format/lib";
import { entryOf, entryTitle, HOME_TAB, kindLabel, type Tab } from "./workspace";

interface Props {
  archive: LibArchive;
  projectName: string;
  tabs: Tab[];
  active: string;
  dirty: ReadonlySet<string>;
  marks: ReadonlyMap<string, "error" | "warning">;
  /** Names for resources the game stores without one (format/naming.ts). */
  labels?: ReadonlyMap<string, string>;
  onActivate: (key: string) => void;
  onPin: (key: string) => void;
  onClose: (key: string) => void;
}

/** The names more than one of `names` has. */
export function twinNames(names: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const twins = new Set<string>();
  for (const n of names) (seen.has(n) ? twins : seen).add(n);
  return twins;
}

export const tabId = (key: string) => `tab-${key}`;
export const panelId = (key: string) => `panel-${key}`;

export function TabStrip({ archive, projectName, tabs, active, dirty, marks, labels, onActivate, onPin, onClose }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector(`[aria-selected="true"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);
  // arrows at the ends when the tabs do not fit (they also shrink first)
  const [ends, setEnds] = useState({ left: false, right: false });
  // the tabs out of sight (scrolled past or cut), counted on "⌄ N more"
  const [hidden, setHidden] = useState<string[]>([]);
  const showEnds = () => {
    const el = strip.current;
    if (!el) return;
    setEnds({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    const box = el.getBoundingClientRect();
    const items = [...el.querySelectorAll<HTMLElement>(".e-tab")];
    const out = hiddenTabs(
      items.map((t) => t.getBoundingClientRect()),
      { left: box.left, right: box.right },
    ).map((i) => items[i].dataset.key ?? "");
    setHidden((h) => (h.join("|") === out.join("|") ? h : out));
  };
  // tabs as wide as their names while they fit; past that the widest shrink to one width (tabFit.ts)
  // (when they do not all fit, the project home shows only its icon first)
  const [{ cap, tight }, setFit] = useState<{ cap: number | null; tight: boolean }>({ cap: null, tight: false });
  const shown = tabs.map((t) => `${t.key}:${labels?.get(t.key) ?? ""}:${marks.get(t.key) ?? ""}:${dirty.has(t.key)}`).join("|");
  const nameOf = (key: string) => {
    const e = entryOf(archive, key);
    return e ? (labels?.get(key) ?? entryTitle(e)) : key;
  };
  const twins = twinNames(tabs.filter((t) => t.key !== HOME_TAB).map((t) => nameOf(t.key)));
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const fit = () => {
      const items = [...el.querySelectorAll<HTMLElement>(".e-tab:not(.home)")];
      const home = el.querySelector<HTMLElement>(".e-tab.home");
      const natural = items.map((t) => {
        const l = t.querySelector<HTMLElement>(".e-tab-label");
        return t.offsetWidth + (l ? l.scrollWidth - l.clientWidth : 0);
      });
      const homeLabel = home?.querySelector<HTMLElement>(".e-tab-label");
      const labelW = homeLabel ? homeLabel.scrollWidth + 5 : 0;
      const compact = (home?.offsetWidth ?? 0) - (el.classList.contains("tight") ? 0 : labelW);
      const sum = natural.reduce((s, w) => s + w, 0);
      if (sum <= el.clientWidth - compact - labelW) setFit((f) => (f.cap === null && !f.tight ? f : { cap: null, tight: false }));
      else {
        const c = tabCap(natural, el.clientWidth - compact - 1);
        setFit((f) => (f.cap === c && f.tight ? f : { cap: c, tight: true }));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown, archive, active]);
  useLayoutEffect(showEnds, [cap, tight, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const update = showEnds;
    update();
    el.addEventListener("scroll", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrollBy = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * Math.max(160, (strip.current?.clientWidth ?? 400) * 0.6), behavior: "smooth" });

  const focusTab = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onActivate(t.key);
    requestAnimationFrame(() => document.getElementById(tabId(t.key))?.focus());
  };

  return (
    <div className="e-tabs-wrap">
      {ends.left && (
        <button type="button" className="e-tabs-arrow left" tabIndex={-1} aria-label="Show the tabs to the left" onClick={() => scrollBy(-1)}>
          ‹
        </button>
      )}
    <div className={`e-tabs${tight ? " tight" : ""}`} role="tablist" aria-label="Open resources" ref={strip} style={cap ? { ["--e-tab-cap" as string]: `${cap}px` } : undefined}>
      {tabs.map((t, i) => {
        const home = t.key === HOME_TAB;
        const e = home ? undefined : entryOf(archive, t.key);
        const named = home ? "Project" : e ? nameOf(t.key) : t.key;
        // (two open tabs with one name, as scripts of one map can be, show their numbers)
        const label = e && twins.has(named) ? `${named} ${e.type}-${e.index}` : named;
        const kind = home ? "home" : e ? kindLabel(e) : "";
        const selected = t.key === active;
        const isDirty = dirty.has(t.key);
        const mark = marks.get(t.key);
        return (
          <div key={t.key} data-key={t.key} className={`e-tab ${selected ? "on" : ""} ${t.pinned ? "" : "preview"} ${home ? "home" : ""}`} onAuxClick={(ev) => ev.button === 1 && !home && onClose(t.key)}>
            <button
              id={tabId(t.key)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.key)}
              tabIndex={selected ? 0 : -1}
              className="e-tab-main"
              title={home ? `${projectName}: the project home` : `${label} (${kind} ${t.key.split("-").slice(1).join("-")})${t.pinned ? "" : " · preview: double-click to keep it open"}${isDirty ? " · not applied yet" : ""}`}
              aria-label={home ? "Project home" : `${label}, ${kind}${mark ? (mark === "error" ? ", has an error" : ", has a warning") : ""}${isDirty ? ", not applied yet" : ""}`}
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
                e && <KindIcon of={e} className="e-tab-icon" />
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
      {ends.right && (
        <button type="button" className="e-tabs-arrow right" tabIndex={-1} aria-label="Show the tabs to the right" onClick={() => scrollBy(1)}>
          ›
        </button>
      )}
      {hidden.length > 0 && (
        <TabsMenu
          tabs={tabs.map((t) => {
            const home = t.key === HOME_TAB;
            const e = home ? undefined : entryOf(archive, t.key);
            return {
              key: t.key,
              name: home ? "Project" : e ? nameOf(t.key) : t.key,
              kind: home ? `the project home · ${projectName}` : e ? `${kindLabel(e)} ${e.type}-${e.index}` : "",
              icon: home ? null : (e ?? null),
              dirty: dirty.has(t.key),
              mark: marks.get(t.key),
              hidden: hidden.includes(t.key),
            };
          })}
          hiddenCount={hidden.length}
          active={active}
          onPick={(key) => {
            onActivate(key);
            requestAnimationFrame(() => document.getElementById(tabId(key))?.focus());
          }}
        />
      )}
    </div>
  );
}

interface MenuTab {
  key: string;
  name: string;
  /** Its kind and number ("map 1-1"), or what the home is. */
  kind: string;
  icon: { resType: number; type: number } | null;
  dirty: boolean;
  mark?: "error" | "warning";
  /** Out of sight in the strip. */
  hidden: boolean;
}

/** "⌄ N more": every open tab in a menu, with its full name and kind. */
function TabsMenu({ tabs, hiddenCount, active, onPick }: { tabs: MenuTab[]; hiddenCount: number; active: string; onPick: (key: string) => void }) {
  const m = usePopupMenu();
  const label = moreLabel(hiddenCount);
  const pick = (key: string) => {
    m.close(false);
    onPick(key);
  };
  return (
    <>
      <button
        ref={m.button}
        type="button"
        className="e-tabs-more"
        aria-haspopup="menu"
        aria-expanded={m.open}
        aria-controls={m.open ? "e-tabs-menu" : undefined}
        aria-label={`${label} tabs: all ${tabs.length} open tabs`}
        title={`All ${tabs.length} open tabs`}
        onClick={m.toggle}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !m.open) (e.preventDefault(), m.toggle());
        }}
      >
        <svg className="e-tabs-more-chev" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{label}</span>
      </button>
      {m.open && (
        <div ref={m.menu} id="e-tabs-menu" className="e-tabs-menu" role="menu" aria-label={`Open tabs (${tabs.length})`} style={m.style} onKeyDown={m.onKeyDown}>
          {tabs.map((t) => (
            <div
              key={t.key}
              role="menuitemradio"
              aria-checked={t.key === active}
              tabIndex={-1}
              data-name={t.name}
              className={`e-tabs-item${t.hidden ? " out" : ""}`}
              onClick={() => pick(t.key)}
              onKeyDown={itemKeys(() => pick(t.key))}
            >
              <span className="e-tabs-item-icon" aria-hidden="true">
                {t.icon ? <KindIcon of={t.icon} className="e-tab-icon" /> : "⌂"}
              </span>
              <span className="e-tabs-item-name">{t.name}</span>
              <span className="e-tabs-item-kind">{t.kind}</span>
              {(t.mark || t.dirty) && (
                <span className="e-tabs-item-state">
                  {t.mark && (
                    <span className={`mark ${t.mark}`} role="img" aria-label={t.mark === "error" ? "has an error" : "has a warning"}>
                      !
                    </span>
                  )}
                  {t.dirty && (
                    <span className="e-tabs-item-dirty" role="img" aria-label="not applied yet">
                      ●
                    </span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
