// A resource's number in its tab's header, and what changing it does: the
// editor renumbers through world.ts renumberResource (every reference in
// scripts, records, spell lists, maps' tilesets and the notes moves with it),
// after showing what will be updated and any warnings.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LibEntry } from "../format/lib";
import "./cards.css";

/** What a renumbering will do (from cardModel.ts planRenumber). */
export interface RenumberPreview {
  /** "3 scripts and 2 records will be updated." */
  summary: string;
  /** The resources updated, in words. */
  details: string[];
  warnings: string[];
}

export interface RenumberActions {
  /** What giving the resource this number will change; throws with a readable message when it cannot. */
  previewRenumber?: (index: number) => RenumberPreview;
  /** Do it. Returns an error message, or null when done. */
  renumber: (index: number) => string | null;
}

/** The number input (for the header) and the confirmation panel (below it). */
export function useRenumber(entry: LibEntry, actions: RenumberActions | undefined, kind: string): { input: ReactNode; panel: ReactNode } {
  const [pending, setPending] = useState<{ to: number; preview: RenumberPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // (the panel takes the focus, not its button: the Enter that asked must not confirm)
  useEffect(() => {
    if (pending) box.current?.focus();
  }, [pending]);
  if (!actions) return { input: null, panel: null };

  const reset = () => {
    setPending(null);
    if (input.current) input.current.value = String(entry.index);
  };
  const ask = (to: number) => {
    setError(null);
    if (to === entry.index) return reset();
    if (!actions.previewRenumber) {
      const err = actions.renumber(to);
      setError(err);
      if (err) reset();
      return;
    }
    try {
      setPending({ to, preview: actions.previewRenumber(to) });
    } catch (e) {
      setError((e as Error).message.replace(/(\d+-\d+) is already used$/, "$1 is already used."));
      reset();
    }
  };
  const confirm = () => {
    if (!pending) return;
    const err = actions.renumber(pending.to);
    setError(err);
    setPending(null);
    if (err && input.current) input.current.value = String(entry.index);
  };

  const field = (
    <label className="field" title="Give it another number: everything that refers to it is updated (you see what first)">
      No.
      <input
        ref={input}
        type="number"
        min={1}
        max={255}
        defaultValue={entry.index}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") reset();
        }}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (pending && pending.to === n) return;
          ask(n);
        }}
        aria-label="Resource number"
      />
    </label>
  );
  const panel = (
    <>
      {error && <p className="error small">{error}</p>}
      {pending && (
        <div
          ref={box}
          tabIndex={-1}
          className="rn-panel"
          role="group"
          aria-label="Renumber"
          onKeyDown={(e) => {
            if (e.key === "Escape") (e.stopPropagation(), reset(), input.current?.focus());
          }}
        >
          <p>
            <b>
              Renumber this {kind} from {entry.type}-{entry.index} to {entry.type}-{pending.to}?
            </b>{" "}
            {pending.preview.summary}
          </p>
          {pending.preview.details.length > 0 && (
            <ul className="rn-list small">
              {pending.preview.details.slice(0, 12).map((d) => (
                <li key={d}>{d}</li>
              ))}
              {pending.preview.details.length > 12 && <li className="muted">…and {pending.preview.details.length - 12} more</li>}
            </ul>
          )}
          {pending.preview.warnings.map((w) => (
            <p key={w} className="rn-warn small">
              ⚠ {w}
            </p>
          ))}
          <div className="row">
            <button type="button" onClick={confirm}>
              Renumber
            </button>
            <button type="button" className="ghost" onClick={() => (reset(), input.current?.focus())}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
  return { input: field, panel };
}
