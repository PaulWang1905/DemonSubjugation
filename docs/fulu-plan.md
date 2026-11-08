# Fulu (符箓): plan for review

**Fulu** is the planned replacement for the Longman 4988's operating system,
written in TypeScript. With it, a `.gam` program runs its own 6502 code on the
emulated 4988 (`src/bbk`), but every call it makes to the operating system is
answered by Fulu instead of BBK's firmware. No firmware files are needed.
This is the "WSL" idea: WSL ran Linux programs on Windows by answering their
system calls; Fulu runs 4988 programs in the browser by answering their OS
calls.

(符箓 are the written talismans of the 伏魔 stories: paper that commands
spirits. Here each one is a small function that commands the machine on the
program's behalf.)

Nothing is built yet. This document is what will be built, how it will be
checked, and what is needed from you.

---

## 1. What changes, and what does not

```
                 firmware mode (today)            Fulu mode (planned)
the program      its own 6502 code                its own 6502 code        same
the CPU, memory  src/bbk (emulated hardware)      src/bbk                  same
the OS           BBK's firmware (0E00.DAT)        Fulu (TypeScript)        replaced
the font         BBK's font ROM (4988.font)       the site's pixel fonts   replaced
files, saves     the flash file system            the flash file system    same
```

The program's own code is never replaced, so its game logic (battles,
formulas, a mod's engine changes) is always its own. Only the OS is new, so
only the OS has to be right.

## 2. Input and output

**Input (for players):** one `.gam` file. Nothing else: no firmware, no fonts
to upload (Fulu uses the pixel fonts the site already ships).

**Output:** the same as firmware mode: the 159×96 screen, the same keys,
saves kept in the browser, resume where you left off. Plus what only Fulu can
give, because text goes through it: the HD text option and the font menus for
every `.gam` program, not only fmj ones.

**In code:** a `Fulu` object with the same interface as today's `Device`
(`press(key)`, run a frame, the LCD RAM, `saveState`/`loadState`, the flash),
so the existing device player shows it unchanged. Roughly:

```ts
const os = new Fulu({ fonts });            // no firmware
const file = os.install(gamBytes);         // into the flash file system
os.start(file);                            // straight into the program, no boot
os.machine.run(cycles); os.machine.press(Key.enter);
```

**Input (for development only, never committed or shipped):** the firmware
dumps (as the referee) and the `.gam` collection. See section 6.

## 3. How a program talks to the OS (measured)

Everything Fulu must answer, found by scanning the 138 programs of the
bbk-games collection and reading the firmware:

| Way in | What it is | How many |
|---|---|---|
| Far calls `JSR $D2F6` through the API table at `$E700-$EA64` | the OS functions: drawing, text, keys, timers, memory, files, strings, random, message boxes | ~290 slots, ~200 point at code; **107 are used** by the 138 programs |
| Direct `JSR` into banks D-F (`$D000-$FFFF`, resident OS code) | the C compiler's helpers (push/pop on the software stack at `$28/$29`, compare, multiply, divide, shifts, switch) and the bank and far-call machinery | ~50-70 entry points |
| Interrupt vectors at `$0300 + 4n` | the OS's handlers: keyboard, ST1-ST4 timers, CT, alarm | 20 vectors, ~6 used |
| RAM the OS owns | tick counters (`$2018/$2019/$201E`), the key buffer (`$2003-$2017`), the program's base page (`$2029/$202A`), the software-stack pointer, zero page | to be catalogued |
| Start and exit | the OS launcher maps the program's banks, sets the base page, pushes a return address and calls the entry; the program returns to the OS when it ends | 1 each |

Coverage grows quickly: 52 functions cover 100 of the 138 programs, 70 cover
118, all 107 cover 138. Names are known for 29 (matched from fmj-engine's
disassembly), with fmj-engine's `middle.c` as a reference for about 45.

## 4. How Fulu works

1. **A synthetic OS ROM.** Fulu generates the 2 MB region at `0xE00000`
   itself. It contains no firmware bytes, only:
   - the vector page (`$0300`), each vector a jump to a trap;
   - the far-call stub at `$D2F6` and the bank routines, written anew in 6502
     (they are tiny, and keeping them as 6502 keeps the exact stack and bank
     behaviour programs rely on, for the 57,000 calls programs make to their
     own code);
   - the API table at `$E700`, each entry pointing at a trap;
   - a trap at each resident helper address.
2. **Traps.** A trap is the WDC opcode `$02`, a 2-byte no-op on the real
   chip, followed by a function number. When the CPU executes `$02` inside
   Fulu's ROM it calls the TypeScript function with that number; anywhere
   else `$02` stays a no-op, so no program can trip it by accident. Cost: one
   check on one rare opcode.
3. **The functions** read their arguments from the software stack, do their
   work on the emulated machine (draw into the LCD RAM at `$0400`, fill
   buffers, read the flash), set the return value (`$20/$21`, A/X), and
   return. They take the same device time as the originals (a message box
   stays 1 s; a delay lasts as long), measured on the firmware.
4. **The font.** Fulu builds a font region (`0x800000`) in the 4988 font ROM's
   layout from the site's pixel fonts (Retro, Ark, Unifont), so text looks as
   the Text menu says and any path that reads glyphs still works.
5. **Starting a program.** No boot: Fulu sets the machine to the state the
   OS leaves at a program's first instruction (banks 5-8 its code, 9-C its
   data, D-F Fulu, the OS variables, the software stack, a return address into
   Fulu's exit trap), learned from firmware mode, and jumps to the entry.
6. **Unfinished functions** show a clear message ("Fulu does not handle
   SysPicture ($E78E) yet") instead of crashing silently, and the player
   offers firmware mode if the files are there.

## 5. How it is checked against the real OS

Firmware mode is the referee: the same program, the same machine, BBK's own
OS. Three tools, built first:

1. **Call recorder.** Plays a program in firmware mode from a script of key
   presses and records every OS call: which function, its arguments, the
   whole machine state before (32 KB RAM, CPU, banks: cheap) and after, and
   the device time it took.
2. **Call replay.** For each recorded call, restores the "before" state into a
   Fulu machine, runs Fulu's version, and compares the result with the
   recorded "after": RAM, registers, the LCD, the time. Every difference is
   either a bug or the OS's own scratch memory (listed once). This checks each
   function with real arguments from real games, one function at a time.
3. **Side by side.** The same program and key script in both modes, comparing
   the screen whenever the program waits for a key. Text is compared with
   Fulu reading BBK's font for the test, so the comparison is pixel-exact;
   players get the site's fonts.

For functions no program in the collection uses (about 90 of the table),
small test programs written for the purpose (a few bytes of 6502 calling the
function with chosen arguments, packed as a `.gam`) are run in both modes
and compared the same way. That is how "every OS function" is reached, not
only the ones today's games use, so programs you add later work too.

The C compiler's helpers are checked by running them with random inputs in
both modes and comparing registers, flags and memory.

## 6. Which games are needed

**Already available (no upload needed):** the 138 programs of the bbk-games
collection (fetched from GitHub when a session starts) and the firmware set I
sent you. They stay outside the repository, as now.

**Test tiers, in order:**

| Tier | Programs | Why |
|---|---|---|
| 1 | 比大小, 二十一点, 对对碰, 平面魔方, 螃蟹回家 | 13-17 OS functions each: the first programs to run fully |
| 2 | 五子棋, 中国象棋, 二十四点, 乒乓球 | board and card games: menus, text, timers |
| 3 | 伏魔记 1.3, 伏魔记完美版, 仙剑三 (family A), 侠客行终曲版 (family B) | the fmj engine families: maps, battles, saves, many functions |
| 4 | 三国霸业, 七剑, 金庸群侠传, 魔塔 (from the factory flash) | other engines and heavy users |
| 5 | 炸弹超人 (link play), any program using the clock, melodies or the input method | special hardware and OS features, last |

**From you, if you have them:**
- any `.gam` not in the bbk-games collection, especially the ones you plan to
  add later, so they are in the tests from the start;
- programs that use the input method (typing a name), sound, the clock or
  linking two devices, if you know any;
- a list of the games that matter most to you, to put them in the early tiers.

## 7. Milestones

| # | Result | Done when |
|---|---|---|
| F0 | Tools: API catalogue from the firmware, call recorder, call replay, side-by-side | they run on tier 1 and 2 in firmware mode |
| F1 | Fulu boots a program: synthetic ROM, far calls, compiler helpers, interrupts, start and exit | tier 1 programs run until their first OS function, the helpers match on random inputs |
| F2 | Tier 1 fully playable without firmware | every recorded call replays identically; the screens match side by side |
| F3 | The ~52 common functions | 100 of 138 programs run; replay has no unexplained differences |
| F4 | All 107 used functions | 138 of 138 |
| F5 | The rest of the API table, with test programs | every function of the OS answered |
| F6 | In the site: Play works without firmware (firmware mode stays as "original OS" when its files are there); HD text and font menus for `.gam` programs | browser tests on phone and desktop |

Rough size: F0 1-2 sessions, F1 1-2, F2 2, F3 4-6, F4 4-6, F5 3-5, F6 1-2.
Each milestone is merged to main only when its checks pass; until then the
work stays on the `fulu` branch.

## 8. Code layout

```
src/fulu/
  index.ts        Fulu: install, start, the Device-like interface
  rom.ts          the synthetic OS ROM: vectors, far-call stub, API table, traps
  traps.ts        trap dispatch, argument and return-value helpers
  runtime.ts      the C compiler's helpers
  os/             the OS functions, grouped: screen, text, keys, timers,
                  memory, files, strings, dialogs, sound
  font.ts         the font region from the site's pixel fonts
  state.ts        the machine state at a program's start
tests/fulu-*.test.ts        unit tests (no firmware needed)
tests/fulu-referee.test.ts  replay and side by side (with BBK_FIRMWARE, BBK_GAMES)
scripts/bbk/                recorder and catalogue tools
docs/fulu.md                the API catalogue and notes, kept up to date
```

`src/bbk` gains one thing: the `$02` trap hook in the CPU (inactive in
firmware mode).

## 9. Rules Fulu keeps

- **No firmware in the repository or in Fulu.** Fulu's ROM is generated from
  TypeScript; its fonts are the site's. What is learned from the firmware is
  behaviour (what a function does, how long it takes, which memory programs
  read), written as code and tests, never copied bytes.
- **Firmware mode stays** as the reference and as "original OS" for players
  who have the files.
- **No guessing:** a Fulu function is done when replay against the real OS
  shows no unexplained difference, not when a game seems to work.

## 10. Risks

| Risk | What happens | Answer |
|---|---|---|
| Programs read OS memory nobody documented | they misbehave under Fulu | the recorder lists every OS-written byte a program reads; Fulu keeps those |
| OS screens (message boxes, menus, the input method) have their own look | screens differ | side-by-side comparison down to the pixel |
| Melodies live in the firmware's data ROMs | no music under Fulu | Fulu plays its own tones for the melody numbers, or stays silent; decided when reached |
| Linking two devices (炸弹超人) | serial port not emulated in either mode | out of scope until both modes have it |
| A program calls OS code outside the table | Fulu has no answer | the recorder catches it; a trap is added at that address |
| Timing | animations or input feel different | device time per call is recorded and matched |

## 11. Decisions for you

1. The name **Fulu** and the branch **`fulu`** (or another name).
2. The order of the tiers, and which of your games go first.
3. Whether F5 (every OS function, also those no game uses yet) is in scope
   now or after F4.
4. Merging policy: each milestone to main once its checks pass (proposed), or
   all at once at the end.
