// The steps of an event in the Visual script view: each instruction a card
// that reads as a sentence with its operands as inline controls; blocks
// (a choice, a battle, an if, a menu) with their arms nested and indented;
// labels as small markers; lines the model cannot read as editable text.
import { useState, type DragEvent, type ReactNode } from "react";
import { commandInfo, sentence, type SentencePart } from "../format/commands";
import type { Arm, InstructionStep, OutlineNode, Position, Step } from "../format/scriptModel";
import { OperandControl, useSv } from "./ScriptVisualControls";
import { controlFor } from "./scriptVisualLogic";

export interface StepProblem {
  level: "error" | "warning";
  message: string;
}

/** What the list of steps needs from the view (selection, editing, moving). */
export interface StepsApi {
  /** A DOM id for a step's card. */
  cardId: (id: number) => string;
  selected: number | null;
  editing: number | null;
  select: (id: number, focus?: boolean) => void;
  toggleEdit: (id: number) => void;
  problems: ReadonlyMap<number, StepProblem[]>;
  /** Steps other lines jump to (label → how many places). */
  refs: ReadonlyMap<string, number>;
  /** Open the palette to add a step at a position. */
  addAt: (pos: Position, where: string) => void;
  move: (id: number, dir: -1 | 1) => void;
  duplicate: (id: number) => void;
  remove: (id: number) => void;
  setLine: (id: number, text: string) => void;
  rename: (from: string, to: string) => void;
  drop: (id: number, target: number, where: "before" | "after") => void;
  /** The arm's / list's end, for "add a step here". */
  listEnd: (nodes: OutlineNode[], fallback: Position) => Position;
  /**
   * Labels only an if's own jump goes to, where its two ways meet again (an
   * if-then's or a skip's join): not shown, the block says it in words.
   */
  joins?: ReadonlySet<string>;
  /** A live text for a step's operand (typed, not stored yet). */
  live: { id: number; k: number; text: string } | null;
  /** The text box shown under a step (narrow views), or nothing. */
  preview?: (id: number) => ReactNode;
}

/** "Ask: …" with the text operands as fields and everything else as inline controls. */
function SentenceLine({ step, header }: { step: InstructionStep; header?: boolean }) {
  const sv = useSv();
  let parts: (SentencePart | { text: string; operand?: undefined; monsters: true })[] = sentence(step.op.name, step.values, sv.names).parts.map((p) => ({ ...p }));
  // a battle's monsters: every one as a picker, and an empty slot to add one
  const isMonster = (p: (typeof parts)[number]) => (p.operand !== undefined && p.kind === "monster") || p.text === "no monsters";
  const m0 = parts.findIndex(isMonster);
  if (m0 >= 0) {
    let m1 = m0;
    while (m1 + 1 < parts.length && (isMonster(parts[m1 + 1]) || (parts[m1 + 1].text === ", " && m1 + 2 < parts.length && isMonster(parts[m1 + 2])))) m1++;
    parts = [...parts.slice(0, m0), { text: "", monsters: true }, ...parts.slice(m1 + 1)];
  }
  if (header) {
    // a block's instruction: what it jumps to is shown as its arms below, so the
    // sentence stops before its first "go to" clause ("Ask: “Yes” or “No”")
    const firstLabel = parts.findIndex((p) => p.operand !== undefined && "kind" in p && p.kind === "label");
    if (firstLabel >= 0) {
      let cut = firstLabel;
      for (let i = 0; i < firstLabel; i++) {
        const p = parts[i];
        if (p.operand !== undefined) continue;
        const m = /;|,\s*go to/.exec(p.text);
        if (m) {
          parts = [...parts.slice(0, i), { text: p.text.slice(0, m.index) }];
          cut = -1;
          break;
        }
      }
      if (cut >= 0) parts = parts.slice(0, cut);
    }
  }
  const multiline = (k: number | undefined) => {
    if (k === undefined) return false;
    const c = controlFor(step.command, k);
    return c.kind === "text" && c.multiline;
  };
  // the quotes around a text field go: the field shows the text
  parts.forEach((p, i) => {
    if (!multiline(p.operand)) return;
    const before = parts[i - 1];
    const after = parts[i + 1];
    if (before && before.operand === undefined) before.text = before.text.replace(/“$/, "");
    if (after && after.operand === undefined) after.text = after.text.replace(/^”/, "");
  });
  const seen = new Set<number>();
  const rows: ReactNode[] = [];
  let inline: ReactNode[] = [];
  // an operand the sentence leaves out when it is 0 ("Say: …" without a portrait):
  // its control at the end of the first line
  const zero = step.command.sentenceIfZero;
  const zk = zero && !header ? step.command.operands.findIndex((o) => o.key === zero.operand) : -1;
  let zeroPending = zk >= 0 && !parts.some((p) => p.operand === zk);
  const flush = () => {
    if (zeroPending) {
      inline.push(<OperandControl key={`z${zk}`} step={step} k={zk} />);
      zeroPending = false;
    }
    if (inline.some((n) => n !== null)) rows.push(<div key={`r${rows.length}`} className="sv-inline">{inline}</div>);
    inline = [];
  };
  parts.forEach((p, i) => {
    if ("monsters" in p) {
      const slots = step.command.operands.flatMap((o, k) => (o.kind === "monster" ? [k] : []));
      const used = slots.filter((k) => step.values[k] !== 0);
      const empty = slots.find((k) => step.values[k] === 0);
      used.forEach((k) => inline.push(<OperandControl key={`m${k}`} step={step} k={k} />));
      if (empty !== undefined)
        inline.push(
          <span key={`m${empty}`} className="sv-add-monster" title="Add a monster">
            {used.length ? "and" : ""}
            <OperandControl step={step} k={empty} />
          </span>,
        );
      return;
    }
    if (p.operand === undefined || seen.has(p.operand)) {
      if (p.text.trim()) inline.push(<span key={`t${i}`}>{p.text}</span>);
      return;
    }
    seen.add(p.operand);
    if (multiline(p.operand)) {
      flush();
      rows.push(<OperandControl key={`o${i}`} step={step} k={p.operand} />);
      return;
    }
    inline.push(<OperandControl key={`o${i}`} step={step} k={p.operand} />);
  });
  flush();
  return <div className="sv-sentence">{rows}</div>;
}

/** Every operand, labelled (the card's details). */
function Details({ step }: { step: InstructionStep }) {
  const c = step.command;
  return (
    <div className="sv-details">
      <p className="small">
        <b>{c.title}.</b> <span className="muted">{c.help}</span>
      </p>
      <div className="sv-fields">
        {c.operands.map((o, k) => {
          const ctl = controlFor(c, k);
          if (ctl.kind === "hidden") return null;
          return (
            <label key={k} className="sv-field" onClick={(e) => ctl.kind !== "text" && e.preventDefault()}>
              <span className="sv-field-label" title={o.help}>
                {o.label}
              </span>
              <OperandControl step={step} k={k} control={ctl} />
            </label>
          );
        })}
      </div>
      <p className="sv-line-text small">
        <span className="muted">Line {step.line}:</span> <code>{step.text.trim()}</code>
      </p>
    </div>
  );
}

function CardTools({ id, api, label }: { id: number; api: StepsApi; label: string }) {
  const sv = useSv();
  return (
    <span className="sv-tools" role="group" aria-label={`${label}: actions`}>
      <button type="button" className="ghost icon" title="Move up (Alt+↑)" aria-label="Move up" disabled={sv.disabled} onClick={(e) => (e.stopPropagation(), api.move(id, -1))}>
        ↑
      </button>
      <button type="button" className="ghost icon" title="Move down (Alt+↓)" aria-label="Move down" disabled={sv.disabled} onClick={(e) => (e.stopPropagation(), api.move(id, 1))}>
        ↓
      </button>
      <button type="button" className="ghost icon" title="Duplicate (Ctrl+D)" aria-label="Duplicate" disabled={sv.disabled} onClick={(e) => (e.stopPropagation(), api.duplicate(id))}>
        ⧉
      </button>
      <button type="button" className="ghost icon danger" title="Delete (Delete)" aria-label="Delete" disabled={sv.disabled} onClick={(e) => (e.stopPropagation(), api.remove(id))}>
        ×
      </button>
    </span>
  );
}

function Problems({ list }: { list?: StepProblem[] }) {
  if (!list?.length) return null;
  return (
    <ul className="sv-problems">
      {list.map((p, i) => (
        <li key={i} className={p.level}>
          {p.level === "error" ? "⛔" : "⚠"} {p.message}
        </li>
      ))}
    </ul>
  );
}

/** A card: one step, selectable, draggable, with its tools. */
function Card({ step, api, kind, children }: { step: Step; api: StepsApi; kind: string; children: ReactNode }) {
  const sv = useSv();
  const [over, setOver] = useState<"before" | "after" | null>(null);
  const selected = api.selected === step.id;
  const title = step.kind === "instruction" ? step.command.title : step.kind === "label" ? `Label ${step.label}` : step.kind === "raw" ? "Script line" : "Note";
  const onDrag = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOver(e.clientY < r.top + r.height / 2 ? "before" : "after");
  };
  return (
    <div
      id={api.cardId(step.id)}
      className={`sv-card sv-${kind}${selected ? " sel" : ""}${over ? ` drop-${over}` : ""}${api.problems.get(step.id)?.some((p) => p.level === "error") ? " has-error" : api.problems.has(step.id) ? " has-warning" : ""}`}
      role="listitem"
      tabIndex={selected ? 0 : -1}
      aria-label={step.kind === "instruction" ? `${title}: ${sentence(step.op.name, step.values, sv.names).text}` : title}
      aria-current={selected ? "true" : undefined}
      data-step={step.id}
      onMouseDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest(".sv-card") !== e.currentTarget) return;
        // typing in a step's field selects the step too (so "+ Add step" adds after it), leaving the focus in the field
        if (t.closest("input, textarea, select, button, .rp, .fp")) {
          if (!selected) api.select(step.id);
          return;
        }
        api.select(step.id, true);
      }}
      onFocus={(e) => (e.target as HTMLElement).closest(".sv-card") === e.currentTarget && api.selected !== step.id && api.select(step.id)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-sv-step")) return;
        e.preventDefault();
        e.stopPropagation();
        onDrag(e);
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        const id = Number(e.dataTransfer.getData("application/x-sv-step"));
        e.preventDefault();
        e.stopPropagation();
        const where = over ?? "after";
        setOver(null);
        if (id) api.drop(id, step.id, where);
      }}
    >
      <span
        className="sv-handle"
        draggable={!sv.disabled}
        title="Drag to move"
        aria-hidden="true"
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-sv-step", String(step.id));
          e.dataTransfer.effectAllowed = "move";
          const card = (e.target as HTMLElement).closest(".sv-card");
          if (card) e.dataTransfer.setDragImage(card, 12, 12);
        }}
      >
        ⋮⋮
      </span>
      <div className="sv-body">{children}</div>
      {step.kind === "instruction" && (
        <button
          type="button"
          className={`ghost sv-more${api.editing === step.id ? " on" : ""}`}
          onClick={() => api.toggleEdit(step.id)}
          aria-expanded={api.editing === step.id}
          aria-label={`${title}: all settings`}
          title={`${title}: all settings (Enter)`}
        >
          {api.editing === step.id ? "▴" : "▾"}
        </button>
      )}
      {selected && <CardTools id={step.id} api={api} label={title} />}
    </div>
  );
}

function InstructionCard({ step, api, header }: { step: InstructionStep; api: StepsApi; header?: boolean }) {
  const editing = api.editing === step.id;
  return (
    <Card step={step} api={api} kind={`op-${step.command.category.replace(/\W+/g, "-").toLowerCase()}`}>
      {(step.command.noEffect || step.label) && (
        <div className="sv-head">
          {step.label && (
            <span className="sv-tag" title="This line has a label">
              ◆ {step.label}
            </span>
          )}
          {step.command.noEffect && <span className="sv-tag">no effect in this engine</span>}
        </div>
      )}
      <SentenceLine step={step} header={header} />
      {step.comment && <p className="sv-comment small">{step.comment.replace(/^;\s*/, "")}</p>}
      {api.preview?.(step.id)}
      {editing && <Details step={step} />}
      {/* (while its text is typed the box beside it says what fits; the stored text's warnings would be stale) */}
      <Problems list={api.live?.id === step.id ? undefined : api.problems.get(step.id)} />
    </Card>
  );
}

function LineField({ step, api, label }: { step: Step; api: StepsApi; label: string }) {
  const sv = useSv();
  const text = step.text.replace(/\r$/, "");
  const [v, setV] = useState(text);
  return (
    <input
      className="sv-raw"
      spellCheck={false}
      aria-label={label}
      value={v}
      disabled={sv.disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== text && api.setLine(step.id, v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.preventDefault(), (e.target as HTMLInputElement).blur());
        else if (e.key === "Escape") setV(text);
      }}
    />
  );
}

function LabelMarker({ step, api }: { step: Step; api: StepsApi }) {
  if (step.label && api.joins?.has(step.label) && !step.comment) return null;
  return <LabelCard step={step} api={api} />;
}

function LabelCard({ step, api }: { step: Step; api: StepsApi }) {
  const sv = useSv();
  const [naming, setNaming] = useState(false);
  const [v, setV] = useState(step.label ?? "");
  const n = api.refs.get(step.label ?? "") ?? 0;
  return (
    <Card step={step} api={api} kind="label">
      <span className="sv-label">
        <span aria-hidden="true">◆</span>{" "}
        {naming ? (
          <input
            className="sv-name-input"
            autoFocus
            value={v}
            aria-label={`New name for the label ${step.label}`}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
              setNaming(false);
              if (v && v !== step.label) api.rename(step.label!, v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.preventDefault(), (e.target as HTMLInputElement).blur());
              else if (e.key === "Escape") (setNaming(false), setV(step.label ?? ""));
            }}
          />
        ) : (
          <button type="button" className="link" disabled={sv.disabled} onClick={() => (setV(step.label ?? ""), setNaming(true))} title="Rename this label everywhere">
            {step.label}
          </button>
        )}
        {n > 0 && <span className="muted small">{`${n} place${n === 1 ? "" : "s"} go${n === 1 ? "es" : ""} here`}</span>}
      </span>
      {step.comment && <span className="sv-comment small">{step.comment.replace(/^;\s*/, "")}</span>}
      <Problems list={api.problems.get(step.id)} />
    </Card>
  );
}

/** A plain step's card. */
function StepNode({ step, api }: { step: Step; api: StepsApi }) {
  switch (step.kind) {
    case "blank":
      return null;
    case "instruction":
      return <InstructionCard step={step} api={api} />;
    case "label":
      return <LabelMarker step={step} api={api} />;
    case "comment":
      return (
        <Card step={step} api={api} kind="comment">
          <span className="sv-kind">note</span>
          <LineField step={step} api={api} label="Comment line" />
        </Card>
      );
    case "raw":
      return (
        <Card step={step} api={api} kind="raw">
          <div className="sv-head">
            <span className="sv-title">Script line</span>
            <span className="sv-tag warn">not understood: kept as written</span>
          </div>
          <LineField step={step} api={api} label="Script line" />
          <Problems list={api.problems.get(step.id)} />
        </Card>
      );
    default:
      return (
        <Card step={step} api={api} kind="raw">
          <div className="sv-head">
            <span className="sv-title">{step.kind === "data" ? "Raw bytes" : "Directive"}</span>
          </div>
          <code className="sv-mono">{step.text.trim()}</code>
          <Problems list={api.problems.get(step.id)} />
        </Card>
      );
  }
}

function GoTo({ label, prefix = "go to" }: { label: string; prefix?: string }) {
  const sv = useSv();
  return (
    <p className="sv-goto small">
      {prefix}{" "}
      <button type="button" className="link" onClick={() => sv.goLabel(label)} title={`Show the label ${label}`}>
        ◆ {label} →
      </button>
    </p>
  );
}

function armTitle(block: string, arm: Arm): string {
  if (block === "choice") return `If the player picks ${arm.title}`;
  if (block === "menu") return `If ${arm.title} is picked`;
  if (block === "ifThen") return "Then";
  return arm.title;
}

function AddHere({ api, pos, where }: { api: StepsApi; pos: Position; where: string }) {
  const sv = useSv();
  return (
    <button type="button" className="sv-add-here" disabled={sv.disabled} onClick={() => api.addAt(pos, where)}>
      + Add a step {where}
    </button>
  );
}

function Block({ node, api }: { node: Extract<OutlineNode, { kind: "block" }>; api: StepsApi }) {
  // where both ways meet again, when the block says it in words (its label is not shown)
  const joined = !!node.joinLabel && !!api.joins?.has(node.joinLabel);
  const hasOtherwise = node.arms.some((a) => a.key === "otherwise");
  return (
    <div className={`sv-block sv-block-${node.block}`} role="group" aria-label={node.step.command.title}>
      <InstructionCard step={node.step} api={api} header={node.arms.length > 0} />
      {/* (an if-then's "go to" past its Then is how the text says "otherwise": shown as the Otherwise below) */}
      {node.extra.map((s) => (node.block === "ifThen" && joined && s.kind === "instruction" && s.op.name === "goto" ? null : <StepNode key={s.id} step={s} api={api} />))}
      <div className="sv-arms">
        {node.arms.map((a) => (
          <div key={a.key + (a.label ?? "")} className={`sv-arm${a.key === "otherwise" ? " sv-otherwise-arm" : ""}`} role="group" aria-label={armTitle(node.block, a)}>
            <div className="sv-arm-head">
              <span>{armTitle(node.block, a)}</span>
              {a.label && a.nodes && !a.skip && !(node.block === "ifThen" && joined) && <span className="muted small">◆ {a.label}</span>}
            </div>
            {a.skip ? (
              joined ? (
                <p className="muted small sv-nothing">nothing: skips the Otherwise and goes on below</p>
              ) : (
                <GoTo label={a.label!} prefix="nothing: goes on at" />
              )
            ) : a.nodes ? (
              <>
                <NodeList nodes={a.nodes} api={api} />
                {a.continuesAt && !(joined && a.continuesAt === node.joinLabel) && <GoTo label={a.continuesAt} prefix="then goes on at" />}
                {(!a.continuesAt || (joined && a.continuesAt === node.joinLabel)) && !endsInBlock(a.nodes) && (
                  <AddHere api={api} pos={api.listEnd(a.nodes, a.labelStep ? { after: a.labelStep.id } : { after: node.step.id })} where={a.key === "otherwise" ? "to the Otherwise" : "here"} />
                )}
              </>
            ) : a.label ? (
              <GoTo label={a.label} />
            ) : null}
          </div>
        ))}
        {node.block === "ifThen" && node.joinLabel && (
          <div className="sv-arm sv-otherwise">
            <div className="sv-arm-head">Otherwise</div>
            <p className="muted small">{joined ? "nothing: both ways go on with the next step" : <>skips to ◆ {node.joinLabel}, where both ways go on</>}</p>
          </div>
        )}
        {node.block === "branch" && !hasOtherwise && node.arms.some((a) => a.nodes) && (
          <div className="sv-arm sv-otherwise">
            <div className="sv-arm-head">Otherwise</div>
            <p className="muted small">goes on with the next step</p>
            <AddHere api={api} pos={{ after: node.step.id }} where="to the Otherwise" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Whether a list's last card is a block (its arms are where steps go then). */
export function endsInBlock(nodes: OutlineNode[]): boolean {
  const vis = nodes.filter((n) => n.step.kind !== "blank" && n.step.kind !== "comment");
  return vis[vis.length - 1]?.kind === "block";
}

/** A list of nodes (an event's or an arm's). */
export function NodeList({ nodes, api }: { nodes: OutlineNode[]; api: StepsApi }) {
  return (
    <div className="sv-list" role="list">
      {nodes.map((n) => (n.kind === "block" ? <Block key={n.step.id} node={n} api={api} /> : <StepNode key={n.step.id} step={n.step} api={api} />))}
    </div>
  );
}

/** The command's title, for messages. */
export const titleOf = (name: string) => commandInfo(name)?.title ?? name;
