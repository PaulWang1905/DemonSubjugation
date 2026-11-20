// Write docs/fulu-games.md from src/app/fuluGames.ts (the games Fulu should
// run, those tested by hand, the problems): npx tsx scripts/bbk/fulu-games-doc.mts
// tests/fulu-games.test.ts fails when the document is not up to date.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fuluGamesMarkdown } from "../../src/app/fuluGamesDoc";

const doc = fileURLToPath(new URL("../../docs/fulu-games.md", import.meta.url));
writeFileSync(doc, fuluGamesMarkdown());
console.log(`wrote ${doc}`);
