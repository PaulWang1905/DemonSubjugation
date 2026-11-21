// Fulu without firmware: a small hand-made program that uses the C runtime,
// a far call into its own second segment, and ends by returning from main.
import { describe, expect, it } from "vitest";
import { Key } from "../src/bbk/keys";
import { CPU_HZ } from "../src/bbk/machine";
import { FAR_CALL, Fulu } from "../src/fulu/fulu";

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
    expect(call(0xe925)).toBe("Fulu has no OS function $E925 yet");
  });

  it("goes on past what it lacks, when asked: the call returns 0 and the program plays on", () => {
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const fulu = run(
      program(
        [
          0xa9, 0x55, ...far(0xe925), 0x8d, 0x00, 0x30, // a function Fulu lacks; [$3000] = what it returned
          // $E96B(one of the OS's own help texts), which Fulu stops in: the word pushed, the call, the word dropped
          0xa9, 0x00, 0x85, 0x20, 0xa9, 0x01, 0x85, 0x21, 0x20, 0xca, 0xda, ...far(0xe96b),
          0x18, 0xa5, 0x28, 0x69, 2, 0x85, 0x28, 0xa5, 0x29, 0x69, 0, 0x85, 0x29,
          0xa5, 0x28, 0x8d, 0x01, 0x30, 0xa5, 0x29, 0x8d, 0x02, 0x30, // [$3001] = the software stack pointer
          0xa9, 42, 0x8d, 0x03, 0x30, // [$3003] = 42
          0x60, // main returns
        ],
        [],
        [],
      ),
    );
    const ram = fulu.machine.ram, sp = ram[0x28] | (ram[0x29] << 8);
    expect(fulu.stopped).toBe("Fulu has no OS function $E925 yet");
    expect(fulu.resumable).toBe(true);
    expect(fulu.goOn()).toBe(true);
    fulu.machine.run(200_000);
    expect(ram[0x3000]).toBe(0);
    expect(fulu.stopped).toBe("Fulu has no $E96B with one of the OS's own help texts yet");
    expect(fulu.goOn()).toBe(true);
    fulu.machine.run(200_000);
    expect(ram[0x3001] | (ram[0x3002] << 8)).toBe(sp); // (its stack as it was before the call)
    expect(ram[0x3003]).toBe(42);
    expect(fulu.stopped).toBe("The program ended");
    expect(fulu.resumable).toBe(false);
    expect(fulu.goOn()).toBe(false);
  });

  it("takes Chinese typed with the computer's input method, as the OS's input method gives it", () => {
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const fulu = run(program([...far(0xe932), 0xa9, 4, ...far(0xe93b), 0x60], [], []));
    const ram = fulu.machine.ram, record = (i: number) => [ram[0x2b0f + 3 * i], ram[0x2b10 + 3 * i] | (ram[0x2b11 + 3 * i] << 8)];
    expect(fulu.stopped).toBe("The program ended");
    expect(ram[0x2b27] & 0x0f).toBe(4); // input mode 4: Chinese
    expect(fulu.chineseInput).toBe(true);
    expect(ram[0x2b0b]).toBe(1); // the mode change's message, $0A 1
    expect(record(0)).toEqual([0x0a, 1]);
    fulu.type("你好a😀");
    expect(ram[0x2b0b]).toBe(4); // (the emoji has no GB2312 code: left out)
    expect([1, 2, 3].map(record)).toEqual([[3, 0xc4e3], [3, 0xbac3], [2, 0x61]]);
  });

  it("starts a program in the state BBK's launcher leaves, with the clock it is given", () => {
    // $E99E date($3000): the day, month, year - 1900, weekday (1 Monday)
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const g = program([0xa9, 0x00, 0x85, 0x20, 0xa9, 0x30, 0x85, 0x21, 0x20, 0xca, 0xda, ...far(0xe99e), 0x60], [], []);
    const date = (clock?: Date) => {
      const fulu = new Fulu(), file = fulu.install(g)!;
      fulu.start(file, clock);
      const ram = fulu.machine.ram;
      // the launcher's: input mode 2, keyboard state $0F, no help word
      expect([ram[0x2b27], ram[0x2b28], ram[0x2ba8], ram[0x2ba9]]).toEqual([2, 0x0f, 0xff, 0xff]);
      fulu.machine.run(200_000);
      expect(fulu.stopped).toBe("The program ended");
      return [...ram.subarray(0x3000, 0x3004)];
    };
    expect(date()).toEqual([1, 10, 104, 5]); // the launcher's clock: Friday 1 October 2004
    expect(date(new Date(2026, 10, 21, 9, 30, 5))).toEqual([21, 11, 126, 6]); // Saturday 21 November 2026
    expect(date(new Date(2024, 1, 29, 23, 59, 0))).toEqual([29, 2, 124, 4]); // Thursday 29 February 2024
  });

  it("drops typed text the program did not take before it left Chinese input", () => {
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const fulu = run(program([...far(0xe932), 0xa9, 4, ...far(0xe93b), 0x60], [], []));
    const ram = fulu.machine.ram;
    fulu.type("一二三四五六七八九十");
    expect(ram[0x2b0b]).toBe(8); // the queue full: three left to give
    ram[0x2b27] = (ram[0x2b27] & 0xf0) | 2; // out of Chinese input
    ram.set([0, 0, 0], 0x2b09); // and the queue read
    fulu.feedTyped();
    ram[0x2b27] = (ram[0x2b27] & 0xf0) | 4;
    fulu.feedTyped();
    expect(ram[0x2b0b]).toBe(0);
  });

  describe("an OS function that waits in its own loop goes on when asked again, also in a machine restored from a saved state", () => {
    const far = (entry: number) => [0xa2, entry & 0xff, 0x86, 0x26, 0xa2, entry >> 8, 0x86, 0x27, 0x20, 0xf6, 0xd2];
    const push = (w: number) => [0xa9, w & 0xff, 0x85, 0x20, 0xa9, w >> 8, 0x85, 0x21, 0x20, 0xca, 0xda];
    const MENU = 0x3000, LAYOUT = 0x3080, ITEMS = 0x3200, RECORDS = 0x3300, TEXTS = 0x3800;
    /** $E94D(MENU, LAYOUT) with item 1 chosen, `extra` bytes pushed first; [$3010] = what it returns, [$3011] = the software stack pointer after. */
    const menuProgram = (extra: number) => {
      const g = program(
        [
          ...Array.from({ length: extra }, () => push(0)).flat(),
          ...push(LAYOUT), ...push(MENU), 0xa9, 1, ...far(0xe94d),
          0x8d, 0x10, 0x30,
          0x18, 0xa5, 0x28, 0x69, 4, 0x85, 0x28, 0xa5, 0x29, 0x69, 0, 0x85, 0x29,
          0xa5, 0x28, 0x8d, 0x11, 0x30, 0xa5, 0x29, 0x8d, 0x12, 0x30,
          0x60,
        ],
        [],
        [],
      );
      g.set([0, ...new TextEncoder().encode("HELP"), 0], 0x3000); // the help text, at $8001
      const fulu = new Fulu();
      fulu.start(fulu.install(g)!);
      // five one-column items, "ABC" to "EBC", on the top four rows; the help word $8001
      const ram = fulu.machine.ram;
      ram.set([5, 1, 0x00, 0x31, 0, ITEMS & 0xff, ITEMS >> 8], MENU);
      ram[0x3100] = 2;
      for (let i = 0; i < 5; i++) {
        const rec = RECORDS + 8 * i, text = TEXTS + 24 * i;
        ram.set([rec & 0xff, rec >> 8], ITEMS + 2 * i);
        ram.set([3, text & 0xff, text >> 8, 0, 0, 0, 0], rec);
        ram.set([0x41 + i, 0x42, 0x43, 0], text);
      }
      ram.set([0, 159, 0, 63, 0, 0, 0, 0], LAYOUT);
      ram.set([0x01, 0x80], 0x2ba8);
      return fulu;
    };
    const settle = (fulu: Fulu) => fulu.machine.run(CPU_HZ / 2);
    const keys = (fulu: Fulu, ...ks: number[]) => ks.forEach((k) => (fulu.machine.press(k), settle(fulu)));
    /** The help command (Shift twice in other input modes), into GuiGetMsg's queue. */
    const help = (fulu: Fulu) => {
      fulu.machine.ram.set([0, 1, 1, 0, 0, 0, 5, 0x26, 0], 0x2b09);
      fulu.machine.ram[0x200] &= ~0x08;
      settle(fulu);
    };
    /** The machine saved and put back in a new Fulu, as the player does when the page is opened again. */
    const reload = (fulu: Fulu) => {
      const again = new Fulu();
      again.machine.flash.data.set(fulu.machine.flash.data);
      again.machine.loadState(fulu.machine.saveState());
      again.waiting = again.machine.cpu.pc === FAR_CALL && (again.machine.ram[0x200] & 0x08) !== 0;
      return again;
    };
    const result = (fulu: Fulu) => {
      const ram = fulu.machine.ram;
      return [fulu.stopped, ram[0x3010], ram[0x3011] | (ram[0x3012] << 8)];
    };

    for (const reloaded of [false, true]) {
      const how = reloaded ? ", restored meanwhile (and another menu waiting deeper in another Fulu)" : "";
      it(`the menu ($E94D) in GuiGetMsg${how}`, () => {
        let fulu = menuProgram(0);
        settle(fulu);
        expect([fulu.stopped, fulu.waiting]).toEqual([null, true]);
        if (reloaded) {
          fulu = reload(fulu);
          settle(menuProgram(3));
        }
        keys(fulu, Key.down, Key.enter);
        expect(result(fulu)).toEqual(["The program ended", 2, 0x17bb]);
      });
      it(`the menu's help screen ($E96B, $E980, $F262)${how}`, () => {
        let fulu = menuProgram(0);
        settle(fulu);
        help(fulu);
        expect([fulu.stopped, fulu.waiting]).toEqual([null, true]);
        if (reloaded) {
          fulu = reload(fulu);
          const other = menuProgram(3);
          settle(other);
          help(other);
        }
        keys(fulu, Key.exit); // the help screen closes, the menu waits again
        expect([fulu.stopped, fulu.waiting]).toEqual([null, true]);
        keys(fulu, Key.down, Key.down, Key.enter);
        expect(result(fulu)).toEqual(["The program ended", 3, 0x17bb]);
      });
    }
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
