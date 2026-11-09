// Fulu against the real OS. Runs when BBK_FIRMWARE points at a folder with the
// firmware dumps (and, for the games, BBK_GAMES at one with .gam files).
//
// Each check puts the machine in a state, lets the firmware answer an entry
// into the OS, then puts it back in that state and lets Fulu answer; the two
// must leave the same registers, banks and memory (all but the dead stacks
// and what time changes; docs/fulu-notes.md has the rules).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Device } from "../src/bbk/device";
import { addFirmwareFile, type Firmware } from "../src/bbk/firmware";
import { Key, keyCode } from "../src/bbk/keys";
import { Machine } from "../src/bbk/machine";
import { FAR_CALL, Fulu, type OsFunction } from "../src/fulu/fulu";
import { KEY_CLASSES } from "../src/fulu/gui";
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

/** The real-time clock's counters, and registers in which hardware sets bits (interrupt flags, the key code). */
const RTC = [0x234, 0x239];
const RAISED = [0x04, 0x05, 0x24e];
/** How far below the software stack pointer the OS's dead locals can be. */
const DEAD_SOFT_STACK = 0x300;
/** Every OS function's declared temporaries. */
const TEMPORARY = new Uint8Array(0x8000);
for (const f of Object.values(FUNCTIONS)) for (const [a, b] of f.temporaries ?? []) TEMPORARY.fill(1, a, b);

interface Row {
  calls: number;
  /** Calls the firmware answered with interrupts in the middle, replayed to Fulu. */
  interrupted: number;
  mismatches: number;
  first?: string;
  /** Fulu has no answer for this entry yet (or for an interrupt in it). */
  missing?: boolean;
}

/** An interrupt the firmware took inside an entry, with what the hardware showed it. */
interface Nested {
  vector: number;
  isr: number;
  tisr: number;
  key: number;
  /** Taken before the firmware reached the OS function's own code (in the far call's trampoline). */
  early: boolean;
  /** The far calls the firmware had made to other OS functions in the entry, before it. */
  calls: number;
}

/**
 * Play a game on the firmware with a fixed script of keys, and check Fulu's
 * answer to every entry into the OS from the program's first instruction on.
 * Interrupts that came while the firmware answered are given to Fulu too:
 * while it waits (the CPU halted until the next interrupt), and the rest
 * after its answer.
 */
/** The keys the scripts press: the play keys, and with them the keys a keyboard has (characters, shift, delete, the input key). */
const PLAY_KEYS: number[] = [Key.enter, Key.enter, Key.enter, Key.up, Key.down, Key.left, Key.right, Key.enter, Key.down, Key.right, Key.exit];
const TYPING_KEYS = [...PLAY_KEYS, ...[..."az09m"].map(keyCode), Key.space, Key.shift, Key.del, Key.del, Key.input];

/**
 * A key script: E Enter, X Exit, U D L R the arrows, each pressed with 0.6 s
 * after it; w waits a second. SAVE_AND_LOAD (伏魔记 1.3, and as far as it goes
 * in the others): a new game, the opening dialogue, then from the menu's 系统
 * a save to slot 1, a second save over it (覆盖原进度？ 是) and a load.
 */
const SAVE_AND_LOAD = "EwwEEXwXwEEEEEEEEEEwwXwDDDEwDwEwEwXwDDDEwDwEwEwEwXwDDDEwEwEwEw";
const SCRIPT_KEYS: Record<string, number> = { E: Key.enter, X: Key.exit, U: Key.up, D: Key.down, L: Key.left, R: Key.right };

function shadow(fw: Firmware, gam: Uint8Array, seconds: number, keys: number[] | string = PLAY_KEYS): { rows: Map<string, Row>; misuse: Set<string> } {
  const d = new Device(fw), file = d.install(gam);
  if (!file) throw new Error("the game does not fit in the flash");
  const m = d.machine, cpu = m.cpu, entry = gam[0x40] | (gam[0x41] << 8), first = 0x200 + (file.offset >> 12);
  const fulu = new Fulu(m);
  const rows = new Map<string, Row>();
  const vector = (pc: number) => pc >= 0x300 && pc < 0x350;
  const inOs = (pc: number) => vector(pc) || m.page(pc >>> 12) >= 0xe00;

  /** What the entry at pc is (in the state on entry), and whether Fulu answers it. */
  function entryOf(pc: number): [string, boolean, OsFunction?] {
    if (vector(pc)) return [`interrupt ${(pc - 0x300) >> 2}`, !!INTERRUPTS[(pc - 0x300) >> 2]];
    // a far call's return into the OS: a callback from an OS function Fulu does not have
    if (pc === 0xd313 && m.ram[0x100 | ((cpu.s + 1) & 0xff)] < 0xe0) return ["far return into the OS", false];
    if (pc !== FAR_CALL) return [`$${hex(pc, 4)}`, pc === 0xd313 || !!HELPERS[pc]];
    const ptr = m.ram[0x26] | (m.ram[0x27] << 8), seg = m.read((ptr + 2) & 0xffff), f = FUNCTIONS[ptr];
    return seg >= 0xe0 ? ["far call", true] : [`OS function $${hex(ptr, 4)}`, !!f, f];
  }

  function replay(n: Nested): void {
    m.ram[0x04] = n.isr;
    m.ram[0x05] = n.tisr;
    m.ram[0x24e] = n.key;
    m.ram[0x200] &= ~0x08; // the interrupt wakes the CPU
    fulu.service(n.vector);
  }

  /**
   * How Fulu is given the interrupts the firmware took in an entry: "one",
   * those taken before the firmware reached the function first, then one each
   * time Fulu waits, the rest after its answer; "first", all before; "together",
   * the early ones first and all the rest at once the first time it waits;
   * "calls", each where it came among the function's calls to other OS
   * functions (for one that takes long, such as GuiMsgBox drawing its box
   * while timer ticks come): those in a call after it, then at a wait those
   * that came in its call; "calls early", those in a call at its start.
   */
  type Order = "one" | "first" | "together" | "calls" | "calls early";
  const ORDERS: Order[] = ["one", "first", "together", "calls", "calls early"];

  /** Fulu's answer, or why there is none to compare. */
  function answer(order: Order): string {
    const queue = order === "first" ? [] : nested.filter((n) => !n.early);
    (order === "first" ? nested : nested.filter((n) => n.early)).forEach(replay);
    let made = 0;
    const upTo = (n: number) => {
      let k = 0;
      while (k < queue.length && queue[k].calls <= n) k++;
      return k;
    };
    const byCalls = order === "calls" || order === "calls early";
    if (byCalls) fulu.onCall = () => queue.splice(0, upTo(order === "calls" ? made++ : ++made)).forEach(replay);
    try {
      fulu.enter(at);
      while (at === FAR_CALL && cpu.pc === FAR_CALL && !cpu.stopped) {
        if (!queue.length) return "Fulu still waits";
        const n = order === "together" ? queue.length : byCalls ? Math.max(1, upTo(made)) : 1;
        queue.splice(0, n).forEach(replay);
        fulu.enter(at);
      }
    } finally {
      fulu.onCall = null;
    }
    if (fulu.stopped) {
      const why = fulu.stopped;
      fulu.stopped = null;
      return why;
    }
    queue.forEach(replay);
    return "";
  }

  let calls = 0;
  /** The flash before an entry into a file function (its answers change it). */
  let flashBefore: Uint8Array | null = null, firmwareFlash: Uint8Array | null = null;
  let started = false, at = -1, before: Snapshot | null = null, reached = true;
  let function_: (typeof FUNCTIONS)[number] | undefined;
  const misuse = new Set<string>();
  const nested: Nested[] = [];
  function finish(): void {
    judging = true;
    const ref = snapshot(m);
    const refFlash = flashBefore ? m.flash.data.slice() : null;
    firmwareFlash = refFlash;
    const back = () => {
      restore(m, before!);
      if (flashBefore) m.flash.data.set(flashBefore);
    };
    back();
    const [name, answered, function_] = entryOf(at);
    const row = rows.get(name) ?? { calls: 0, interrupted: 0, mismatches: 0 };
    rows.set(name, row);
    row.calls++;
    if (nested.length) row.interrupted++;
    if (!answered || nested.some((n) => !INTERRUPTS[n.vector])) row.missing = true;
    else {
      // An interrupt can come at any point of a function on the device, and
      // several while it sleeps; Fulu answers at once. So any of these orders
      // of the interrupts is the device's.
      let diff = judge(ref, function_, "one");
      for (const order of ORDERS.slice(1)) {
        if (!diff || !nested.length) break;
        back();
        if (!judge(ref, function_, order)) diff = "";
      }
      if (diff) {
        row.mismatches++;
        row.first ??= diff;
      }
    }
    restore(m, ref);
    if (refFlash) m.flash.data.set(refFlash);
    cpu.stopped = false;
    judging = false;
  }

  /** Fulu's answer compared with the firmware's (ref): what differs. */
  function judge(ref: Snapshot, f: OsFunction | undefined, order: Order): string {
    fulu.waiting = false;
    const why = answer(order);
    // the dead stacks, the 6502's below S and the software stack below ($28): as the firmware left them
    m.ram.set(ref.ram.subarray(0x100, 0x101 + ref.cpu.s), 0x100);
    const sp = ref.ram[0x28] | (ref.ram[0x29] << 8), low = Math.max(0x1000, sp - DEAD_SOFT_STACK);
    if (sp > low && sp <= 0x8000) m.ram.set(ref.ram.subarray(low, sp), low);
    // the function's temporaries, and what it would take from the OS's ROM
    fromOs(m, ref, f);
    // what time did meanwhile: the clock, and interrupt flags and a key the hardware raised
    m.ram.set(ref.ram.subarray(RTC[0], RTC[1]), RTC[0]);
    for (const a of RAISED) {
      const raised = ref.ram[a] & ~before!.ram[a];
      if (!((m.ram[a] ^ ref.ram[a]) & ~raised)) m.ram[a] = ref.ram[a];
    }
    return why || [differences(ref, snapshot(m)), refFlashOf(f)].filter(Boolean).join(", ");
  }

  /** For a file function: how Fulu's flash differs from the firmware's (taken when the firmware answered). */
  function refFlashOf(f: OsFunction | undefined): string {
    return f?.files && firmwareFlash ? flashDifferences(firmwareFlash, m.flash.data) : "";
  }

  // An entry ends back in the program; an interrupt's at its RTI, wherever it returns to.
  let back = -1, backS = 0;
  // that a declared temporary is never read before it is written in an entry, nor used by the program
  let entries = 1, judging = false;
  const written = new Uint32Array(0x8000), read = m.read.bind(m), write = m.write.bind(m);
  const temporary = (a: number) => started && !judging && (a < 0x100 || (a >= 0x2000 && a < 0x5000)) && TEMPORARY[a];
  m.read = (a: number) => {
    if (temporary(a) && written[a] !== entries) misuse.add(`$${hex(a, 4)} read ${at >= 0 ? `before it is written, in ${entryOf(at)[0]}` : "by the program"}`);
    return read(a);
  };
  m.write = (a: number, v: number) => {
    if (temporary(a)) {
      if (at < 0) misuse.add(`$${hex(a, 4)} written by the program`);
      written[a] = entries;
    }
    write(a, v);
  };
  const step = cpu.step.bind(cpu);
  cpu.step = () => {
    const pc = cpu.pc;
    if (!started) started = pc === entry && m.page(5) === first;
    if (!started) return step();
    if (at >= 0) {
      if (back >= 0 ? pc === back && cpu.s === backS : !inOs(pc)) {
        finish();
        at = -1;
      } else if (vector(pc)) nested.push({ vector: (pc - 0x300) >> 2, isr: m.ram[0x04], tisr: m.ram[0x05], key: m.ram[0x24e], early: !reached, calls });
      else if (pc === FAR_CALL && FUNCTIONS[m.ram[0x26] | (m.ram[0x27] << 8)]) calls++;
      else if (!reached && function_ && pc === function_.at && m.page(5) >= 0xe00) reached = true;
    }
    if (at < 0 && inOs(pc)) {
      entries++;
      at = pc;
      before = snapshot(m);
      nested.length = 0;
      calls = 0;
      function_ = pc === FAR_CALL ? FUNCTIONS[m.ram[0x26] | (m.ram[0x27] << 8)] : undefined;
      flashBefore = function_?.files ? m.flash.data.slice() : null;
      reached = !function_;
      const st = (i: number) => m.ram[0x100 | ((cpu.s + i) & 0xff)];
      back = vector(pc) ? st(2) | (st(3) << 8) : -1;
      backS = (cpu.s + 3) & 0xff;
    }
    return step();
  };
  if (!d.launch(file)) throw new Error("the game does not start");

  if (typeof keys === "string") {
    d.run(3);
    for (const c of keys) {
      if (c === "w") d.run(1);
      else {
        d.press(SCRIPT_KEYS[c]);
        d.run(0.6);
      }
    }
    return { rows, misuse };
  }
  let seed = 7;
  const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
  for (let t = 0; t < seconds; t += 0.4) {
    d.run(0.4);
    d.press(keys[rand(keys.length)]);
  }
  return { rows, misuse };
}

/** Let the firmware answer: run until the CPU is back in program memory (pages below the OS's). */
function runFirmware(m: Machine, limit = 2_000_000): void {
  for (let n = 0; n < limit && m.page(m.cpu.pc >>> 12) >= 0xe00; n++) m.cpu.step();
}

/** The firmware's machine with RAM in banks 1-4 and the OS's resident code in banks D-F, and Fulu answering for it. */
function bareMachine(): [Machine, Fulu] {
  const m = new Machine(loadFirmware());
  [1, 2, 3, 4].forEach((b) => (m.write(0x0c, b), m.write(0x0d, b), m.write(0x0e, 0)));
  [0xe88, 0xe89, 0xe8a].forEach((p, i) => (m.write(0x0c, 13 + i), m.write(0x0d, p & 0xff), m.write(0x0e, p >> 8)));
  return [m, new Fulu(m)];
}

const RETURN = 0x0ff0, ARGS = 0x4400;

/** Leave out of a comparison what a function declares it need not leave as the OS does: its temporaries, and what it would take from the OS's ROM. */
function fromOs(m: Machine, ref: Snapshot, f: OsFunction | undefined): void {
  const rom = f?.fromRom?.ram, fromRom = typeof rom === "function" ? rom() : (rom ?? []);
  for (const [a, b] of [...(f?.temporaries ?? []), ...fromRom, ...(f?.ownState?.ram ?? [])]) m.ram.set(ref.ram.subarray(a, b), a);
  for (const r of [...(f?.fromRom?.registers ?? []), ...(f?.ownState?.registers ?? [])]) m.cpu[r] = ref.cpu[r];
}

/**
 * The files a program can see in a flash image: the downloaded ones' and the
 * user files' live directory entries in the OS's order, with each user file's
 * contents. (Where the OS puts them, and what it does with deleted ones, is
 * its own: it collects the space of deleted files its own way.)
 */
function visibleFiles(f: Uint8Array): string[] {
  const out: string[] = [];
  const map = (sector: number) => (sector < 0x100 ? 0x1000 : 0x8000) + (sector & 0xff);
  for (let e = 0; e < 0x1000 && f[e + 15] !== 0xff; e += 16) if (f[e + 15]) out.push(`program ${[...f.subarray(e, e + 16)].join(",")}`);
  for (let sector = 0x1ff; sector >= 0 && (f[map(sector)] === 2 || f[map(sector)] === 3); sector--) {
    if (f[map(sector)] !== 3) continue;
    for (let e = sector << 12; e < (sector + 1) << 12; e += 16) {
      const type = f[e + 15];
      if (type === 0 || type === 0xff) continue;
      const page = f[e] | (f[e + 1] << 8), size = f[e + 12] | (f[e + 13] << 8) | (f[e + 14] << 16);
      const data = f.subarray(page << 8, (page << 8) + size);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum = (Math.imul(sum, 31) + data[i]) >>> 0;
      out.push(`file ${[...f.subarray(e, e + 16)].join(",")} data ${sum.toString(16)}`);
    }
  }
  return out;
}

/** How the files a program can see differ between the firmware's flash and Fulu's. */
function flashDifferences(ref: Uint8Array, got: Uint8Array): string {
  const a = visibleFiles(ref), b = visibleFiles(got);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `files: ${a[i] ?? "none"} / ${b[i] ?? "none"}`;
  return "";
}

/**
 * Far-call an OS function with A and the arguments at ARGS on the firmware,
 * then from the same state on Fulu: what differs ("" if nothing). The
 * machine is left as the firmware left it.
 */
function farCallBoth(m: Machine, fulu: Fulu, entry: number, a: number, args: number[], cpu: Partial<Regs> = {}): string {
  m.ram.set([0x0f, 0x02], 0x2029); // a program's base page
  m.ram[0x28] = ARGS & 0xff;
  m.ram[0x29] = ARGS >> 8;
  args.forEach((v, i) => (m.ram[ARGS + i] = v));
  m.ram[0x26] = entry & 0xff;
  m.ram[0x27] = entry >> 8;
  m.ram[0x1f0] = (RETURN - 1) >> 8;
  m.ram[0x1ef] = (RETURN - 1) & 0xff;
  Object.assign(m.cpu, { x: 0, y: 0, p: 0x24, ...cpu, a, s: 0xee, pc: FAR_CALL });
  const before = snapshot(m);
  runFirmware(m);
  const ref = snapshot(m);
  restore(m, before);
  fulu.enter(FAR_CALL);
  m.ram.set(ref.ram.subarray(0x100, 0x101 + ref.cpu.s), 0x100);
  m.ram.set(ref.ram.subarray(ARGS - DEAD_SOFT_STACK, ARGS), ARGS - DEAD_SOFT_STACK);
  fromOs(m, ref, FUNCTIONS[entry]);
  const diff = differences(ref, snapshot(m));
  restore(m, ref);
  return diff;
}

describe.skipIf(!FW || !existsSync(FW))("Fulu against the OS", () => {
  it("the keyboard's classes are the OS's", () => {
    const os = loadFirmware().regions.os!, at = (a: number) => (0x80 + 4 * 8) * 0x1000 + a - 0x5000; // segment 8
    const table = KEY_CLASSES.flatMap((half) => half.flat());
    expect(table).toEqual([...os.subarray(at(0x8c36), at(0x8c36) + 0x100)]);
  });

  it("the screen functions, on random arguments", { timeout: 300_000 }, () => {
    const [m, fulu] = bareMachine();
    let seed = 3;
    const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
    // rows below 200 at most: further down, the screen's rows would be the OS's own variables
    const x = () => (rand(8) ? rand(160) : rand(256)), y = () => (rand(8) ? rand(96) : rand(200));
    const near = (v: number) => Math.min(199, Math.max(0, v + rand(255) - 127)); // a y the line's 8-bit difference reaches
    // the function, and its arguments after the first (in A)
    const cases: [number, () => number[]][] = [
      [0xe794, () => ((y0) => [y0, x(), near(y0)])(y())],
      [0xe797, () => [y(), x(), y()]],
      [0xe85d, () => [y(), x(), y()]],
      [0xe860, () => [y(), x(), y()]],
      [0xe877, () => [y(), x(), y(), rand(256), 0x30 + rand(8)]],
      [0xe87a, () => [y(), x(), y(), rand(256), 0x30 + rand(8)]],
      [0xe87d, () => [y(), x(), y()]],
      [0xe874, () => [y(), x(), y(), rand(256), 0x30 + rand(8)]],
      [0xe7bb, () => [rand(8) ? rand(81) : rand(100), rand(256)]],
      // a string at $1000 of ASCII, GB2312 (hanzi, symbols), other double-byte codes, and anything
      [0xe79a, () => {
        const s: number[] = [];
        for (let n = rand(12); n > 0; n--) {
          const k = rand(6);
          if (k === 0) s.push(0x20 + rand(0x5f));
          else if (k === 1) s.push(0xb0 + rand(0x48), 0xa1 + rand(0x5e));
          else if (k === 2) s.push(0xa1 + rand(9), 0xa1 + rand(0x5e));
          else if (k === 3) s.push(0x81 + rand(0x7f), 0x40 + rand(0x61));
          else if (k === 4) s.push(0xfd + rand(3), 0xa1 + rand(0x5e));
          else s.push(1 + rand(255), 1 + rand(255));
        }
        m.ram.set([...s, 0], 0x1000);
        return [rand(8) ? rand(81) : rand(100), 0x00, 0x10];
      }],
      // bitmaps on screen rows, from $1000-$10FF: at most 96 rows of 32 bytes, clear of the OS's variables at $2000
      [0xe78e, () => [rand(96), x(), rand(96), rand(256), 0x10, rand(4) ? 0 : 1]],
      [0xe889, () => [rand(96), x(), rand(96), rand(256), 0x10, rand(256), 0x30 + rand(8), 0]],
    ];
    const failures: string[] = [];
    for (const [entry, args] of cases) {
      for (let trial = 0; trial < 300; trial++) {
        for (let a = 0x400; a < 0x4000; a++) m.ram[a] = rand(256);
        const a = x(), list = args();
        const diff = farCallBoth(m, fulu, entry, a, list, { x: rand(256), y: rand(256), p: (rand(256) | 0x24) & ~0x18 });
        if (diff) {
          failures.push(`$${hex(entry, 4)} trial ${trial} (A ${hex(a)}, ${list.map((v) => hex(v)).join(" ")}): ${diff}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("the string functions, itoa, ltoa, SysRand, the melodies and GuiSetKbdState, on random arguments", { timeout: 300_000 }, () => {
    const [m, fulu] = bareMachine();
    let seed = 9;
    const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
    const failures: string[] = [];
    for (let trial = 0; trial < 2000 && !failures.length; trial++) {
      for (let a = 0x1000; a < 0x2000; a++) m.ram[a] = rand(4) ? 1 + rand(255) : 0;
      const p = 0x1100 + rand(0x400), q = rand(3) ? p + rand(64) - 32 : 0x1800 + rand(0x400), n = rand(0x300);
      const w = (v: number) => [v & 0xff, v >> 8];
      const [entry, args] = [
        [0xe71b, [...w(rand(20) ? p : 0), ...w(rand(20) ? q : 0)]],
        [0xe71e, w(p)],
        [0xe700, [...w(p), ...w(n), rand(256)]],
        [0xe959, w(p)], // SysRand(p): a seed and a range at p (small half the time)
        [0xe712, [...w(p), ...w(0x1800 + rand(0x400))]], // (apart: overlapping, it would copy forever)
        [0xe718, [...w(p), ...w(q)]],
        [0xe8a1, []], // SysPlayMelody(A), A mostly 1-12
        [0xe8a4, []],
        [0xe968, w(rand(0x10000))], // GuiSetKbdState(w)
        // itoa(value, buffer, radix): values small, signed extremes or any; radix 10, 16, 2, 8 or any
        [0xe709, [...w([0, 1, 9, 10, 0x7fff, 0x8000, 0xffff, rand(100), rand(0x10000)][rand(9)]), ...w(0x1800 + rand(0x400)), ...w([10, 16, 2, 8, rand(0x10000)][rand(5)])]],
        // ltoa(value, buffer, radix), value a long
        [0xe70f, [...((v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24])([0, 1, 9, 10, 0x7fffffff, 0x80000000, 0xffffffff, rand(1000), rand(0x10000) * 0x10000 + rand(0x10000)][rand(9)]), ...w(0x1800 + rand(0x400)), ...w([10, 16, 2, 8, rand(0x10000)][rand(5)])]],
      ][rand(11)] as [number, number[]];
      if (entry === 0xe959 && rand(2)) m.ram.set([rand(200), 0], p + 4);
      if (entry === 0xe718 && rand(2)) {
        // the same string at q, now and then with a byte changed
        let k = 0;
        while (m.ram[p + k]) k++;
        m.ram.copyWithin(q, p, p + k + 1);
        if (rand(2)) m.ram[q + rand(k + 1)] = rand(256);
      }
      const diff = farCallBoth(m, fulu, entry, entry === 0xe8a1 ? rand(16) : rand(256), args);
      if (diff) failures.push(`$${hex(entry, 4)} (${args.map((v) => hex(v)).join(" ")}): ${diff}`);
    }
    expect(failures).toEqual([]);
  });

  it("the heap, on random allocations and frees", { timeout: 300_000 }, () => {
    const [m, fulu] = bareMachine();
    let seed = 5;
    const rand = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
    // the heap as the OS leaves it for a program: one free block at $2C00, $1400 bytes in all
    m.ram.set([0x00, 0x2c, 0, 0, 0x00, 0x14, 0, 0, 0], 0x2bab);
    m.ram.set([0x62, 0x65, 0xfc, 0x13], 0x2c00);
    m.ram.set([0xd7, 0x17], 0x2a); // the C runtime's scratch area
    const blocks: number[] = [], failures: string[] = [];
    for (let call = 0; call < 1500 && !failures.length; call++) {
      const free = blocks.length && rand(2);
      const p = !free ? 0 : rand(8) ? blocks.splice(rand(blocks.length), 1)[0] : rand(4) ? blocks[rand(blocks.length)] : 0x2c00 + rand(0x1400);
      const n = rand(4) ? rand(0x100) : rand(0x800);
      const args = free ? [p & 0xff, p >> 8] : [n & 0xff, n >> 8];
      const diff = farCallBoth(m, fulu, free ? 0xe94a : 0xe947, rand(256), args);
      if (diff) failures.push(`call ${call}: ${free ? `free $${hex(p, 4)}` : `allocate ${n}`}: ${diff}`);
      const r = m.ram[0x20] | (m.ram[0x21] << 8);
      if (!free && r) blocks.push(r);
    }
    expect(failures).toEqual([]);
  });

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
        } else if (addr === 0xd93f) {
          // a long at ($20) shifted by the long at ($23): counts mostly under 40
          set16(0x20, ptr());
          set16(0x23, ptr());
          const c = m.ram[0x23] | (m.ram[0x24] << 8);
          [rand(40), rand(8) ? 0 : rand(256), rand(8) ? 0 : rand(256), 0].forEach((v, i) => m.write(c + i, v));
        } else if (addr === 0xe520 || addr === 0xe52c) {
          // float ÷ and ×: floats at ($20) and ($23), now and then 0, ±0, an extreme exponent, or the same number
          const float = (at: number) => {
            const e = [0x7f, 0x7f + rand(20), 0x7f - rand(20), rand(256), 0, 0xfe][rand(8) % 6], sign = rand(2) << 7;
            const zero = rand(10) === 0;
            const b = zero ? [0, 0, 0, sign] : [rand(256), rand(256), (rand(128) | ((e & 1) << 7)), (e >> 1) | sign];
            b.forEach((v, i) => m.write(at + i, v));
          };
          set16(0x20, ptr());
          set16(0x23, ptr());
          const p = m.ram[0x20] | (m.ram[0x21] << 8), q = m.ram[0x23] | (m.ram[0x24] << 8);
          float(p);
          if (rand(6)) float(q);
          else for (let i = 0; i < 4; i++) m.write(q + i, m.read(p + i));
        } else if ([0xd85a, 0xd85f, 0xdae6, 0xdb19, 0xdac1, 0xdac7, 0xdafc, 0xd7b4].includes(addr)) {
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
        } else if (addr === 0xe904) {
          // memcmp(a, b, n): b half the time a copy of a, now and then with a byte changed
          const n = rand(4) ? rand(0x300) : rand(0x800), args = 0x4400 + rand(0x400);
          const a = 0x1000 + rand(0x2800), b = 0x1000 + rand(0x2800);
          if (rand(2)) {
            for (let i = 0; i < n; i++) m.write(b + i, m.read(a + i));
            if (n && rand(2)) m.write(b + rand(n), rand(256));
          }
          set16(0x28, args);
          [a, b, n].forEach((v, i) => (m.write(args + 2 * i, v & 0xff), m.write(args + 2 * i + 1, v >> 8)));
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
  const playAll = (keys: number[] | string) => {
    const fw = loadFirmware(), mismatches: string[] = [];
    const missing = new Map<string, Set<string>>();
    for (const g of games) {
      const { rows, misuse } = shadow(fw, new Uint8Array(readFileSync(join(GAMES, g))), SECONDS, keys);
      for (const x of misuse) mismatches.push(`${g}: a temporary ${x}`);
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
  };
  it.skipIf(!games.length)("every entry into the OS while games play", { timeout: 3_600_000 }, () => playAll(PLAY_KEYS));
  it.skipIf(!games.length)("every entry into the OS while games play, typing too", { timeout: 3_600_000 }, () => playAll(TYPING_KEYS));
  it.skipIf(!games.length)("every entry into the OS while saving and loading", { timeout: 3_600_000 }, () => playAll(SAVE_AND_LOAD));
});
