// Story flags to pick from, by name: the ones the author named (project
// notes) and the ones the scripts use (the world index), with where each is
// set and checked, and the next free number for a new one.
import type { ProjectNotes } from "./notes";
import type { WorldIndex } from "./world";
import { scriptShortLabel } from "./naming";

export interface FlagChoice {
  flag: number;
  /** The author's name for it. */
  name?: string;
  /** "set in start · checked in FOREST", or "" when no script uses it. */
  uses: string;
}

/** The flags in use: named ones and used ones (plus `extra`, e.g. this script's), by number. */
export function flagChoices(notes: ProjectNotes | undefined, world?: WorldIndex, extra: Iterable<number> = []): FlagChoice[] {
  const nums = new Set<number>([...Object.keys(notes?.flags ?? {}).map(Number), ...(world?.flags.keys() ?? []), ...extra]);
  const scriptName = (k: string) => {
    const number = k.split("-").slice(1).join("-");
    const n = world ? scriptShortLabel(world, k, notes) : "";
    return n && n !== `Script ${number}` ? n : `script ${number}`;
  };
  return [...nums]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 2400)
    .sort((a, b) => a - b)
    .map((flag) => {
      const by = new Map<string, Set<string>>();
      for (const u of world?.flags.get(flag) ?? []) {
        const verb = u.access === "read" ? "checked" : u.access === "set" ? "set" : "cleared";
        const where = u.script ? scriptName(u.script) : u.resource ? "an item" : "elsewhere";
        by.set(verb, new Set([...(by.get(verb) ?? []), where]));
      }
      const order = ["set", "checked", "cleared"];
      const uses = order
        .filter((v) => by.has(v))
        .map((v) => `${v} in ${[...by.get(v)!].slice(0, 2).join(", ")}${by.get(v)!.size > 2 ? "…" : ""}`)
        .join(" · ");
      return { flag, name: notes?.flags[String(flag)]?.name, uses };
    });
}

/** The lowest flag number nothing uses or names (and not in `taken`). */
export function nextFreeFlag(notes: ProjectNotes | undefined, world?: WorldIndex, taken: Iterable<number> = []): number {
  const used = new Set<number>([...Object.keys(notes?.flags ?? {}).map(Number), ...(world?.flags.keys() ?? []), ...taken]);
  for (let f = 1; f <= 2400; f++) if (!used.has(f)) return f;
  throw new Error("every story flag is used");
}

/** Choices matching a search (by name, number or where used); a bare number matches its flag first. */
export function searchFlags(list: readonly FlagChoice[], q: string): FlagChoice[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...list];
  const n = /^\d+$/.test(s) ? Number(s) : null;
  const hits = list.filter((c) => c.flag === n || `${c.name ?? ""} ${c.flag} ${c.uses}`.toLowerCase().includes(s));
  return n === null ? hits : [...hits.filter((c) => c.flag === n), ...hits.filter((c) => c.flag !== n)];
}
