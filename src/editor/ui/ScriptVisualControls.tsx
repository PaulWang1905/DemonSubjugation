// The inline controls of the Visual script view's steps: one per operand
// kind (scriptVisualLogic.controlFor): resource pickers, flags and variables
// with the author's names, labels, choices, people, numbers and text.
// Numbers and text are kept while typed and stored when the field is left
// (or Enter is pressed), so one change is one undo step.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CommandInfo, NameResolver, OperandValue } from "../format/commands";
import type { LibArchive } from "../format/lib";
import { setFlagNote, setVariableNote, type ProjectNotes } from "../format/notes";
import type { InstructionStep, ScriptModel } from "../format/scriptModel";
import { pictureFrame } from "./DialoguePreview";
import { DARK, LIGHT } from "./pixels";
import { ResourcePicker } from "./ResourcePicker";
import { SAY_PLAIN, SAY_WITH_PORTRAIT, wrapForBox, wrapMessage } from "../format/text";
import { FlagPicker } from "./FlagPicker";
import type { WorldIndex } from "../format/world";
import { controlFor, parseOperandNumber, type Control } from "./scriptVisualLogic";

/** What the steps and their controls share (ScriptVisual.tsx provides it). */
export interface SvContext {
  archive: LibArchive;
  model: ScriptModel;
  names: NameResolver;
  notes: ProjectNotes;
  setNotes: (update: (prev: ProjectNotes) => ProjectNotes) => void;
  /** Person / object numbers this script places: id → name. */
  people: Map<number, string>;
  /** Set operands of an instruction (one undo step). */
  setOperands: (id: number, changes: readonly (readonly [number, OperandValue])[]) => void;
  /** Point a jump at a new label (a new arm at the end of the event). */
  newLabel: (id: number, k: number) => void;
  /** Text being typed in a step (for the live preview). */
  setLive: (live: { id: number; k: number; text: string } | null) => void;
  /** Show a refusal. */
  refuse: (msg: string) => void;
  /** Show a label's code. */
  goLabel: (label: string) => void;
  disabled: boolean;
  /** The project's world index (the flags its scripts use), when it could be built. */
  world?: WorldIndex;
}

export const Sv = createContext<SvContext | null>(null);
export const useSv = () => useContext(Sv)!;

/** A picture's first frame as a small image (portraits beside their picker). */
export function PictureThumb({ archive, type, index, size = 28 }: { archive: LibArchive; type: number; index: number; size?: number }) {
  const url = useMemo(() => {
    const f = pictureFrame(archive, type, index);
    if (!f || !f.width || !f.height) return null;
    const c = document.createElement("canvas");
    c.width = f.width;
    c.height = f.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(f.width, f.height);
    f.pixels.forEach((v, i) => v !== 2 && img.data.set([...(v === 1 ? DARK : LIGHT), 255], i * 4));
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }, [archive, type, index]);
  if (!url) return null;
  return <img className="sv-thumb" src={url} alt="" aria-hidden="true" style={{ maxWidth: size, maxHeight: size }} />;
}

/** A field kept while typed, stored on Enter / leaving it, reverted on Escape. */
function useDraftValue(value: string): [string, (v: string) => void, () => void] {
  const [v, setV] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      setV(value);
    }
  }, [value]);
  return [v, setV, () => setV(value)];
}

function NumberField({ value, label, min, max, onCommit, width = 5 }: { value: number; label: string; min: number; max: number; onCommit: (text: string) => void; width?: number }) {
  const [v, setV, revert] = useDraftValue(String(value));
  return (
    <input
      className="sv-num"
      type="text"
      inputMode="numeric"
      aria-label={`${label} (${min}-${max})`}
      title={`${label}: ${min}-${max}`}
      value={v}
      style={{ width: `${Math.max(width, v.length + 1)}ch` }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== String(value) && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.preventDefault(), (e.target as HTMLInputElement).blur());
        else if (e.key === "Escape") revert();
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          const n = Math.max(min, Math.min(max, (Number(v) || 0) + (e.key === "ArrowUp" ? 1 : -1)));
          setV(String(n));
          onCommit(String(n));
        }
      }}
    />
  );
}

/** The flags a script's lines use (flag operands). */
function modelFlags(model: ScriptModel): number[] {
  const out = new Set<number>();
  for (const s of model.steps) {
    if (s.kind !== "instruction") continue;
    s.command.operands.forEach((o, k) => o.kind === "flag" && typeof s.values[k] === "number" && out.add(s.values[k] as number));
  }
  return [...out];
}

/** A story flag, picked by name (or made new), and renamed in place. */
function FlagField({ step, k, label }: { step: InstructionStep; k: number; label: string }) {
  const sv = useSv();
  const value = Number(step.values[k]);
  const extra = useMemo(() => modelFlags(sv.model), [sv.model]);
  return (
    <span className="sv-named">
      <span className="sv-kind">flag</span>
      <FlagPicker value={value} onChange={(n) => n !== value && sv.setOperands(step.id, [[k, n]])} notes={sv.notes} setNotes={sv.setNotes} world={sv.world} extra={extra} label={label} disabled={sv.disabled} />
      <RenameNamed kind="flag" value={value} />
    </span>
  );
}

/** "rename" / "name this flag" beside a flag or variable. */
function RenameNamed({ kind, value }: { kind: "flag" | "variable"; value: number }) {
  const sv = useSv();
  const name = kind === "flag" ? sv.notes.flags[String(value)]?.name : sv.notes.variables[String(value)]?.name;
  const [naming, setNaming] = useState(false);
  const [text, setText] = useState(name ?? "");
  const save = () => {
    setNaming(false);
    if ((name ?? "") === text.trim()) return;
    sv.setNotes((n) => (kind === "flag" ? setFlagNote(n, value, { name: text }) : setVariableNote(n, value, { name: text })));
  };
  if (naming)
    return (
      <input
        className="sv-name-input"
        autoFocus
        value={text}
        placeholder={kind === "flag" ? "e.g. gate open" : "e.g. where we came from"}
        aria-label={`Name for ${kind} ${value}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.preventDefault(), save());
          else if (e.key === "Escape") (setNaming(false), setText(name ?? ""));
        }}
      />
    );
  return (
    <button
      type="button"
      className={`link sv-name${name ? "" : " unnamed"}`}
      disabled={sv.disabled}
      onClick={() => {
        setText(name ?? "");
        setNaming(true);
      }}
      title={name ? `Rename ${kind} ${value} (names are kept with the project, not in the game)` : `Give ${kind} ${value} a name (kept with the project, not in the game)`}
    >
      {name ? "rename" : `name this ${kind}`}
    </button>
  );
}

/** A flag's or variable's number with the author's name for it, named in place. */
function NamedNumber({ kind, value, label, min, max, onCommit }: { kind: "flag" | "variable"; value: number; label: string; min: number; max: number; onCommit: (text: string) => void }) {
  const sv = useSv();
  const name = kind === "flag" ? sv.notes.flags[String(value)]?.name : sv.notes.variables[String(value)]?.name;
  const [naming, setNaming] = useState(false);
  const [text, setText] = useState(name ?? "");
  const save = () => {
    setNaming(false);
    if ((name ?? "") === text.trim()) return;
    sv.setNotes((n) => (kind === "flag" ? setFlagNote(n, value, { name: text }) : setVariableNote(n, value, { name: text })));
  };
  return (
    <span className="sv-named">
      <span className="sv-kind">{kind}</span>
      <NumberField value={value} label={label} min={min} max={max} onCommit={onCommit} width={4} />
      {naming ? (
        <input
          className="sv-name-input"
          autoFocus
          value={text}
          placeholder={kind === "flag" ? "e.g. gate open" : "e.g. where we came from"}
          aria-label={`Name for ${kind} ${value}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), save());
            else if (e.key === "Escape") (setNaming(false), setText(name ?? ""));
          }}
        />
      ) : (
        <button
          type="button"
          className={`link sv-name${name ? "" : " unnamed"}`}
          disabled={sv.disabled}
          onClick={() => {
            setText(name ?? "");
            setNaming(true);
          }}
          title={name ? `Rename ${kind} ${value} (names are kept with the project, not in the game)` : `Give ${kind} ${value} a name (kept with the project, not in the game)`}
        >
          {name ? `“${name}”` : `name this ${kind}`}
        </button>
      )}
    </span>
  );
}

function TextField({ step, k, multiline, label }: { step: InstructionStep; k: number; multiline: boolean; label: string }) {
  const sv = useSv();
  const stored = String(step.values[k] ?? "");
  // dialogue is shown as typed (without the spaces that keep words whole in the box) and wrapped when stored
  const wraps = isWrapped(step, k);
  const value = wraps ? unpadded(stored) : stored;
  const [v, setV, revert] = useDraftValue(value);
  const out = (t: string) => (wraps ? wrapTyped(step, t) : t);
  const commit = () => {
    sv.setLive(null);
    if (v !== value && out(v) !== stored) sv.setOperands(step.id, [[k, out(v)]]);
  };
  const common = {
    "aria-label": label,
    value: v,
    disabled: sv.disabled,
    spellCheck: true,
    onChange: (e: { target: { value: string } }) => {
      const t = e.target.value.replace(/\r?\n/g, " ");
      setV(t);
      sv.setLive({ id: step.id, k, text: out(t) });
    },
    onFocus: () => sv.setLive({ id: step.id, k, text: out(v) }),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey || !e.shiftKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        revert();
        sv.setLive(null);
      }
    },
  };
  if (!multiline) return <input className="sv-text-input" {...common} style={{ width: `${Math.max(6, v.length + 2)}ch` }} />;
  return (
    <>
      <textarea className="sv-text" rows={Math.max(1, Math.min(6, Math.ceil(v.length / 46)))} {...common} title={wraps ? "Type it as you like: the line breaks are made when it is stored, so no word is split in the box" : undefined} />
      {wraps && <span className="sv-wrap-hint muted small">Line breaks for the box are added when you leave the field.</span>}
    </>
  );
}

/** Dialogue text the editor wraps itself: say / message / timed message text without control codes. */
function isWrapped(step: InstructionStep, k: number): boolean {
  const name = step.op.name;
  if (name !== "say" && name !== "message" && name !== "timemsg") return false;
  if (step.command.operands[k]?.kind !== "text") return false;
  return !/\\/.test(String(step.values[k] ?? ""));
}

/** The text without the padding that wrapping added. */
function unpadded(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Typed text as stored: wrapped for its box (11 then 15 letters a line with a portrait, 15 without; messages 15). */
function wrapTyped(step: InstructionStep, t: string): string {
  const text = unpadded(t);
  if (!text) return text;
  if (step.op.name === "say") return wrapForBox(text, Number(step.values[0]) ? SAY_WITH_PORTRAIT : SAY_PLAIN);
  return wrapMessage(text);
}

function LabelField({ step, k, label }: { step: InstructionStep; k: number; label: string }) {
  const sv = useSv();
  const raw = step.values[k];
  if (typeof raw === "number") return <code className="sv-raw-addr" title="A jump to a raw address (from a disassembly): edit it in the Text view">#{raw}</code>;
  const value = String(raw);
  const labels = [...sv.model.labels.keys()];
  return (
    <span className="sv-label-field">
      <select
        aria-label={label}
        value={value}
        disabled={sv.disabled}
        onChange={(e) => {
          if (e.target.value === "\u0000new") sv.newLabel(step.id, k);
          else sv.setOperands(step.id, [[k, e.target.value]]);
        }}
      >
        {!sv.model.labels.has(value) && <option value={value}>◆ {value} (missing)</option>}
        {labels.map((l) => (
          <option key={l} value={l}>
            ◆ {l}
          </option>
        ))}
        <option value={"\u0000new"}>New label…</option>
      </select>
      {sv.model.labels.has(value) && (
        <button type="button" className="link sv-go" onClick={() => sv.goLabel(value)} title={`Show the label ${value}`}>
          show
        </button>
      )}
    </span>
  );
}

function NpcField({ step, k, allowPlayer, label }: { step: InstructionStep; k: number; allowPlayer: boolean; label: string }) {
  const sv = useSv();
  const v = Number(step.values[k]);
  const ids = Array.from({ length: 40 }, (_, i) => i + 1);
  return (
    <select aria-label={label} value={v} disabled={sv.disabled} onChange={(e) => sv.setOperands(step.id, [[k, Number(e.target.value)]])} className="sv-npc">
      {allowPlayer && <option value={0}>the player</option>}
      {[...sv.people.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, name]) => (
          <option key={id} value={id}>
            {name} (#{id})
          </option>
        ))}
      <optgroup label="Other numbers">
        {ids
          .filter((i) => !sv.people.has(i))
          .map((i) => (
            <option key={i} value={i}>
              #{i}
            </option>
          ))}
      </optgroup>
      {(v < (allowPlayer ? 0 : 1) || v > 40) && <option value={v}>#{v} (out of range)</option>}
    </select>
  );
}

function ShopField({ step, label }: { step: InstructionStep; label: string }) {
  const sv = useSv();
  const list = (step.values[0] ?? []) as readonly (readonly [number, number])[];
  const set = (next: (readonly [number, number])[]) => sv.setOperands(step.id, [[0, next]]);
  return (
    <span className="sv-shop" role="group" aria-label={label}>
      {list.map(([t, i], p) => (
        <span key={p} className="sv-shop-item">
          <ResourcePicker archive={sv.archive} resType={6} value={{ type: t, index: i }} label={`Item ${p + 1} for sale`} disabled={sv.disabled} onChange={(v) => v && set(list.map((x, q) => (q === p ? [v.type, v.index] : x)))} />
          <button type="button" className="ghost small" aria-label={`Remove item ${p + 1}`} disabled={sv.disabled} onClick={() => set(list.filter((_, q) => q !== p))}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="ghost small" disabled={sv.disabled || list.length >= 30} onClick={() => set([...list, list[list.length - 1] ?? [9, 1]])}>
        + Item
      </button>
    </span>
  );
}

/** The control for operand k of an instruction step. */
export function OperandControl({ step, k, control }: { step: InstructionStep; k: number; control?: Control }) {
  const sv = useSv();
  const c: CommandInfo = step.command;
  const o = c.operands[k];
  const ctl = control ?? controlFor(c, k);
  const label = o?.label ?? `Operand ${k + 1}`;
  const v = step.values[k];
  const commitNumber = (text: string) => {
    const r = parseOperandNumber(text, o);
    if ("error" in r) sv.refuse(r.error);
    else sv.setOperands(step.id, [[k, r.value]]);
  };
  switch (ctl.kind) {
    case "hidden":
      return null;
    case "resource": {
      const type = ctl.pairType !== undefined ? Number(step.values[ctl.pairType]) : (ctl.types?.[0] ?? 1);
      const index = Number(v);
      const value = index === 0 && ctl.allowNone ? null : { type, index };
      return (
        <span className="sv-res">
          {ctl.resType === 11 && index > 0 && <PictureThumb archive={sv.archive} type={type} index={index} />}
          <ResourcePicker
            archive={sv.archive}
            resType={ctl.resType}
            types={ctl.types}
            value={value}
            allowNone={ctl.allowNone}
            noneLabel={o?.zero ? o.zero[0].toUpperCase() + o.zero.slice(1) : "None"}
            label={label}
            disabled={sv.disabled}
            onChange={(r) => {
              if (!r) sv.setOperands(step.id, [[k, 0]]);
              else if (ctl.pairType !== undefined) sv.setOperands(step.id, [[ctl.pairType, r.type], [k, r.index]]);
              else sv.setOperands(step.id, [[k, r.index]]);
            }}
          />
        </span>
      );
    }
    case "flag":
      return <FlagField step={step} k={k} label={label} />;
    case "variable":
      return <NamedNumber kind={ctl.kind} value={Number(v)} label={label} min={o?.min ?? 0} max={o?.max ?? 255} onCommit={commitNumber} />;
    case "label":
      return <LabelField step={step} k={k} label={label} />;
    case "select": {
      const known = ctl.options.some(([n]) => n === v);
      return (
        <select aria-label={label} value={Number(v)} disabled={sv.disabled} onChange={(e) => sv.setOperands(step.id, [[k, Number(e.target.value)]])}>
          {ctl.options.map(([n, t]) => (
            <option key={n} value={n}>
              {t}
            </option>
          ))}
          {!known && <option value={Number(v)}>{`${label.toLowerCase()} ${v}`}</option>}
        </select>
      );
    }
    case "npc":
      return <NpcField step={step} k={k} allowPlayer={ctl.allowPlayer} label={label} />;
    case "event": {
      const n = Number(v);
      const what = n ? sv.names.event?.(n) : o?.zero;
      return (
        <span className="sv-event-field">
          <NumberField value={n} label={label} min={o?.min ?? 0} max={o?.max ?? 255} onCommit={commitNumber} width={4} />
          {what && <span className="muted small">{what}</span>}
        </span>
      );
    }
    case "number": {
      const n = Number(v);
      const unit = o?.unit === "1/100 s" ? `× 1/100 s = ${n / 100} s` : o?.unit === "half-seconds" ? `half-seconds = ${n / 2} s` : o?.kind === "chance" ? `‰ = ${n / 10}%` : o?.kind === "percent" ? "%" : o?.kind === "money" ? "gold" : "";
      return (
        <span className="sv-number">
          <NumberField value={n} label={label} min={ctl.min} max={ctl.max} onCommit={commitNumber} width={o?.kind === "money" ? 7 : 4} />
          {unit && <span className="muted small">{unit}</span>}
          {n === 0 && ctl.zero && <span className="muted small">({ctl.zero})</span>}
        </span>
      );
    }
    case "text":
      return <TextField step={step} k={k} multiline={ctl.multiline} label={label} />;
    case "shop":
      return <ShopField step={step} label={label} />;
  }
}
