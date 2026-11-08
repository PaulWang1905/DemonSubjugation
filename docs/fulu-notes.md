# Fulu: working notes

What has been learned about the Longman 4988's OS while writing Fulu, kept so
that the work can be extended from the seven games of the plan
(`docs/fulu-plan.md`) to the whole collection. Addresses are CPU addresses
unless marked as file offsets.

## How to extend Fulu to more games

1. Put the games in a folder and run the shadow run on it:
   `BBK_FIRMWARE=<firmware> BBK_GAMES=<folder> BBK_SECONDS=60 npx vitest run tests/fulu-shadow.test.ts --reporter verbose`.
   It prints, per game, every entry into the OS with its call count and
   `ok`, `n mismatches` or `missing`, then the missing ones by the number of
   games that need them. That is the to-do list.
2. For a missing OS function, read it in the firmware:
   `node scripts/bbk/os-function.mjs <0E00.DAT> <table entry>` disassembles it
   (following its code in its segment and the resident banks, naming the far
   calls it makes); `--size` gives only its size and callees.
3. Write it in `src/fulu` as behaviour (never copied bytes), with the OS's
   state where the OS keeps it (below), and run the shadow run until it shows
   0 mismatches.
4. Static views, for planning: `scripts/bbk/api-scan.mjs` (the OS functions
   each game far-calls), `scripts/bbk/resident-calls.mjs` (the resident
   routines each game calls), `scripts/bbk/api-names.mjs` (SDK names).

Measured over the 138 programs of bbk-games `eebbk/roms`: 107 OS functions
and 61 resident routines are used in all; 52 functions cover 100 programs,
70 cover 118.

## The OS ROM (0E00.DAT, physical $E00000)

- Segment n (16 KB) is at page $E80 + 4n (file offset ($80 + 4n) × $1000),
  mapped at $5000-$8FFF while it runs. Segment 2 (pages $E88-$E8A) is also
  the resident code in banks D-F ($D000-$FFFF).
- The API table is at $E700-$E9FF (bank E): 3-byte entries, the function's
  address and its segment (below $E0: an OS segment).
- The last page ($1FFF00 in the file) is the boot page the MCU copies to RAM
  $0300: the interrupt vectors ($0300 + 4n, each `JMP` to a stub) and the
  reset code at $0350. $03E4/$03E5 hold the OS's base page ($0E80).

## Entry points

- **Far call, `$D2F6`**: `$26/$27` point at a table entry (address, segment).
  The OS saves the current segment (`$E8F8`: number of the segment in bank 5,
  from $E0 for the program's), maps the new one into banks 5-8
  (`$E8FB`), and jumps to the target with A = X = Y = the caller's A,
  `$26/$27` = target - 1, N/Z from A, C/V from the high byte of that
  subtraction. The target's RTS lands at `$D313`: the old segment is mapped
  back, X = A, N/Z from A. The mapping leaves bank select ($0C) at 8, and
  scratch in `$2000-$2002` ($2000 = the high byte of bank 8's page, $2001/
  $2002 = the segment's base page: the program's from $2029/$202A, the
  OS's from $03E5/$03E4).
- **Interrupts**: vector n's stub pushes A and X, sets X = 3n and calls a
  dispatcher that saves Y and `$26/$27` and far-calls the entry at
  `$E74C + 3n`. Vector 2 (keyboard) → 7:$764D, 3 (timer ST1) → 7:$77AF,
  $12 (timer CT) → 5:$510E.
- **Resident routines**: the C runtime (see `src/fulu/runtime.ts` for each
  one's contract) and, at $E900, memmove ($E901), map banks ($E907) and save a
  bank's page ($E90A).

## The C compiler's conventions

Arguments in zero page, `$20/$21` and `$23/$24`, 16-bit results in `$20/$21`,
32-bit values by pointer with results in the scratch area at `($2A)`. OS
functions take their arguments on the software stack (`$28/$29`, growing
down; the caller removes them) and some in A; they return in A or `$20/$21`.

## Comparing with the firmware

The shadow run compares registers, banks and all of RAM after each entry,
except what is dead or driven by time:

- the 6502 stack below S, and the software stack below ($28) (the OS's
  compiled C keeps its locals there; up to $300 bytes below is treated as
  dead). A program reading uninitialised locals could see a difference
  there; none is known.
- the real-time clock ($0234-$0238), and bits that the hardware set during
  the firmware's answer in ISR, TISR and KEYCODE.

Interrupts the firmware took inside an entry are recorded (vector, ISR,
TISR, KEYCODE) and given to Fulu in the same order: while its function
waits, and after its answer. Compiled C functions change their own argument
slots (above $28), which is live memory: Fulu must leave them the same.

## The OS's RAM

What the OS keeps where, as far as known. Fulu keeps the same state at the
same addresses, so a program sees the same memory and saved states need
nothing extra.

| Address | What |
|---|---|
| $2000-$2002 | far-call scratch (above) |
| $2003, $2004 | key buffer: write and read index (mod 16) |
| $2008-$2017 | key buffer (16 key codes; the OS keeps at most 15) |
| $2018 | timer 1: ticks counted |
| $2019 | timer 1: period, in ST1 ticks |
| $201A | timer 1: 1 = open |
| $201B | flags: bit 2 = key sound on |
| $201E | flags: bit 0 = timer 1 fired |
| $2021 | flags: bit 0 = a key arrived |
| $2027, $2028 | (copied $2027 → $2028 by the keyboard interrupt) |
| $2029, $202A | the running program's base page |
| $20CD, $20CE | cursor: on, blink phase (the CT interrupt) |
| $2122-$2151 | (cleared by $E9C2: four 12-byte records), $216A |
| $2B28 | (set by $E938 from its argument) |

At a program's first instruction the OS's RAM also holds the launcher's
state in $16BD-$18CA, $2000-$21A0, $2818-$2907, $2B04-$2BB0, $2C00-$2D24 and
$302C-$30AB. Between the seven games only these differ: the data page in the
launcher's frame ($17C4, $17D1, $17DF) and $2088-$20AE.

## The boot page and the fonts

The boot page's data (RAM $03E3-$03FF, from the OS ROM's last page) holds,
as far as known: $03E4/$03E5 the OS's base page ($0E80), $03E7 the font
ROM's bank ($80: physical $800000), $03F8-$03FC the LCD redirect (1,
$0400, $1000). Fulu.start sets $03E4-$03FC as measured.

Glyphs are read from the font ROM through DATA4 ($03), with ADDR4 ($0211-
$0213) stepping each read. ASCII 8 × 16: offset $08B363 + 16 × code (other
styles at + $0810 n, through $20EF). Fulu reads them the same way, from
the real font ROM when checked against the firmware, and from one made
from the site's fonts otherwise (F3).

16 × 16 glyphs (32 bytes, two a row) for a double-byte code hi lo are at
32 × (row × n + column) + base, with the OS's 16 × 16 multiply ($7B73,
whose carry into the top byte is lost):

| hi | lo | row, column | n | base |
|---|---|---|---|---|
| $B0-$F7 | ≥ $A1 | hi - $B0, lo - $A1 | $5E | $000000 (GB2312 hanzi) |
| $A1-$A9 | ≥ $A1 | hi - $A1, lo - $A1 | $5E | $034E00 (GB2312 symbols) |
| $AA-$AF | ≥ $A1 | hi - $AA, lo - $A1 | $5E | $03DF40 |
| $F8-$FF | ≥ $A1 | hi - $F8, lo - $A1 | $5E | $0425C0 (also the 8-wide $FD-$FF) |
| $A1-$A7 | < $A1 | hi - $A1, lo - $40 | $61 | $047800 |
| $A8-$A9 | < $A1 | hi - $A8, lo - $40 (- $41 from $80) | $60 | $03BD80 |
| $AA-$D9 | < $A1 | hi - $AA, lo - $40 | $61 | $08D3A3 |

Anything else (hi < $A1, or hi ≥ $DA with lo < $A1) is drawn as A1A1.

## The screen

The LCD's memory is RAM $0400-$0FFF, 32 bytes a RAM row, wired out of order
(src/bbk/lcd.ts). The OS addresses display row y as RAM row 65 - y for
y ≤ 65 and y for y ≥ 66 (its pointer $3A/$3B), display byte 0 (pixels 0-7)
as byte 19 of the neighbouring RAM row (pointer $38/$39: rows ≤ 64 → RAM
row 64 - y, row 65 → RAM row 95, rows ≥ 66 → RAM row y - 1), and byte b ≥ 1
as byte b - 1. The boot page's $03F8-$03FC (1, $0400, $1000) redirect RAM
row 0's first byte to $1000. `lcd()` in src/fulu/screen.ts is this map.
Drawing functions take x1 in A and y1, x2, y2 on the software stack, and
keep temporaries in $38-$3B, $2080-$2089, $20B7-$20B9, $20CF-$20EE. Their
checks are loose: only the second x and y are checked before the corners
are sorted, so a first coordinate past the screen draws past it (into the
RAM after the LCD's rows; from row 224 on, into the OS's own variables,
where the firmware then corrupts its own loop state; the random tests stay
below row 200). SysPictureDummy's row step takes a stray carry when x2 ≥ 160.

## The OS functions

Each line: table entry, SDK name where known, where it is (segment:address),
its size in instructions (with the resident code it uses), what it does.

| Entry | Name | At | Size | What it does |
|---|---|---|---|---|
| $E7B2 | SysTimer1Open | 7:$7770 | 16 | A = period in ticks (0: nothing); if not open: open, count from 0, enable ST1 ($0226 bit 0) |
| $E7B5 | SysTimer1Close | 7:$7793 | 6 | close; disable ST1 |
| $E7B8 | | 7:$77A1 | 7 | A = timer 1's period if open, else 0 |
| $E7C1 | SysGetKey | 7:$76CC | 18 | A = the next key from the buffer, or $FF |
| $E7C4 | SysSetKeySound | 7:$7716 | 10 | A ≠ 0: key sound on |
| $E7C7 | | 7:$772E | 7 | A = 1 if key sound is on |
| $E7D9 | | 7:$759F | 3 | A = the RTC's seconds |
| $E9C2 | | D:$6911 | 12 | clear $216A and four records at $2122 |
| $E938 | | 8:$5D45 | 30 | $2B28 = the byte argument |
| $E700 | (memset) | 4:$5000 | 102 | memset(p, c, n); leaves p + n and 0 in its arguments, A = $29 |
| $E709 | | 4:$5456 | 734 | |
| $E712 | | 4:$5EA4 | 157 | |
| $E718 | | 4:$604F | 129 | |
| $E71B | | 4:$6132 | 479 | |
| $E71E | strlen | 4:$63DD | 79 | strlen(s) in $20/$21; leaves s + length + 1 in its argument |
| $E78E | SysPicture | 5:$67E2 | 1005 | (x1 in A, y1, x2, y2, bitmap, mode): a packed bitmap (rows of ⌈w/8⌉ bytes) onto the screen; mode 1 copies whole bytes. Corners in either order; nothing if x2 ≥ 160 or y2 ≥ 96 |
| $E794 | SysLine | 5:$8309 | 424 | (x0 in A, y0, x1, y1): a line, unclipped; endpoints swapped when x0 ≥ x1; four octants, a 16-bit midpoint error term |
| $E797 | SysRect | 5:$860B | 473 | (x1 in A, y1, x2, y2): an outline as four SysLines (bottom, left, top, right); nothing unless x1 ≤ x2 < 160, y1 ≤ y2 < 96 |
| $E79A | SysPrintString | 5:$582C | 1343 | (x in A, y, s): a string: ASCII 8 wide (as SysAscii), double-byte 16 wide ($FD-$FF + ≥ $A1: 8 wide, the left halves), wrapping to x = 0 and 16 rows down, stopping at the end or below row 80; $2F/$30 left where it stopped |
| $E7BB | SysAscii | 5:$638C | 461 | (x in A, y, c): an 8 × 16 ASCII glyph (font ROM $08B363 + 16c) at (x, y), x ≤ 152, y ≤ 80, replacing the pixels under it; at x = 152 its last column is dropped (the icons). Reads the glyph through DATA4 into $208D (far-calling $E749) |
| $E7FA | | 5:$852A | 221 | |
| $E85D | SysLcdPartClear | 5:$6FDE | 556 | (x1 in A, y1, x2, y2): clear a rectangle; counts $2F/$30 up once a row |
| $E860 | SysLcdReverse | 5:$7336 | 677 | (x1 in A, y1, x2, y2): invert a rectangle; counts $2F/$30 up once a row |
| $E877 | SysSaveScreen | 5:$77CD | 517 | (x1 in A, y1, x2, y2, buffer): the screen's bytes under a rectangle, row by row, to a buffer ($2F/$30 left after it) |
| $E889 | SysPictureDummy | 6:$5B18 | 323 | (x1 in A, y1, x2, y2, bitmap, buffer): as SysPicture (mode 0) into a 20-byte-stride buffer; far-calls the multiply $EAEC |
| $E8BF | | 5:$8603 | 474 | |
| $E8EC | | 6:$624D | 333 | |
| $E932 | (GUI start-up) | 8:$5000 | 164 | clears $2B09-$2B0B, memset($2B0F, 0, $18), $2B27 = 2, $2B28 = $0F; far-calls $E9A1($FFFF), $E91C, $E848(0), $E8D7(0), $E845(0); returns 1 |
| $E935 | GuiGetMsg | 8:$5093 | 2075 | (msg): the message pump (in progress, below) |
| $E93B | | 8:$5FF3 | 118 | |
| $E93E | GuiTranslateMsg | 8:$6111 | 1269 | |
| $E944 | | 8:$7D92 | 508 | |
| $E947 | SysMemAllocate | 8:$8515 | 1120 | |
| $E94A | SysMemFree | 8:$88DD | 1013 | |
| $E953 | GuiMsgBox | 9:$8A7C | 1324 | |
| $E959 | SysRand | 8:$6FAB | 483 | |
| $E95C | | 8:$7093 | 84 | (p, v, w): *(long *)p = v (16 bits, widened unsigned); *(int *)(p + 4) = w |
| $E965 | | 8:$6A79 | 102 | returns $2B28 << 8 \| $2B27 in $20/$21 |
| $E968 | GuiSetKbdState | 8:$6B12 | 98 | |
| $E9E9 | FileNum | D:$74C5 | 350 | |

Interrupt handlers: keyboard — acknowledge (ISR bit 7), copy $2027 to $2028,
and if KEYCODE ($024E) bit 7 is set, clear it and add the code to the key
buffer unless full, setting $2021 bit 0. ST1 — acknowledge (TISR bit 0),
count $2018 up to the period $2019, then set $201E bit 0 and count from 0.
CT — acknowledge (ISR bit 1) and blink the cursor if it is on.

## GuiGetMsg ($E935), as far as read

`GuiGetMsg(msg)` loops until it has a message; `msg` gets a type byte and a
16-bit parameter, and it returns 1 (or 0 for some events it handles itself).
It tests the OS's 32-bit event flags at $201E in this order, each with a mask
(constants in segment 8 at $8AC2-$8B32), clearing the bit it takes:

1. $02000000 → type 7, parameter 0.
2. $00000001 (timer 1, set by the ST1 interrupt) → type 6, parameter 0.
3. $00000002 → the next record of a queue of 8 three-byte records at
   $2B0F ($2B09 read index, $2B0B count; mod 8) → type and parameter.
4. Otherwise a key from SysGetKey ($E7C1); if there is one: type 1,
   parameter the key, and a translation step at 8:$5B02.
5. No key: $00040000 → far-calls $ECC5, returns 0; $00000004 → $EBC5,
   returns 0; $00000080 → $E97A; then $00000040, $00000010, $00010000 and
   $02000000 again (not read yet).

Its locals are 3 bytes on the software stack. Still to read: the rest of the
event list, the wait (presumably halting until an interrupt, which Fulu
answers with "wait"), and the callees $E7A0, $E7A3, $E86E, $E8CB, $E8CE,
$E8E9, $E8F5, $E96E, $E97A, $EBC5, $ECC5, $EDF7, $EE06, $EE09.
