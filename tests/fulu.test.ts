// Fulu without firmware: a small hand-made program that uses the C runtime,
// a far call into its own second segment, and ends by returning from main.
import { describe, expect, it } from "vitest";
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
    expect(call(0xe9ce)).toBe("Fulu has no FileOpen ($E9CE) yet");
    expect(call(0xe9c8)).toBe("Fulu has no OS function $E9C8 yet");
  });
});
