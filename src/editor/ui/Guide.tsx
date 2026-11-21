// The guided first game: a small panel at the bottom left of the workspace
// that takes a new author through making something and playing it (paint
// the first map, add a person, give them a line, playtest, add a chest, add
// a second map with an exit, playtest again). Each step says what and why,
// points at the real control (outlined and scrolled into view), and moves on
// by itself when the project shows the step done (guideModel.ts); Done, Skip
// and Back move by hand. It never blocks the editor: it can be folded or
// closed, and the project home resumes it. Progress is kept in the project's
// notes.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LibArchive } from "../format/lib";
import type { ProjectNotes } from "../format/notes";
import { firstLine, type Texts } from "../format/worldEdit";
import { projectWorld } from "../format/wizards";
import type { WorldIndex } from "../format/world";
import { advance, goTo, guideSignals, readGuide, STEPS, writeGuide, type GuideState, type StepId } from "./guideModel";
import type { WorldIntent } from "./intents";
import type { OpenOptions } from "./views";
import type { WizardInit, WizardKind } from "./Wizards";
import "./starter.css";

interface Props {
  archive: LibArchive;
  texts: Texts;
  /** Counts the project's changes. */
  version: number;
  notes: ProjectNotes;
  setNotes: (update: (prev: ProjectNotes) => ProjectNotes) => void;
  onOpen: (key: string, opts?: OpenOptions) => void;
  onArm: (map: string, intent: WorldIntent) => void;
  onPlaytest: () => void;
  onWizard: (kind: WizardKind, init?: WizardInit) => void;
}

/** A control to point at: the first match that is on screen (with this text, if given). */
interface Target {
  sel: string;
  text?: string;
}

function targetsFor(id: StepId, map: string | null, g: GuideState, now: { maps: number; exits: number }): Target[] {
  const view = map ? `.w-view[data-map="${map}"]` : ".w-view";
  const tool = (t: string) => ({ sel: `${view} [data-tool="${t}"][aria-pressed="false"]` });
  switch (id) {
    case "paint":
      return [tool("tile"), { sel: `${view} .w-stage` }];
    case "person":
      return [tool("person"), { sel: `${view} .w-new` }, { sel: `${view} .w-stage` }];
    case "chest":
      return [tool("chest"), { sel: `${view} .w-new` }, { sel: `${view} .w-stage` }];
    case "line":
      return [
        { sel: '.sv-card.sel[aria-label^="Show dialogue"] textarea' },
        { sel: '.sv-card.sel[aria-label^="Show dialogue"]' },
        { sel: '.sv-card[aria-label^="Show dialogue"]' },
        { sel: `${view} button`, text: "Edit what they say" },
        { sel: `${view} .w-person` },
      ];
    case "play":
    case "play2":
      return [{ sel: ".editor-bar button", text: "Playtest" }];
    case "map":
      if (g.base && now.maps > g.base.maps) return [tool("exit"), { sel: `${view} .w-panel` }];
      return [{ sel: '[data-guide-id="new-map"]' }, { sel: '.e-side [data-group="world"] .group-add' }];
  }
}

function findTarget(list: Target[], root: HTMLElement | null): HTMLElement | null {
  for (const t of list) {
    for (const el of document.querySelectorAll<HTMLElement>(t.sel)) {
      if (root?.contains(el)) continue;
      if (el.offsetParent === null) continue;
      if (t.text && !el.textContent?.includes(t.text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) return el;
    }
  }
  return null;
}

export function GuidePanel({ archive, texts, version, notes, setNotes, onOpen, onArm, onPlaytest, onWizard }: Props) {
  const g = readGuide(notes);
  const [folded, setFolded] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const world: WorldIndex | null = useMemo(() => {
    try {
      return projectWorld({ archive, texts });
    } catch {
      return null;
    }
  }, [archive, texts, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useMemo(() => guideSignals(world, archive, g?.playtests ?? 0), [world, archive, g?.playtests]);
  const nowKey = JSON.stringify(now);

  // follow the project: a step done moves on by itself
  useEffect(() => {
    if (!g || g.closed) return;
    const next = advance(g, now);
    if (next !== g) setNotes((n) => {
      const cur = readGuide(n);
      return cur ? writeGuide(n, advance(cur, now)) : n;
    });
  }, [nowKey, g?.step, g?.closed, !g?.base]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = g && g.step < STEPS.length ? STEPS[g.step] : null;

  // point at the control: outline it, and scroll it into view when it first shows
  useEffect(() => {
    if (!g || g.closed || !step) return;
    let shown: HTMLElement | null = null;
    const list = targetsFor(step.id, now.map, g, now);
    const tick = () => {
      const el = findTarget(list, panel.current);
      if (el === shown) return;
      if (shown) delete shown.dataset.guide;
      shown = el;
      if (el) {
        el.dataset.guide = "on";
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    };
    tick();
    const t = window.setInterval(tick, 500);
    return () => {
      clearInterval(t);
      if (shown) delete shown.dataset.guide;
    };
  }, [step?.id, g?.closed, nowKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g || g.closed) return null;
  const set = (fn: (x: GuideState) => GuideState) => setNotes((n) => {
    const cur = readGuide(n);
    return cur ? writeGuide(n, fn(cur)) : n;
  });
  const close = () => set((x) => ({ ...x, closed: true }));
  const map = now.map;

  const showMe = () => {
    if (!step) return;
    const world_ = (tool: string) => {
      if (!map) return;
      onOpen(map, { mode: "map.world" });
      onArm(map, { tool });
    };
    switch (step.id) {
      case "paint":
        return world_("tile");
      case "person":
        return world_("person");
      case "chest":
        return world_("chest");
      case "line": {
        const p = map ? world?.maps.get(map)?.people.find((x) => x.kind === "person") : undefined;
        const m = p ? world?.scripts.get(p.script)?.model : undefined;
        const label = m?.events.find((e) => e.number === p!.id)?.label ?? null;
        const said = m && label ? firstLine(m, label) : null;
        if (p && said) onOpen(p.script, { mode: "visual", line: said.line });
        else world_("person");
        return;
      }
      case "play":
      case "play2":
        return onPlaytest();
      case "map":
        if (g.base && now.maps > g.base.maps) return world_("exit");
        return onWizard("map", { map: map ?? undefined, join: true, side: "east" });
    }
  };

  if (folded)
    return (
      <aside className="guide folded" aria-label="Guide" ref={panel}>
        <button type="button" className="ghost guide-pill" onClick={() => setFolded(false)} aria-expanded="false">
          {step ? `Guide: step ${g.step + 1} of ${STEPS.length} · ${step.title}` : "Guide: done!"}
        </button>
      </aside>
    );

  const progress = step?.progress && g.base ? step.progress(g.base, now) : null;
  return (
    <aside className="guide" aria-label="Your first game: a guide" ref={panel}>
      <header className="guide-head">
        <strong>Your first game</strong>
        <span className="muted small">{step ? `step ${g.step + 1} of ${STEPS.length}` : "done"}</span>
        <span className="spacer" />
        <button type="button" className="ghost icon" onClick={() => setFolded(true)} title="Fold the guide" aria-label="Fold the guide" aria-expanded="true">
          ▁
        </button>
        <button type="button" className="ghost icon" onClick={close} title="Close the guide (the project home brings it back)" aria-label="Close the guide">
          ✕
        </button>
      </header>
      <ol className="guide-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={g.done.includes(i) ? "done" : i === g.step ? "now" : ""} title={s.title} aria-current={i === g.step ? "step" : undefined}>
            <span className="sr-only">{s.title}{g.done.includes(i) ? " (done)" : ""}</span>
          </li>
        ))}
      </ol>
      {step ? (
        <div className="guide-body" aria-live="polite">
          <h4>{step.title}</h4>
          <p className="small">{step.text}</p>
          {progress && <p className="small guide-progress">{progress}</p>}
          <div className="row guide-buttons">
            <button type="button" onClick={showMe}>
              {step.id === "play" || step.id === "play2" ? "▶ Playtest" : step.id === "map" && !(g.base && now.maps > g.base.maps) ? "New map…" : "Show me"}
            </button>
            <button type="button" className="ghost" onClick={() => set((x) => goTo(x, x.step + 1, now, true))} title="Mark this step done and go on">
              Done
            </button>
            <span className="spacer" />
            <button type="button" className="link" onClick={() => set((x) => goTo(x, x.step - 1, now))} disabled={g.step === 0} title="The step before">
              Back
            </button>
            <button type="button" className="link" onClick={() => set((x) => goTo(x, x.step + 1, now))} title="Go on without doing this step">
              Skip
            </button>
          </div>
          <p className="muted small guide-auto">It moves on by itself when you have done it.</p>
        </div>
      ) : (
        <div className="guide-body">
          <h4>You made a game!</h4>
          <p className="small">A map, a person who talks, a chest and a second place to walk to. Next: a shop (New shop…), a battle (New monster or battle…), names for your story flags on the project home, and Export to keep a copy.</p>
          <div className="row guide-buttons">
            <button type="button" onClick={close}>
              Close the guide
            </button>
            <button type="button" className="ghost" onClick={() => set((x) => goTo({ ...x, done: [] }, 0, now))}>
              Start again
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
