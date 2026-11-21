// The games list (src/app/fuluGames.ts) and docs/fulu-games.md, written from it, agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COVERAGE, FIRMWARE_LOG, FULU_COUNTS, fuluSummary, GAMES, HAND_TESTS, MILESTONES, PROBLEMS, REMAINING, FULU_OTHERS } from "../src/app/fuluGames";
import { FUNCTIONS } from "../src/fulu/os";
import { HELPERS } from "../src/fulu/runtime";
import { fuluGamesMarkdown } from "../src/app/fuluGamesDoc";

const DOC = new URL("../docs/fulu-games.md", import.meta.url);

describe("the games Fulu should run", () => {
  it("docs/fulu-games.md is written from the list (npx tsx scripts/bbk/fulu-games-doc.mts)", () => {
    expect(readFileSync(DOC, "utf8")).toBe(fuluGamesMarkdown());
  });

  it("names only problems that exist, and each game once", () => {
    const ids = new Set(PROBLEMS.map((p) => p.id));
    for (const g of GAMES) for (const p of g.problems ?? []) expect(ids).toContain(p);
    expect(new Set(GAMES.map((g) => g.name)).size).toBe(GAMES.length);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  it("counts what Fulu answers as src/fulu has it (the site shows the counts)", () => {
    expect(Object.keys(FUNCTIONS).length).toBe(FULU_COUNTS.functions);
    expect(Object.keys(HELPERS).length).toBe(FULU_COUNTS.routines);
    // what the page says they are: what the programs call, and the others (fuluGames.ts)
    expect(FULU_COUNTS.functions).toBe(COVERAGE.apiUsed + FULU_OTHERS.forFulu + FULU_OTHERS.iconSet);
    expect(FULU_COUNTS.routines).toBe(COVERAGE.residentUsed - 1 + FULU_OTHERS.routinesForFulu);
  });

  it("lists as left exactly what the programs stop at or their code calls", () => {
    const left = new Set(REMAINING.map((r) => r.what));
    expect(left.size).toBe(REMAINING.length);
    const needed = new Set(GAMES.flatMap((g) => [...(g.scan ?? []), ...(g.stopsAt ? [g.stopsAt] : [])]));
    expect([...left].sort()).toEqual([...needed].sort());
    for (const r of REMAINING) expect(PROBLEMS.map((p) => p.id)).toContain(r.problem);
    // nothing listed as left is answered by Fulu
    for (const r of REMAINING) if (r.what.startsWith("$")) expect(FUNCTIONS[parseInt(r.what.slice(1), 16)]).toBeUndefined();
    expect(COVERAGE.apiUsed).toBeGreaterThan(left.size);
  });

  it("README.md and docs/fulu-report.md state the list's current numbers", () => {
    const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\s+/g, " ");
    const readme = read("../README.md"), report = read("../docs/fulu-report.md");
    const n = fuluSummary(), fmt = (x: number) => x.toLocaleString("en-US");
    const { functions, routines } = FULU_COUNTS, { apiUsed, residentUsed } = COVERAGE;
    for (const s of [
      `It answers ${functions} OS functions and ${routines} C runtime routines`,
      `all ${n.total} programs of the bbk-games collection run on it`,
      `${n.plays} play the whole time and the other ${n.ends} end`,
    ])
      expect(readme).toContain(s);
    for (const s of [
      `Fulu answers ${functions} OS entries`,
      `${routines} resident C-runtime routines`,
      `| ${n.total} of ${n.total} (${n.plays} play the whole time, ${n.ends} end as on the device) |`,
      `| API entries answered | ${functions}: all ${apiUsed} the collection calls, ${FULU_OTHERS.forFulu} only Fulu's own functions call, and ${FULU_OTHERS.iconSet} status-bar icon functions`,
      `| Resident routines answered | ${routines}: all ${residentUsed - 1} the collection calls`,
      `about ${fmt(COVERAGE.written)} instructions of the firmware's`,
      `${FIRMWARE_LOG.api} of the ${apiUsed} API entries and ${FIRMWARE_LOG.routines} of the ${residentUsed - 1} resident routines`,
    ])
      expect(report).toContain(s);
  });

  it("dates the milestones in order", () => {
    const dates = MILESTONES.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("says what a stopping game stops at, and dates every hand test", () => {
    for (const g of GAMES) expect(g.onFulu === "stops").toBe(!!g.stopsAt);
    for (const t of HAND_TESTS) expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
