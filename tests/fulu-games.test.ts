// The games list (src/app/fuluGames.ts) and docs/fulu-games.md, written from it, agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FULU_COUNTS, GAMES, HAND_TESTS, PROBLEMS } from "../src/app/fuluGames";
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
  });

  it("says what a stopping game stops at, and dates every hand test", () => {
    for (const g of GAMES) expect(g.onFulu === "stops").toBe(!!g.stopsAt);
    for (const t of HAND_TESTS) expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
