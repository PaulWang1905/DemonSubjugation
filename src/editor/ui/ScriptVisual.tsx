// The Visual view of a script: its events in plain words on the left, the
// chosen event's steps as sentences in the middle (blocks nested, labels as
// markers, lines the model cannot read kept as text), and on the right the
// text box as the player sees it for a dialogue step.
//
// The script's text stays the source of truth: every edit goes through the
// script model (format/scriptModel.ts), is written back as text with only
// the lines it changes, assembled, and stored with onChange(bytes, text).
// An edit that does not assemble is refused (the assembler's message shown).
// Opening a script here writes nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assemble, scriptSource } from "../format/gut";
import { findEntry } from "../format/lib";
import { nextFreeFlag } from "../format/flags";
import { commandInfo, type OperandValue } from "../format/commands";
import {
  addEvent,
  groupOfStep,
  instructionLine,
  jumpLabels,
  labelTarget,
  modelProblems,
  outline,
  parseScript,
  renameLabel,
  setOperand,
  toSource,
  uniqueLabel,
  type EventGroup,
  type InstructionStep,
  type Position,
  type ScriptModel,
} from "../format/scriptModel";
import { buildWorld, projectNames, resKey, scriptNames, type WorldIndex } from "../format/world";
import { withScriptLabels } from "../format/naming";
import { DialoguePreview } from "./DialoguePreview";
import { Sv, type SvContext } from "./ScriptVisualControls";
import { EventList } from "./ScriptVisualEvents";
import { StepPalette } from "./ScriptVisualPalette";
import { endsInBlock, NodeList, type StepProblem, type StepsApi } from "./ScriptVisualSteps";
import {
  addArmLabel,
  commitModel,
  deleteNode,
  dropNode,
  duplicateNode,
  eventEnd,
  eventEntries,
  insertCommand,
  startingValues,
  insertionPoint,
  isDialogue,
  joinLabels,
  listEnd,
  moveNode,
  setLineText,
  setOperands,
  wrapStep,
} from "./scriptVisualLogic";
import { typing, useUndoKeys } from "./undoKeys";
import type { ViewProps } from "./views";
import "./scriptVisual.css";
import "./round2.css";
import { plainProblem } from "./plainWords";

/** The world index of a project version (an archive object and its version count). */
const worldCache = new WeakMap<object, { version: number; world: WorldIndex | undefined; text: Map<string, string> }>();

interface Snap {
  model: ScriptModel;
  selected: number | null;
  eventKey: string | null;
}

type Status = { kind: "error" | "ok"; msg: string; action?: { label: string; run: () => void } };

export function ScriptVisual({ archive, entry, onChange, services }: ViewProps) {
  const key = services.key;
  // the text when the view was created (an own change does not re-create the view)
  // the model is kept (not re-read from the text) so steps keep their ids across edits
  const [model, setModel] = useState(() => parseScript(scriptSource(entry.data, services.source)));
  const text = useMemo(() => toSource(model), [model]);
  const [pendingDraft, setPendingDraft] = useState<string | null>(() => (services.draft !== undefined && services.draft !== text ? services.draft : null));
  const hist = useRef<{ undo: Snap[]; redo: Snap[] }>({ undo: [], redo: [] });
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [live, setLive] = useState<{ id: number; k: number; text: string } | null>(null);
  const [palette, setPalette] = useState<{ pos: Position; where: string } | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardId = useCallback((id: number) => `sv-${key}-${id}`, [key]);
  // the view's width: under 1000 px the preview goes under the selected step
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = anchor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.offsetParent !== null) setNarrow(el.clientWidth < 1000);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- the project around the script ---------------------------------------------
  const world: WorldIndex | undefined = useMemo(() => {
    // (one index per version of the project, shared by the open scripts)
    const cached = worldCache.get(archive);
    if (cached && cached.version === services.version && cached.text.get(key) === text) return cached.world;
    const sources: Record<string, string> = {};
    for (const e of archive.entries) {
      if (e.resType !== 1) continue;
      const k = resKey(1, e.type, e.index);
      const t = k === key ? text : services.scriptText(k);
      if (t !== undefined) sources[k] = t;
    }
    let w: WorldIndex | undefined;
    try {
      w = buildWorld(archive, sources);
    } catch {
      w = undefined;
    }
    worldCache.set(archive, { version: services.version, world: w, text: new Map(Object.entries(sources)) });
    return w;
    // (services.version counts every change to the project)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, services.version, text, key]);
  const names = useMemo(() => (world ? withScriptLabels(scriptNames(world, archive, key, services.notes), world, services.notes) : projectNames(archive, services.notes)), [world, archive, key, services.notes]);
  const placed = useMemo(() => {
    const m = new Map<number, { name: string; kind: "person" | "object" }>();
    for (const p of world?.placements ?? []) if (p.script === key && !m.has(p.id)) m.set(p.id, { name: p.name.trim() || `${p.kind} ${p.resource.split("-")[2]}`, kind: p.kind });
    return m;
  }, [world, key]);
  const people = useMemo(() => new Map([...placed].map(([id, p]) => [id, p.name])), [placed]);

  // --- problems on steps -----------------------------------------------------------------
  const stored = useMemo(() => scriptSource(entry.data, services.source), [entry, services.source]);
  const problems = useMemo(() => {
    const m = new Map<number, StepProblem[]>();
    const add = (id: number, p: StepProblem) => {
      const list = m.get(id) ?? [];
      if (!list.some((x) => x.message === p.message)) list.push(p);
      m.set(id, list);
    };
    for (const p of modelProblems(model)) add(p.stepId, { level: "error", message: plainProblem(p.message) });
    // the project check's (on the stored text: the same text, once an edit is stored)
    if (stored === text) {
      for (const p of services.problems) {
        const s = p.line ? model.steps[p.line - 1] : undefined;
        if (s) add(s.id, { level: p.level, message: plainProblem(p.message) });
      }
    }
    return m;
  }, [model, services.problems, stored, text]);
  const generalProblems = stored === text ? services.problems.filter((p) => !p.line) : [];
  const problemLines = useMemo(() => new Set([...problems.keys()].map((id) => model.steps.find((s) => s.id === id)?.line ?? 0)), [problems, model]);

  // --- events --------------------------------------------------------------------------
  const entries = useMemo(() => eventEntries(model, { script: key, world, names, problemLines }), [model, key, world, names, problemLines]);
  const current = entries.find((e) => e.key === eventKey) ?? entries[0] ?? null;
  const group: EventGroup | null = current?.group ?? null;
  const nodes = useMemo(() => (group ? outline(model, group) : []), [model, group]);
  // jumps to each label (the event table's entries left out)
  const refs = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of model.steps) for (const l of jumpLabels(st)) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  }, [model]);
  const entryKeyOf = (g: EventGroup | undefined) => (g ? entries.find((e) => e.group === g)?.key ?? null : null);

  // --- selection --------------------------------------------------------------------------
  const focusCard = (id: number, control = false) =>
    requestAnimationFrame(() => {
      const el = document.getElementById(cardId(id));
      if (!el) return;
      el.scrollIntoView({ block: "nearest" });
      const c = control ? (el.querySelector<HTMLElement>(":scope > .sv-body textarea") ?? el.querySelector<HTMLElement>("textarea, input, select, .rp-btn")) : null;
      (c ?? el).focus({ preventScroll: true });
    });
  const select = (id: number, focus = false) => {
    setSelected(id);
    if (editing !== null && editing !== id) setEditing(null);
    if (focus) focusCard(id);
  };
  /** Show a step: its event, selected and scrolled to. */
  const showStep = (id: number) => {
    const g = groupOfStep(model, id);
    const k = entryKeyOf(g);
    if (k) setEventKey(k);
    setSelected(id);
    focusCard(id);
  };
  const goLabel = (label: string) => {
    const t = labelTarget(model, label);
    const at = t >= 0 ? t : model.labels.get(label);
    if (at !== undefined && at >= 0) showStep(model.steps[at].id);
  };
  // a request to show a line (from the project check, the sidebar)
  useEffect(() => {
    const g = services.goto;
    if (!g) return;
    const s = model.steps[g.line - 1];
    if (s) showStep(s.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.goto?.n]);

  // --- edits ----------------------------------------------------------------------------
  const commit = (next: ScriptModel | null, sel?: number | null, note?: string): boolean => {
    if (!next) return false;
    if (pendingDraft !== null) {
      setStatus({ kind: "error", msg: "Apply or discard the text edits first." });
      return false;
    }
    const c = commitModel(next, entry.type, entry.index);
    if (!c.ok) {
      setStatus({ kind: "error", msg: `Not changed: ${c.message}` });
      return false;
    }
    if (c.text === text) return false;
    hist.current.undo.push({ model, selected, eventKey: current?.key ?? null });
    if (hist.current.undo.length > 200) hist.current.undo.shift();
    hist.current.redo = [];
    setModel(next);
    onChange(c.bin, c.text);
    if (sel !== undefined) setSelected(sel);
    setStatus(note ? { kind: "ok", msg: note } : null);
    return true;
  };
  const edit = (f: (m: ScriptModel) => ScriptModel | null, sel?: number | null, note?: string): boolean => {
    try {
      return commit(f(model), sel, note);
    } catch (e) {
      setStatus({ kind: "error", msg: `Not changed: ${(e as Error).message}` });
      return false;
    }
  };
  const restore = (from: Snap[], to: Snap[], what: string) => {
    if (pendingDraft !== null) return;
    const s = from.pop();
    if (!s) return;
    try {
      const t = toSource(s.model);
      const bin = assemble(t);
      to.push({ model, selected, eventKey: current?.key ?? null });
      setModel(s.model);
      onChange(bin, t);
      setEventKey(s.eventKey);
      setSelected(s.selected);
      setStatus({ kind: "ok", msg: what });
      if (s.selected !== null) focusCard(s.selected);
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
    }
  };
  const undo = () => restore(hist.current.undo, hist.current.redo, "Undone.");
  const redo = () => restore(hist.current.redo, hist.current.undo, "Redone.");
  useUndoKeys(anchor, undo, redo);

  const move = (id: number, dir: -1 | 1) => {
    if (!group) return;
    const next = moveNode(model, group, id, dir);
    if (!next) return setStatus({ kind: "error", msg: dir < 0 ? "It is already the first step here." : "It is already the last step here." });
    if (commit(next, id)) focusCard(id);
  };
  const duplicate = (id: number) => {
    if (!group) return;
    let newId: number | null = null;
    if (
      edit((m) => {
        const r = duplicateNode(m, group, id);
        if (!r) return null;
        newId = r.id;
        return r.model;
      })
    )
      if (newId !== null) (setSelected(newId), focusCard(newId));
  };
  const remove = (id: number) => {
    if (!group) return;
    const list = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-step]") ?? [])].map((el) => Number(el.dataset.step));
    const i = list.indexOf(id);
    const r = deleteNode(model, group, id);
    if ("error" in r) return setStatus({ kind: "error", msg: r.error });
    if (commit(r.model)) {
      const nextId = list.filter((x) => r.model.steps.some((s) => s.id === x))[Math.max(0, i - 1)] ?? null;
      setSelected(nextId);
      setEditing(null);
      if (nextId !== null) focusCard(nextId);
      else listRef.current?.focus();
    }
  };
  const setOps = (id: number, changes: readonly (readonly [number, OperandValue])[]) => edit((m) => setOperands(m, id, changes), id);

  // --- adding ---------------------------------------------------------------------------------
  const titleOf = (id: number | null) => {
    const s = id !== null ? model.steps.find((x) => x.id === id) : undefined;
    return s?.kind === "instruction" ? s.command.title : s?.label ? `◆ ${s.label}` : "the step";
  };
  const openPalette = (pos?: Position, where?: string) => {
    if (!group || pendingDraft !== null) return;
    const p = pos ?? insertionPoint(model, group, selected);
    const w = where ?? (p === "end" ? "at the end" : "before" in p ? `before “${titleOf(p.before)}”` : `after “${titleOf(p.after)}”`);
    setPalette({ pos: p, where: w });
  };
  const pick = (name: string) => {
    const p = palette;
    setPalette(null);
    if (!p || !group) return;
    let id: number | null = null;
    const ok = edit((m) => {
      // (a new battle shows a background the project has, not the missing picture 0; a new shop the project's items)
      const fight = name === "enterfight" || name === "initfight" || name === "buy";
      let values = fight ? startingValues(name, (rt, t, i) => !!findEntry(archive, rt, t, i)) : undefined;
      // (a new flag step starts on a flag nothing uses yet, not on another story's flag: the author picks one)
      const fk = commandInfo(name)?.operands.findIndex((o) => o.kind === "flag") ?? -1;
      if (fk >= 0) {
        const inScript = m.steps.flatMap((s) => (s.kind === "instruction" ? s.command.operands.flatMap((o, k) => (o.kind === "flag" && typeof s.values[k] === "number" ? [s.values[k] as number] : [])) : []));
        values = values ?? startingValues(name);
        values[fk] = nextFreeFlag(services.notes, world, inScript);
      }
      const r = insertCommand(m, group, name, p.pos, values);
      id = r.id;
      return r.model;
    });
    if (ok && id !== null) {
      setSelected(id);
      setEditing(null);
      const c = commandInfo(name);
      focusCard(id, !!c?.operands.some((o) => o.kind === "text"));
      setStatus({ kind: "ok", msg: `Added “${c?.title ?? name}”.` });
    } else listRef.current?.focus();
  };

  const onAddEvent = (a: { kind: "talk"; id: number } | { kind: "tile"; mapEvent: number }) => {
    if (a.kind === "talk") {
      const label = uniqueLabel(model, `talk_${a.id}`);
      const who = placed.get(a.id);
      const body = who?.kind === "person" ? [instructionLine("facetoface", [0, a.id]), "  callback"] : ["  callback"];
      if (edit((m) => addEvent(m, a.id, label, body), null, `Added the event for #${a.id}${who ? ` (${who.name})` : ""}.`)) setEventKey(`group-${label}`);
    } else {
      const label = uniqueLabel(model, `tile_${a.mapEvent}`);
      const map = world?.scripts.get(key)?.maps[0];
      if (edit((m) => addEvent(m, 40 + a.mapEvent, label), null)) {
        setEventKey(`group-${label}`);
        setStatus({
          kind: "ok",
          msg: `Added map event ${a.mapEvent}. Paint ${a.mapEvent} on the map's cells (Tiles view, Event tool) where it should happen.`,
          action: map ? { label: "Open the map", run: () => services.openResource(map, { mode: "map.tiles" }) } : undefined,
        });
      }
    }
  };

  // --- the draft from the Text view -----------------------------------------------------------
  const applyDraft = () => {
    const d = pendingDraft;
    if (d === null) return;
    try {
      const bin = assemble(d);
      if (bin[0] !== entry.type || bin[1] !== entry.index) throw new Error(`the .gut line must stay "${entry.type} ${entry.index}"`);
      hist.current.undo.push({ model, selected, eventKey: current?.key ?? null });
      setModel(parseScript(d));
      onChange(bin, d);
      services.setDraft(null);
      setPendingDraft(null);
      setStatus({ kind: "ok", msg: "Applied the text edits." });
    } catch (e) {
      setStatus({ kind: "error", msg: `The text edits do not assemble: ${(e as Error).message}`, action: { label: "Fix them in the Text view", run: () => services.openResource(key, { mode: "script.text" }) } });
    }
  };
  const discardDraft = () => {
    services.setDraft(null);
    setPendingDraft(null);
    setStatus({ kind: "ok", msg: "Discarded the text edits." });
  };

  // --- keys -------------------------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (typing(e.nativeEvent)) {
      // Escape or Enter in a step's field: back to its card (the field keeps or reverts its value)
      const inCard = (e.target as HTMLElement).closest(".sv-card");
      if (inCard && selected !== null && (e.key === "Escape" || (e.key === "Enter" && (e.target as HTMLElement).tagName !== "SELECT"))) focusCard(selected);
      return;
    }
    if (palette) return;
    const ids = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-step]") ?? [])].map((el) => Number(el.dataset.step));
    const i = selected === null ? -1 : ids.indexOf(selected);
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (selected !== null) move(selected, e.key === "ArrowUp" ? -1 : 1);
    } else if (!mod && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      if (!ids.length) return;
      const n = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : e.key === "ArrowDown" ? Math.min(ids.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      select(ids[n], true);
    } else if (e.key === "Enter" && selected !== null && !mod) {
      e.preventDefault();
      const s = model.steps.find((x) => x.id === selected);
      if (s?.kind === "instruction") {
        setEditing(selected);
        focusCard(selected, true);
      } else focusCard(selected, true);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected !== null && !mod) {
      e.preventDefault();
      remove(selected);
    } else if (mod && e.key.toLowerCase() === "d" && selected !== null) {
      e.preventDefault();
      duplicate(selected);
    } else if (e.key === "Escape") {
      setEditing(null);
      setPalette(null);
      if (selected !== null && (e.target as HTMLElement).closest(".sv-card") && !(e.target as HTMLElement).matches(".sv-card")) focusCard(selected);
    } else if (e.key === "Insert" || (e.key === "+" && !mod) || (mod && e.key === "Enter")) {
      e.preventDefault();
      openPalette();
    }
  };

  // --- the view ---------------------------------------------------------------------------------
  const ctx: SvContext = {
    archive,
    model,
    names,
    notes: services.notes,
    setNotes: services.setNotes,
    people,
    world,
    setOperands: setOps,
    newLabel: (id, k) => {
      if (!group) return;
      edit((m) => {
        const s = m.steps.find((x) => x.id === id) as InstructionStep | undefined;
        const base = s ? (s.command.operands[k]?.key ?? "label").replace(/^if/, "").toLowerCase() || "label" : "label";
        const r = addArmLabel(m, group, base);
        return setOperand(r.model, id, k, r.label);
      }, id);
    },
    setLive,
    refuse: (msg) => setStatus({ kind: "error", msg: `Not changed: ${msg}` }),
    goLabel,
    disabled: pendingDraft !== null,
  };
  const api: StepsApi = {
    cardId,
    selected,
    editing,
    select,
    toggleEdit: (id) => {
      setSelected(id);
      setEditing((e) => (e === id ? null : id));
    },
    problems,
    refs,
    addAt: (pos, where) => openPalette(pos, where === "here" ? "at the end of this branch" : where),
    move,
    duplicate,
    remove,
    setLine: (id, t) => edit((m) => setLineText(m, id, t), id),
    rename: (from, to) => {
      if (edit((m) => renameLabel(m, from, to))) if (eventKey === `group-${from}`) setEventKey(`group-${to}`);
    },
    drop: (id, target, where) => {
      if (!group) return;
      const next = dropNode(model, group, id, target, where);
      if (!next) return setStatus({ kind: "error", msg: "It cannot go there." });
      if (commit(next, id)) focusCard(id);
    },
    listEnd,
    // (labels said in words, so not shown: joins, branches' own labels, and the event's own label when only the event table points to it)
    joins: (() => {
      const j = joinLabels(nodes, refs);
      if (group?.label && !refs.get(group.label)) j.add(group.label);
      return j;
    })(),
    live,
  };

  const sel = selected !== null ? model.steps.find((s) => s.id === selected) : undefined;
  const dialogue = isDialogue(sel) ? sel : null;
  const dialogueValues: OperandValue[] | null = dialogue ? (live && live.id === dialogue.id ? dialogue.values.map((v, k) => (k === live.k ? live.text : v)) : dialogue.values) : null;
  const preview =
    dialogue && dialogueValues ? (
      <DialoguePreview
        archive={archive}
        name={dialogue.op.name}
        values={dialogueValues}
        onWrap={
          dialogue.op.name === "choice" || dialogue.op.name === "showgut"
            ? null
            : () => {
                const next = wrapStep(model, dialogue.id);
                if (!next) setStatus({ kind: "ok", msg: "No words are split; nothing to wrap." });
                else commit(next, dialogue.id, "Re-wrapped the text.");
              }
        }
      />
    ) : null;
  // narrow (the 1280 px desktop): two columns, the preview under the selected step
  api.preview = narrow && dialogue ? (id) => (id === dialogue.id ? preview : null) : undefined;
  const allProblems = [...problems.entries()].flatMap(([id, list]) => list.map((p) => ({ id, ...p })));
  const errors = allProblems.filter((p) => p.level === "error").length;

  return (
    <Sv.Provider value={ctx}>
      <div className="sv" ref={anchor} onKeyDown={onKeyDown}>
        {pendingDraft !== null && (
          <div className="sv-banner" role="alert">
            <span>This script has unapplied text edits (made in the Text view).</span>
            <button type="button" onClick={applyDraft}>
              Apply them
            </button>
            <button type="button" className="ghost" onClick={discardDraft}>
              Discard them
            </button>
          </div>
        )}
        <div className="sv-bar">
          <button type="button" onClick={() => openPalette()} disabled={!group || pendingDraft !== null} title="Add a step after the selected one (Insert or +)">
            + Add step
          </button>
          <button type="button" className="ghost" onClick={undo} disabled={!hist.current.undo.length || pendingDraft !== null} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="ghost" onClick={redo} disabled={!hist.current.redo.length || pendingDraft !== null} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <span className={`sv-status small ${status?.kind ?? ""}`} role={status?.kind === "error" ? "alert" : "status"}>
            {status?.msg}
            {status?.action && (
              <button type="button" className="link" onClick={status.action.run}>
                {status.action.label}
              </button>
            )}
          </span>
          <span className="spacer" />
          {allProblems.length + generalProblems.length > 0 ? (
            <button type="button" className={`ghost sv-problem-sum ${errors ? "error" : "warning"}`} aria-expanded={showProblems} onClick={() => setShowProblems((v) => !v)}>
              {errors ? "⛔" : "⚠"} {allProblems.length + generalProblems.length} problem{allProblems.length + generalProblems.length === 1 ? "" : "s"} in this script
            </button>
          ) : (
            <span className="muted small">No problems found</span>
          )}
        </div>
        {showProblems && (allProblems.length > 0 || generalProblems.length > 0) && (
          <ul className="sv-problem-list">
            {allProblems.map((p, i) => (
              <li key={i} className={p.level}>
                <button type="button" className="link" onClick={() => showStep(p.id)}>
                  Line {model.steps.find((s) => s.id === p.id)?.line}
                </button>{" "}
                {p.message}
              </li>
            ))}
            {generalProblems.map((p, i) => (
              <li key={`g${i}`} className={p.level}>
                {p.message}
              </li>
            ))}
          </ul>
        )}
        <div className={`sv-grid${narrow ? " narrow" : ""}`}>
          <EventList entries={entries} current={current?.key ?? null} onSelect={(k) => (setEventKey(k), setSelected(null), setEditing(null))} model={model} placed={placed} disabled={pendingDraft !== null} onAdd={onAddEvent} />
          <section className={`sv-main${pendingDraft !== null ? " locked" : ""}`} aria-label="Steps">
            {current && (
              <header className="sv-main-head">
                <h3>{current.title}</h3>
                {current.detail && <p className="muted small">{current.detail}</p>}
              </header>
            )}
            {palette && <StepPalette where={palette.where} onPick={pick} onClose={() => (setPalette(null), selected !== null ? focusCard(selected) : listRef.current?.focus())} />}
            {current?.kind === "raw" && <p className="muted">This event runs code the editor cannot show as steps. Open the Text view to edit it.</p>}
            {group && (
              <div className="sv-steps" ref={listRef} tabIndex={selected === null ? 0 : -1} aria-label={`Steps of ${current?.title ?? "the event"}`} onFocus={(e) => {
                  if (e.target !== e.currentTarget || selected !== null) return;
                  const first = listRef.current?.querySelector<HTMLElement>("[data-step]");
                  if (first) select(Number(first.dataset.step), true);
                }}>
                {nodes.some((n) => n.step.kind !== "blank") ? <NodeList nodes={nodes} api={api} /> : <p className="muted">No steps yet.</p>}
                {!endsInBlock(nodes) && (
                  <button type="button" className="sv-add-here end" disabled={pendingDraft !== null} onClick={() => openPalette(eventEnd(model, group), "at the end of the event")}>
                    + Add a step at the end
                  </button>
                )}
              </div>
            )}
            <p className="sv-keys muted small">
              <kbd>↑</kbd> <kbd>↓</kbd> select · <kbd>Enter</kbd> edit · <kbd>Alt+↑↓</kbd> move · <kbd>Ctrl+D</kbd> duplicate · <kbd>Delete</kbd> remove · <kbd>+</kbd> add · <kbd>Ctrl+Z</kbd> undo
            </p>
          </section>
          {!narrow && (
          <aside className="sv-aside" aria-label="Preview">
            {preview ? (
              <>
                <h3>As the player sees it</h3>
                {preview}
              </>
            ) : sel?.kind === "instruction" ? (
              <>
                <h3>{sel.command.title}</h3>
                <p className="muted small">{sel.command.help}</p>
                {sel.command.operands.length > 0 && (
                  <p className="muted small">
                    <kbd>Enter</kbd> or ▾ shows all of its settings.
                  </p>
                )}
              </>
            ) : (
              <div className="muted small sv-aside-help">
                <h3>Steps</h3>
                <p>Each step reads as a sentence; change the coloured parts in place. Select a line of dialogue to see it as the player will.</p>
                <p>Steps run from the top. Branches (a question, a battle, a flag check) show what happens each way, indented.</p>
              </div>
            )}
          </aside>
          )}
        </div>
      </div>
    </Sv.Provider>
  );
}
