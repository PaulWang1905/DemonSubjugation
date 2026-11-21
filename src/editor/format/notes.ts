// Author notes the engine does not store: names for story flags and
// variables ("gate open", "where the party came from") and a name or note
// per resource. A plain object that survives JSON, kept beside the project
// (storage is the UI's business) and never needed to play.
//
// All helpers are pure: they return a new object and leave the old one alone.

export interface Note {
  /** A short name shown instead of the number ("gate open"). */
  name?: string;
  /** Free text. */
  note?: string;
}

export interface ProjectNotes {
  version: 1;
  /** By story flag number (1-2400). */
  flags: Record<string, Note>;
  /** By variable number (0-239). */
  variables: Record<string, Note>;
  /** By resource key "resType-type-index" ("11-1-3" for portrait 3). */
  resources: Record<string, Note>;
}

export function emptyNotes(): ProjectNotes {
  return { version: 1, flags: {}, variables: {}, resources: {} };
}

type Section = "flags" | "variables" | "resources";

const clean = (n: Note): Note | null => {
  const out: Note = {};
  if (n.name?.trim()) out.name = n.name.trim();
  if (n.note?.trim()) out.note = n.note;
  return out.name || out.note ? out : null;
};

function setIn(notes: ProjectNotes, section: Section, key: string, patch: Note): ProjectNotes {
  const merged = clean({ ...notes[section][key], ...patch });
  const next = { ...notes[section] };
  if (merged) next[key] = merged;
  else delete next[key];
  return { ...notes, [section]: next };
}

/** The author's name for a flag, if any. */
export const flagName = (notes: ProjectNotes | undefined, n: number): string | undefined => notes?.flags[String(n)]?.name;
/** The author's name for a variable, if any. */
export const variableName = (notes: ProjectNotes | undefined, n: number): string | undefined => notes?.variables[String(n)]?.name;
/** The author's note on a resource ("resType-type-index"), if any. */
export const resourceNote = (notes: ProjectNotes | undefined, key: string): Note | undefined => notes?.resources[key];

/** Set (merge) a flag's note; empty name and note remove it. */
export const setFlagNote = (notes: ProjectNotes, n: number, patch: Note): ProjectNotes => setIn(notes, "flags", String(n), patch);
/** Set (merge) a variable's note; empty name and note remove it. */
export const setVariableNote = (notes: ProjectNotes, n: number, patch: Note): ProjectNotes => setIn(notes, "variables", String(n), patch);
/** Set (merge) a resource's note; empty name and note remove it. */
export const setResourceNote = (notes: ProjectNotes, key: string, patch: Note): ProjectNotes => setIn(notes, "resources", key, patch);

/** Move a resource's note to another key (after renumbering); a note already at `to` is replaced. */
export function moveResourceNote(notes: ProjectNotes, from: string, to: string): ProjectNotes {
  if (from === to || !notes.resources[from]) return notes;
  const next = { ...notes.resources };
  next[to] = next[from];
  delete next[from];
  return { ...notes, resources: next };
}

/** Remove a resource's note (the resource was deleted). */
export function dropResourceNote(notes: ProjectNotes, key: string): ProjectNotes {
  if (!notes.resources[key]) return notes;
  const next = { ...notes.resources };
  delete next[key];
  return { ...notes, resources: next };
}

/**
 * Read notes from anything (parsed JSON from storage): unknown or broken
 * parts are dropped, so a damaged sidecar never stops a project opening.
 */
export function readNotes(raw: unknown): ProjectNotes {
  const out = emptyNotes();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const section of ["flags", "variables", "resources"] as const) {
    const s = r[section];
    if (!s || typeof s !== "object") continue;
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const { name, note } = v as Record<string, unknown>;
      const n = clean({ name: typeof name === "string" ? name : undefined, note: typeof note === "string" ? note : undefined });
      if (!n) continue;
      if (section === "resources" ? /^\d+-\d+-\d+$/.test(k) : /^\d+$/.test(k)) out[section][k] = n;
    }
  }
  return out;
}

/** True when there is nothing to keep. */
export function notesEmpty(notes: ProjectNotes): boolean {
  return !Object.keys(notes.flags).length && !Object.keys(notes.variables).length && !Object.keys(notes.resources).length;
}
