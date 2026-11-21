// The author's notes kept beside a project (names for flags and variables,
// notes per resource, a view's own state): what the engine does not store.
// The model is src/editor/format/notes.ts; stored with the project
// (StoredProject.notes in src/storage/db.ts); views read and change them
// through EditorServices.notes / setNotes (src/editor/ui/views.tsx).
export { emptyNotes, notesEmpty, readNotes as normalizeNotes, type ProjectNotes } from "../format/notes";
