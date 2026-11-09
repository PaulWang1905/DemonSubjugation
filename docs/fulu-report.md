# Fulu: a TypeScript stand-in for the Longman 4988's operating system

*Technical report, FMJ React, November 2026.*

Addresses are CPU addresses (`$xxxx`) unless marked physical (`$xxxxxx`)
or as `segment:address` in the OS ROM. Code references are to this
repository. `docs/fulu-notes.md` holds the entry-by-entry working notes this
report draws on.

## Contents

1. Abstract
2. The platform
3. How programs reach the OS
4. Fulu's core: the trap, the far call, interrupts
5. Writing a handler: flags, temporaries, waiting
6. Starting a program
7. The OS functions
8. The C runtime
9. Verification
10. Timing
11. Input
12. HD text
13. The player, saved devices and tools
14. Results
15. OS quirks Fulu reproduces, and findings
16. Limitations and future work

Appendices: A. The OS's RAM. B. Interrupt sources. C. Files.

---

## 1. Abstract

The Longman 4988 (步步高 / BBK electronic dictionary, 2004) ran games as
`.gam` programs: 65C02 code that calls into the device's operating system
for drawing, text, keys, timers, memory and files. FMJ React emulates the
4988's hardware in TypeScript, but the OS is BBK's firmware, which the site
cannot distribute. **Fulu** (符箓) replaces it. The program runs its own
machine code unchanged on the emulated CPU, and every entry into the OS is
answered by TypeScript that leaves the machine exactly as the firmware
would: the same registers, flags, banks and RAM, including the OS's own
variables.

Fulu answers 59 API-table entries, 55 resident C-runtime routines and the
keyboard, ST1 and CT interrupts, in about 4,450 lines (`src/fulu`). It
plays and saves 伏魔记 1.0, 1.2, 1.3, 完美版 1.0, 怀旧终曲 v1.0 and 英雄坛说.
It was verified by a **shadow run**: the firmware and Fulu answer each entry
from the same machine state, and the results are compared. A minute of play
in each game, every entry, gave 0 mismatches. Static tracing confirms that
nothing else the six games' code can reach is missing.

A cost model charges the firmware's measured time for each entry, so the
games keep the device's pace. Because Fulu draws every character and sees
every key, it also provides what the original OS could not: HD text,
dropping keys pressed while a game is busy, and a debug menu. It runs about
16 times faster than emulating the firmware.

---

## 2. The platform

`src/bbk` emulates the hardware only. The same machine runs the firmware or
Fulu; the difference is what lies in the OS's ROM pages.

### 2.1 Memory

Physical memory is 16 MB in 4 KB pages (`src/bbk/machine.ts`):

| Physical | What |
|---|---|
| `$000000-$007FFF` | RAM, 32 KB (pages 0-7) |
| `$200000-$3FFFFF` | NOR flash, 2 MB (pages `$200-$3FF`): the file system |
| `$400000-$7FFFFF` | dictionary ROMs, four channels chosen by PB (`$021B`) bits 7-6 |
| `$800000-$9FFFFF` | font ROM |
| `$A00000`, `$C00000` | data ROMs |
| `$E00000-$FFFFFF` | the OS ROM |

The CPU sees sixteen 4 KB banks. Bank 0 is fixed to physical page 0 and
holds the zero page, the 6502 stack, the I/O registers (`$0000-$000F` and
`$0200-$02FF`), the interrupt vectors at `$0300` and the LCD memory at
`$0400-$0FFF`. Banks 1-15 are mapped by writing the bank number to BK_SEL
(`$0C`) and the page to BK_ADRL/BK_ADRH (`$0D`/`$0E`, 12 bits). The machine
keeps a direct `Uint8Array` view per bank for RAM and ROM, so the CPU's
reads cost one array index. Flash goes through the flash chip's command
state machine (program, sector erase, CFI query). Four DATA ports
(`$00-$03`) read and write physical memory at ADDR1-4 (`$0208-$0213`,
24 bits each), each stepping after an access when its INCR bit (`$0207`)
is set. The OS reads glyphs from the font ROM this way.

### 2.2 Interrupts, halt and timers

Interrupt flags are in ISR (`$04`) and TISR (`$05`), with enables in IER
(`$023A`) and TIER (`$023B`). Writing a 0 bit to a flag register clears that
flag. The highest-priority pending source is taken through vector
`$0300 + 4n` (Appendix B). Setting bit 3 of SYSCON (`$0200`) halts the CPU,
and raising any flag clears that bit again. The OS halts this way while it
waits.

ST1-ST4 are 8-bit up-counters, enabled by STCON (`$0226`) bits 0-3,
reloaded from ST1LD+n (`$0227`…) on overflow, and raising TISR bit n. CT is
a 12-bit counter, enabled by STCTCON (`$022E`) bit 4, reloaded from CTLD
(`$022F`), raising ISR bit 1. The real-time clock counts seconds, minutes,
hours and a 9-bit day count at RTCSEC (`$0234`…), with an alarm on ISR bit 0.

**Clock rates** (§10.2): the CPU runs at 8 MHz, and the timers count at
9 kHz, so one count is 888.9 CPU cycles (`TICK = CPU_HZ / TIMER_HZ`).

### 2.3 The keyboard

Pressed keys queue in the machine. On each timer count, if ISR bit 7 is
clear, the next key is latched into KEYCODE (`$024E`) with bit 7 set and
ISR bit 7 is raised. The OS's keyboard handler takes it, clears KEYCODE and
acknowledges, which lets the next key through. Key codes are 6 bits: 0-3
are the system keys (power, 目录, 双解, 现代), and the arrows, Enter, Exit
and the letters follow (`src/bbk/keys.ts`).

### 2.4 The LCD

The screen is 159 × 96 pixels plus a column of status icons. It is
refreshed from RAM `$0400-$0FFF`: 96 rows of 32 bytes, with the most
significant bit leftmost. The rows are wired out of order. RAM rows 0-65
are display rows 65-0, bottom up, and rows 66-95 follow in order. Each RAM
row's bytes 0-18 are display bytes 1-19, while byte 19 holds display byte
0 of a neighbouring row: rows ≤ 64 use RAM row 64 − y, row 65 uses RAM
row 95, and rows ≥ 66 use RAM row y − 1. RAM row 0's byte 0 is redirected
to `$1000`. Bit 0 of byte 18 of RAM row i lights status icon i. The OS's
`lcd(b, y)` address function and the player's `decodeLcd` implement this
map.

### 2.5 `.gam` programs

A `.gam` file is a header and 16 KB code segments, followed by data. The
header holds `"GAM\0"`, the GBK name at +6, the entry point at +`$40`
(16 bits) and the data's file offset at +`$42` (24 bits). Installed in
flash at offset h:

- The program's **base page** is `$200 + h/4096`. Code segment n is at
  pages base + 4n … +3 and runs in banks 5-8 (`$5000-$8FFF`).
- The **data pages** start at base + (data offset >> 12), mapped into
  banks 9-12 (`$9000-$CFFF`) at start.
- **Banks 13-15** (`$D000-$FFFF`) hold the OS's resident code (pages
  `$E88-$E8A`). Banks 1-4 are RAM pages 1-4.

The six games carry an fmj resource library at file offset `$48000`
(`src/bbk/gam.ts`, `findLib`).

---

## 3. How programs reach the OS

Measured over the 138 programs of the bbk-games collection, programs reach
the OS in three ways only. They never read the font ROM or the OS's
variables, except a few zero-page bytes (the software stack `$28/$29`, its
bound `$2A/$2B`, scratch `$2F/$30`).

### 3.1 The far call, `JSR $D2F6`

The caller points `$26/$27` at a 3-byte entry: a target address and a
segment number. The OS's API table is at `$E700-$E9FF` (bank E). Segment
numbers below `$E0` are the OS's own; a segment `$E0 + n` is segment n of
the running program. The trampoline then:

1. saves the current segment's number (`$E8F8`; computed from bank 5's
   page relative to the OS's base page, kept at `$03E4/$03E5`, or the
   program's, kept at `$2029/$202A`);
2. maps the target's segment into banks 5-8 (`$E8FB`). This leaves BK_SEL
   at 8, `$2000` = the high byte of bank 8's page, and `$2001/$2002` = the
   segment's base page;
3. jumps to the target with **A = X = Y = the caller's A**, `$26/$27` =
   target − 1, N and Z from A, and C and V from the high byte of that
   subtraction;
4. lands at `$D313` when the target returns with RTS. There it maps the
   saved segment back, sets X = A and N/Z from A, and returns to the
   caller.

107 different API entries are used across the 138 programs. 52 of them
cover 100 programs, and 70 cover 118.

### 3.2 Resident routines

The C compiler's runtime lives at `$D000-$FFFF`: multiply, divide, shifts,
32-bit and floating-point arithmetic, sign extension, `switch` dispatch.
At `$E900` there are also `memmove` (`$E901`), `memcmp` (`$E904`), "map
banks" (`$E907`) and "save a bank's page" (`$E90A`). 61 routines are used
across the collection. Programs call them with a plain `JSR`.

### 3.3 Interrupts

Vector n's stub at `$0300 + 4n` pushes A and X, sets X = 3n, and calls a
dispatcher. The dispatcher saves Y and `$26/$27` and far-calls the handler
through the table at `$E74C + 3n`. The handlers used are: vector 2
(keyboard) → 7:`$764D`; 3 (ST1) → 7:`$77AF`; `$12` (CT) → 5:`$510E`.

### 3.4 The C conventions

Values and pointers are passed in zero page at `$20/$21` and `$23/$24`, and
16-bit results return in `$20/$21`. 32-bit values pass by pointer; results
go to a scratch area at `($2A)` (+8, or +`$18` for a remainder), with `$20`
pointed at them. OS functions take arguments on the **software stack**
(`$28/$29`, growing down, removed by the caller), often with the first one
in A, and return in A or `$20/$21`. The OS is compiled C too: it keeps its
locals on the software stack and changes its own argument slots, which are
live memory the caller can see.

---

## 4. Fulu's core: the trap, the far call, interrupts

### 4.1 The trap

Fulu's machine has an OS ROM filled with the byte `$02`. On the 65C02,
`$02` is a two-byte NOP. The emulated CPU first offers it to a trap hook
(`Cpu.trap(pc)`, `src/bbk/cpu.ts`) and treats it as the NOP only if the hook
declines. `Fulu.enter(pc)` (`src/fulu/fulu.ts`) decides:

```
pc in $0300-$034F                → interrupt((pc − $300) / 4)
bank of pc maps a page < $E00     → decline: a $02 in the program's own code is a NOP
pc == $D2F6                       → farCall
pc == $D313                       → farReturn
HELPERS[pc]                       → charge, run it, then RTS (unless it set PC: "jump")
otherwise                         → stop: "Fulu has no the OS routine at $xxxx yet"
```

Because the trap is per address, nothing of the OS's code is needed: the
`$02` bytes only mark where the OS is.

### 4.2 The far call

`farCall` reads the entry at `($26)`:

- **The program's own segment (`$E0` and up).** It pushes the current
  segment number, maps the segment (`mapSegment`), pushes `$D313 − 1` as the
  return address, sets up the arrival state and jumps to the target. The
  program then runs at full speed until its RTS reaches `$D313`.
- **An OS function.** It looks up `FUNCTIONS[ptr]`. If there is none, the
  program stops with "Fulu has no SysRand ($E959) yet" (the SDK name, where
  known). Otherwise it keeps A, X, Y and P, records the call for the debug
  menu, charges its cost (§10), sets the arrival state for `f.at`, and runs
  the handler.
  - If the handler returns **"wait"**, Fulu puts A, X, Y, P and PC back as
    they were before the call, puts `$26/$27` back at the entry, and sets
    SYSCON bit 3. The CPU halts at `$D2F6`. The next interrupt wakes it,
    the trap fires again, and the handler runs again with `retrying` set.
  - Otherwise Fulu maps the caller's segment back, applies the return
    state (X = A, N/Z from A) and does an RTS.

**The arrival state** (`arrive`) is exactly the trampoline's:

```
$26/$27 = target − 1
X = Y = A
r  = (target >> 8) − (low byte of target == 0 ? 1 : 0)
C  = r ≥ 0;  V = (hi & ~r & $80) ≠ 0;  N, Z from A
```

**Segment numbering** (`segment`, `mapSegment`) uses the OS's own rule. If
bank 5's page is at or above the OS's base page, the segment number is
(page − OS base) / 4. Otherwise it is `$E0` + (page − program base) / 4.
Mapping a segment writes BK_SEL, BK_ADRL and BK_ADRH for banks 5-8, as the
OS does, and leaves `$2000-$2002` as the OS's scratch.

`farReturn` (`$D313`) pulls the saved segment. A value below `$E0` means the
launcher's own far call has returned, that is, `main` returned: the program
has ended (§6).

### 4.3 OS functions calling OS functions

Some functions are built from others: GuiMsgBox calls strlen,
SysMemAllocate, SysSaveScreen, SysPrintString and GuiGetMsg. Inside Fulu
they use `os.call(entry, resumed)`. It runs the callee with the same
arrival and return state a far call from the OS's code would give, and
leaves `$26/$27` as that call leaves them (`farCalled(at)`). It returns
"wait" when the callee waits. The caller then waits too, and continues
from the same point when it is asked again (§5.4).

### 4.4 Interrupts

`interrupt(vector)` runs the TypeScript handler (`INTERRUPTS`), remaps the
interrupted segment as the handler's far-call return would, charges the
handler's cost, and returns as RTI does. It pulls P (with U set and B
clear), then the PC. The CPU had already pushed PC and P on entry, as the
hardware does. The three handlers are:

- **Keyboard (2).** Acknowledge (ISR ← `$7F`), copy `$2027` to `$2028`, and
  start the key click if the key sound is on (`$201B` bit 2). If KEYCODE
  bit 7 is set, clear it and append the code to the 16-place ring at
  `$2008` (write index `$2003`, read index `$2004`, both mod 16). The OS
  keeps at most 15 keys and drops the key when the buffer is full. Then set
  `$2021` bit 0.
- **ST1 (3).** Acknowledge (TISR ← `$FE`), count `$2018` up, and when it
  reaches the period in `$2019`, set `$201E` bit 0 (the timer-1 event) and
  count from 0 again.
- **CT (`$12`).** Acknowledge (ISR ← `$FD`) and, if the cursor is on
  (`$20CD`), toggle its phase (`$20CE`) and the status icons it blinks.

---

## 5. Writing a handler: flags, temporaries, waiting

### 5.1 The flag-exact ALU

A program may branch on any register or flag an OS call leaves. So a
handler must leave **C, V, N and Z exactly as the OS's code does**, down to
the flags of the last arithmetic the OS's compiled C happens to do.
`src/fulu/alu.ts` provides 65C02 arithmetic that sets them the same way:
`adc`, `sbc`, `cmp`, `rol`, `ror`, `asl`, `lsr`, `nz` and `plp`, all on the
real P register. A handler does its arithmetic in the order the OS does.
For example, SysTimer1Open sets up its timer with `wr(STCON, (cpu.a =
nz(rd(STCON) | 1)))`, leaving A and N/Z as the OS's `ORA`/`STA` does. Where
the OS adds one to a pointer with `CLC`/`ADC #1`/`ADC #0`, the handler does
the same, so C and V come out the same.

### 5.2 The function record

Each API entry is an `OsFunction` (`src/fulu/fulu.ts`), usually built with
`fn(at, run, temporaries)`:

| Field | Meaning |
|---|---|
| `at` | where the OS has the function, in its segment (it sets `$26/$27` on arrival) |
| `run` | the handler: returns nothing, `"wait"`, or `"jump"` (it has set PC) |
| `temporaries` | `[from, to)` ranges of OS RAM the function uses as scratch, always written before being read and never used by programs |
| `fromRom` | registers and RAM the OS would fill from its own ROM data (a melody's notes, a dialog's icon), which Fulu does not have; may be a function of the call |
| `ownState` | the OS's workspace that Fulu keeps its own way (the file functions' workspace and registers) |
| `files` | it changes the flash |

These declarations exist so the shadow run (§9) can tell an honest
difference from a scratch value. The shadow run also checks them: a
declared temporary that is read before it is written within an entry, or
that the program touches, is reported as misuse.

### 5.3 The OS's state, at the OS's addresses

Fulu keeps no private state that a program could observe. The key buffer,
timer 1, the event flags, the heap's block headers, the message queue, the
keyboard state and the file system's records all live at the OS's own
addresses (Appendix A). So the emulator's saved state (RAM, registers,
banks, timers, flash) also captures Fulu's whole state. The only extra
needed on resume is whether the CPU is halted inside a waiting call
(`FuluDevice.resumed`: waiting = PC == `$D2F6` and SYSCON bit 3 set).

### 5.4 Waiting and resuming

A function that cannot answer yet returns "wait" (§4.2). GuiGetMsg is the
main case: with no event, message or key it waits, as the OS's far call to
`$E7A0` halts until an interrupt. When asked again it leaves `$26/$27` as
that call does (`$7303`). Functions that wait inside a longer job
(GuiMsgBox, the Yes/No dialog `$E950`) keep **their locals on the software
stack**, in the 57-byte frame the OS's compiled C uses. They also follow
the same sequence of calls to other OS functions. When the inner GuiGetMsg
waits, the whole function returns "wait". When asked again
(`os.retrying`), it continues from its locals at the call that waited. A
saved state taken in the middle of a dialog therefore resumes in the
middle of it.

---

## 6. Starting a program

Fulu skips the OS's boot and puts the machine in the state the OS's
launcher leaves at a program's first instruction. That state was measured
on the device for the 伏魔记 series, 三国霸业 and 英雄坛说 (`Fulu.start`):

- **Boot page data** at `$03E4-$03FC`: the OS's base page (`$0E80`), the font
  ROM's bank (`$80`), and the LCD redirect (`$03F8-$03FC` = 1, `$0400`,
  `$1000`).
- **Banks**: 1-4 → RAM pages 1-4; 5-8 → the program's segment 0; 9-12 →
  its data pages; 13-15 → the OS's resident pages `$E88-$E8A`. The program's
  base page goes in `$2029/$202A`, and `$2186` = 2 (the file system's groups
  of 256 sectors).
- **I/O registers**: 38 values, among them SYSCON `$05`, INCR `$0F`, ADDR4 =
  `$88B573`, ST1LD `$A6` (timer 1's reload: 90 counts), IER `$83`, TIER `$21`.
  **Zero page**: the runtime's pointers, with the software stack at `$17BB`
  and its bound at `$17D7`.
- **The 6502 stack** from S = `$E7`: 24 bytes of the launcher's return
  addresses. The innermost is a far call's: when `main` returns, its RTS
  goes to `$D313`, which pulls the saved segment `$08`, one of the OS's.
  Fulu reports that as "The program ended".
- **The launcher's frame** on the software stack at `$17BB`, holding the
  program's data and base pages.
- **Registers**: A = X = Y = `$17`, P = `$21`, S = `$E7`, `$26/$27` =
  entry − 1, PC = entry.

Installing the `.gam` writes a directory entry and its data into flash, as
the PC download tool did (`src/bbk/flashfs.ts`). The program can then find
itself and its saves in the file system.

---

## 7. The OS functions

The 59 entries Fulu answers, by area. "At" is where the OS has them. The
full table, with sizes and contracts, is in `docs/fulu-notes.md`.

### 7.1 Timers, keys, clock (`src/fulu/os.ts`)

| Entry | Name | At | Behaviour |
|---|---|---|---|
| `$E7B2` | SysTimer1Open | 7:`$7770` | A = period in ST1 ticks. Nothing if 0 or already open; otherwise `$201A` = 1, `$2019` = period, `$2018` = 0, STCON bit 0 on |
| `$E7B5` | SysTimer1Close | 7:`$7793` | `$201A` = 0, STCON bit 0 off |
| `$E7B8` | | 7:`$77A1` | A = the period if open, else 0 |
| `$E7C1` | SysGetKey | 7:`$76CC` | A = next key from the ring, or `$FF`. Leaves `$2F/$30` = `$2008` and Y = the index read |
| `$E7C4` | SysSetKeySound | 7:`$7716` | A ≠ 0: `$201B` bit 2 on |
| `$E7C7` | | 7:`$772E` | A = 1 if the key sound is on |
| `$E7D9` | | 7:`$759F` | A = the RTC's seconds (`$0234` & `$3F`) |
| `$E845`, `$E848`, `$E8D7` | | 6:`$672B`… | one status icon on or off (rows 20, 31, 41) |
| `$E8EC` | | 6:`$624D` | every status icon off (the rows from the table at 6:`$6D15`) |

### 7.2 The screen (`src/fulu/screen.ts`)

Drawing functions take x1 in A and y1, x2, y2 on the software stack. They
address the LCD through `lcd(b, y)` (§2.4) and keep temporaries in
`$38-$3B`, `$2080-$2089`, `$20B7-$20B9` and `$20CF-$20EE`. Their checks are
the OS's own, loose ones. Only the second corner is tested before the
corners are sorted, so a first corner past the screen draws past it, into
RAM after the LCD.

| Entry | Name | Behaviour |
|---|---|---|
| `$E78E` | SysPicture | a packed bitmap (rows of ⌈w/8⌉ bytes) at a rectangle. Mode 1 copies whole bytes, mode 0 shifts into place. Nothing if x2 ≥ 160 or y2 ≥ 96 |
| `$E889` | SysPictureDummy | the same into a buffer with a 20-byte stride. Its row step takes a stray carry when x2 ≥ 160 (reproduced) |
| `$E794` | SysLine | Bresenham-style, four octants, 16-bit error term. Endpoints swapped when x0 ≥ x1. Unclipped |
| `$E797` | SysRect | four SysLines (bottom, left, top, right). Nothing unless x1 ≤ x2 < 160 and y1 ≤ y2 < 96 |
| `$E85D` | SysLcdPartClear | clears a rectangle; counts `$2F/$30` up once a row |
| `$E860` | SysLcdReverse | inverts a rectangle (menus' selections) |
| `$E87D` | SysFillRect | ORs a rectangle's bytes. A = the last byte written, C = 1 |
| `$E874` | | n = (⌊x2/8⌋ − ⌊x1/8⌋ + 1) × (y2 − y1 + 1): a save buffer's size. Off screen it writes 0 through `$2F/$30` as they are |
| `$E877` / `$E87A` | SysSaveScreen / SysRestoreScreen | a rectangle's bytes to a buffer and back |

### 7.3 Text (`src/fulu/text.ts`, `glyphs.ts`)

**SysPrintString** (`$E79A`, x in A, y, s):

- ASCII (< `$81`) is drawn 8 wide as SysAscii does.
- Double-byte codes are drawn 16 wide. `$FD-$FF` with a second byte ≥ `$A1`
  are drawn 8 wide (the glyph's left halves).
- A character that does not fit before x = `$91` (16 wide) or `$99`
  (8 wide) wraps to x = 0, 16 rows down.
- Drawing stops at the string's end, or when y ≥ `$51`. `$2F/$30` are left
  where it stopped.

**SysAscii** (`$E7BB`) draws an 8 × 16 glyph only when x < `$99` and y <
`$51`. A glyph replaces the pixels under its cell. At x = 152 an 8-wide
glyph's last column is dropped, and at x = 144 a 16-wide one's: that column
belongs to the status icons.

**Glyphs** are read through the DATA4 port. The handler sets ADDR4
(`$0211-$0213`) to bank `$03E7` × 64 K + offset and reads 16 or 32 bytes
into `$208D`, as the OS's `$E749` does. ASCII glyphs are at offset
`$08B363 + 16 × code`. A 16 × 16 glyph for the code hi lo is at
`32 × (row × n + column) + base`. The product comes from the OS's 16 × 16
multiply (`$7B73`), whose carry into the top byte is lost, and Fulu
reproduces that:

| hi | lo | row, column | n | base |
|---|---|---|---|---|
| `$B0-$F7` | ≥ `$A1` | hi − `$B0`, lo − `$A1` | `$5E` | `$000000` (GB2312 hanzi) |
| `$A1-$A9` | ≥ `$A1` | hi − `$A1`, lo − `$A1` | `$5E` | `$034E00` (GB2312 symbols) |
| `$AA-$AF` | ≥ `$A1` | hi − `$AA`, lo − `$A1` | `$5E` | `$03DF40` |
| `$F8-$FF` | ≥ `$A1` | hi − `$F8`, lo − `$A1` | `$5E` | `$0425C0` |
| `$A1-$A7` | < `$A1` | hi − `$A1`, lo − `$40` | `$61` | `$047800` |
| `$A8-$A9` | < `$A1` | hi − `$A8`, lo − `$40` (− `$41` from `$80`) | `$60` | `$03BD80` |
| `$AA-$D9` | < `$A1` | hi − `$AA`, lo − `$40` | `$61` | `$08D3A3` |

Any other code is drawn as `A1A1`, a space. For its own machine, Fulu
builds a font ROM in this layout from the site's Unifont, as HZK16 and
ASC16 (`fontRom` in `glyphs.ts`). When checked against the firmware, it
reads the real font ROM. That's why the handlers read glyphs through the
port rather than from a table of their own.

### 7.4 Messages and keys (`src/fulu/gui.ts`)

**GuiGetMsg** (`$E935`, msg): the message pump. It writes a type byte and a
16-bit parameter through its argument and returns 1. It tests, in order:

1. event bit 25 (`$02000000`) → type 7;
2. event bit 0 (timer 1, set by the ST1 handler) → type 6;
3. a posted message: a queue of 8 three-byte records at `$2B0F`, read
   index `$2B09`, count `$2B0B` (mod 8);
4. a key from SysGetKey → type 1, parameter = the key code. It then points
   `$20/$21` and `$26/$27` at the key's entry in the key-class table
   (8:`$8C36` + 2 × (code & `$3F`)) and sets `$23/$24` = code & `$3F`. The
   system keys 0-3 leave the program on the device; on Fulu they end it.
5. With no key: the events `$02`, `$04`, `$80`, `$40`, `$10`/`$10000`, which
   go to code Fulu does not have (it stops, naming the event), then bit 25
   again;
6. nothing: **wait** (§5.4).

Each test leaves (scratch + 8) = events & flag, and taking an event clears
its bit through the same scratch, as the OS's 32-bit compiled C does.

**GuiTranslateMsg** (`$E93E`) turns a key message into (class, code) using
the key-class table (two halves; the second while the shift latch is set).
The keyboard state is at `$2B27`: low 4 bits the input mode (1, 2, 4, 8),
bits 2-3 input methods, bit 4 caps, bit 5 the shift latch. `$2B28` says
what characters are accepted (bit 0 digits, bit 1 letters, bits 2-3 input
methods). Letters are made upper case under caps or the latch, which they
release. Delete (`$34`) toggles the latch and its icon. Shift (`$29`) is
the command `$29` in modes 1 and 2. In mode 2 the input key (`$36`)
toggles caps. **GuiSetKbdState** (`$E968`), `$E965` (returns
`$2B28 << 8 | $2B27`), `$E938`, `$E93B` (only "no change") and the GUI's
start-up `$E932` complete the set.

### 7.5 The heap (`src/fulu/heap.ts`)

The heap's start and size are 32-bit values at `$2BAB` and `$2BAF`. A
program starts with `$2C00` and `$1400`: one free block up to `$4000`.
`$2BB3` = 1 marks that a broken block was found. Each block has a 4-byte
header:

```
+0  'b' ($62) free  | 'u' ($75) used
+1  'n' ($6E) another follows | 'e' ($65) the last
+2  data size (16 bits)          next block = p + 4 + size
```

- **SysMemAllocate(n)** (`$E947`) rounds n up to a multiple of 4, writing it
  back into its argument. It takes the first free block with size − 4 ≥ n
  and splits it when more than 4 bytes would remain. The rest becomes a
  free block that takes over the follow byte. It returns the data address,
  or 0.
- **SysMemFree(p)** (`$E94A`) finds the block at p − 4 by walking. It marks
  it free, then lets every free block absorb the free blocks after it. It
  returns 1, including when the block was already free, or 0 if p is not a
  block.

Walking stops at a pointer outside the heap, at the last block, or at a
broken block: one whose follow byte is neither 'n' nor 'e', or whose next
block is outside the heap. Both functions are compiled C that checks
32-bit bounds with the runtime, so they leave the heap's end at scratch + 8
and the last address checked at scratch + `$10`, with pointers to them in
`$20` and `$23`. The model does the same. It was checked on 1,500 random
calls.

### 7.6 The message box and the Yes/No dialog (`msgbox.ts`, `dialog.ts`)

**GuiMsgBox** (`$E953`, text, timeout) is a wrapper (9:`$8A7C`) around a body
(9:`$8195`) called as body(text, timeout, 1):

1. strlen(text); a zero low byte returns `$FF`.
2. Break into lines of 16 bytes, at most 5. A byte > `$80` counts a run of
   double-byte bytes; at column 16 the line breaks after this byte if the
   run is even, and before it if odd.
3. top = (90 − 16 × lines) / 2, bottom = top + 16 × lines + 4. The frame is
   x 11-`$92`, with its shadow to `$94` and y to bottom + 2.
4. `$E874` for the size, then SysMemAllocate (0 → `$FE`), SysSaveScreen and
   SysLcdPartClear. Each line is `strncpy`'d into a 17-byte buffer and drawn
   at (15, top + 2 + 16i). Then SysRect, and two SysFillRects for the
   shadow.
5. With a timeout: keep timer 1's period (`$E7B8`), close the timer, and
   reopen it with period 1.
6. GuiGetMsg until a key, or until timeout type-6 messages. This is where
   the function waits and resumes (§5.4).
7. Close the timer, reopen the old period, SysRestoreScreen, SysMemFree,
   and return 1.

**`$E950`**, the Yes/No dialog (伏魔记 1.0's "overwrite the save?"), works
the same way, through the same OS calls. The OS draws a 24 × 24 icon
(9:`$8ADA`) and its buttons (9:`$8CB2`) from its ROM. Fulu draws the site's
icon (`public/favicon.svg` at 1.5×) and 是 / 否 from the font ROM's glyphs.
Those regions, and the heap blocks they pass through, are declared
`fromRom`.

### 7.7 Files (`src/fulu/files.ts`)

The calls are:

- FileNum (`$E9E9`, type in A, &n)
- FileSearch (`$E9EC`, type in A, n, &id, &name)
- FileOpen (`$E9CE`, id, type, mode, &handle, &size); a user file is found
  by its id alone
- create (`$E9C8`, type in A, size (3 bytes), name, &id, &handle); opened
  to write
- read (`$E9D7`) and write (`$E9D4`): handle in A, n (a byte), buffer; at the
  position, unchecked against the size
- seek (`$E9EF`, handle in A, offset (long), whence): 1 from the start,
  2 from the position, 3 from the end (size + offset − 1)
- close (`$E9D1`, handle in A)
- FileDel (`$E9DD`, handle in A, open to write)

All return 1 or 0 in A.

The on-flash format is the OS's own, so saves made by either OS are the
same bytes (Appendix C). FileNum follows the OS's code closely. The OS
keeps a nesting count at `$216A`, and on the first entry saves the pages of
banks 9-12 and 4 to `$215C-$2167`. It maps banks 9-12 to pages
`$202-$205` and bank 4 to `$200` (D:`$610A` maps X consecutive banks from
the page at `$2177`). It counts directory entries of the type at `$2100`
into `$2119`, mapping each directory sector at `$A000`, and maps the saved
pages back on the last exit.

The other functions are written from what they do rather than from the
OS's code, which programs flash cell by cell with its own wear-levelling.
They work on the same format and keep the 4 open-file records at `$2122`
(12 bytes each: mode, first page, position (3), size (3), the entry's
index in its sector, the sector). The OS's workspace (`$2100-$219F`,
`$80-$8F`, `$20-$27`) and registers other than A are declared `ownState`.
Where a deleted file's space goes is Fulu's own rule: reuse a data sector
no live file uses, from the top, as the OS was seen to. So the shadow run
compares **the files a program can see** (the live entries in order, and
each file's contents) rather than raw flash bytes.

### 7.8 The rest

- **SysRand** (`$E959`, r = { long seed; int range }):
  seed = seed × 1103515245 + 12345, returns (seed / 65536) mod (range + 1).
- **itoa** (`$E709`) and **ltoa** (`$E70F`), with their constants read from
  where the OS has them.
- **String and memory functions**: strlen, strcpy (`$E71B`, safe when the
  strings overlap: backwards when src < dst, compared signed), strncpy
  (`$E72D`), strcat (`$E712`), strcmp (`$E718`), memset (`$E700`; leaves
  p + n and 0 in its arguments).
- **`$E95C`**: *(long *)p = v, *(int *)(p + 4) = w, through the runtime's
  scratch, widened as the OS does.
- **`$E9C2`, `$E9A1`, `$E91C`, `$E944`**: housekeeping, including the heap's
  set-up, whose memset is really a `JSR $5000` in segment 8, that is, the
  GUI start-up. Fulu runs that instead, as the OS does.
- **SysPlayMelody / SysStopMelody** (`$E8A1`/`$E8A4`): the OS's state is
  updated. What the OS takes from its tune data (the notes' pointers, Y)
  is declared `fromRom`. The emulator plays no sound.

---

## 8. The C runtime (`src/fulu/runtime.ts`)

All 55 routines leave memory, registers and flags as the OS's own do,
including the incidental ones: X and Y as the loop left them, and the flags
of the last operation. They are grouped below by kind:

| Kind | Entries | Notes |
|---|---|---|
| 32-bit add / and / subtract | `$D29D`, `$D2CA`, `$DB2F` | (scratch + 8) = (`$20`) op (`$23`); Y = `$0B`; `$20` pointed at the result |
| compare | `$D340` (16-bit), `$D362` (32-bit) | the subtraction's flags; Z only if all bytes are equal; A = the flags, X = the bytes that differ |
| widen / sign-extend | `$D49E`, `$D50C`, `$D4A9`, `$D4C6`, `$D519`, `$D53A`, `$DD1F`, `$DD38`, `$DD58`, `$DD75` | byte or word to 32 bits at scratch + `$10` or + `$20`, signed or not |
| load, copy, push | `$D85A`, `$D85F`, `$DAE6`, `$DB19`, `$DAAA`, `$DACA`, `$DAFC` | push = onto the software stack (1, 2 or 4 bytes) |
| shifts | `$DA09`, `$DBE1` (8), `$DA1A`, `$DBF2` (16), `$DA3D`, `$DC0E` (32), `$D90B`, `$D93F` (right, by a count) | `$D93F` is logical for counts under 32: the OS's BMI to its sign-filling loop follows an LDY that clears N |
| multiply / divide | `$DCEF`, `$DC7B`, `$DCAB`, `$DCF4`, `$D6AF`, `$DC80`, `$DCB1`, `$D3EF`, `$DC83`, `$DCC8`, `$DCF7` | 8, 16 and 32 bits, signed and unsigned; quotient and remainder where the OS puts them |
| `switch` | `$DB5C` | walks a table of (value, target) pairs after the call; jumps to the match, or to the default in `$20` |
| negate, logical not | `$D7B4`, `$D7A6`, `$DDE4` | |
| float | `$DD32`, `$DD52` (int, byte → float, through long → float `$E31D`), `$E520` (divide), `$E52C` (multiply) | the OS's divide hangs when its rounding overflows; Fulu stops there instead |
| memory | `$E901` memmove, `$E904` memcmp | memmove moves whole pages, then the rest, forwards or backwards as the pointers compare |
| banks | `$E907` map banks, `$E90A` save a bank's page | |

The helpers that unwind their own pushes compute S as the OS does (`TXA`,
`CLC`, `ADC #n`, `TAX`, `TXS`), so A and X hold that arithmetic's result
afterwards.

---

## 9. Verification

### 9.1 The shadow run (`tests/fulu-shadow.test.ts`)

The firmware runs the game on a machine whose `step`, `read` and `write` are
instrumented. Fulu is attached to that same machine (`new Fulu(m)`), as a
second answerer.

1. **An entry starts** when the PC enters the OS: a vector, or a bank
   mapping an OS page. The test takes a snapshot (RAM, registers, banks,
   timers, and the flash for file functions) and notes which entry it is.
2. **The firmware answers.** The entry ends when execution is back in the
   program: for an interrupt, at its RTI's target with the same S.
   Meanwhile, every interrupt the firmware takes is recorded: its vector,
   ISR, TISR and KEYCODE, whether it came before the function proper was
   reached, and how many OS-internal far calls had been made by then.
3. **The judgement.** The test restores the snapshot and lets Fulu answer,
   giving it the recorded interrupts (setting ISR, TISR and KEYCODE, waking
   the CPU, running `service`) in one of five **orders**:
   - *one*: those before the function, then one per wait, the rest after;
   - *first*: all before;
   - *together*: all at the first wait;
   - *calls* and *calls early*: each at its place among the OS-internal
     calls, using `Fulu.onCall`.

   The device can take an interrupt at any instruction, so any order that
   matches is accepted. GuiMsgBox, for instance, draws for about 15 timer
   ticks before it waits.
4. **Normalising before comparing.** These parts of Fulu's result are set
   from the firmware's:
   - the dead 6502 stack below S;
   - the software stack below `($28)`, up to `$300` bytes (dead locals);
   - the function's `temporaries`, `fromRom` and `ownState`;
   - the RTC (`$0234-$0238`);
   - ISR, TISR and KEYCODE bits that the hardware raised meanwhile.

   Everything else is compared: A, X, Y, S, P, PC, all bank registers, and
   all of RAM. For file functions, the files visible in the two flashes are
   compared too.
5. Machine and flash then go back to the firmware's result, and play goes
   on.

The read/write instrumentation also enforces the `temporaries`
declarations: it reports any declared temporary that is read before being
written in the same entry, or that the program reads or writes.

Keys come from seeded scripts:
- a play script: a new game, walking, menus;
- a typing script: letters, digits, space, shift, delete, the input key;
- a save script: save to slot 1, save over it (覆盖原进度？), load.

The output is a table of entries per game, with calls, interruptions and
mismatches, and the first difference shown in full. That table was the
to-do list throughout.

**Results.** In milestone F1, about 910,000 entries into the OS over a
minute of each game, with 0 mismatches. In milestone F2, the six games,
60 s each, every entry: 0 mismatches. The save script also gives 0
mismatches, with the flash compared.

### 9.2 Random arguments

The 55 runtime routines are compared with the firmware on 400 random calls
each. The screen, string and heap functions get random rectangles,
strings and allocation sequences: 1,500 heap calls, for example, with
coordinates kept below row 200. Beyond that, the OS's loose checks let it
corrupt its own variables, so no stable comparison exists there.

### 9.3 Reachability (`scripts/bbk/gam-calls.mjs`)

A minute of play reaches only part of a game. This script traces each
game's code from its entry. It follows branches, `JSR` and `JMP`, far calls
into the program's own segments, and the C compiler's switch tables (calls
to `$DB5C` followed by their table). It collects every far-call site into
the OS and every resident routine the code can reach: about 136,000
instructions per game. For all six games it reaches every far-call site a
byte search finds, so the list is complete for direct calls, and Fulu has
all of them.

### 9.4 Without firmware

These tests run on every commit:
- `tests/fulu.test.ts`: hand-made programs (a helper, a far call into a
  second segment, a missing function's name, keys forgotten while busy);
- `tests/text-marks.test.ts`;
- `tests/memory-search.test.ts`.

`tests/kit-cheats.test.ts` plays the six games through Fulu, given the
games and fonts, and checks the debug menu against each game's own menus.

---

## 10. Timing (`src/fulu/timing.ts`)

### 10.1 Charging the OS's cost

Fulu answers in no emulated time, but the firmware's code takes time: a
full-screen SysPicture costs about 250,000 cycles. The games pace their
animation partly by their own work, so with nothing charged they ran
10-50% fast. On its own machine (`Fulu.timed`), Fulu therefore charges each
entry the firmware's **busy** cycles, not counting time spent halted, by
calling `Machine.stall(n)`. The stall adds n cycles after the current
instruction.

- **When:** a helper at its entry; an OS function as it is entered,
  computed from A and its arguments (memset changes its own arguments, so
  later would be wrong); a call made again after waiting, once, except
  GuiGetMsg, which is charged at every wake because the OS's loop runs
  again on each; an interrupt (keyboard 908, ST1 793, CT 300); the far call
  into a program segment (441) and its return (241).
- **Constants** for most entries, for example: SysPrintString 68,000,
  `$E94A` SysMemFree 35,423, `$E8EC` 26,642, SysMemAllocate 16,738,
  `$E9E9` FileNum 11,134, GuiGetMsg 3,551, the helper `$DCB1` 1,283.
  Unmeasured entries default to 60 (helper) or 1,000 (function).
- **Size models** for drawing. Let w = bytes covered per row, h = rows, and
  bw = ⌈width / 8⌉:

  ```
  SysPicture        62·w·h + 231·h + 62·bw·h + 674
  SysPictureDummy   340·w·h + 60·h + (x1 mod 8 ≠ 0 ? 76 : 0)·bw·h − 234·bw·h + 2071
  SysLcdPartClear,
  SysFillRect       66·w·h + 162·h + 3828
  SysLcdReverse     77·w·h + 295·h + 19
  Save/RestoreScreen 148·w·h + 37·h
  SysRect           1968·(|x2 − x1| + |y2 − y1|) + 11634
  SysLine           1087·max(|Δx|, |Δy|) + 130
  memset            262·n + 162        memmove   21·n + 90
  strlen            300·length + 200
  ```

The models were fitted to about 370,000 firmware entries in 伏魔记 1.0, 1.3
and 英雄坛说, with median error 0.1-3%.

**Keeping time.** `Machine.run(cycles)` advances an absolute target clock
(`due += cycles`) and runs until the machine's clock reaches it. A stall
longer than a frame overshoots, and the overshoot is paid back by the next
frames instead of being added to real time. Saved states restore `clock =
due`. With the same key script, Fulu draws within 1% as many pictures as
the firmware (2145 vs 2165, 883 vs 875, 1745 vs 1767).

### 10.2 The clock rates

The first rates came from other 4988 emulators: 4 MHz, with 400 cycles per
timer count. They were never measured, and games played at half the pace
players remember. The fix comes from the games' own timing:

- 伏魔记 opens timer 1 with `SysTimer1Open(50)` for its map's 500 ms tick,
  so its unit is 10 ms. Its Java port and the Baye port time it the same
  way.
- The OS reloads ST1 with `$A6`, which is 90 counts per overflow.
- So the timers count at 9,000 Hz (90 counts = 10 ms), and the CPU runs at
  8 MHz, twice the old rate.

Holding a direction for 3 s now walks 23 steps, where it walked 12 before.

---

## 11. Input

Three rules, two in the player and one in Fulu, make input feel right
without changing what a program sees.

1. **Repeat only when read.** The player repeats a held key every 90 ms
   (after 300 ms) only while `Machine.keysWaiting()` is false: the
   machine's queue is empty and the OS's ring is empty (`$2003` = `$2004`).
   Before this, repeats filled the 15-key ring while a walking step took
   longer than 90 ms, and the hero walked on for seconds after the key was
   released.
2. **Release drops the repeats.** On release, `Machine.dropKey(code)`
   removes that key's presses still in the machine's queue. If the OS's
   ring holds nothing but that key, it empties the ring (read index ←
   write index). A single tap is never dropped.
3. **Forget keys pressed while the program is busy** (`Fulu.listen`, called
   by SysGetKey and GuiGetMsg on entry). Fulu records the clock whenever
   the program asks for a key. If an ask comes more than **300 ms**
   (2,400,000 cycles) after the previous one, Fulu clears the machine's
   queue and the KEYCODE latch (`Machine.dropKeys`), and empties the OS's
   ring, before reading. Asks made again after waiting (`retrying`) don't
   check, because a waiting GuiGetMsg is a program waiting for input. So a
   key that ends a long wait is always kept. The first ask after start-up
   doesn't check either.

   The 300 ms threshold comes from measuring the gaps between asks in the
   six games. Walking and menus ask at least every 250 ms. Scenes, notices
   (真气不足!, 340 ms) and map loads go longer: 伏魔记 1.3's opening scene
   goes 2 s without asking. Before this rule, nine presses during that
   scene were handed over afterwards and skipped two dialogues.

All three apply on Fulu's own machine only. In the shadow run, and in
firmware mode, the device's behaviour is untouched.

---

## 12. HD text (`src/fulu/textMarks.ts`)

Fulu draws every character, so it knows where each one is. That is enough
to redraw a `.gam` game's text with real fonts at the screen's resolution,
which the original OS never had.

- **Record.** After each glyph SysPrintString or SysAscii draws, Fulu
  records x, y, its width (8 or 16), its 16 rows of bits (from the glyph
  buffer at `$208D`), and its character, decoded from GBK. A glyph with no
  dark pixels, a code the font lacks, or one of the device's 8-wide symbols
  gets no character. A new record drops every record whose cell it
  overlaps, so the list stays small.
- **Verify, every frame.** The player decodes the LCD. A record is reported
  only if its whole cell still shows its bits, either exactly or exactly
  inverted (a menu's selection, made by SysLcdReverse). The comparison is
  per pixel, so x need not be a multiple of 8, and it stops at column 159,
  the icons. A character drawn over even partly, scrolled or cleared keeps
  its pixels, so a stale record can never show.
- **Draw.** The report is a list of `TextMark { x, y, w, h, text, fg, bg }`.
  The site's `HiresText` renderer, shared with the JS engine, clears the
  cell, scales the picture with the chosen effect, and paints the text in
  the chosen font. Inverted cells swap fg and bg.

Checked on 伏魔记 1.3 and 英雄坛说 by tinting the reported cells on
screenshots of the intro, dialogues, menus, magic lists, the status screen
and notices: every whole character is found, and nothing else. Text the
games draw as pictures (the title, the big 穿 / 戴) stays pixels.

---

## 13. The player, saved devices and tools

- **`FuluDevice`** (`src/fulu/device.ts`) is what the device player needs:
  `install`, `launch`, `press`, `machine`, `stopped` (the reason a program
  stopped) and `resumed`.
- **Saved devices.** The emulated device is kept between visits, its RAM,
  registers and gzipped flash in IndexedDB, saved periodically and when the
  page is hidden. The original OS keeps `gam:<id>` and Fulu keeps
  `gam:<id>:fulu`, so a device saved on one OS never resumes on the other
  (each record also stores which OS made it). A Fulu device saved under the
  older key resumes once and moves.
- **System keys** (power, 目录, the dictionaries) would end the program on
  Fulu, which has no menu or dictionaries to go to. The player ignores them
  there.
- **The debug menu** (§14.3) uses `Fulu.recentCalls`, the last 40 API
  entries called, for its Device tab. It works on both OSes for everything
  else.

---

## 14. Results

### 14.1 Coverage

| | |
|---|---|
| Games that play and save without firmware | 伏魔记 1.0, 1.2, 1.3, 完美版 1.0, 怀旧终曲 v1.0; 英雄坛说 |
| API entries answered | 59 (29 with SDK names) |
| Resident routines answered | 55 |
| Interrupt handlers | keyboard, ST1, CT |
| Shadow-run mismatches | 0 (six games, every entry, play and save scripts) |
| Code | about 4,450 lines in `src/fulu` (runtime 865, files 427, GUI 424, core 404, OS table 376, screen 309) |

### 14.2 Speed

Twenty seconds of emulated play, in Node:

| Engine | Time |
|---|---|
| Fulu | 74 ms |
| Firmware | 1,207 ms |

Fulu is about 16 times faster, because the OS's work runs as TypeScript
instead of emulated 65C02 code. Its emulated pace is still the firmware's,
through the cost model.

### 14.3 What Fulu made possible

- HD text (§12).
- Dropping keys pressed while the game is busy (§11).
- A debug menu for the RPG kit's games (`src/bbk/kitCheats.ts`). It reads
  and writes party, items, money, story flags and switches in the running
  game's memory. The kit's builds place their variables differently:
  伏魔记 1.3 two bytes later, 1.0 and 1.2 one byte earlier from `$197B` on.
  So the layout is found from two inventory-pointer signatures (`$4A10`)
  and confirmed against the game's own library (the current map's name)
  before use. It is tested against each game's own menus.
- A choice of engine per game on the Games page.

---

## 15. OS quirks Fulu reproduces, and findings

Being indistinguishable means keeping the firmware's oddities. Among those
reproduced:

- The glyph address multiply loses its carry into the top byte (§7.3).
- The drawing functions check only the second corner before sorting the
  corners. SysPictureDummy's row step takes a stray carry when x2 ≥ 160.
  `$E874` writes 0 through `$2F/$30` off screen.
- The right shift `$D93F` is logical, not arithmetic, for counts under 32.
- strcpy copies backwards when the strings overlap and src < dst, compared
  signed. memset, strlen and strncpy leave advanced pointers in their own
  argument slots.
- SysMemAllocate rounds up and writes the rounded size back into its argument.
  SysMemFree returns 1 for a block that was already free.
- The keyboard handler copies `$2027` to `$2028`, and the ring keeps at most
  15 keys.

One firmware behaviour is deliberately not reproduced: the floating-point
divide hangs when its rounding overflows, and Fulu stops the program
instead.

Findings about the games:

- **伏魔记 1.3's "RunErr:12" is the game's own bug.** After 系统 → 结束游戏 →
  新的征程, the opening scene fails with NPC_RECBEUSE (an NPC slot already in
  use). The firmware does the same, because the engine clears its NPC slots
  (`$19D3`) only when the program starts.
- **The C reconstruction of the RPG kit's engine** (gitee fmj-engine)
  misnames part of an actor's stats block. The block is a copy of the
  character's library record from +`$20`: speed, spirit and luck are at
  +`$16-$18`, and current experience at +`$12`. The game's status page
  confirms it.
- **The kit's engine re-reads its map before each step.** Walking through
  walls cannot be done by writing to its view of the map; it needs the
  engine's own passability test answered.

---

## 16. Limitations and future work

- **Other programs.** Fulu answers what the six games need: 59 API entries
  (of the 107 the collection uses) and 55 resident routines. A program that
  calls something missing stops with its name, and still runs on the
  original OS. 三国霸业 needs `$E7FA` and `$E8BF`, `$E9E3`, and the
  routines `$D506`, `$D572`, `$D81D`, `$D825`, `$D8AE`, `$DD19`, `$DD6F` and
  `$E517` (floating point).
- **Not written:** input methods (`$E919`, `$E925`…), GuiGetMsg's other
  events, `$E92F` (GuiMsgBox's message `$0A` 3), and the mode changes in
  `$E93B`.
- **No sound**, in either OS mode.
- **Timing** is a model of the firmware's cost, within a few percent on the
  games measured, not cycle-exact.
- **Next:** the wider map view for `.gam` games (F5), drawing the rest of the
  map around the device's screen from the `.gam`'s library, shown only while
  the device's own tiles match it. More text (F6), answering the kit's
  dialogue commands (SAY, MESSAGE, TIMEMSG) in TypeScript, first exactly as
  the game's code, then with 12 / 10 px layouts. The same routine trapping
  would make walking through walls possible. Then 三国霸业 and the rest of the
  collection, one shadow-run table at a time.

---

## Appendix A. The OS's RAM, as Fulu keeps it

| Address | What |
|---|---|
| `$2000-$2002` | far-call scratch: bank 8's page high byte, the segment's base page |
| `$2003`, `$2004` | key ring: write and read index (mod 16) |
| `$2008-$2017` | key ring (16 codes; at most 15 kept) |
| `$2018`, `$2019`, `$201A` | timer 1: ticks counted, period, open |
| `$201B` | bit 2: key sound on |
| `$201E-$2021` | 32-bit event flags: bit 0 timer 1; bit 24 (`$2021` bit 0) a key arrived; bit 25 a type-7 message (GuiGetMsg polls instead of halting while set) |
| `$2027`, `$2028` | copied by the keyboard handler |
| `$2029`, `$202A` | the running program's base page |
| `$208D…` | glyph buffer |
| `$20CD`, `$20CE` | cursor on, blink phase |
| `$2100-$219F` | file system workspace; `$2122` four open-file records of 12 bytes; `$215C-$2167` saved bank pages; `$216A` nesting count; `$2186` sector groups |
| `$2B09`, `$2B0B`, `$2B0F` | message queue: read index, count, 8 records |
| `$2B27`, `$2B28` | keyboard state, accepted characters |
| `$2BAB`, `$2BAF`, `$2BB3` | heap start, size (32-bit each), broken-block flag |
| `$2C00-$3FFF` | the heap at start |
| `$03E4-$03FC` | boot page data: OS base page, font bank, LCD redirect |

## Appendix B. Interrupt sources, by priority

| Flag | Source | Vector |
|---|---|---|
| ISR bit 7 | keyboard | 2 |
| ISR bit 0 | clock alarm | `$13` |
| ISR bit 1 | CT timer | `$12` |
| TISR bit 5 | MT (sound) | `$11` |
| TISR bit 7, 6 | GTH, GTL | `$10`, `$0F` |
| TISR bits 0-3 | ST1-ST4 | 3-6 |
| (none) | BRK | 1 |

## Appendix C. The flash file system

| Flash offset | What |
|---|---|
| `$0000-$0FFF` | directory: 16-byte entries {first page (2), name (10, GBK), size (3), type}. Type `$FF` ends the list, `$00` marks a deleted entry |
| `$1000` | sector map, sectors `$000-$0FF` (a byte each) |
| `$4000` | page map (a byte per 256-byte page: `$02` used, `$00` freed) |
| `$8000` | sector map, sectors `$100-$1FF` |
| `$B000` | page map, second half |

Sector map values: `$04` system, `$01` a file (installed program), `$03` a
directory sector of user files, `$02` one of their data sectors (allocated
from the top of the flash down, without a gap), `$FF` free. File types:
`$3D` game, `$3F` e-book, `$3B` dictionary, `$39` study, `$3E` data, `$33`
program. A program file occupies whole 4 KB sectors, and its entry holds
its address >> 8.

## Appendix D. Where things are

| | |
|---|---|
| `src/bbk/cpu.ts`, `machine.ts`, `flash.ts`, `lcd.ts`, `keys.ts`, `flashfs.ts`, `gam.ts` | the hardware, the file system's format, the `.gam` format |
| `src/fulu/fulu.ts` | start-up, the trap, far call and return, waiting, interrupts, key forgetting, the call log |
| `src/fulu/alu.ts` | the flag-exact ALU and memory helpers handlers use |
| `src/fulu/os.ts` | the API table, interrupt handlers, SDK names |
| `src/fulu/runtime.ts` | the C runtime's resident routines |
| `src/fulu/screen.ts`, `text.ts`, `glyphs.ts` | drawing, text, the font ROM |
| `src/fulu/gui.ts`, `msgbox.ts`, `dialog.ts` | messages, keys, dialogs |
| `src/fulu/heap.ts`, `files.ts` | the heap, the file system |
| `src/fulu/itoa.ts`, `ltoa.ts`, `rand.ts` | number formatting, random numbers |
| `src/fulu/timing.ts` | the cost model |
| `src/fulu/textMarks.ts` | HD text's glyph record |
| `src/fulu/device.ts` | the device player's interface |
| `tests/fulu-shadow.test.ts` | the shadow run (`BBK_FIRMWARE`, `BBK_GAMES`, `BBK_SECONDS`) |
| `scripts/bbk/gam-calls.mjs`, `os-function.mjs`, `fold-c.mjs` | reachability, disassembling an OS function, folding compiled C |
| `docs/fulu-plan.md`, `docs/fulu-notes.md` | the plan with F1-F7, the working notes |
