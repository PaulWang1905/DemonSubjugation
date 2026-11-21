// Pieces the wizard dialogs share (Wizards.tsx, WizardsParty.tsx): the
// buttons, who is on the maps, the person picker, the map a wizard starts on.
import { useMemo } from "react";
import type { LibArchive } from "../format/lib";
import type { Texts } from "../format/worldEdit";
import { projectWorld, type WizardResult } from "../format/wizards";
import type { ResValue } from "./ResourcePicker";
import type { WorldIntent } from "./intents";

/** Where a wizard starts (the map shown, the side to join, who is selected). */
export interface WizardInit {
  map?: string;
  /** The person selected in the World view ("script#id"): the shop keeper, the one to fight. */
  person?: string;
  side?: "east" | "west" | "north" | "south";
  /** Tick "join it to" (New map). */
  join?: boolean;
}

/** What a wizard made, with a World view tool to arm and the person it placed (for the next wizard). */
export type RunResult = WizardResult & { arm?: { map: string; intent: WorldIntent }; placed?: { map: string; script: string; id: number } };
export type Run = (make: () => RunResult) => void;

export interface Part {
  archive: LibArchive;
  texts: Texts;
  init?: WizardInit;
  run: Run;
  project: { archive: LibArchive; texts: Texts; namedFlags?: readonly string[] };
}

export function Buttons({ ok, label, disabled }: { ok: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="row wz-buttons">
      <button type="button" onClick={ok} disabled={disabled}>
        {label}
      </button>
      <button type="button" className="ghost" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()}>
        Cancel
      </button>
    </div>
  );
}

/** The map a new game starts on, else the first. */
export function firstMap(archive: LibArchive, texts: Texts): string | undefined {
  try {
    const w = projectWorld({ archive, texts });
    if (w.start) return w.start.map;
  } catch {
    /* fall back */
  }
  const e = archive.entries.find((x) => x.resType === 2);
  return e ? `2-${e.type}-${e.index}` : undefined;
}

export const toValue = (key: string | undefined): ResValue | null => {
  if (!key) return null;
  const [, type, index] = key.split("-").map(Number);
  return { type, index };
};

/** People the scripts place, for the shop, inn and battle wizards: those on `first` (the map in view) first. */
export function usePeople(project: { archive: LibArchive; texts: Texts }, first?: string) {
  return useMemo(() => {
    try {
      const w = projectWorld(project);
      const all = w.placements
        .filter((p) => p.kind === "person")
        .map((p) => ({ key: `${p.script}#${p.id}`, script: p.script, id: p.id, name: p.name || `Person #${p.id}`, map: p.map ? (w.maps.get(p.map)?.name ?? p.map) : "no map", map_key: p.map }))
        .filter((p, i, all) => all.findIndex((q) => q.key === p.key) === i);
      return first ? [...all.filter((p) => p.map_key === first), ...all.filter((p) => p.map_key !== first)] : all;
    } catch {
      return [];
    }
  }, [project.archive, project.texts, first]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Who: nobody chosen at first unless someone is selected on the map (then the wizard asks). */
export function PersonSelect({ people, value, onChange }: { people: ReturnType<typeof usePeople>; value: string; onChange: (v: string) => void }) {
  if (!people.length) return <p className="wz-note small">Nobody is placed on a map yet: make a person first (New person).</p>;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Person" aria-invalid={!value} className={value ? "" : "wz-ask"}>
      {!value && (
        <option value="" disabled>
          Choose who…
        </option>
      )}
      {people.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name} — on {p.map}
          {people.some((q) => q !== p && q.name === p.name && q.map === p.map) ? ` (#${p.id})` : ""}
        </option>
      ))}
    </select>
  );
}
