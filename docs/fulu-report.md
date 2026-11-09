# Fulu: a TypeScript stand-in for the Longman 4988's operating system

*Technical report, FMJ React, November 2026.*

## Abstract

The Longman 4988 (步步高 / BBK electronic dictionary, 2004) ran games as
`.gam` programs: 65C02 code that calls into the device's operating system
for everything from drawing text to saving files. To run those programs in
a browser, FMJ React emulates the 4988's hardware; but the OS is BBK's
firmware, which the site cannot distribute. **Fulu** (符箓) replaces it. The
program runs its own machine code on the emulated CPU, unchanged, and every
call it makes into the OS is answered by TypeScript instead of by firmware.
Fulu answers 59 OS functions, 55 resident C-runtime routines and three
interrupt handlers in about 4,450 lines. It plays and saves the six games
it targets (伏魔记 1.0, 1.2, 1.3, 完美版 and 怀旧终曲, and 英雄坛说). It
was checked against the real firmware call by call ("the shadow run"):
every entry into the OS in a minute of play of each game, registers, banks
and all of RAM, with 0 mismatches. It also runs about 16 times faster than
emulating the firmware. Because Fulu draws all text and sees every key, it
also gives `.gam` games features the original OS never had: HD text,
dropping keys pressed while the game is busy, and a debug menu.

## 1. Background

The 4988 has a 65C02-compatible CPU, 32 KB of RAM, 2 MB of flash, ROMs for
the OS and fonts, a 159 × 96 monochrome LCD, timers and a keyboard. A `.gam`
file is a program for it: code in 16 KB segments plus data, installed into
the flash file system and started from the OS's 游戏 menu. Programs reach the
OS in three ways only, measured over the 138 programs of the bbk-games
collection:

1. **Far calls through the API table** (`JSR $D2F6` with `$26/$27` pointing at
   a 3-byte entry in `$E700-$E9FF`): 107 different functions are used, and 52
   cover 100 of the 138 programs.
2. **Direct calls into the OS's resident code** at `$D000-$FFFF`: the C
   compiler's runtime (multiply, shifts, 32-bit and floating-point
   arithmetic, `memmove`), 61 routines in all.
3. **Interrupts** through the vector page at `$0300`.

Programs never read the font ROM or the OS's variables directly, apart from
a few zero-page bytes (the software stack's bounds, the runtime's scratch).
That is what makes a replacement possible without emulating the firmware's
internals.

FMJ React now has three engines. **FMJ React** is the site's own port of
the 伏魔记 engine, for `.lib` archives and for the library inside a `.gam`.
**Fulu** runs any `.gam` without firmware. The **original OS** is BBK's
firmware, emulated, for visitors who add its files. The Games page lets
each game use any engine that fits.

## 2. Goals

- Run `.gam` programs **as written**: their own 65C02 code, unpatched.
- Need **nothing from BBK**: no firmware and no copied bytes. What was
  learned from the firmware is written as behaviour, and the fonts are the
  site's own.
- Be **indistinguishable to the program**: the same registers, flags, banks
  and memory after each call as the real OS leaves, so any program logic
  that depends on them behaves the same.
- Let measurement set the order of work: the shadow run lists what is
  missing, and a function is done when it has 0 mismatches.

## 3. Design

### 3.1 The machine

`src/bbk` emulates the hardware only: the CPU (`cpu.ts`), memory banks
mapping RAM, flash and ROM pages into the 64 KB address space, the flash
chip with its command set and CFI, the LCD (RAM `$0400-$0FFF`, its rows wired
out of order), two timers, the real-time clock and the keyboard controller
(`machine.ts`). The CPU runs at 8 MHz and the timers count at 9 kHz (§5.2).
The same machine runs the firmware or Fulu; only the OS region differs.

### 3.2 The OS as a lookup table

On Fulu's machine the OS ROM region is filled with the byte `$02`, an
opcode the CPU traps. When execution reaches an address there, the trap
hands control to `Fulu.enter`, which looks the address up:

- **`$D2F6`, the far call.** Fulu reads the table entry. For an OS function
  it runs its TypeScript version (`FUNCTIONS`, `src/fulu/os.ts` and the files
  it gathers). For the program's own code it maps that segment into banks
  5-8, pushes a return into Fulu and lets the program run. The return
  (`$D313`) maps the caller's segment back.
- **A resident routine** (`HELPERS`, `src/fulu/runtime.ts`): the C runtime.
- **An interrupt vector**, for the keyboard, timer ST1 and timer CT
  handlers (`INTERRUPTS`).
- **Anything else** stops the program with the function's name ("Fulu has no
  SysRand ($E959) yet"), and the player shows that message.

Each answer then returns as the OS's own code would: same registers, same
flags (down to C and V of the last addition the OS's compiled C happens to
make), same banks, and the trampoline's side effects (`$26/$27` = target − 1,
the scratch bytes at `$2000-$2002`).

### 3.3 Waiting

Some functions wait: GuiGetMsg for a key or a timer tick, a message box for
a key. On the device the OS halts the CPU until an interrupt and then
looks again. Fulu does the same. A function that cannot answer yet returns
`"wait"`, and Fulu restores the registers as they were before the call and
halts the CPU at the far call. After the next interrupt the call is made
again with `retrying` set. Functions that call other OS functions while
waiting, like GuiMsgBox and the Yes/No dialog `$E950`, keep their locals on
the program's software stack, where the OS's compiled C keeps them, and go
on from where they stopped. So a saved state taken mid-dialog resumes
correctly.

### 3.4 The same state at the same addresses

Fulu keeps the OS's state where the OS keeps it: the key buffer at
`$2003-$2017`, timer 1 at `$2018-$201A`, the 32-bit event flags at
`$201E-$2021`, the heap's blocks, the file system's records at `$2100-$21A0`,
and so on (`docs/fulu-notes.md`, "The OS's RAM"). Programs see the same
memory, and the emulator's saved states need nothing extra. Each function
declares what else it touches, so that it can be compared with the firmware:

- `temporaries`: the OS's scratch, dead after the call.
- `fromRom`: memory filled from the OS's own ROM data, such as an icon,
  where Fulu draws the site's equivalent.
- `ownState`: memory only Fulu writes.

### 3.5 Starting a program

Fulu skips the OS's boot. It installs the `.gam` in the flash file system
as the PC download tool did. It then puts the machine in the state the
OS's launcher leaves: banks, stacks, the program's base page, the boot page
at `$0300` (interrupt vectors and reset code), and a return into Fulu for
when `main` returns. It then jumps to the program's entry.

### 3.6 Text, the screen and fonts

The screen functions (SysPicture and its masked variant, rectangles, lines,
filling, inverting, saving and restoring parts of the screen) write LCD RAM
bit for bit as the OS does, including its clipping and the status-icon
column. Text goes through SysPrintString and SysAscii. Their glyphs are read
from a font ROM through the hardware's data port, as the OS reads them. For
its own machine Fulu builds that ROM from the site's Unifont in HZK16/ASC16
layout (`glyphs.ts`). When compared with the firmware, it reads the real
one.

### 3.7 Files

Saving and loading use the OS's flash file system: FileOpen, FileNum,
FileSearch, FileDel, reading, writing and seeking (`files.ts`). Fulu keeps
the OS's on-flash layout and its in-RAM records, including how the OS
picks a free sector and when it reuses one. Saves made on Fulu and on the
firmware are the same bytes.

### 3.8 Dialogs and the rest

GuiMsgBox, the Yes/No dialog `$E950` (伏魔记 1.0's "overwrite the save?"),
the message queue and keyboard state functions, the heap (SysMemAllocate
and SysMemFree), `itoa` and `ltoa`, SysRand, the melody functions, and the
strings and memory helpers all follow the firmware's behaviour. Where the OS
draws pictures from its own ROM, Fulu draws the site's: the dialog's icon is
the site's favicon, and its 是 / 否 buttons come from the font. These
regions are declared `fromRom`, as above. The melody functions are answered
for their effect on the OS's state. Neither OS mode plays sound.

## 4. Verification

### 4.1 The shadow run

`tests/fulu-shadow.test.ts` runs each game on the real firmware. At every
entry into the OS it takes a copy of the machine and lets the firmware
answer. It then runs Fulu's answer on the copy, with the same interrupts in
the same order, and compares registers, flags, banks and all of RAM.
Excluded are the 6502 stack below S, the software stack below `($28)` (the
OS's compiled C keeps its dead locals there), the real-time clock, and
hardware status bits set during the answer. Nothing is recorded, so every
call of every run is checked. Keys come from seeded scripts that start a
new game, walk, open menus, type, save and load.

Interrupts can come at any point on the device, while Fulu answers at once.
So the shadow run gives the firmware's recorded interrupts to Fulu in
several orders: one per wait; all before the call; all at the first wait;
or each one just before or after the OS-internal far call it arrived among.
Any order that matches counts as the device's. That last order matters for
long functions: GuiMsgBox draws for about 15 timer ticks before it waits.

Results: **0 mismatches** in the six games over a minute of play each (in
F1, the helpers alone: about 910,000 entries checked). File functions are
also checked while saving, overwriting and loading, and the flash contents
are compared.

### 4.2 Other checks

- The runtime helpers and the screen, string and heap functions are also
  compared on random arguments, 400 calls each for the helpers.
- `scripts/bbk/gam-calls.mjs` traces each game's code from its entry,
  following branches, far calls into its own segments and the C compiler's
  switch tables. It lists every OS function and helper the code can reach,
  not only those a minute of play reaches. For all six games the result
  is "nothing missing".
- `tests/fulu.test.ts` runs hand-made programs without firmware: a helper,
  a far call into a second segment, a missing function's name, and keys
  forgotten while busy.

## 5. Timing and input

### 5.1 Charging the OS's time

Fulu answers instantly, but on the device the OS's code takes time:
drawing a full-screen picture takes about 250,000 cycles. Games that pace
themselves partly by their own work ran 10-50% fast. So, on its own
machine, Fulu charges each entry the cycles the firmware spends on it
(`timing.ts`, through `Machine.stall`):

- constants for most functions and helpers;
- for drawing, clearing, copying and `strlen`, models fitted to about
  370,000 firmware entries from 伏魔记 1.0, 1.3 and 英雄坛说 (median error
  0.1-3%);
- interrupts, and the far call's trampoline and return.

`Machine.run` keeps to an absolute clock, so a stall longer than a frame is
paid back by the following frames instead of slowing the game down. Over
the same key script, Fulu draws within 1% as many pictures as the firmware
(2145 vs 2165, 883 vs 875, 1745 vs 1767).

### 5.2 The clock

The CPU clock was taken at first from other emulators: 4 MHz, with 400
cycles per timer count. It had never been measured, and games felt half
speed. The games' own timing fixes it. 伏魔记 opens its map timer with
`SysTimer1Open(50)` for a 500 ms tick: a 10 ms unit, as its Java port and
the Baye port also time it. The OS reloads timer 1 with `$A6`, which is 90
counts per overflow. So the timers count at 9 kHz, and the CPU runs at
8 MHz. At these rates walking and animation match the device.

### 5.3 Keys

Three rules keep input responsive without changing what programs see:

- A held key repeats only once the program has read the last press
  (`Machine.keysWaiting`). Before this, repeats piled up in the OS's 15-key
  buffer while a step took longer than the repeat rate.
- On release, the repeats not yet read are dropped (`Machine.dropKey`), so
  the walk stops when the key is let go.
- **Keys pressed while the program is busy are forgotten.** During a
  scene, a notice or a map load, the games stop asking for keys: 伏魔记
  1.3's opening scene goes 2 s without asking. The OS kept the presses and
  handed them over afterwards, where they skipped the next dialogues. Fulu
  notes when the program last asked (SysGetKey, GuiGetMsg). If it asks after
  more than 300 ms, the keys pressed in between are dropped. Waiting inside
  GuiGetMsg counts as asking, so a key that ends a long wait is kept.
  Measured across the six games, walking and menus ask at least every 250 ms,
  while scenes and notices go 340 ms to seconds without asking.

These rules apply only on Fulu's own machine. The firmware mode keeps the
device's behaviour.

## 6. Features built on Fulu

Because Fulu draws every character and sees every key, it can do things
the original OS could not:

- **HD text** (`textMarks.ts`). Each glyph SysPrintString or SysAscii draws
  is recorded with its cell and bits. Each frame, the characters whose whole
  cell the screen still shows are handed to the site's HD text renderer.
  Inverted cells, such as a menu's selection, count, with their colours
  swapped. A character drawn over even partly keeps its pixels, so stale text
  can never show. Checked on 伏魔记 1.3 and 英雄坛说 by tinting the reported
  cells on screenshots: every whole character is found and nothing else.
- **The debug menu** for games made with BBK's RPG kit (`src/bbk/kitCheats.ts`;
  it works on the firmware too). It reads and writes party, items, money,
  story flags and switches in the running game's memory. The kit's builds
  place their variables differently: 伏魔记 1.3 has them 2 bytes later, and
  1.0 and 1.2 one byte earlier from `$197B` on. So the layout is found from
  two pointer signatures and confirmed against the game's own library (the
  current map's name) before anything is used. A test plays all six games
  and checks against each game's own menus: money, and speed, spirit and
  luck on the status page.
- **A choice of engine per game** on the Games page. Fulu and the original
  OS keep separate saved devices for each game.

## 7. Results

| | |
|---|---|
| Games playable and saving without firmware | 伏魔记 1.0, 1.2, 1.3, 完美版 1.0, 怀旧终曲 v1.0; 英雄坛说 |
| OS table entries answered | 59 (29 with SDK names) |
| Resident routines answered | 55 |
| Interrupt handlers | keyboard, timer ST1, timer CT |
| Shadow-run mismatches (six games) | 0 |
| Code | about 4,450 lines in `src/fulu` |
| Speed (Node, 20 s of emulated play) | Fulu 74 ms; firmware 1,207 ms |

## 8. Findings about the device and the games

- **伏魔记 1.3's RunErr:12 is the game's own bug.** Ending a game from the
  menu and starting a new one shows "RunErr:12" (NPC slot already in use).
  The firmware does the same: the engine clears its NPC slots only when the
  program starts.
- **The RPG kit's builds differ** in where they keep their variables (above),
  and in details such as where 1.0 keeps its story flags.
- **The C reconstruction of the kit's engine** (gitee fmj-engine) misnames
  part of an actor's stats block. The block is a copy of the character's
  library record from `+$20`: speed, spirit and luck are at `+$16-$18`,
  current experience at `+$12`.
- **The kit's engine re-reads its map before each step.** Walking through
  walls therefore cannot be done by writing to its view of the map. It
  needs the engine's own passability test answered.

## 9. Limitations

- **Other programs.** Fulu answers what the six games need. Of the 107 OS
  functions the 138-program collection uses, the rest are not written.
  A program that calls one stops with its name, and the original OS still
  runs it. 三国霸业 needs two more OS functions (`$E7FA`, `$E8BF`) and eight
  floating-point and runtime routines.
- **Not written:** input methods, some GuiGetMsg events, `$E92F` (a
  GuiMsgBox message), the input-mode changes in `$E93B`.
- **The system keys** (power, 目录, the dictionaries) end the program, as
  Fulu has no menu or dictionaries to go to. The player ignores them on Fulu.
- **No sound**, in either OS mode.
- Timing is a model of the firmware's cost, not cycle-exact. It is
  within a few percent on the measured games.

## 10. Future work

- **The wider map view** for `.gam` games (F5): draw the rest of the map
  around the device's screen from the `.gam`'s library, shown only while the
  device's own tiles match it.
- **More text** (F6): answer the RPG kit's dialogue commands (SAY, MESSAGE,
  TIMEMSG) in TypeScript, first exactly as the game's code (checked by the
  shadow run), then with 12 / 10 px layouts. The same routine trapping would
  allow walking through walls.
- **三国霸业 and the rest of the collection**, one shadow-run list at a time.

## Appendix: where things are

| | |
|---|---|
| `src/fulu/fulu.ts` | start-up, the address lookup, far call and return, waiting, interrupts, key forgetting |
| `src/fulu/os.ts` | the function table, interrupt handlers, SDK names |
| `src/fulu/runtime.ts` | the C runtime's resident routines |
| `src/fulu/screen.ts`, `text.ts`, `glyphs.ts` | drawing, text, the font ROM |
| `src/fulu/gui.ts`, `msgbox.ts`, `dialog.ts` | messages, keys, dialogs |
| `src/fulu/heap.ts`, `files.ts` | the heap, the flash file system |
| `src/fulu/itoa.ts`, `ltoa.ts`, `rand.ts` | number formatting, random numbers |
| `src/fulu/timing.ts` | the cost model |
| `src/fulu/textMarks.ts` | HD text's record of glyphs |
| `src/fulu/device.ts` | what the device player needs |
| `tests/fulu-shadow.test.ts` | the shadow run (needs `BBK_FIRMWARE`, `BBK_GAMES`) |
| `tests/fulu.test.ts`, `text-marks.test.ts`, `kit-cheats.test.ts` | without firmware |
| `scripts/bbk/gam-calls.mjs` | what a game's code can call |
| `docs/fulu-plan.md` | the plan, milestones F1-F7 and their status |
| `docs/fulu-notes.md` | what was learned about the OS, entry by entry |
