// The step palette's note for what the engine lacks (paletteNotes.ts), with
// buttons that add the steps that come closest.
import { paletteNote } from "./paletteNotes";
import "./paletteNote.css";

export function PaletteNoteBox({ query, onPick }: { query: string; onPick: (name: string) => void }) {
  const note = paletteNote(query);
  if (!note) return null;
  return (
    <div className="sv-p-note small" role="note">
      <strong>{note.title}.</strong> {note.text}
      <span className="sv-p-note-steps">
        {note.steps.map((x) => (
          <button key={x.name} type="button" className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(x.name)}>
            + {x.label}
          </button>
        ))}
      </span>
    </div>
  );
}
