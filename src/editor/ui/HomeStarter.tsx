// The project home's quick actions: the wizards (a map, a person, a shop, a
// battle) and the guided first game, where an author looks first.
import type { ProjectNotes } from "../format/notes";
import { readGuide, STEPS } from "./guideModel";
import { WIZARDS, type WizardInit, type WizardKind } from "./Wizards";
import "./starter.css";

interface Props {
  notes: ProjectNotes;
  onWizard: (kind: WizardKind, init?: WizardInit) => void;
  onGuide: () => void;
}

export function HomeQuickActions({ notes, onWizard, onGuide }: Props) {
  const g = readGuide(notes);
  const guide = !g ? "Guide me through a first game" : g.step >= STEPS.length ? "Take the guide again" : g.closed ? `Resume the guide (step ${g.step + 1} of ${STEPS.length})` : `The guide is open (step ${g.step + 1} of ${STEPS.length})`;
  return (
    <section className="p-card" aria-labelledby="qa-title">
      <h3 id="qa-title">Make something</h3>
      <ul className="qa-list">
        <li>
          <button type="button" className="ghost qa guide-qa" onClick={onGuide}>
            <strong>{guide}</strong>
            <span className="muted small">a map, a person, a chest, a second map, played as you go</span>
          </button>
        </li>
        {WIZARDS.map((w) => (
          <li key={w.kind}>
            <button type="button" className="ghost qa" onClick={() => onWizard(w.kind)} {...(w.kind === "map" ? { "data-guide-id": "new-map" } : {})}>
              <strong>New {w.label.charAt(0).toLowerCase() + w.label.slice(1)}</strong>
              <span className="muted small">{w.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
