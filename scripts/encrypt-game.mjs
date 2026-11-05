// Encrypt a game for the Games page's locked cards (see src/app/lockedGame.ts).
// Usage: GAME_PASSWORD='…' node scripts/encrypt-game.mjs game.lib public/locked/name.fmje
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const [input, output] = process.argv.slice(2);
const password = process.env.GAME_PASSWORD;
if (!input || !output || !password) {
  console.error("Usage: GAME_PASSWORD='…' node scripts/encrypt-game.mjs game.lib out.fmje");
  process.exit(1);
}
const iterations = 600_000;
const data = readFileSync(input);
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
const out = new Uint8Array(37 + body.length);
out.set([0x46, 0x4d, 0x4a, 0x45, 1], 0);
new DataView(out.buffer).setUint32(5, iterations, true);
out.set(salt, 9);
out.set(iv, 25);
out.set(body, 37);
writeFileSync(output, out);
console.log(`Wrote ${output} (${out.length} bytes)`);
