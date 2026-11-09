// Finding a game's numbers in RAM, as cheat finders do: start with every
// address, then keep those whose value is a given number, or has changed,
// stayed, gone up or down since the last step, until few are left.

export type Test = { equals: number } | "changed" | "unchanged" | "up" | "down";

export class MemorySearch {
  /** The candidates, and their values at the last step. */
  private addrs: Int32Array;
  private last: Float64Array;

  /** A search of `ram` for numbers of `size` bytes (little-endian, unsigned). */
  constructor(
    private readonly ram: Uint8Array,
    readonly size: 1 | 2 | 4,
  ) {
    this.addrs = Int32Array.from({ length: ram.length - size + 1 }, (_, i) => i);
    this.last = Float64Array.from(this.addrs, (a) => this.value(a));
  }

  /** The number at `addr` now. */
  value(addr: number): number {
    let v = 0;
    for (let i = this.size - 1; i >= 0; i--) v = v * 256 + this.ram[addr + i];
    return v;
  }

  /** Keep the candidates that pass `test`; their values now become the last ones. */
  narrow(test: Test): void {
    const keep = (now: number, before: number) =>
      typeof test === "object" ? now === test.equals : test === "changed" ? now !== before : test === "unchanged" ? now === before : test === "up" ? now > before : now < before;
    const addrs: number[] = [], last: number[] = [];
    this.addrs.forEach((a, i) => {
      const now = this.value(a);
      if (keep(now, this.last[i])) {
        addrs.push(a);
        last.push(now);
      }
    });
    this.addrs = Int32Array.from(addrs);
    this.last = Float64Array.from(last);
  }

  get count(): number {
    return this.addrs.length;
  }

  /** The first `limit` candidates and their values now. */
  results(limit: number): { addr: number; value: number }[] {
    return Array.from(this.addrs.subarray(0, limit), (addr) => ({ addr, value: this.value(addr) }));
  }

  /** Write `v` at `addr`, in this search's size. */
  set(addr: number, v: number): void {
    for (let i = 0; i < this.size; i++, v = Math.floor(v / 256)) this.ram[addr + i] = v & 0xff;
  }
}
