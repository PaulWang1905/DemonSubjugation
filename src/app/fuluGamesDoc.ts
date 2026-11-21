// docs/fulu-games.md, as Markdown, from src/app/fuluGames.ts (written by
// scripts/bbk/fulu-games-doc.mts; tests/fulu-games.test.ts checks the file).
import { COVERAGE, fuluSummary, GAMES, HAND_TESTS, MILESTONES, PLAY_HISTORY, PROBLEMS, REMAINING, remainingGames, UPDATED, type FuluGame } from "./fuluGames";

const ON_FULU: Record<FuluGame["onFulu"], string> = { plays: "plays", ends: "ends", stops: "stops" };
const FIRMWARE: Record<FuluGame["firmware"], string> = { full: "full", play: "a minute of play", none: "—" };
const cell = (s: string) => s.replace(/\|/g, "\\|");

export function fuluGamesMarkdown(): string {
  const n = fuluSummary();
  const tested = new Set(HAND_TESTS.map((t) => t.game));
  const gamesWith = (id: string) => GAMES.filter((g) => g.problems?.includes(id)).map((g) => g.name);
  const apiDone = COVERAGE.apiUsed - new Set(GAMES.flatMap((g) => g.scan ?? [])).size;
  const names = (ns: string[]) => (ns.length > 6 ? `${ns.length} programs` : ns.join(", ")) || "—";
  const lines = [
    "# Fulu: the games",
    "",
    "<!-- Written by scripts/bbk/fulu-games-doc.mts from src/app/fuluGames.ts: change that file, then run the script. -->",
    "",
    "The programs Fulu should run, how far each has got, the ones the owner has",
    "played by hand, and the problems known. The programs are the bbk-games",
    "collection's 138 for the Longman 4988 (`eebbk/roms`). The site's Fulu page",
    "shows the same lists, in its progress report (/fulu/progress).",
    "",
    `Updated ${UPDATED}.`,
    "",
    `- **On Fulu alone** (180 s each of random keys from every key a player can press, \`scripts/bbk/fulu-play.mts\`, docs/fulu-report.md §16): ${n.plays} play the whole time, ${n.ends} end as on the device (their \`main\` returns: a game-over box, a menu's quit, Exit; the test starts them again), ${n.stops} stop at something Fulu lacks.`,
    `- **Compared with BBK's firmware** (the shadow run): ${n.full} in full (their code traced, play, typing and saves compared), ${n.play} for a minute of play.`,
    `- **Tested by hand**: ${HAND_TESTS.length} report${HAND_TESTS.length === 1 ? "" : "s"} (below).`,
    `- **Problems**: ${n.open} open, ${PROBLEMS.length - n.open} decided or fixed.`,
    `- **Code scan** (\`scripts/bbk/fulu-coverage.mts --programs\`): ${n.scanClean} programs call nothing Fulu lacks. The programs call ${COVERAGE.apiUsed} OS functions (Fulu answers ${apiDone}) and ${COVERAGE.residentUsed} runtime routines (all answered); about ${COVERAGE.written.toLocaleString("en-US")} instructions of OS code are written and ${COVERAGE.left.toLocaleString("en-US")} left, not counting the OS's own input method (Fulu takes Chinese from the computer's own instead).`,
    "",
    "## How it got here",
    "",
    "Up to Chinese input the play test pressed Enter, the arrows and space; from F9, every key (Shift and Exit included), so more programs end.",
    "",
    "| Step | Play 180 s | End as on the device |",
    "|---|---|---|",
    ...PLAY_HISTORY.map((h) => `| ${h.step.en} | ${h.plays} | ${h.ends} |`),
    "",
    "| Date | Step | What |",
    "|---|---|---|",
    ...MILESTONES.map((m) => `| ${m.date} | ${m.step ?? ""} | **${cell(m.title.en)}**: ${cell(m.detail.en)} |`),
    "",
    "## What is left",
    "",
    ...(REMAINING.length
      ? ["| What | Instructions | Stops in play | Code can call it | When |", "|---|---|---|---|---|"]
      : [
          "Nothing the checks find: both code scans find nothing Fulu lacks in any program, the every-key play test no stop, and the firmware log nothing a program entered that Fulu lacks. What they cannot reach (the long RPGs' endings, say) is covered only by hand tests. Not counted: the OS's own input method (not written: the computer's is used) and sound (kept off).",
        ]),
    ...REMAINING.map((r) => {
      const { stop, canCall } = remainingGames(r.what);
      const what = `${r.what === "input methods" ? "input methods" : `\`${r.what}\``}${r.about ? (r.what === "input methods" ? `: ${cell(r.about.en)}` : ` (${cell(r.about.en)})`) : ""}${r.calls ? `, with ${r.calls.map((c) => `\`${c}\``).join(" ")}` : ""}`;
      return `| ${what} | ${r.size?.toLocaleString("en-US") ?? "not measured"} | ${stop.join(", ") || "—"} | ${names(canCall)} | ${r.plan === "next" ? "next round" : "later"} |`;
    }),
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
    "Kit: made with BBK's RPG kit (FMJ React's own engine plays it too). On Fulu: plays (the whole 180 s), ends (as on the device), or stops (at what). Code scan: what its code can call that Fulu lacks.",
    "",
    "| # | Game | Kit | On Fulu | Firmware comparison | Code scan | By hand | Problems |",
    "|---|---|---|---|---|---|---|---|",
    ...GAMES.map(
      (g, i) =>
        `| ${i + 1} | ${cell(g.name)} | ${g.kit ? "yes" : ""} | ${ON_FULU[g.onFulu]}${g.stopsAt ? ` at ${g.stopsAt}` : ""} | ${FIRMWARE[g.firmware]} | ${(g.scan ?? []).map((a) => `\`${a}\``).join(" ")} | ${tested.has(g.name) ? "yes" : ""} | ${(g.problems ?? []).map((p) => `\`${p}\``).join(", ")} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

