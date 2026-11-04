import { useEffect, useState } from "react";
import { decodeImage, resourceName } from "../format/decode";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { readField, writeField, type Field } from "../format/schema";
import { FrameCanvas } from "./FrameStrip";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  fields: Field[];
  onChange: (data: Uint8Array) => void;
}

/** Shows what a reference field points at. */
function RefInfo({ archive, data, f, value }: { archive: LibArchive; data: Uint8Array; f: Field; value: number }) {
  if (!f.ref || value === 0) return <span className="muted small">{value === 0 ? "none" : ""}</span>;
  const type = typeof f.ref.type === "number" ? f.ref.type : data[f.ref.type.at];
  const target = findEntry(archive, f.ref.resType, type, value);
  if (!target) return <span className="error small">missing</span>;
  if ([7, 8, 9, 10, 11].includes(f.ref.resType)) {
    try {
      const frames = decodeImage(target.data).frames;
      const pick = f.ref.resType === 8 && (type === 1 || type === 2) ? frames[7] ?? frames[0] : frames[0];
      return pick ? <FrameCanvas frame={pick} scale={2} /> : null;
    } catch {
      return null;
    }
  }
  return <span className="muted small">{resourceName(target.resType, target.type, target.data) || "✓"}</span>;
}

export function FieldForm({ archive, entry, fields, onChange }: Props) {
  const [data, setData] = useState(entry.data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setData(entry.data), [entry]);

  const update = (f: Field, v: number | string) => {
    try {
      const next = writeField(data, f, v);
      setData(next);
      setErrors((e) => ({ ...e, [f.key]: "" }));
      onChange(next);
    } catch (err) {
      setErrors((e) => ({ ...e, [f.key]: (err as Error).message }));
    }
  };

  const groups: [string, Field[]][] = [];
  for (const f of fields) {
    const g = f.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(f);
    else groups.push([g, [f]]);
  }

  return (
    <div className="form">
      {groups.map(([g, list]) => (
        <fieldset key={g || "main"}>
          {g && <legend>{g}</legend>}
          {list.map((f) => {
            const v = readField(data, f);
            return (
              <div className="frow" key={f.key}>
                <label htmlFor={`f-${f.key}`}>{f.label}</label>
                <div className="fctl">
                  {f.kind === "str" ? (
                    f.max > 24 ? (
                      <textarea id={`f-${f.key}`} defaultValue={String(v)} rows={3} onBlur={(e) => update(f, e.target.value)} />
                    ) : (
                      <input id={`f-${f.key}`} defaultValue={String(v)} onBlur={(e) => update(f, e.target.value)} />
                    )
                  ) : f.kind === "enum" ? (
                    <select id={`f-${f.key}`} value={Number(v)} onChange={(e) => update(f, Number(e.target.value))}>
                      {!f.options.some(([n]) => n === v) && <option value={Number(v)}>{v}</option>}
                      {f.options.map(([n, l]) => (
                        <option key={n} value={n}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === "flags" ? (
                    <span className="flags">
                      {f.bits.map(([bit, l]) => (
                        <label key={bit} className="check">
                          <input type="checkbox" checked={(Number(v) & bit) !== 0} onChange={(e) => update(f, e.target.checked ? Number(v) | bit : Number(v) & ~bit)} />
                          {l}
                        </label>
                      ))}
                    </span>
                  ) : f.kind === "masked" && f.max === 1 ? (
                    <input id={`f-${f.key}`} type="checkbox" checked={v === 1} onChange={(e) => update(f, e.target.checked ? 1 : 0)} />
                  ) : (
                    <input
                      id={`f-${f.key}`}
                      type="number"
                      key={`${f.key}:${v}`}
                      defaultValue={Number(v)}
                      onBlur={(e) => e.target.value !== String(v) && update(f, Number(e.target.value))}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  )}
                  {f.ref && <RefInfo archive={archive} data={data} f={f} value={Number(v)} />}
                </div>
                {errors[f.key] ? <p className="error small fhelp">{errors[f.key]}</p> : f.help && <p className="muted small fhelp">{f.help}</p>}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
