import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SaveStorage } from "../src/engine/java";

export function memorySaves(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (p) => data.get(p) ?? null,
    set: (p, v) => {
      if (v == null) data.delete(p);
      else data.set(p, v);
    },
    has: (p) => data.has(p),
  };
}

/**
 * Real game resources for the optional integration tests. Point FMJ_DATA_DIR
 * at a folder containing DAT.LIB, HZK16 and ASC16 (they are never committed).
 */
export function loadRealResources(): { datLib: Uint8Array; hzk16: Uint8Array; asc16: Uint8Array } | null {
  const dir = process.env.FMJ_DATA_DIR;
  if (!dir) return null;
  const files = ["DAT.LIB", "HZK16", "ASC16"].map((f) => join(dir, f));
  if (!files.every((f) => existsSync(f))) return null;
  const [datLib, hzk16, asc16] = files.map((f) => new Uint8Array(readFileSync(f)));
  return { datLib, hzk16, asc16 };
}
