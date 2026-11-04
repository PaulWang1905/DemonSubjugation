import { useMemo } from "react";
import { decodeImage, decodeSrsImages, KIND_NAMES, resourceName, subTypeName } from "../format/decode";
import type { LibArchive, LibEntry } from "../format/lib";
import { FrameStrip } from "./FrameStrip";
import { fieldsFor } from "../format/schema";
import { FieldForm } from "./FieldForm";
import { MapEditor } from "./MapEditor";
import { LevelTableEditor, MagicChainEditor } from "./TableEditors";
import { ScriptEditor } from "./ScriptEditor";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  source?: string;
  onChange: (data: Uint8Array, source?: string) => void;
}

function hex(b: Uint8Array, n = 64): string {
  return [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, "0")).join(" ") + (b.length > n ? " …" : "");
}

export function ResourceView({ archive, entry, source, onChange }: Props) {
  const title = `${KIND_NAMES[entry.resType] ?? "Resource"} · ${subTypeName(entry.resType, entry.type)} · #${entry.index}`;
  const name = resourceName(entry.resType, entry.type, entry.data);
  const body = useMemo(() => {
    try {
      switch (entry.resType) {
        case 1:
          return <ScriptEditor entry={entry} source={source} onChange={onChange} />;
        case 2:
          return <MapEditor archive={archive} entry={entry} onChange={onChange} />;
        case 5: {
          const frames = decodeSrsImages(entry.data);
          return (
            <>
              <p className="muted">
                Animation with {entry.data[2]} frame(s) drawn from {frames.length} image(s).
              </p>
              <FrameStrip frames={frames} />
            </>
          );
        }
        case 7:
        case 8:
        case 9:
        case 10:
        case 11: {
          const { frames } = decodeImage(entry.data);
          const f = frames[0];
          return (
            <>
              <p className="muted">
                {frames.length} frame(s), {f?.width}×{f?.height} pixels.
                {entry.resType === 8 && (entry.type === 1 || entry.type === 2) && " Frames 1-3 face north, 4-6 east, 7-9 south, 10-12 west."}
                {entry.resType === 7 && " Frame N is tile N-1 in the map editor."}
              </p>
              <FrameStrip frames={frames} scale={entry.resType === 11 && f?.width > 100 ? 2 : 3} />
            </>
          );
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
      </header>
      {body}
    </section>
  );
}
