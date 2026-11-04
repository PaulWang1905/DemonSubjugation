import { useEffect, useMemo, useState } from "react";
import { AsmError, assemble, disassemble, OPS } from "../format/gut";
import type { LibEntry } from "../format/lib";

interface Props {
  entry: LibEntry;
  /** Previously saved source text for this script, if any. */
  source?: string;
  onChange: (data: Uint8Array, source: string) => void;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function ScriptEditor({ entry, source, onChange }: Props) {
  const original = useMemo(() => {
    // Prefer the author's own text (labels, comments) while it still matches.
    if (source) {
      try {
        if (sameBytes(assemble(source), entry.data)) return source;
      } catch {
        /* fall back to disassembly */
      }
    }
    try {
      return disassemble(entry.data);
    } catch (e) {
      return `; could not disassemble: ${(e as Error).message}\n`;
    }
  }, [entry, source]);
  const [text, setText] = useState(original);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    setText(original);
    setStatus((st) => (st && st.ok ? st : null)); // keep "Saved" after an apply
  }, [original]);

  const dirty = text !== original;

  const apply = () => {
    try {
      const bin = assemble(text);
      if (bin[0] !== entry.type || bin[1] !== entry.index) {
        throw new Error(`the .gut line must stay "${entry.type} ${entry.index}" (use New script to add another)`);
      }
      onChange(bin, text);
      setStatus({ ok: true, msg: `Saved (${bin.length} bytes).` });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof AsmError || e instanceof Error ? e.message : String(e) });
    }
  };

  const ops = OPS.filter((o) => !filter || o.name.includes(filter.toLowerCase()) || o.doc.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="script-editor">
      <div className="script-main">
        <div className="row">
          <button onClick={apply} disabled={!dirty}>
            Apply
          </button>
          <button className="ghost" onClick={() => setText(original)} disabled={!dirty}>
            Revert
          </button>
          {status && <span className={status.ok ? "ok" : "error"}>{status.msg}</span>}
          {!status && dirty && <span className="muted">Unsaved changes (Ctrl+S to apply)</span>}
        </div>
        <textarea
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              apply();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const s = t.selectionStart;
              const v = t.value;
              setText(v.slice(0, s) + "  " + v.slice(t.selectionEnd));
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      </div>
      <aside className="script-ref">
        <input placeholder="Search instructions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <p className="muted small">
          Labels: <code>@name:</code>. Jumps take <code>@name</code>. Event N of a character runs when the player talks to it;
          map event N runs as event N+40.
        </p>
        <dl>
          {ops.map((o) => (
            <div key={o.code}>
              <dt>
                <code>{o.name}</code>
              </dt>
              <dd>{o.doc}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
