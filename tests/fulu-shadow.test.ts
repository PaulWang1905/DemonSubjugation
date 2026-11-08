// Fulu against the real OS. Runs when BBK_FIRMWARE points at a folder with the
// firmware dumps (and, for the games, BBK_GAMES at one with .gam files).
//
// Each check puts the machine in a state, lets the firmware answer an entry
// into the OS, then puts it back in that state and lets Fulu answer; the two
// must leave the same registers, banks and memory (all but the dead part of
// the 6502 stack, below S).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Device } from "../src/bbk/device";
import { addFirmwareFile, type Firmware } from "../src/bbk/firmware";
import { Key } from "../src/bbk/keys";
import { Machine } from "../src/bbk/machine";
import { FAR_CALL, Fulu } from "../src/fulu/fulu";
import { FUNCTIONS, INTERRUPTS } from "../src/fulu/os";
import { HELPERS } from "../src/fulu/runtime";

const FW = process.env.BBK_FIRMWARE ?? "";
const GAMES = process.env.BBK_GAMES ?? "";
/** Seconds of play per game. */
const SECONDS = Number(process.env.BBK_SECONDS ?? 30);

function loadFirmware(): Firmware {
  const fw: Firmware = { regions: {} };
  for (const f of readdirSync(FW)) addFirmwareFile(fw, f, new Uint8Array(readFileSync(join(FW, f))));
  return fw;
}

type Regs = { a: number; x: number; y: number; p: number; s: number; pc: number };
interface Snapshot {
  ram: Uint8Array;
  cpu: Regs;
  banks: number[];
  bankSel: number;
}

const regs = (m: Machine): Regs => ({ a: m.cpu.a, x: m.cpu.x, y: m.cpu.y, p: m.cpu.p, s: m.cpu.s, pc: m.cpu.pc });
const snapshot = (m: Machine): Snapshot => ({ ram: m.ram.slice(), cpu: regs(m), banks: m.banks(), bankSel: m.read(0x0c) });
function restore(m: Machine, s: Snapshot): void {
  m.ram.set(s.ram);
  s.banks.forEach((page, b) => {
    m.write(0x0c, b);
    m.write(0x0d, page & 0xff);
    m.write(0x0e, page >> 8);
  });
  m.write(0x0c, s.bankSel);
  Object.assign(m.cpu, s.cpu);
}

const hex = (v: number, n = 2) => v.toString(16).padStart(n, "0");

/** What differs between the firmware's result and Fulu's, or "" when nothing does. */
function differences(ref: Snapshot, got: Snapshot): string {
  const out: string[] = [];
  for (const k of ["a", "x", "y", "p", "s", "pc"] as const) if (ref.cpu[k] !== got.cpu[k]) out.push(`${k} ${hex(ref.cpu[k])}/${hex(got.cpu[k])}`);
  if (ref.bankSel !== got.bankSel) out.push(`bank select ${ref.bankSel}/${got.bankSel}`);
  ref.banks.forEach((p, b) => p !== got.banks[b] && out.push(`bank ${b} ${hex(p, 3)}/${hex(got.banks[b], 3)}`));
  const live = 0x101 + ref.cpu.s;
  for (let a = 0; a < ref.ram.length && out.length < 12; a++) {
    if (a >= 0x100 && a < live) continue;
    if (ref.ram[a] !== got.ram[a]) out.push(`[${hex(a, 4)}] ${hex(ref.ram[a])}/${hex(got.ram[a])}`);
  }
  return out.join(", ");
}

/** The OS's own variables, which programs never read: Fulu keeps that state in TypeScript. */
const OS_VARIABLES = [0x2000, 0x2100];
/** The real-time clock's counters, and registers in which hardware sets bits (interrupt flags, the key code). */
const RTC = [0x234, 0x239];
const RAISED = [0x04, 0x05, 0x24e];

interface Row {
  calls: number;
  /** Calls not compared because an interrupt came in the middle of the firmware's answer. */
  interrupted: number;
  mismatches: number;
  first?: string;
  /** Fulu has no answer for this entry yet. */
  missing?: boolean;
}

/**
 * Play a game on the firmware with a fixed script of keys, and check Fulu's
 * answer to every entry into the OS from the program's first instruction on.
 */
function shadow(fw: Firmware, gam: Uint8Array, seconds: number): Map<string, Row> {
  const d = new Device(fw), file = d.install(gam);
  if (!file) throw new Error("the game does not fit in the flash");
  const m = d.machine, cpu = m.cpu, entry = gam[0x40] | (gam[0x41] << 8), first = 0x200 + (file.offset >> 12);
  const fulu = new Fulu(m);
  fulu.base = first;
  const rows = new Map<string, Row>();
  const vector = (pc: number) => pc >= 0x300 && pc < 0x350;
  const inOs = (pc: number) => vector(pc) || m.page(pc >>> 12) >= 0xe00;

  /** What the entry at pc is (in the state on entry), and whether Fulu answers it. */
  function entryOf(pc: number): [string, boolean] {
    if (vector(pc)) return [`interrupt ${(pc - 0x300) >> 2}`, !!INTERRUPTS[(pc - 0x300) >> 2]];
    if (pc !== FAR_CALL) return [`$${hex(pc, 4)}`, pc === 0xd313 || !!HELPERS[pc]];
    const ptr = m.ram[0x26] | (m.ram[0x27] << 8), seg = m.read((ptr + 2) & 0xffff);
    return seg >= 0xe0 ? ["far call", true] : [`OS function $${hex(ptr, 4)}`, !!FUNCTIONS[ptr]];
  }

  let started = false, at = -1, interrupted = false, before: Snapshot | null = null;
  function finish(): void {
    const ref = snapshot(m);
    restore(m, before!);
    const [name, answered] = entryOf(at);
    const row = rows.get(name) ?? { calls: 0, interrupted: 0, mismatches: 0 };
    rows.set(name, row);
    row.calls++;
    if (!answered) row.missing = true;
    else if (interrupted) row.interrupted++;
    else {
      fulu.enter(at);
      // the dead stack and the OS's variables: as the firmware left them
      m.ram.set(ref.ram.subarray(0x100, 0x101 + ref.cpu.s), 0x100);
      m.ram.set(ref.ram.subarray(OS_VARIABLES[0], OS_VARIABLES[1]), OS_VARIABLES[0]);
      // what time did meanwhile: the clock, and interrupt flags and a key the hardware raised
      m.ram.set(ref.ram.subarray(RTC[0], RTC[1]), RTC[0]);
      for (const a of RAISED) {
        const raised = ref.ram[a] & ~before!.ram[a];
        if (!((m.ram[a] ^ ref.ram[a]) & ~raised)) m.ram[a] = ref.ram[a];
      }
      const diff = differences(ref, snapshot(m));
      if (diff) {
        row.mismatches++;
        row.first ??= diff;
      }
    }
    restore(m, ref);
    cpu.stopped = false;
  }

  // An entry ends back in the program; an interrupt's at its RTI, wherever it returns to.
  let back = -1, backS = 0;
  const step = cpu.step.bind(cpu);
  cpu.step = () => {
    const pc = cpu.pc;
    if (!started) started = pc === entry && m.page(5) === first;
    if (!started) return step();
    if (at >= 0) {
      if (back >= 0 ? pc === back && cpu.s === backS : !inOs(pc)) {
        finish();
        at = -1;
      } else if (vector(pc)) interrupted = true;
    }
    if (at < 0 && inOs(pc)) {
      at = pc;
      before = snapshot(m);
      interrupted = false;
      const st = (i: number) => m.ram[0x100 | ((cpu.s + i) & 0xff)];
      back = vector(pc) ? st(2) | (st(3) << 8) : -1;
      backS = (cpu.s + 3) & 0xff;
    }
    return step();
  };
  if (!d.launch(file)) throw new Error("the game does not start");

  let seed = 7;
  const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
  const keys = [Key.enter, Key.enter, Key.enter, Key.up, Key.down, Key.left, Key.right, Key.enter, Key.down, Key.right, Key.exit];
  for (let t = 0; t < seconds; t += 0.4) {
    d.run(0.4);
    d.press(keys[rand(keys.length)]);
  }
  return rows;
}

/** Let the firmware answer: run until the CPU is back in program memory (pages below the OS's). */
function runFirmware(m: Machine, limit = 2_000_000): void {
  for (let n = 0; n < limit && m.page(m.cpu.pc >>> 12) >= 0xe00; n++) m.cpu.step();
}

describe.skipIf(!FW || !existsSync(FW))("Fulu against the OS", () => {
  it("the C runtime's helpers, on random arguments", { timeout: 120_000 }, () => {
    const m = new Machine(loadFirmware()), fulu = new Fulu(m);
    // RAM in banks 1-4, the OS's resident code in banks D-F
    [1, 2, 3, 4].forEach((b) => (m.write(0x0c, b), m.write(0x0d, b), m.write(0x0e, 0)));
    [0xe88, 0xe89, 0xe8a].forEach((p, i) => (m.write(0x0c, 13 + i), m.write(0x0d, p & 0xff), m.write(0x0e, p >> 8)));
    let seed = 1;
    const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
    const ptr = () => 0x1000 + rand(0x3800);
    const value = () => [0, 1, 2, 7, 8, 15, 16, 31, 32, 0x7f, 0x80, 0xff][rand(12)] | (rand(3) ? 0 : rand(256) << 8);
    const set16 = (zp: number, v: number) => ((m.ram[zp] = v & 0xff), (m.ram[zp + 1] = (v >> 8) & 0xff));
    const fill = (a: number, n: number, f: () => number) => { for (let i = 0; i < n; i++) m.write(a + i, f()); };
    const RETURN = 0x0ff0;
    const failures: string[] = [];
    for (const addr of Object.keys(HELPERS).map(Number)) {
      for (let trial = 0; trial < 400; trial++) {
        for (let a = 0x1000; a < 0x5000; a++) m.ram[a] = rand(256);
        for (let a = 0x20; a < 0x40; a++) m.ram[a] = rand(256);
        const pointers = rand(4) !== 0;
        set16(0x20, pointers ? ptr() : rand(2) ? value() : rand(0x10000));
        set16(0x23, pointers ? ptr() : rand(2) ? value() : rand(0x10000));
        set16(0x2a, ptr());
        set16(0x28, 0x1100 + rand(0x3000));
        const cpu = m.cpu, sp = m.ram[0x28] | (m.ram[0x29] << 8);
        Object.assign(cpu, { a: rand(2) ? value() & 0xff : rand(256), x: rand(256), y: rand(256), p: (rand(256) | 0x24) & ~0x18, s: 0x40 + rand(0xb0) });
        if (addr === 0xd362 || addr === 0xd29d || addr === 0xd2ca || addr === 0xdb2f || addr === 0xdc83 || addr === 0xdcc8 || addr === 0xdcf7) {
          set16(0x20, ptr());
          set16(0x23, ptr());
          if (rand(3) === 0) fill(m.ram[0x23] | (m.ram[0x24] << 8), 4, () => (rand(2) ? 0 : rand(256)));
        } else if (addr === 0xda3d || addr === 0xdc0e) {
          set16(0x20, ptr());
          set16(0x23, ptr());
          const c = m.ram[0x23] | (m.ram[0x24] << 8);
          fill(c, 4, () => 0);
          m.write(c, rand(40));
          if (rand(8) === 0) m.write(c + 1 + rand(3), 1);
        } else if ([0xd85a, 0xd85f, 0xdae6, 0xdb19, 0xdac1, 0xdac7, 0xdafc].includes(addr)) {
          set16(0x20, ptr());
          set16(0x23, ptr());
        } else if (addr === 0xdb5c) {
          // a switch: n case values at ($26), then n targets; default at $20/$21
          const n = 1 + rand(5), table = ptr(), cases: number[] = [];
          for (let i = 0; i < n; i++) cases.push(rand(4) ? value() : rand(0x10000));
          cases.forEach((v, i) => (m.write(table + 2 * i, v & 0xff), m.write(table + 2 * i + 1, v >> 8)));
          for (let i = 0; i < n; i++) (m.write(table + 2 * n + 2 * i, rand(256)), m.write(table + 2 * n + 2 * i + 1, 0x10 + rand(0x40)));
          set16(0x26, table);
          set16(0x20, 0x1000 + rand(0x4000));
          set16(0x23, rand(2) ? cases[rand(n)] : value());
          Object.assign(cpu, { x: n, y: 0 });
        } else if (addr === 0xe901) {
          // the arguments (above $4400) outside what is copied (below $4000)
          const n = rand(4) ? rand(0x300) : rand(0x800), args = 0x4400 + rand(0x400);
          set16(0x28, args);
          [0x1000 + rand(0x2800), 0x1000 + rand(0x2800), n].forEach((v, i) => (m.write(args + 2 * i, v & 0xff), m.write(args + 2 * i + 1, v >> 8)));
        } else if (addr === 0xe907) {
          cpu.a = 5 + rand(5);
          m.write(sp, 1 + rand(13 - cpu.a));
          m.write(sp + 1, rand(256));
          m.write(sp + 2, rand(16));
        } else if (addr === 0xe90a) {
          cpu.a = rand(16);
          set16(0x2f, 0);
          const p = ptr();
          m.write(sp, p & 0xff);
          m.write(sp + 1, p >> 8);
        }
        // called by JSR from RETURN - 3 (the switch is reached by JMP)
        if (addr !== 0xdb5c) {
          m.ram[0x100 | cpu.s] = (RETURN - 1) >> 8;
          m.ram[0x100 | ((cpu.s - 1) & 0xff)] = (RETURN - 1) & 0xff;
          cpu.s = (cpu.s - 2) & 0xff;
        }
        cpu.pc = addr;
        const before = snapshot(m);
        runFirmware(m);
        const ref = snapshot(m);
        restore(m, before);
        fulu.enter(addr);
        const diff = differences(ref, snapshot(m));
        if (diff) {
          failures.push(`$${hex(addr, 4)} trial ${trial}: ${diff}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  });

  const games = GAMES && existsSync(GAMES) ? readdirSync(GAMES).filter((f) => /\.gam$/i.test(f)).sort() : [];
  it.skipIf(!games.length)("every entry into the OS while games play", { timeout: 3_600_000 }, () => {
    const fw = loadFirmware(), mismatches: string[] = [];
    const missing = new Map<string, Set<string>>();
    for (const g of games) {
      const rows = shadow(fw, new Uint8Array(readFileSync(join(GAMES, g))), SECONDS);
      const lines = [...rows].sort((a, b) => b[1].calls - a[1].calls).map(([name, r]) => {
        if (r.missing) missing.set(name, (missing.get(name) ?? new Set()).add(g));
        if (r.mismatches) mismatches.push(`${g} ${name}: ${r.mismatches} of ${r.calls}, first: ${r.first}`);
        const state = r.missing ? "missing" : r.mismatches ? `${r.mismatches} mismatches` : "ok";
        return `  ${name.padEnd(22)} ${String(r.calls).padStart(8)} ${state}${r.interrupted ? ` (${r.interrupted} interrupted)` : ""}`;
      });
      console.log(`${g}\n${lines.join("\n")}`);
    }
    const byGames = [...missing].sort((a, b) => b[1].size - a[1].size);
    console.log("missing, with the number of games that need it:\n" + byGames.map(([n, s]) => `  ${n} ${s.size}`).join("\n"));
    expect(mismatches).toEqual([]);
  });
});
