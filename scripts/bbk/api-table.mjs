// Markdown table of the OS API entries the scanned games use.
// Usage: node scripts/bbk/api-table.mjs <folder with os-api.json and api-names.json> (writes api-table.md there)
import fs from "node:fs";
const dir = process.argv[2];
const rows = JSON.parse(fs.readFileSync(dir + "/os-api.json", "utf8"));
const names = JSON.parse(fs.readFileSync(dir + "/api-names.json", "utf8"));
const lines = rows.map((r) => {
  const t = r.tables.split(",")[0];
  const n = (names[t] || "").replace(/ ×\d+$/, "").replace(/ \(also.*\)/, "");
  const args = r.argBytes.split(" ")[0].split("×")[0];
  const varies = r.argBytes.includes(" ") ? " (varies)" : "";
  return "| `" + t.toUpperCase() + "` | " + r.target.toUpperCase() + " | " + n + " | " + args + varies + " | " + r.games + " |";
});
fs.writeFileSync(dir + "/api-table.md", lines.join("\n") + "\n");
console.log(lines.length, "rows");
