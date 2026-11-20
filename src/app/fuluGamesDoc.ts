// docs/fulu-games.md, as Markdown, from src/app/fuluGames.ts (written by
// scripts/bbk/fulu-games-doc.mts; tests/fulu-games.test.ts checks the file).
import { fuluSummary, GAMES, HAND_TESTS, PROBLEMS, type FuluGame } from "./fuluGames";

const ON_FULU: Record<FuluGame["onFulu"], string> = { plays: "plays", ends: "ends on its own", stops: "stops" };
const FIRMWARE: Record<FuluGame["firmware"], string> = { full: "full", play: "a minute of play", none: "—" };
const cell = (s: string) => s.replace(/\|/g, "\\|");

export function fuluGamesMarkdown(): string {
  const n = fuluSummary();
  const tested = new Set(HAND_TESTS.map((t) => t.game));
  const gamesWith = (id: string) => GAMES.filter((g) => g.problems?.includes(id)).map((g) => g.name);
  const lines = [
    "# Fulu: the games",
    "",
    "<!-- Written by scripts/bbk/fulu-games-doc.mts from src/app/fuluGames.ts: change that file, then run the script. -->",
    "",
    "The programs Fulu should run, how far each has got, the ones the owner has",
    "played by hand, and the problems known. The programs are the bbk-games",
    "collection's 138 for the Longman 4988 (`eebbk/roms`). The site's Fulu page",
    "shows the same lists.",
    "",
    `- **On Fulu alone** (180 s of random keys each, docs/fulu-report.md §16): ${n.plays} play the whole time, ${n.ends} end on their own (their \`main\` returns, as on the device), ${n.stops} stop at something Fulu lacks.`,
    `- **Compared with BBK's firmware** (the shadow run): ${n.full} in full (their code traced, play, typing and saves compared), ${n.play} for a minute of play.`,
    `- **Tested by hand**: ${HAND_TESTS.length} report${HAND_TESTS.length === 1 ? "" : "s"} (below).`,
    `- **Problems**: ${n.open} open, ${PROBLEMS.length - n.open} decided or fixed.`,
    "",
    "## Problems",
    "",
    "| | Problem | Status | Decision | Games |",
    "|---|---|---|---|---|",
    ...PROBLEMS.map(
      (p) =>
        `| \`${p.id}\` | **${cell(p.title.en)}**${p.notFulu ? " (not Fulu's)" : ""}: ${cell(p.detail.en)} | ${p.status} | ${p.decision ? cell(p.decision.en) : "—"} | ${gamesWith(p.id).join(", ") || "—"} |`,
    ),
    "",
    "## Tested by hand",
    "",
    "What the owner played and reported, as reported. Each new report is added here.",
    "",
    "| Date | Game | Where | What | Result | Notes |",
    "|---|---|---|---|---|---|",
    ...HAND_TESTS.map((t) => `| ${t.date} | ${cell(t.game)} | ${t.engine} | ${cell(t.tested)} | ${t.result} | ${cell(t.notes ?? "")} |`),
    "",
    "## Every program",
    "",
    "Kit: made with BBK's RPG kit (FMJ React's own engine plays it too). On Fulu: plays (the whole 180 s), ends on its own, or stops (at what).",
    "",
    "| # | Game | Kit | On Fulu | Firmware comparison | By hand | Problems |",
    "|---|---|---|---|---|---|---|",
    ...GAMES.map(
      (g, i) =>
        `| ${i + 1} | ${cell(g.name)} | ${g.kit ? "yes" : ""} | ${ON_FULU[g.onFulu]}${g.stopsAt ? ` at ${g.stopsAt}` : ""} | ${FIRMWARE[g.firmware]} | ${tested.has(g.name) ? "yes" : ""} | ${(g.problems ?? []).map((p) => `\`${p}\``).join(", ")} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

