import { useEffect, useMemo, useRef, useState } from "react";
import { AsmError, assemble, scriptSource } from "../format/gut";
import type { LibEntry } from "../format/lib";
import { allHelp, checkDialogue, GROUPS, insertSnippet, instructionAt, signature, SNIPPETS, template, wrapDialogue, type OpHelp } from "../format/scriptHelp";

interface Props {
  entry: LibEntry;
  /** Previously saved source text for this script, if any. */
  source?: string;
  /** Text typed but not applied yet (kept by the editor across views). */
  draft?: string;
  onDraft?: (text: string | null) => void;
  onChange: (data: Uint8Array, source: string) => void;
  /** Select this line (n changes for every request). */
  goto?: { line: number; n: number };
  /** The project's other scripts' text (to pick story flags they do not use). */
  others?: () => string[];
}

/** Start offsets of a text's lines. */
function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}

export function ScriptEditor({ entry, source, draft, onDraft, onChange, goto, others }: Props) {
  const original = useMemo(() => scriptSource(entry.data, source), [entry, source]);
  const [text, setText] = useState(draft ?? original);
  const [status, setStatus] = useState<{ ok: boolean; msg: string; line?: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [caret, setCaret] = useState({ line: 1, col: 0 });
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const shown = useRef(original);
  useEffect(() => {
    // the stored script changed (applied here or elsewhere): show it
    if (shown.current === original) return;
    shown.current = original;
    setText(original);
    setStatus((st) => (st && st.ok ? st : null)); // keep "Saved" after an apply
  }, [original]);

  const dirty = text !== original;
  useEffect(() => onDraft?.(dirty ? text : null), [text, dirty, onDraft]);

  const warnings = useMemo(() => checkDialogue(text), [text]);
  const starts = useMemo(() => lineStarts(text), [text]);
  const badLines = useMemo(() => new Set(warnings.map((w) => w.line)), [warnings]);

  /** Select a line and scroll it into view. */
  const selectLine = (line: number) => {
    const t = area.current;
    if (!t || line < 1) return;
    const at = lineStarts(t.value);
    const s = at[Math.min(line, at.length) - 1] ?? 0;
    const e = line < at.length ? at[line] - 1 : t.value.length;
    t.focus();
    t.setSelectionRange(s, e);
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 19.5;
    t.scrollTop = Math.max(0, (line - 1) * lh - t.clientHeight / 3);
    setCaret({ line, col: 0 });
  };
  useEffect(() => {
    if (goto) requestAnimationFrame(() => selectLine(goto.line));
  }, [goto?.n]);

  const apply = () => {
    try {
      const bin = assemble(text);
      if (bin[0] !== entry.type || bin[1] !== entry.index) {
        throw new Error(`the .gut line must stay "${entry.type} ${entry.index}" (use + Script to add another)`);
      }
      onChange(bin, text);
      setStatus({ ok: true, msg: `Applied (${bin.length} bytes).` });
    } catch (e) {
      const line = e instanceof AsmError && e.line > 0 ? e.line : undefined;
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e), line });
      if (line) selectLine(line);
    }
  };

  /** Insert text with the browser's own undo (Ctrl+Z) kept. */
  const insert = (s: string, from: number, to = from) => {
    const t = area.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(from, to);
    if (!document.execCommand?.("insertText", false, s)) {
      const v = t.value.slice(0, from) + s + t.value.slice(to);
      setText(v);
      requestAnimationFrame(() => t.setSelectionRange(from + s.length, from + s.length));
    }
  };
  /** Insert whole lines after the caret's line. */
  const insertLines = (lines: string) => {
    const t = area.current;
    if (!t) return;
    const at = t.value.indexOf("\n", t.selectionEnd);
    const pos = at < 0 ? t.value.length : at + 1;
    insert((at < 0 && !t.value.endsWith("\n") ? "\n" : "") + lines.replace(/\n?$/, "\n"), pos);
  };

  /** Insert a ready-made piece (its event handlers at the end, its .event lines at the top). */
  const insertPiece = (i: number) => {
    const t = area.current;
    const s = SNIPPETS[i];
    if (!t || !s) return;
    const line = lineStarts(t.value).filter((x) => x <= t.selectionEnd).length;
    const r = insertSnippet(t.value, s, line, others?.() ?? []);
    insert(r.text, 0, t.value.length);
    requestAnimationFrame(() => selectLine(r.line));
    setStatus({ ok: true, msg: `Inserted: ${s.label}. ${r.note}` });
  };

  const wrap = () => {
    const r = wrapDialogue(text);
    if (r.changed) insert(r.text, 0, text.length);
    setStatus({ ok: true, msg: r.changed ? `Re-wrapped ${r.changed} line${r.changed === 1 ? "" : "s"} of dialogue (Apply to keep).` : "No dialogue needs wrapping." });
  };

  const updateCaret = () => {
    const t = area.current;
    if (!t) return;
    const p = t.selectionStart;
    let line = 1;
    while (line < starts.length && starts[line] <= p) line++;
    setCaret({ line, col: p - starts[line - 1] });
  };

  const current = useMemo(() => {
    const s = starts[caret.line - 1] ?? 0;
    const e = text.indexOf("\n", s);
    return instructionAt(text.slice(s, e < 0 ? text.length : e), caret.col);
  }, [text, starts, caret]);

  const q = filter.trim().toLowerCase();
  const ops = allHelp().filter((o) => !q || o.name.includes(q) || o.text.toLowerCase().includes(q) || o.group.toLowerCase().includes(q));
  const errLine = status && !status.ok ? status.line : undefined;
  const lineWarnings = warnings.filter((w) => w.line === caret.line);

  return (
    <div className="script-editor">
      <div className="script-main">
        <div className="row script-bar">
          <button onClick={apply} disabled={!dirty} title="Assemble the script and save it (Ctrl+S)">
            Apply
          </button>
          <button className="ghost" onClick={() => setText(original)} disabled={!dirty} title="Go back to the script as last applied">
            Revert
          </button>
          <select
            className="add-menu"
            value=""
            onChange={(e) => e.target.value !== "" && insertPiece(Number(e.target.value))}
            title="Insert a ready-made piece of script after the caret's line"
          >
            <option value="">Insert…</option>
            {SNIPPETS.map((s, i) => (
              <option key={s.label} value={i} title={s.note}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={wrap} title="Re-wrap say / message text whose words are split across the lines of the box">
            Wrap dialogue
          </button>
          {status && (
            <span className={status.ok ? "ok" : "error"}>
              {status.msg}
              {errLine && (
                <button className="link" onClick={() => selectLine(errLine)}>
                  Show line {errLine}
                </button>
              )}
            </span>
          )}
          {!status && dirty && <span className="muted">Not applied yet (Ctrl+S applies)</span>}
        </div>
        <div className="code">
          <div className="gutter" ref={gutter} aria-hidden="true">
            {starts.map((_, i) => (
              <div key={i} className={i + 1 === errLine ? "bad" : badLines.has(i + 1) ? "warn" : i + 1 === caret.line ? "cur" : undefined}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={area}
            spellCheck={false}
            wrap="off"
            value={text}
            aria-label="Script"
            onChange={(e) => {
              setText(e.target.value);
              if (status?.ok) setStatus(null);
            }}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onSelect={updateCaret}
            onKeyUp={updateCaret}
            onClick={updateCaret}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                apply();
              }
              if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                const t = e.currentTarget;
                insert("  ", t.selectionStart, t.selectionEnd);
              }
            }}
          />
        </div>
        <div className="script-hint small" aria-live="polite">
          <span className="muted">Line {caret.line}</span>
          {current ? <Signature help={current.help} arg={current.arg} /> : <span className="muted">Labels end with a colon (@name:); ; starts a comment.</span>}
          {lineWarnings.map((w) => (
            <span key={w.message} className="warn-text">
              ⚠ {w.message}
            </span>
          ))}
          {warnings.length > 0 && !lineWarnings.length && (
            <button className="link" onClick={() => selectLine(warnings[0].line)}>
              ⚠ {warnings.length} dialogue warning{warnings.length === 1 ? "" : "s"} (line {warnings.map((w) => w.line).join(", ")})
            </button>
          )}
        </div>
      </div>
      <aside className="script-ref">
        <input placeholder="Search instructions…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search instructions" />
        <details className="script-basics">
          <summary>How scripts work</summary>
          <p>
            <code>.event N @label</code> lines at the top say where each event starts. Event N of an NPC or object runs when the
            player talks to the one created with id N; map event N runs <code>.event N+40</code>. The script starts at its first
            instruction (<code>@start:</code> by convention) when it is loaded; an event ends with <code>callback</code>.
          </p>
          <p>
            Labels: <code>@name:</code> marks a place, jumps take <code>@name</code>. Text goes in "straight quotes". Story flags (
            <code>setevent</code>, <code>if</code>) are kept in saves; variables hold 0-255.
          </p>
        </details>
        <p className="muted small">Click an instruction to insert its example after the caret's line.</p>
        {GROUPS.map((g) => {
          const list = ops.filter((o) => o.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className={list[0].noop ? "noop" : undefined}>
              <h3>{g}</h3>
              <dl>
                {list.map((o) => (
                  <div key={o.name}>
                    <dt>
                      <button className="link" onClick={() => insertLines(`  ${template(o)}`)} title={`Insert: ${template(o)}`}>
                        <code>{signature(o)}</code>
                      </button>
                    </dt>
                    <dd>{o.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
        {!ops.length && <p className="muted small">No instruction matches “{filter}”.</p>}
      </aside>
    </div>
  );
}

/** "enterfight rounds, m1, **m2**, …: text" with the operand at the caret in bold. */
function Signature({ help, arg }: { help: OpHelp; arg: number }) {
  return (
    <span className="sig">
      <code>
        {help.name}
        {help.args.map((a, i) => (
          <span key={i}>
            {i ? ", " : " "}
            {i === arg ? <b>{a}</b> : a}
          </span>
        ))}
      </code>{" "}
      <span className="muted">{help.text}</span>
    </span>
  );
}
