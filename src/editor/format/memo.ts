// Remembering the results of the editor's slow pure functions (the
// disassembler, the assembler, the world index, the project check) while
// what they were given is unchanged, so opening a big game and the views
// that each ask for the same thing do the work once.
//
// The results are keyed by content, never by object identity alone: a
// project read again from storage (new arrays, the same bytes) finds them,
// and bytes changed in place are never mistaken for the old ones (each
// remembered input is a copy, compared byte for byte).
import type { LibArchive } from "./lib";

/** A 32-bit FNV-1a hash of some bytes. */
export function bytesHash(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
  return h >>> 0;
}

/** Whether two byte arrays hold the same bytes. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A map that keeps the `max` entries used last. */
export class Lru<K, V> {
  private m = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as K);
  }
  clear(): void {
    this.m.clear();
  }
  get size(): number {
    return this.m.size;
  }
}

/** What a project-wide function was given: its resources (copied) and its scripts' sources. */
interface Snapshot {
  keys: Int32Array;
  data: Uint8Array[];
  sources: (string | undefined)[];
}

function snapshot(a: LibArchive, sources: Record<string, string>): Snapshot {
  const n = a.entries.length;
  const keys = new Int32Array(n);
  const data: Uint8Array[] = [];
  const srcs: (string | undefined)[] = [];
  a.entries.forEach((e, i) => {
    keys[i] = (e.resType << 16) | (e.type << 8) | e.index;
    data.push(e.data.slice());
    srcs.push(e.resType === 1 ? sources[`1-${e.type}-${e.index}`] : undefined);
  });
  return { keys, data, sources: srcs };
}

function matches(s: Snapshot, a: LibArchive, sources: Record<string, string>): boolean {
  const n = a.entries.length;
  if (s.keys.length !== n) return false;
  for (let i = 0; i < n; i++) {
    const e = a.entries[i];
    if (s.keys[i] !== ((e.resType << 16) | (e.type << 8) | e.index)) return false;
    if (e.resType === 1 && s.sources[i] !== sources[`1-${e.type}-${e.index}`]) return false;
  }
  for (let i = 0; i < n; i++) if (!sameBytes(s.data[i], a.entries[i].data)) return false;
  return true;
}

/**
 * `fn` of a project (its resources and its scripts' sources), remembered for
 * the last `size` projects given. The result is shared: callers must not
 * change it (the world index and the problem list never are).
 */
export function projectMemo<R>(fn: (a: LibArchive, sources: Record<string, string>) => R, size = 4): ((a: LibArchive, sources?: Record<string, string>) => R) & { clear(): void } {
  let slots: { s: Snapshot; r: R }[] = [];
  const memo = (a: LibArchive, sources: Record<string, string> = {}): R => {
    const i = slots.findIndex((x) => matches(x.s, a, sources));
    if (i >= 0) {
      const hit = slots[i];
      if (i > 0) slots = [hit, ...slots.slice(0, i), ...slots.slice(i + 1)];
      return hit.r;
    }
    const r = fn(a, sources);
    slots = [{ s: snapshot(a, sources), r }, ...slots].slice(0, size);
    return r;
  };
  memo.clear = () => void (slots = []);
  return memo;
}
