import { useEffect, useState } from "react";
import { resourceName } from "../format/decode";
import { encodeMagicChain } from "../format/encode";
import type { LibArchive, LibEntry } from "../format/lib";
import { LEVEL_COLUMNS, readLevels, readMagicChain, writeLevels } from "../format/schema";

interface Props {
  archive: LibArchive;
  entry: LibEntry;
  onChange: (data: Uint8Array) => void;
}

/** Spell list (MLR 1-n): which spells, in learning order. */
export function MagicChainEditor({ archive, entry, onChange }: Props) {
  const [list, setList] = useState(() => readMagicChain(entry.data));
  useEffect(() => setList(readMagicChain(entry.data)), [entry]);
  const magics = archive.entries.filter((e) => e.resType === 4);
  const save = (next: { type: number; index: number }[]) => {
    setList(next);
    onChange(encodeMagicChain(entry.index, next));
  };
  const label = (t: number, i: number) => {
    const m = magics.find((e) => e.type === t && e.index === i);
    return m ? resourceName(4, t, m.data) : "missing";
  };
  return (
    <div className="form">
      <p className="muted small">Spells are learnt in this order. Party members and monsters say how many of their list they know.</p>
      <ol className="chain">
        {list.map((m, k) => (
          <li key={k}>
            <span className={label(m.type, m.index) === "missing" ? "error" : ""}>
              {label(m.type, m.index)} <span className="muted small">({m.type}-{m.index})</span>
            </span>
            <span className="row">
              <button className="ghost" disabled={k === 0} onClick={() => save(list.map((x, i) => (i === k - 1 ? list[k] : i === k ? list[k - 1] : x)))}>
                ↑
              </button>
              <button className="ghost" disabled={k === list.length - 1} onClick={() => save(list.map((x, i) => (i === k + 1 ? list[k] : i === k ? list[k + 1] : x)))}>
                ↓
              </button>
              <button className="ghost danger" onClick={() => save(list.filter((_, i) => i !== k))}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ol>
      <label className="field">
        Add spell
        <select
          value=""
          onChange={(e) => {
            const [t, i] = e.target.value.split("-").map(Number);
            if (t) save([...list, { type: t, index: i }]);
          }}
        >
          <option value="">Choose…</option>
          {magics.map((m) => (
            <option key={`${m.type}-${m.index}`} value={`${m.type}-${m.index}`}>
              {resourceName(4, m.type, m.data)} ({m.type}-{m.index})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Level-up table (MLR 2-n): stats per level. */
export function LevelTableEditor({ entry, onChange }: Props) {
  const [rows, setRows] = useState(() => readLevels(entry.data));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(readLevels(entry.data)), [entry]);
  const save = (next: number[][]) => {
    try {
      const bytes = writeLevels(entry.data, next);
      setRows(next);
      setError(null);
      onChange(bytes);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="form">
      <p className="muted small">
        Stats a party member has at each level (gains are the difference between rows). "Exp to next" is the experience needed
        to leave that level.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table className="levels">
          <thead>
            <tr>
              <th>Lv</th>
              {LEVEL_COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, l) => (
              <tr key={l}>
                <th>{l + 1}</th>
                {r.map((v, k) => (
                  <td key={k}>
                    <input
                      type="number"
                      key={`${l}:${k}:${v}`}
                      defaultValue={v}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n !== v) save(rows.map((row, i) => (i === l ? row.map((x, j) => (j === k ? n : x)) : row)));
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="ghost" onClick={() => save([...rows, [...rows[rows.length - 1]]])} disabled={rows.length >= 255}>
          + Level
        </button>
        <button className="ghost" onClick={() => save(rows.slice(0, -1))} disabled={rows.length <= 1}>
          − Last level
        </button>
      </div>
    </div>
  );
}
