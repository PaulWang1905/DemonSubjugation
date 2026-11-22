// The workspace's sidebar: the project's resources grouped by what an author
// thinks about (Story, World, Characters & monsters, Items & magic, Art,
// Advanced), each group collapsible with its count and a "+" that makes the
// right new thing. A single click opens a preview tab, a double click keeps it.
import { useEffect, useMemo, useRef, useState } from "react";
import { filterLabel, resourceName } from "../format/decode";
import type { LibArchive } from "../format/lib";
import { CREATE_OPTIONS } from "./create";
import { hasThumb, Thumb } from "./Thumb";
import { WIZARDS } from "./Wizards";
import { AddMenu } from "./AddMenu";
import { entryTitle, groupEntries, groupOf, keyOf, kindLabel, parseKey, type GroupId } from "./workspace";
import type { LibEntry } from "../format/lib";
import { chapterPlaces, ownScriptName, scriptAbout } from "../format/naming";
import type { ProjectNotes } from "../format/notes";
import type { WorldIndex } from "../format/world";
import "./scriptNames.css";

interface Props {
  archive: LibArchive;
  /** The resource of the active tab. */
  active: string | null;
  /** Preview (single click) or keep (double click) a resource. */
  onOpen: (key: string, pin: boolean) => void;
  onCreate: (what: string) => void;
  /** Scripts with text not applied yet. */
  dirty?: ReadonlySet<string>;
  /** The worst problem of each resource. */
  marks?: ReadonlyMap<string, "error" | "warning">;
  /** Names for resources the game stores without one (the author's, else from what uses them; format/naming.ts). */
  labels?: ReadonlyMap<string, string>;
  /** The world index: the scripts' chapters and what each is for (tooltips). */
  world?: WorldIndex | null;
  notes?: ProjectNotes;
  /** The groups shown open. */
  open: ReadonlySet<GroupId>;
  onToggle: (g: GroupId, open: boolean) => void;
}

/**
 * A resource's name in the list: the author's or one from what uses it
 * ("Old Woman (walk)"), else its own; a resource without any shows its kind
 * (its number is shown beside it anyway).
 */
export function sideLabel(e: LibEntry, labels?: ReadonlyMap<string, string>): string {
  const named = labels?.get(keyOf(e));
  if (named) return named;
  if (e.resType !== 1 && e.resType !== 5 && resourceName(e.resType, e.type, e.data).trim()) return entryTitle(e);
  if (e.resType === 1) return entryTitle(e);
  const k = kindLabel(e);
  return `${k[0].toUpperCase()}${k.slice(1)}`;
}

/**
 * A script shown with what it is for ("三清宫 · 游戏开始"): the part that tells
 * it apart, and its own name (shown quieter: other scripts share it).
 */
export function labelParts(e: LibEntry, label: string): [string, string] {
  if (e.resType !== 1) return [label, ""];
  const own = ownScriptName(e);
  const tail = ` · ${own}`;
  return own && label !== own && label.endsWith(tail) ? [label.slice(0, -tail.length), tail] : [label, ""];
}

export function Sidebar({ archive, active, onOpen, onCreate, dirty, marks, labels, world, notes, open, onToggle }: Props) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const chapters = useMemo(() => (world ? chapterPlaces(world) : undefined), [world]);
  const groups = useMemo(
    () => groupEntries(archive.entries, words.length ? (e) => words.every((w) => `${filterLabel(e)} ${entryTitle(e).toLowerCase()} ${sideLabel(e, labels).toLowerCase()}`.includes(w)) : undefined, chapters),
    [archive, archive.entries, q, labels, chapters],
  );
  const list = useRef<HTMLElement>(null);

  // reveal the active resource: open its group, scroll it into view
  const activeGroup = active ? groupOf(parseKey(active) ?? { resType: 0, type: 0, index: 0 }) : null;
  useEffect(() => {
    if (!active || !activeGroup) return;
    if (!open.has(activeGroup)) onToggle(activeGroup, true);
    requestAnimationFrame(() => list.current?.querySelector(`[data-key="${active}"]`)?.scrollIntoView({ block: "nearest" }));
  }, [active]);

  const filtering = words.length > 0;
  const shown = filtering ? groups.filter((g) => g.count) : groups;
  return (
    <nav className="res-list e-side" aria-label="Resources" ref={list}>
      <input
        id="res-filter"
        type="search"
        placeholder="Filter (Ctrl+K)…"
        title="Filter by number, name or kind (e.g. monster, npc, tileset); Enter opens the first, Esc clears"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQ("");
          if (e.key === "Enter") {
            const first = shown.find((g) => g.count)?.sections[0]?.entries[0];
            if (first) onOpen(keyOf(first), true);
          }
        }}
      />
      {filtering && !shown.length && <p className="muted small res-none">Nothing matches “{q}”.</p>}
      {shown.map((g) => {
        const isOpen = filtering || open.has(g.id);
        const make = CREATE_OPTIONS.filter((o) => o.group === g.id);
        // (the wizards first: they ask what matters and place what they make)
        const guided = WIZARDS.filter((w) => w.group === g.id);
        const headId = `side-${g.id}`;
        return (
          <div key={g.id} className="group" data-group={g.id}>
            <div className="group-row">
              <button id={headId} className="ghost group-head" onClick={() => onToggle(g.id, !open.has(g.id))} aria-expanded={isOpen} title={g.blurb}>
                <span className="chev" aria-hidden="true">
                  {isOpen ? "▾" : "▸"}
                </span>
                {g.label} <span className="muted count">{g.count}</span>
              </button>
              {make.length === 1 && !guided.length ? (
                <button className="ghost group-add" onClick={() => onCreate(make[0].what)} title={`New ${make[0].label.toLowerCase()}`} aria-label={`New ${make[0].label.toLowerCase()}`}>
                  +
                </button>
              ) : (
                <AddMenu group={g.label} guided={guided} blank={make} onPick={onCreate} />
              )}
            </div>
            {isOpen && g.count === 0 && (
              <>
                <p className="muted small group-empty">None yet.</p>
                <button className="ghost group-empty-add" onClick={() => onCreate((guided[0] ?? make[0]).what)}>
                  + New {(guided[0] ?? make[0]).label.toLowerCase()}
                </button>
              </>
            )}
            {isOpen &&
              g.sections.map((s) => (
                <div key={s.id} className="section" role="group" aria-label={s.label}>
                  {g.sections.length > 1 && (
                    <div className="section-head">
                      {s.label} <span className="count">{s.entries.length}</span>
                    </div>
                  )}
                  <ul>
                    {s.entries.map((e) => {
                      const k = keyOf(e);
                      const mark = marks?.get(k);
                      const start = k === "1-1-1";
                      const label = sideLabel(e, labels);
                      const [main, quiet] = labelParts(e, label);
                      const about = e.resType === 1 && world ? scriptAbout(world, k, notes) : "";
                      return (
                        <li key={k}>
                          <button
                            className={`item ${active === k ? "sel" : ""}`}
                            data-key={k}
                            aria-current={active === k ? "page" : undefined}
                            onClick={(ev) => onOpen(k, ev.detail === 0)}
                            onDoubleClick={() => onOpen(k, true)}
                          >
                            {hasThumb(e.resType) && (
                              <span className="thumb-box">
                                <Thumb archive={archive} entry={e} />
                              </span>
                            )}
                            <span className="label" title={`${label} (${kindLabel(e)} ${e.type}-${e.index})${about ? `\n${about}` : ""}`}>
                              {main}
                              {quiet && <span className="sn-own">{quiet}</span>}
                            </span>
                            {start && (
                              <span className="badge" title="The game starts with this script">
                                start
                              </span>
                            )}
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
                            <span className="id">
                              {e.type}-{e.index}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        );
      })}
    </nav>
  );
}
