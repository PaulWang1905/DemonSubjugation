// Names for story flags and variables: every flag and variable the project's
// scripts use (from the world index), where each is set, read and cleared,
// with a name and a note the author can write. The names live in the
// project's notes (format/notes.ts) and are what the Visual view's sentences
// and pickers show ("If flag gate open is set…"). Shown on the project home.
import { useMemo, useState } from "react";
import type { LibArchive } from "../format/lib";
import { setFlagNote, setVariableNote, type Note, type ProjectNotes } from "../format/notes";
import type { FlagUse, VariableUse, WorldIndex } from "../format/world";
import { projectWorld } from "../format/wizards";
import type { Texts } from "../format/worldEdit";
import "./starter.css";

interface Props {
  archive: LibArchive;
  texts: Texts;
  notes: ProjectNotes;
  setNotes: (update: (prev: ProjectNotes) => ProjectNotes) => void;
  onOpen: (key: string, line?: number) => void;
}

type Use = (FlagUse | VariableUse) & { access: string };

const VERB: Record<string, string> = { set: "set", clear: "cleared", read: "checked", write: "set", modify: "changed" };

/** Where a flag or variable is used, as short links ("set in start, line 12"). */
function Uses({ uses, world, onOpen }: { uses: Use[]; world: WorldIndex; onOpen: Props["onOpen"] }) {
  const by = new Map<string, Use[]>();
  for (const u of uses) by.set(u.access, [...(by.get(u.access) ?? []), u]);
  const name = (k: string) => world.scripts.get(k)?.model.header.desc?.trim() || `script ${k.split("-").slice(1).join("-")}`;
  return (
    <span className="sf-uses small">
      {[...by].map(([access, list]) => (
        <span key={access} className={`sf-use ${access}`}>
          {VERB[access] ?? access}{" "}
          {list.slice(0, 3).map((u, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {u.script ? (
                <button type="button" className="link" onClick={() => onOpen(u.script!, u.line)} title={`Open ${name(u.script)} at line ${u.line}`}>
                  {name(u.script)} {u.line}
                </button>
              ) : (
                <span>{"resource" in u && u.resource ? `by ${u.resource}` : "elsewhere"}</span>
              )}
            </span>
          ))}
          {list.length > 3 && <span className="muted"> +{list.length - 3}</span>}
        </span>
      ))}
    </span>
  );
}

function NoteFields({ label, value, onSave }: { label: string; value: Note | undefined; onSave: (n: Note) => void }) {
  const [name, setName] = useState(value?.name ?? "");
  const [note, setNote] = useState(value?.note ?? "");
  const save = () => {
    if ((value?.name ?? "") !== name.trim() || (value?.note ?? "") !== note) onSave({ name, note });
  };
  return (
    <>
      <input className="sf-name" value={name} placeholder="name it…" aria-label={`Name of ${label}`} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={40} />
      <input className="sf-note" value={note} placeholder="note" aria-label={`Note on ${label}`} onChange={(e) => setNote(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
    </>
  );
}

export function StoryFlags({ archive, texts, notes, setNotes, onOpen }: Props) {
  const [tab, setTab] = useState<"flags" | "variables">("flags");
  const [q, setQ] = useState("");
  const world = useMemo(() => {
    try {
      return projectWorld({ archive, texts });
    } catch {
      return null;
    }
  }, [archive, texts]);
  if (!world) return null;
  const rows = (tab === "flags" ? [...new Set([...world.flags.keys(), ...Object.keys(notes.flags).map(Number)])] : [...new Set([...world.variables.keys(), ...Object.keys(notes.variables).map(Number)])]).sort((a, b) => a - b);
  const words = q.trim().toLowerCase();
  const shown = rows.filter((n) => {
    if (!words) return true;
    const note = (tab === "flags" ? notes.flags : notes.variables)[String(n)];
    return `${n} ${note?.name ?? ""} ${note?.note ?? ""}`.toLowerCase().includes(words);
  });
  const named = rows.filter((n) => (tab === "flags" ? notes.flags : notes.variables)[String(n)]?.name).length;
  return (
    <section className="p-card sf" id="story-flags" aria-labelledby="sf-title">
      <h3 id="sf-title">Story flags and variables</h3>
      <p className="muted small">
        Flags remember what happened (a chest opened, a door unlocked); variables hold small numbers (where the party came from). Give them names: the Visual view shows the names instead of the numbers. Names stay with the project, not in the game.
      </p>
      <div className="row sf-bar">
        <div className="seg" role="tablist" aria-label="Flags or variables">
          <button type="button" role="tab" aria-selected={tab === "flags"} className={tab === "flags" ? "" : "ghost"} onClick={() => setTab("flags")}>
            Flags <span className="count">{world.flags.size}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "variables"} className={tab === "variables" ? "" : "ghost"} onClick={() => setTab("variables")}>
            Variables <span className="count">{world.variables.size}</span>
          </button>
        </div>
        <input type="search" className="sf-filter" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Filter ${tab}`} />
        <span className="muted small">{rows.length ? `${named} of ${rows.length} named` : ""}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small sf-empty">
          {tab === "flags"
            ? "No story flags yet. A chest made with Add chest gets one (so it opens once); in the Visual view, “Set flag” and “If flag is set” use them."
            : "No variables yet. An exit back to a map uses one to know where the party comes from; “Set variable” in the Visual view makes others."}
        </p>
      ) : (
        <ul className="sf-list">
          {shown.map((n) => {
            const key = `${tab}-${n}`;
            const uses = ((tab === "flags" ? world.flags.get(n) : world.variables.get(n)) ?? []) as Use[];
            const note = (tab === "flags" ? notes.flags : notes.variables)[String(n)];
            const label = `${tab === "flags" ? "flag" : "variable"} ${n}`;
            return (
              <li key={key} className="sf-row">
                <span className="sf-num" title={label}>
                  {tab === "flags" ? "flag" : "var"} {n}
                </span>
                <NoteFields
                  key={`${key}:${note?.name ?? ""}:${note?.note ?? ""}`}
                  label={label}
                  value={note}
                  onSave={(v) => setNotes((prev) => (tab === "flags" ? setFlagNote(prev, n, v) : setVariableNote(prev, n, v)))}
                />
                {uses.length ? <Uses uses={uses} world={world} onOpen={onOpen} /> : <span className="muted small">not used by any script</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
