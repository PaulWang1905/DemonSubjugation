// Above a script whose own name other scripts share (all 185 of 伏魔记's are
// "游戏开始"): why the editor shows it by what it is for, and a name of the
// author's own (kept in the project notes, not in the game), which then shows
// everywhere the script is listed or named. Shown for no other script.
import { useContext, useEffect, useMemo, useState } from "react";
import type { LibArchive, LibEntry } from "../format/lib";
import { ownScriptName } from "../format/naming";
import { resourceNote, setResourceNote } from "../format/notes";
import { LabelsContext } from "./names";
import type { EditorServices } from "./views";
import { keyOf } from "./workspace";
import "./scriptNames.css";

/** How many scripts have each own name, per archive. */
const counts = new WeakMap<readonly LibEntry[], Map<string, number>>();
function nameUses(archive: LibArchive): Map<string, number> {
  let c = counts.get(archive.entries);
  if (!c) {
    c = new Map();
    for (const e of archive.entries) if (e.resType === 1) c.set(ownScriptName(e), (c.get(ownScriptName(e)) ?? 0) + 1);
    counts.set(archive.entries, c);
  }
  return c;
}

export function ScriptNameNote({ archive, entry, services }: { archive: LibArchive; entry: LibEntry; services: EditorServices }) {
  const key = keyOf(entry);
  const own = ownScriptName(entry);
  const shared = useMemo(() => (entry.resType === 1 ? (nameUses(archive).get(own) ?? 0) : 0), [archive, entry, own]);
  const label = useContext(LabelsContext)?.get(key);
  const stored = resourceNote(services.notes, key)?.name ?? "";
  const [v, setV] = useState(stored);
  useEffect(() => setV(stored), [stored]);
  if (entry.resType !== 1 || (own && shared < 2)) return null;
  // (the part that tells it apart: the label without the shared name)
  const tail = own ? ` · ${own}` : "";
  const what = label && tail && label.endsWith(tail) ? label.slice(0, -tail.length) : label;
  const save = () => v.trim() !== stored && services.setNotes((n) => setResourceNote(n, key, { name: v }));
  const id = `sn-${key}`;
  return (
    <div className="sn-note">
      <p>
        {own ? (
          <>
            <strong>{own}</strong> is the name of {shared} scripts,{" "}
          </>
        ) : (
          <>This script has no name of its own, </>
        )}
        {stored.trim() ? (
          <>so it is shown by the name you gave it.</>
        ) : (
          <>so the editor shows it with what it is for{what ? <>: <strong>{what}</strong></> : null}. The game file keeps its own name.</>
        )}
      </p>
      <label htmlFor={id}>
        Your name
        <input
          id={id}
          value={v}
          maxLength={40}
          placeholder="Only you see it"
          title="Shown in the lists, tabs, pickers and links instead; kept with the project, not in the game"
          onChange={(e) => setV(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
    </div>
  );
}
