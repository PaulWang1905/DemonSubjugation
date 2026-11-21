// The author's notes kept beside a project (names for flags and variables,
// free notes): what the engine does not store. Stored with the project
// (StoredProject.notes in src/storage/db.ts); views read and change them
// through EditorServices.notes / setNotes (src/editor/ui/views.tsx).
import type { ProjectNotes } from "../../storage/db";

export type { ProjectNotes };

export const emptyNotes = (): ProjectNotes => ({ flags: {}, vars: {}, notes: {}, extra: {} });

/** Only string values, under string keys. */
function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
}

/**
 * Read stored notes, whatever their age: a project saved before notes
 * existed (undefined), or with parts missing or malformed, gets empty parts.
 */
export function normalizeNotes(raw: unknown): ProjectNotes {
  const r = raw && typeof raw === "object" ? (raw as Partial<Record<keyof ProjectNotes, unknown>>) : {};
  const extra = r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? { ...(r.extra as Record<string, unknown>) } : {};
  return { flags: strings(r.flags), vars: strings(r.vars), notes: strings(r.notes), extra };
}

/** Set (or, with an empty text, remove) one entry of a part of the notes. */
export function withNote(n: ProjectNotes, part: "flags" | "vars" | "notes", key: string | number, text: string): ProjectNotes {
  const { [String(key)]: _old, ...rest } = n[part];
  return { ...n, [part]: text.trim() ? { ...rest, [String(key)]: text } : rest };
}

/** Whether there is nothing in the notes (so nothing needs saving). */
export function notesEmpty(n: ProjectNotes): boolean {
  return !Object.keys(n.flags).length && !Object.keys(n.vars).length && !Object.keys(n.notes).length && !Object.keys(n.extra).length;
}
