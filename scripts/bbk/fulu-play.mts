// The play test of a round: each program of a folder on Fulu alone, with
// random keys from every key a player can press (not the four system keys,
// which leave the program on the device): 60% Enter, the arrows and space,
// 20% any key, 20% letters and digits, a key every 0.2 s. Past each stop it
// goes on (Continue), and when the program ends it starts it again; each
// distinct stop is recorded, with when and the keys before it.
//   npx tsx scripts/bbk/fulu-play.mts <folder of .gam> <shard> <shards> <seconds> [noshift]
// e.g. four shards at once: for i in 0 1 2 3; do ... $i 4 180 > play-$i.txt & done
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Fulu } from "../../src/fulu/fulu";
import { Key } from "../../src/bbk/keys";
import { CPU_HZ } from "../../src/bbk/machine";
const [dir, shard, shards, seconds, noShift] = process.argv.slice(2);
const all = Object.values(Key).filter((k) => k > 3 && (!noShift || k !== Key.lang));
const letters = [0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,0x30,0x31,0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x32,0x33,0x18,0x19,0x1a,0x1b,0x1c,0x1d,0x1e,0x1f,0x34,0x21,0x22,0x23,0x24,0x25,0x26,0x27];
const nav = [Key.enter, Key.up, Key.down, Key.left, Key.right, Key.space];
const files = readdirSync(dir).filter((x) => x.endsWith(".gam")).sort().filter((_, i) => i % +shards === +shard);
for (const file of files) {
  const gam = new Uint8Array(readFileSync(join(dir, file)));
  let seed = 7;
  const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
  const f = new Fulu(), entry = f.install(gam)!;
  f.start(entry);
  const stops = new Map<string, string>(), recent: string[] = [];
  let ends = 0;
  const name = (k: number) => Object.entries(Key).find(([, v]) => v === k)?.[0] ?? (letters.includes(k) ? "ch" : k.toString(16));
  for (let t = 0; t < +seconds * 10; t++) {
    if (t % 2 === 0) {
      const r = rand(10), k = r < 6 ? nav[rand(nav.length)] : r < 8 ? all[rand(all.length)] : letters[rand(letters.length)];
      f.machine.press(k);
      recent.push(name(k));
      if (recent.length > 6) recent.shift();
    }
    f.machine.run(CPU_HZ / 10);
    if (f.stopped) {
      const why = f.stopped;
      if (why !== "The program ended" && !stops.has(why)) stops.set(why, `at ${(t / 10).toFixed(1)} s after ${recent.join(" ")}`);
      if (why === "The program ended") ends++;
      if (!(f.resumable && f.goOn())) { f.start(entry); }
    }
  }
  console.log(`${file.replace(".gam", "")}\tends ${ends}\t${[...stops].map(([w, a]) => `${w} (${a})`).join(" | ") || "-"}`);
}
