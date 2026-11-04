import { useMemo, useState } from "react";
import { KIND_NAMES, resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { fieldsFor } from "../format/schema";
import { FieldForm } from "./FieldForm";
import { AnimationEditor } from "./AnimationEditor";
import { MapEditor } from "./MapEditor";
import { PixelEditor } from "./PixelEditor";
import { LevelTableEditor, MagicChainEditor } from "./TableEditors";
import { ScriptEditor } from "./ScriptEditor";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  source?: string;
  onChange: (data: Uint8Array, source?: string) => void;
  actions?: {
    duplicate: () => void;
    /** Returns an error message, or null when done. */
    renumber: (index: number) => string | null;
    remove: () => void;
  };
}

function hex(b: Uint8Array, n = 64): string {
  return [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, "0")).join(" ") + (b.length > n ? " …" : "");
}

export function ResourceView({ archive, entry, source, onChange, actions }: Props) {
  const [numError, setNumError] = useState<string | null>(null);
  const title = `${KIND_NAMES[entry.resType] ?? "Resource"} · ${subTypeName(entry.resType, entry.type)} · #${entry.index}`;
  const name = resourceName(entry.resType, entry.type, entry.data);
  const body = useMemo(() => {
    try {
      switch (entry.resType) {
        case 1:
          return <ScriptEditor entry={entry} source={source} onChange={onChange} />;
        case 2:
          return <MapEditor archive={archive} entry={entry} onChange={onChange} />;
        case 5:
          return <AnimationEditor entry={entry} onChange={onChange} />;
        case 7:
        case 8:
        case 9:
        case 10:
        case 11: {
          const hint =
            entry.resType === 8 && (entry.type === 1 || entry.type === 2)
              ? "Frames 1-3 face north, 4-6 east, 7-9 south, 10-12 west (left foot, standing, right foot)."
              : entry.resType === 7
                ? "Frame N is tile N-1 in the map editor. Tiles are 16×16."
                : entry.resType === 11 && entry.type === 3
                  ? "Battle frames: 1 idle, 2-5 attack, 6-8 cast, 9 guard, 10 hit, 11 weak, 12 knocked out."
                  : entry.resType === 8 && entry.type === 4
                    ? "Objects show frame step+1 (chests: 1 closed, 2 open)."
                    : undefined;
          return <PixelEditor entry={entry} onChange={onChange} hint={hint} />;
        }
        case 12:
          if (entry.type === 1) return <MagicChainEditor archive={archive} entry={entry} onChange={onChange} />;
          if (entry.type === 2) return <LevelTableEditor archive={archive} entry={entry} onChange={onChange} />;
          break;
        case 3:
        case 4:
        case 6: {
          const fields = fieldsFor(entry.resType, entry.type);
          if (fields) return <FieldForm archive={archive} entry={entry} fields={fields} onChange={onChange} />;
          break;
        }
      }
      return (
        <>
          <p className="muted">No form for this kind of resource yet. Raw data ({entry.data.length} bytes):</p>
          <pre className="hex">{hex(entry.data, 160)}</pre>
        </>
      );
    } catch (e) {
      return <p className="error">Cannot show this resource: {(e as Error).message}</p>;
    }
  }, [archive, entry, source, onChange]);

  return (
    <section className="res-view">
      <header>
        <h2>
          {title}
          {name && <span className="name"> {name}</span>}
        </h2>
        {actions && (
          <div className="res-actions">
            <label className="field" title="Other resources refer to this one by number; they are not updated">
              No.
              <input
                type="number"
                min={1}
                max={255}
                defaultValue={entry.index}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  const err = actions.renumber(Number(e.target.value));
                  setNumError(err);
                  if (err) e.target.value = String(entry.index);
                }}
                aria-label="Resource number"
              />
            </label>
            <button className="ghost" onClick={actions.duplicate}>
              Duplicate
            </button>
            <button className="ghost danger" onClick={actions.remove}>
              Delete
            </button>
          </div>
        )}
      </header>
      {numError && <p className="error small">{numError}</p>}
      {body}
    </section>
  );
}
