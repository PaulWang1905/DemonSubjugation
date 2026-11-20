// Fulu without firmware: a small hand-made program that uses the C runtime,
// a far call into its own second segment, and ends by returning from main.
import { describe, expect, it } from "vitest";
import { Key } from "../src/bbk/keys";
import { CPU_HZ } from "../src/bbk/machine";
import { Fulu } from "../src/fulu/fulu";

/** A .gam: segment 0 (code at $5050), segment 1, and data at file offset $8000. */
function program(main: number[], segment1: number[], data: number[]): Uint8Array {
  const g = new Uint8Array(0x9000);
  g.set([0x47, 0x41, 0x4d, 0]);
  g.set(new TextEncoder().encode("TEST"), 6);
  g.set([0x50, 0x50, 0x00, 0x80, 0x00], 0x40); // entry $5050, data at $8000
  g.set(main, 0x50);
  g.set(segment1, 0x4000);
  g.set(data, 0x8000);
  return g;
}

function run(g: Uint8Array): Fulu {
  const fulu = new Fulu(), file = fulu.install(g);
  expect(file).not.toBeNull();
  fulu.start(file!);
  fulu.machine.run(200_000);
  return fulu;
}

describe("Fulu", () => {
  it("runs a program: a helper, a far call into another segment, the end", () => {
    const fulu = run(
      program(
        [
          0xa9, 7, 0x85, 0x20, 0xa9, 0, 0x85, 0x21, // $20/$21 = 7
          0xa9, 6, 0x85, 0x23, 0xa9, 0, 0x85, 0x24, // $23/$24 = 6
          0x20, 0xf4, 0xdc, // JSR $DCF4: 16-bit multiply
          0xa5, 0x20, 0x8d, 0x00, 0x30, // [$3000] = $20
          0xa2, 0x00, 0x86, 0x26, 0xa2, 0x90, 0x86, 0x27, // $26/$27 = $9000, the far call's entry
          0xa9, 5, 0x20, 0xf6, 0xd2, // A = 5, JSR $D2F6
          0x8d, 0x01, 0x30, // [$3001] = A
          0xad, 0x50, 0x50, 0x8d, 0x02, 0x30, // [$3002] = [$5050]: segment 0 is back
          0x60, // main returns
        ],
        [0x0a, 0x60], // segment 1 at $5000: A *= 2
        [0x00, 0x50, 0xe1], // the entry: $5000 in segment 1
      ),
    );
    const ram = fulu.machine.ram;
    expect([ram[0x3000], ram[0x3001], ram[0x3002]]).toEqual([42, 10, 0xa9]);
    expect(fulu.stopped).toBe("The program ended");
  });

  it("names an OS function it does not have", () => {
    const call = (entry: number) =>
      run(program([0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2, 0x60], [], [])).stopped;
    expect(call(0xe919)).toBe("Fulu has no OS function $E919 yet");
    expect(call(0xe7be)).toBe("Fulu has no OS function $E7BE yet");
  });

  it("goes on past what it lacks, when asked: the call returns 0 and the program plays on", () => {
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const fulu = run(
      program(
        [
          0xa9, 0x55, ...far(0xe7be), 0x8d, 0x00, 0x30, // a function Fulu lacks; [$3000] = what it returned
          ...far(0xe932), 0xa9, 4, ...far(0xe93b), // the GUI's start-up, then input mode 4, which Fulu stops in
          0xa5, 0x28, 0x8d, 0x01, 0x30, 0xa5, 0x29, 0x8d, 0x02, 0x30, // [$3001] = the software stack pointer
          0xa9, 42, 0x8d, 0x03, 0x30, // [$3003] = 42
          0x60, // main returns
        ],
        [],
        [],
      ),
    );
    const ram = fulu.machine.ram, sp = ram[0x28] | (ram[0x29] << 8);
    expect(fulu.stopped).toBe("Fulu has no OS function $E7BE yet");
    expect(fulu.resumable).toBe(true);
    expect(fulu.goOn()).toBe(true);
    fulu.machine.run(200_000);
    expect(ram[0x3000]).toBe(0);
    expect(fulu.stopped).toBe("Fulu has no change of input mode from 2 to 4 yet");
    expect(fulu.goOn()).toBe(true);
    fulu.machine.run(200_000);
    expect(ram[0x3001] | (ram[0x3002] << 8)).toBe(sp); // (its stack as it was before the call)
    expect(ram[0x3003]).toBe(42);
    expect(fulu.stopped).toBe("The program ended");
    expect(fulu.resumable).toBe(false);
    expect(fulu.goOn()).toBe(false);
  });

  it("forgets keys pressed while the program has not asked for one for a while", () => {
    // SysGetKey into [$3000], a busy loop of `loops` x 256 x 256 x 5 cycles, SysGetKey into [$3001]
    const getKey = [0xa2, 0xc1, 0x86, 0x26, 0xa2, 0xe7, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    // (only an RPG kit game's: its library, "LIB", at the start of its data area)
    const after = (loops: number, kit = true) => {
      const fulu = new Fulu(), file = fulu.install(
        program(
          [
            ...getKey, 0x8d, 0x00, 0x30,
            0xa9, loops, 0x85, 0x10, // $10 = loops
            0xa0, 0x00, 0xa2, 0x00, 0xca, 0xd0, 0xfd, 0x88, 0xd0, 0xf8, 0xc6, 0x10, 0xd0, 0xf2,
            ...getKey, 0x8d, 0x01, 0x30,
            0x60,
          ],
          [],
          kit ? [0x4c, 0x49, 0x42] : [],
        ),
      )!;
      fulu.start(file);
      fulu.machine.run(0.02 * CPU_HZ);
      fulu.machine.press(Key.enter);
      fulu.machine.run(1.5 * CPU_HZ);
      expect(fulu.stopped).toBe("The program ended");
      return [fulu.machine.ram[0x3000], fulu.machine.ram[0x3001]];
    };
    expect(after(1)).toEqual([0xff, Key.enter]); // asked again after 40 ms: kept
    expect(after(14)).toEqual([0xff, 0xff]); // after 580 ms: forgotten
    expect(after(14, false)).toEqual([0xff, Key.enter]); // any other program's: kept
  });

  it("gives each new file pages of its own, a file over 4 KB whole sectors that run on", () => {
    // create (type 9) files of these sizes, each closed, then end
    const sizes = [41, 300, 5000, 41, 9000, 41];
    const code: number[] = [];
    const sta = (v: number, a: number) => code.push(0xa9, v & 0xff, 0x8d, a & 0xff, a >> 8);
    const call = (entry: number) => code.push(0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2);
    sizes.forEach((size, n) => {
      [0x54, 0x30 + n, 0].forEach((c, i) => sta(c, 0x1e20 + i)); // name "Tn"
      [size, size >> 8, 0, 0, 0x20, 0x1e, 0x10 + 2 * n, 0x1f, 0x40, 0x1f].forEach((v, i) => sta(v, 0x1e00 + i)); // size (long), name, &id, &handle
      sta(0x00, 0x28);
      sta(0x1e, 0x29);
      code.push(0xa9, 0x09);
      call(0xe9c8);
      code.push(0xad, 0x40, 0x1f);
      call(0xe9d1);
    });
    code.push(0x60);
    const fulu = run(program(code, [], []));
    const m = fulu.machine, f = m.flash.data, ram = m.ram;
    const pageMap = (p: number) => (p < 0x1000 ? 0x4000 : 0xb000) + (p & 0xfff);
    const used = new Map<number, number>();
    sizes.forEach((size, n) => {
      const first = ram[0x1f10 + 2 * n] | (ram[0x1f11 + 2 * n] << 8);
      expect(first).not.toBe(0);
      for (let p = first; p < first + Math.ceil(size / 0x100); p++) {
        expect(used.get(p)).toBeUndefined(); // no page shared with another file
        used.set(p, n);
        expect(f[pageMap(p)]).toBe(2); // marked used
        expect(f[(p < 0x1000 ? 0x1000 : 0x8000) + ((p >> 4) & 0xff)]).toBe(2); // in a data sector
      }
    });
  });
});
