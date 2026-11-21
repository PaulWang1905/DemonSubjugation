// The guided first game (Guide.tsx), as pure logic: its steps, what in the
// project shows each step is done, and the progress kept in the project's
// notes (notes.extra["guide.first"], so it survives a reload and stays with
// the project).
//
// A step is done when the project changes the way the step asks, measured
// against the project as it was when the step began (`base`): the first
// map's tiles change, one more person stands on it, a person's first line
// changes, a playtest runs, one more chest stands there, there is one more
// map and one more exit from the first map to another.
import { findEntry, type LibArchive } from "../format/lib";
import type { ProjectNotes } from "../format/notes";
import type { WorldIndex } from "../format/world";
import { firstLine } from "../format/worldEdit";

export const GUIDE_KEY = "guide.first";

/** What the steps look at. */
export interface Signals {
  /** The map the game starts on. */
  map: string | null;
  /** A hash of its tiles. */
  tiles: number;
  /** People and objects (chests) on it. */
  people: number;
  chests: number;
  /** The first lines its people say, joined. */
  lines: string;
  maps: number;
  /** Exits from the start map to another map. */
  exits: number;
  playtests: number;
}

export interface GuideState {
  v: 1;
  /** The current step (STEPS.length when finished). */
  step: number;
  /** Steps done (by index). */
  done: number[];
  /** The project when the current step began. */
  base: Signals | null;
  /** The panel is hidden (resume from the project home). */
  closed: boolean;
  /** Playtests run since the guide began. */
  playtests: number;
}

export type StepId = "paint" | "person" | "line" | "play" | "chest" | "map" | "play2";

export interface GuideStep {
  id: StepId;
  title: string;
  /** What to do and why, one sentence or two. */
  text: string;
  /** Whether the project shows it done (now against the step's start). */
  check: (base: Signals, now: Signals) => boolean;
  /** Part-way progress to show ("a second map ✓"). */
  progress?: (base: Signals, now: Signals) => string | null;
}

export const STEPS: GuideStep[] = [
  {
    id: "paint",
    title: "Paint your first map",
    text: "In the World view, pick Tile, choose a tile on the right and paint a path or a pond on the meadow: this is the first place the player sees.",
    check: (b, n) => n.map === b.map && n.tiles !== b.tiles,
  },
  {
    id: "person",
    title: "Add a person",
    text: "Pick Add person, choose who it is (or make one from a sprite), then click a tile near the start: people are how a game talks to its player.",
    check: (b, n) => n.map === b.map && n.people > b.people,
  },
  {
    id: "line",
    title: "Give them a line",
    text: "Click your person, press “Edit what they say” and change the say step's text. The box on the right shows it as the player will see it (Wrap mends words split across lines).",
    check: (b, n) => n.people > 0 && n.lines !== b.lines,
  },
  {
    id: "play",
    title: "Playtest and talk to them",
    text: "Press Playtest, walk up to your person and press Enter to hear them. “Back to the editor” brings you here again.",
    check: (b, n) => n.playtests > b.playtests,
  },
  {
    id: "chest",
    title: "Add a chest with an item",
    text: "Pick Add chest, choose the chest and what is inside, then click a tile: opening it gives the item once (a story flag remembers it).",
    check: (b, n) => n.map === b.map && n.chests > b.chests,
  },
  {
    id: "map",
    title: "Add a second map and an exit to it",
    text: "New map… makes a second place; tick “Join it to” your first map and walking off that side takes the party there (and back).",
    check: (b, n) => n.maps > b.maps && n.exits > b.exits,
    progress: (b, n) => (n.maps > b.maps ? (n.exits > b.exits ? null : "A second map ✓. Now an exit to it: Add exit in the first map's World view.") : n.exits > b.exits ? "An exit ✓. Now the map." : null),
  },
  {
    id: "play2",
    title: "Playtest again",
    text: "Open the chest, then walk through the exit to your new map and back: that is a game, made by you.",
    check: (b, n) => n.playtests > b.playtests,
  },
];

const hash = (b: Uint8Array, from: number) => {
  let h = 2166136261;
  for (let i = from; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
  return h >>> 0;
};

/** What the guide's steps look at, from the project. */
export function guideSignals(world: WorldIndex | null, archive: LibArchive, playtests: number): Signals {
  const map = world?.start?.map ?? (findEntry(archive, 2, 1, 1) ? "2-1-1" : null);
  const [, t, i] = (map ?? "0-0-0").split("-").map(Number);
  const e = map ? findEntry(archive, 2, t, i) : undefined;
  const info = map ? world?.maps.get(map) : undefined;
  const people = info?.people.filter((p) => p.kind === "person") ?? [];
  const lines = people
    .map((p) => {
      const m = world?.scripts.get(p.script)?.model;
      const label = m?.events.find((x) => x.number === p.id)?.label ?? null;
      return m && label ? (firstLine(m, label)?.text ?? "") : "";
    })
    .join("|");
  return {
    map,
    tiles: e ? hash(e.data, 0x12) : 0,
    people: people.length,
    chests: info?.people.filter((p) => p.kind === "object").length ?? 0,
    lines,
    maps: archive.entries.filter((x) => x.resType === 2).length,
    exits: info?.exits.filter((x) => x.targets.some((tg) => tg.map !== map)).length ?? 0,
    playtests,
  };
}

/** The guide's progress in the notes, or null when it never began. */
export function readGuide(notes: ProjectNotes): GuideState | null {
  const g = notes.extra[GUIDE_KEY] as Partial<GuideState> | undefined;
  if (!g || typeof g !== "object" || g.v !== 1) return null;
  return {
    v: 1,
    step: Math.max(0, Math.min(STEPS.length, Number(g.step) || 0)),
    done: Array.isArray(g.done) ? g.done.filter((x) => Number.isInteger(x)) : [],
    base: g.base && typeof g.base === "object" ? (g.base as Signals) : null,
    closed: !!g.closed,
    playtests: Number(g.playtests) || 0,
  };
}

export function writeGuide(notes: ProjectNotes, g: GuideState): ProjectNotes {
  return { ...notes, extra: { ...notes.extra, [GUIDE_KEY]: g } };
}

/** A guide at its first step (or its progress, shown again). */
export function startGuide(notes: ProjectNotes): ProjectNotes {
  const g = readGuide(notes);
  if (g) return writeGuide(notes, { ...g, closed: false, step: g.step >= STEPS.length ? 0 : g.step, done: g.step >= STEPS.length ? [] : g.done, base: g.step >= STEPS.length ? null : g.base });
  return writeGuide(notes, { v: 1, step: 0, done: [], base: null, closed: false, playtests: 0 });
}

/** Count a playtest (the playtest steps wait for one). */
export function notePlaytest(notes: ProjectNotes): ProjectNotes {
  const g = readGuide(notes);
  return g && g.step < STEPS.length ? writeGuide(notes, { ...g, playtests: g.playtests + 1 }) : notes;
}

/** Go to a step (by the author: Back, Skip, Done); it begins now. */
export function goTo(g: GuideState, step: number, now: Signals, markDone = false): GuideState {
  const done = markDone && !g.done.includes(g.step) ? [...g.done, g.step] : g.done;
  return { ...g, done, step: Math.max(0, Math.min(STEPS.length, step)), base: now };
}

/**
 * Follow the project: a step that is done is marked and the next begins
 * (with `now` as its start). Returns the same object when nothing changed.
 */
export function advance(g: GuideState, now: Signals): GuideState {
  if (g.step >= STEPS.length) return g;
  // (a guide just begun, or read from an old version: the current step starts now)
  if (!g.base) return { ...g, base: now };
  const step = STEPS[g.step];
  const base = { ...g.base, playtests: g.base.playtests ?? 0 };
  if (!step.check(base, { ...now })) return g;
  const done = g.done.includes(g.step) ? g.done : [...g.done, g.step];
  return { ...g, done, step: g.step + 1, base: now };
}
