// Author names for resources that have none in the game (a sprite, a
// picture, an icon): kept in the project notes (notes.resources[key].name),
// shown by the pickers, and named here.
import { createContext, useContext, useEffect, useState } from "react";
import { resourceNote, setResourceNote, type ProjectNotes } from "../format/notes";
import type { EditorServices } from "./views";
import "./authoring.css";

/** The project notes, for components deep in a view (the resource pickers). */
export const NotesContext = createContext<ProjectNotes | null>(null);

/**
 * Names for resources the game stores without one: the author's, else one
 * from what uses them ("Old Woman (walk)"; format/naming.ts resourceLabels).
 */
export const LabelsContext = createContext<ReadonlyMap<string, string> | null>(null);

/** The author's name for a resource, else one from what uses it, if any. */
export function useNotedName(): (key: string) => string | undefined {
  const notes = useContext(NotesContext);
  const labels = useContext(LabelsContext);
  return (key) => resourceNote(notes ?? undefined, key)?.name || labels?.get(key);
}

/** "Name: [ ]" for a resource the game stores without a name (sprites, pictures, icons). */
export function ResourceNameField({ services, what }: { services: EditorServices; what: string }) {
  const stored = resourceNote(services.notes, services.key)?.name ?? "";
  const [v, setV] = useState(stored);
  useEffect(() => setV(stored), [stored]);
  const save = () => v.trim() !== stored && services.setNotes((n) => setResourceNote(n, services.key, { name: v }));
  return (
    <label className="field res-name-field">
      Name
      <input value={v} maxLength={40} placeholder={`Name this ${what} (only you see it)`} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
      <span className="muted small">Shown in pickers and lists; kept with the project, not in the game.</span>
    </label>
  );
}
