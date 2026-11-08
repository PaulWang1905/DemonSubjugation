# Fulu (符箓): plan, version 2

**Fulu** replaces the Longman 4988's operating system with TypeScript. A
`.gam` program runs its own 6502 code on the emulated 4988 (`src/bbk`), and
every call it makes to the OS is answered by Fulu instead of BBK's firmware,
so no firmware files are needed. (The "WSL" idea: run the programs, replace
the system they call.)

This version is simpler than the first: fewer parts, one checking tool, and
the order of work decided by measurement instead of planned by hand.

---

## 1. Input and output

| | |
|---|---|
| **Players give** | one `.gam` file, nothing else |
| **Players get** | the same as firmware mode today: the 159×96 screen, the keys, saves, resume; text in the site's pixel fonts |
| **In code** | `Fulu` has the interface of today's `Device` (`install`, `start`, `machine.run`, `press`, `saveState`), so the existing device player shows it |
| **Tests use** | the 138 programs in [bbk-games `eebbk/roms`](https://github.com/iuxt/bbk-games/tree/main/eebbk/roms), and the firmware as the referee. Neither is committed |

## 2. What was measured (and why it makes Fulu small)

From the 138 programs and the firmware:

1. **Programs reach the OS in three ways only:** far calls through the API
   table (`JSR $D2F6`, 107 functions used), direct calls into the OS's
   resident code at `$D000-$FFFF` (the C compiler's helpers, ~50 entry
   points), and interrupts (vectors at `$0300`).
2. **Programs never read the font ROM or any other ROM** directly (traced
   while running 8 programs of different kinds). Text is always drawn by the
   OS. So Fulu needs no font image and no ROM data: it draws text itself.
3. **Programs read none of the OS's variables** (`$2000-$20FF`). The only
   OS-set memory they touch is a few zero-page bytes (the software-stack
   bounds `$2A/$2B` and the helpers' scratch `$2F/$30`). So Fulu keeps the
   OS's state in TypeScript, not in a copy of the OS's memory layout.
4. **52 functions cover 100 of the 138 programs**; 70 cover 118; 107 cover all.

## 3. How Fulu works: four ideas

1. **The OS as a lookup table.** The OS region of the memory map holds no
   code. When the CPU reaches an address there, Fulu looks the address up and
   runs the TypeScript function for it, then returns as an RTS would. The
   vector page sends interrupts there too. An address with no function stops
   the program with its address and, where known, its name
   ("Fulu has no SysPicture ($E78E) yet").
2. **The far call in TypeScript.** `$D2F6` reads the 3-byte table entry. For
   an OS function it calls Fulu's function. For the program's own code (57,000
   call sites) it maps that 16 KB segment in, pushes a return into Fulu, and
   lets the program run; the return restores the banks, as the OS does.
3. **Waiting functions retry.** A function that waits (for a key, a timer, a
   message box timeout) reports "not yet". The CPU then idles until the next
   interrupt, exactly like the device sleeping in the OS, and the function is
   asked again.
4. **Text through one interface.** Fulu draws characters from a glyph source:
   the site's pixel fonts for players, and the firmware's own font in tests so
   screens can be compared pixel for pixel.

At start-up Fulu skips the OS's boot. It puts the machine in the state the
launcher leaves (banks, stack, the program's base page, a return into Fulu)
and jumps to the program's entry.

## 4. One checking tool: the shadow run

The program runs on the real firmware. Each time it enters the OS, a copy of
the machine is taken. When the real OS returns, Fulu's version is run on that
copy, with the same key presses and timing that arrived meanwhile. Then the
two are compared: registers, the program's memory, the screen, and the time
taken.

- Nothing is recorded or stored, and every call of every program is checked.
- It runs over all 138 programs unattended and prints one table per function:
  calls checked, mismatches (with the first example), and how many programs
  still depend on it.
- That table is the to-do list. The next function to write is always the one
  that unblocks the most programs. A function is done when its mismatch count
  is 0.

Keys come from a seeded script (mostly Enter, arrows, now and then Exit),
the same on both sides, so runs repeat exactly. Where it reaches too little of
a game, as with fmj games that need a new game started and a walk taken, a
short per-game script is added.

## 5. Milestones

| # | Result | Done when | Size |
|---|---|---|---|
| F1 | **Foundation**: the address lookup in `src/bbk`, start and exit, the far call, the compiler helpers, interrupts; the shadow run | the 5 simplest programs (比大小, 二十一点, 对对碰, 平面魔方, 螃蟹回家) run under the shadow run, with the helpers matching and their first OS function named | 1-2 sessions |
| F2 | **The functions, in the order the table gives** | checkpoints: those 5 programs fully (13-17 functions); then 100 programs (52); then all 138 (107); each with 0 mismatches | 6-10 sessions |
| F3 | **In the site**: Play works without firmware; firmware mode stays as "Original OS" when its files are there | the 138 programs start and play in the browser without firmware | 1 session |

Each milestone goes to main when its checks pass; work in between stays on
the `fulu` branch.

## 6. Kept out, on purpose

- **OS functions no program uses yet** (~90 of the ~200 in the table). When a
  future game needs one, Fulu names it, and it is added and checked with that
  game in the shadow run. Nothing is written for no user.
- **Melodies** (their tunes are firmware data): Fulu stays silent, as the
  emulator is now.
- **Link play** (炸弹超人): no serial port in either mode.
- **HD text for `.gam` games**: possible later, since text goes through Fulu,
  but not part of this plan.

## 7. Code

```
src/fulu/
  fulu.ts        install, start, exit; the Device-like interface
  dispatch.ts    the address lookup, far call, interrupts, "not yet" retries
  runtime.ts     the C compiler's helpers
  os/*.ts        the OS functions, one file per area (screen, text, keys,
                 timers, memory, files, strings, dialogs)
  glyphs.ts      the glyph source
tests/fulu.test.ts          without firmware: helpers, dispatch, a hand-made .gam
tests/fulu-shadow.test.ts   the shadow run (with BBK_FIRMWARE and BBK_GAMES)
```

Estimated size: ~400 lines of core, ~1,500 for the 107 functions, ~200 for the
shadow run. `src/bbk` gains one hook for the address lookup.

## 8. Rules

- **No firmware in Fulu or the repository.** What is learned from the firmware
  is behaviour, written as code and checked by the shadow run, never copied
  bytes. The fonts are the site's.
- **Done means 0 mismatches** in the shadow run, not "the game seems to work".
- Firmware mode stays as the reference and for players who have the files.

## 9. What is needed

- From you: nothing to start. The tests use bbk-games `eebbk/roms`, fetched
  each session. If the firmware's download site is unreachable in a session,
  I will ask you to upload the firmware zip I sent earlier.
- Decisions: the name Fulu, and starting F1.
