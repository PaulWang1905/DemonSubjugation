// Opening a project behind a loading screen. The slow, pure work the
// workspace needs at once (reading every script, the world index, the
// project check, the world map's pictures) is done first, a slice at a time
// with the browser painting in between, so the screen says what is
// happening and keeps moving; what it computes is remembered (format/memo.ts,
// worldArt.ts), so the workspace then finds it ready instead of doing it all
// in one long freeze.
import { Cancelled, nextFrame } from "../../app/slices";
import { scriptSource } from "../format/gut";
import type { LibArchive } from "../format/lib";
import { checkProject } from "../format/validate";
import type { ProjectNotes } from "../format/notes";
import { fullTexts, projectWorld } from "../format/wizards";
import { buildWorld, resKey } from "../format/world";
import { mapThumb } from "./worldArt";
import { worldMapOf } from "./worldMapLayout";

/** A step of opening a project, as the loading screen lists it. */
export interface LoadStep {
  label: string;
  /** Done so far and how many in all, for a step that counts (scripts, maps). */
  done?: number;
  total?: number;
}

export interface LoadState {
  /** "Opening 伏魔记" */
  title: string;
  steps: LoadStep[];
  /** The step under way (steps before it are done). */
  current: number;
}

/** The steps for a project (`first`: steps before preparing, such as reading the file). */
export function loadSteps(a: LibArchive, first: string[] = []): LoadStep[] {
  const scripts = a.entries.filter((e) => e.resType === 1).length;
  const maps = a.entries.filter((e) => e.resType === 2).length;
  return [
    ...first.map((label) => ({ label })),
    { label: `Reading ${scripts} ${scripts === 1 ? "script" : "scripts"}`, done: 0, total: scripts },
    { label: `Indexing the world: ${maps} ${maps === 1 ? "map" : "maps"}, who is where, the exits` },
    { label: "Checking the project" },
    { label: `Drawing ${maps} ${maps === 1 ? "map" : "maps"}`, done: 0, total: maps },
  ];
}

/**
 * Do the work the workspace needs at once, in slices of about `budget` ms
 * with a painted frame between them, reporting each step (`from`: the index
 * of its first step in the loading screen's list). `alive` false stops it
 * (throws Cancelled).
 */
export async function prepareProject(
  a: LibArchive,
  sources: Record<string, string>,
  report: (step: number, done?: number) => void,
  { from = 0, alive = () => true, budget = 14, notes }: { from?: number; alive?: () => boolean; budget?: number; notes?: ProjectNotes } = {},
): Promise<void> {
  let sliceStart = performance.now();
  /** Paint now and then: after `budget` ms of work. */
  const breathe = async (force = false) => {
    if (!force && performance.now() - sliceStart < budget) return;
    await nextFrame();
    if (!alive()) throw new Cancelled();
    sliceStart = performance.now();
  };
  const step = async (n: number, done?: number) => {
    report(from + n, done);
    await breathe(true);
  };

  // 1. every script's text (the disassembly, or the author's text checked against the bytes)
  const scripts = a.entries.filter((e) => e.resType === 1);
  await step(0, 0);
  for (let i = 0; i < scripts.length; i++) {
    const e = scripts[i];
    scriptSource(e.data, sources[resKey(1, e.type, e.index)]);
    if (performance.now() - sliceStart >= budget) {
      report(from, i + 1);
      await breathe();
    }
  }
  report(from, scripts.length);

  // 2. the world index, as the editor and the project home ask for it (the
  // flags card and the World view ask with every script's text)
  await step(1);
  try {
    const world = buildWorld(a, sources);
    await breathe(true);
    projectWorld({ archive: a, texts: fullTexts(a, {}, sources) });
    await breathe(true);
    worldMapOf(world);
  } catch {
    /* the workspace says what is wrong */
  }

  // 3. the project check
  await step(2);
  checkProject(a, sources, notes);

  // 4. the world map's pictures
  const maps = a.entries.filter((e) => e.resType === 2);
  await step(3, 0);
  for (let i = 0; i < maps.length; i++) {
    try {
      mapThumb(a, maps[i].data, 160);
    } catch {
      /* drawn (or not) by the world map itself */
    }
    if (performance.now() - sliceStart >= budget) {
      report(from + 3, i + 1);
      await breathe();
    }
  }
  report(from + 3, maps.length);
  await breathe(true);
}
