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
waits, and after its answer. Since the device can take an interrupt at any
point and Fulu answers at once, several orders are tried, and any that
matches is the device's: one per wait; all before; all at the first wait;
and, for functions that call other OS functions and take long (GuiMsgBox
draws for about 15 timer ticks before it waits), each interrupt where it
came among those calls: the firmware's far calls to OS functions are counted
(Fulu.onCall counts Fulu's), and an interrupt is given just before or just
after the call it came in. Compiled C functions change their own argument
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
| $201E-$2021 | the OS's 32-bit event flags: bit 0 timer 1 fired (ST1 interrupt), bit 24 ($2021 bit 0) a key arrived (keyboard interrupt), bit 25 a type-7 message (GuiGetMsg polls instead of sleeping while it is set); others below |
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
| $E9A1 | | 9:$5000 | 11 | (w): $2BA8 = w |
| $E91C | | A:$5000 | 7 | clear $2200-$227F |
| $E845, $E848, $E8D7 | | 6:$672B, $6730, $6735 | 39 | A ≠ 0: a status icon on (bit 0 of byte 18 of RAM row 20, 31, 41; the rows from a table at 6:$6D15) |
| $E938 | | 8:$5D45 | 30 | $2B28 = the byte argument |
| $E700 | (memset) | 4:$5000 | 102 | memset(p, c, n); leaves p + n and 0 in its arguments, A = $29 |
| $E709 | | 4:$5456 | 734 | |
| $E712 | | 4:$5EA4 | 157 | |
| $E718 | | 4:$604F | 129 | |
| $E71B | (strcpy) | 4:$6132 | 479 | strcpy(dst, src), safe when they overlap (backwards when src < dst, signed); returns dst; nothing if either is 0; forwards it leaves src at its NUL in its argument |
| $E72D | (strncpy) | 4:$689D | | strncpy(dst, src, n): copies while a character and n > 0 (signed), then zeros while n ≠ 0; returns dst; counts src and n along in its arguments |
| $E71E | strlen | 4:$63DD | 79 | strlen(s) in $20/$21; leaves s + length + 1 in its argument |
| $E78E | SysPicture | 5:$67E2 | 1005 | (x1 in A, y1, x2, y2, bitmap, mode): a packed bitmap (rows of ⌈w/8⌉ bytes) onto the screen; mode 1 copies whole bytes. Corners in either order; nothing if x2 ≥ 160 or y2 ≥ 96 |
| $E794 | SysLine | 5:$8309 | 424 | (x0 in A, y0, x1, y1): a line, unclipped; endpoints swapped when x0 ≥ x1; four octants, a 16-bit midpoint error term |
| $E797 | SysRect | 5:$860B | 473 | (x1 in A, y1, x2, y2): an outline as four SysLines (bottom, left, top, right); nothing unless x1 ≤ x2 < 160, y1 ≤ y2 < 96 |
| $E79A | SysPrintString | 5:$582C | 1343 | (x in A, y, s): a string: ASCII 8 wide (as SysAscii), double-byte 16 wide ($FD-$FF + ≥ $A1: 8 wide, the left halves), wrapping to x = 0 and 16 rows down, stopping at the end or below row 80; $2F/$30 left where it stopped |
| $E7BB | SysAscii | 5:$638C | 461 | (x in A, y, c): an 8 × 16 ASCII glyph (font ROM $08B363 + 16c) at (x, y), x ≤ 152, y ≤ 80, replacing the pixels under it; at x = 152 its last column is dropped (the icons). Reads the glyph through DATA4 into $208D (far-calling $E749) |
| $E7FA | | 5:$852A | 221 | |
| $E85D | SysLcdPartClear | 5:$6FDE | 556 | (x1 in A, y1, x2, y2): clear a rectangle; counts $2F/$30 up once a row |
| $E860 | SysLcdReverse | 5:$7336 | 677 | (x1 in A, y1, x2, y2): invert a rectangle; counts $2F/$30 up once a row |
| $E874 | (screen buffer size) | 5:$7AC4 | | (x1 in A, y1, x2, y2, &n): n = (⌊x2/8⌋ − ⌊x1/8⌋ + 1) × (y2 − y1 + 1), by the multiply 5:$7BD2; off screen it writes 0 through $2F/$30 as they are |
| $E87A | SysRestoreScreen | 5:$6CEA | | (x1 in A, y1, x2, y2, buffer): SysSaveScreen's inverse |
| $E87D | SysFillRect | 5:$86A9 | | (x1 in A, y1, x2, y2): checks as SysRect (no swapping), then ORs each row's bytes; A = the last byte written, C = 1 |
| $E877 | SysSaveScreen | 5:$77CD | 517 | (x1 in A, y1, x2, y2, buffer): the screen's bytes under a rectangle, row by row, to a buffer ($2F/$30 left after it) |
| $E889 | SysPictureDummy | 6:$5B18 | 323 | (x1 in A, y1, x2, y2, bitmap, buffer): as SysPicture (mode 0) into a 20-byte-stride buffer; far-calls the multiply $EAEC |
| $E8BF | | 5:$8603 | 474 | |
| $E8EC | (icons off) | 6:$624D | 333 | every status icon off (all icon rows but 6, 7, 8, 13, 20, 31, 41, 68, 78, 89-91); icon n's row is 6:$6D15[n] |
| $E932 | (GUI start-up) | 8:$5000 | 164 | clears $2B09-$2B0B, memset($2B0F, 0, $18), $2B27 = 2, $2B28 = $0F; far-calls $E9A1($FFFF), $E91C, $E848(0), $E8D7(0), $E845(0); returns 1 |
| $E935 | GuiGetMsg | 8:$5093 | 2075 | (msg): the message pump (below) |
| $E93B | (input mode) | 8:$5FF3 | 118 | (mode): switch the keyboard state's low 4 bits (modes 2, 4, 8, 1) with a routine per change; Fulu has only no change |
| $E93E | GuiTranslateMsg | 8:$6111 | 1269 | (msg): a key message becomes (class, code) by the key-class table 8:$8C36 (the second half while the shift latch is set; in src/fulu/gui.ts). $2B27 is the keyboard state: low 4 bits the input mode (1, 2, 4, 8), bits 2, 3 input methods, 4 caps, 5 the shift latch; $2B28 what characters are accepted (bit 0 digits, 1 letters, 2, 3 input methods). Characters: a-z upper case with caps or the latch (which they release), the parameter's high byte = the latch, returns $6973's verdict (letters by $2B28 bit 1, digits bit 0, space and '.' either). Delete ($34) toggles the latch ($695A, and its icon $E845); shift ($29) is a switch on the mode ($67CC, table 8:$8BAC): modes 1, 2 with $2B28 bits 2, 3 clear make it the command $29, else an input method is switched; the latched input key ($36) toggles caps (icon $E848) in mode 2; other commands release the latch. Input methods ($E919, $E925, ...) are not in Fulu |
| $E944 | (heap set-up) | 8:$7D92 | 508 | (start, size, x): the heap (below); its memset is a JSR $5000 in segment 8, which is the GUI start-up $E932, run instead |
| $E947 | SysMemAllocate | 8:$8515 | 1120 | (n): first fit (below) |
| $E94A | SysMemFree | 8:$88DD | 1013 | (p): free and join (below) |
| $E953 | GuiMsgBox | 9:$8A7C | 1324 | (text, timeout): a box with the text until a key, or `timeout` ticks of timer 1 (below) |
| $E959 | SysRand | 8:$6FAB | 483 | (r): r is { long seed; int range }; seed = seed × 1103515245 + 12345, returns (seed / 65536) % (range + 1) in $20/$21. Its constants are in segment 8 ($8BCC-$8BD7) |
| $E95C | | 8:$7093 | 84 | (p, v, w): *(long *)p = v (16 bits, widened unsigned); *(int *)(p + 4) = w |
| $E965 | | 8:$6A79 | 102 | returns $2B28 << 8 \| $2B27 in $20/$21 |
| $E968 | GuiSetKbdState | 8:$6B12 | 98 | |
| $E9E9 | FileNum | D:$74C5 | 350 | (type in A, &n): the number of files of a type (below) |

Interrupt handlers: keyboard — acknowledge (ISR bit 7), copy $2027 to $2028,
and if KEYCODE ($024E) bit 7 is set, clear it and add the code to the key
buffer unless full, setting $2021 bit 0. ST1 — acknowledge (TISR bit 0),
count $2018 up to the period $2019, then set $201E bit 0 and count from 0.
CT — acknowledge (ISR bit 1) and blink the cursor if it is on.

## GuiGetMsg ($E935)

`GuiGetMsg(msg)` loops until it has a message: `msg` gets a type byte and a
16-bit parameter, and it returns 1. In order it takes:

1. event $02000000 → type 7, parameter 0;
2. event $00000001 (timer 1) → type 6, parameter 0;
3. a posted message: the queue of 8 three-byte records (type, parameter) at
   $2B0F, read index $2B09, count $2B0B (both mod 8);
4. a key from SysGetKey → type 1, parameter the key code. It then looks the
   key up (8:$5B02): the system keys 0-3 (开关, 目录, 双解, 现代) go to their
   own handlers; any other key only leaves $20/$21 and $26/$27 pointing at
   its entry in a table of key classes (8:$8C36 + 2 × (code & $3F)), $23/$24
   = code & $3F.
5. With no key, the events $00000002, $00000004, $00000080, $00000040,
   $00000010 / $00010000 go to other code (8:$ECC5, $EBC5, $E97A, 8:$7A9D,
   8:$57D1; not written yet), then $02000000 again as in 1.
6. Nothing: it far-calls $E7A0 (7:$7304), which halts the CPU until an
   interrupt unless event bit 25 is set, and loops. Fulu answers "wait"; asked
   again, it leaves $26/$27 as that far call does ($7303).

Each test leaves (scratch + 8) = events & flag; taking an event clears its
bit through the same scratch. The event masks are constants in segment 8 at
$8AC2-$8B32 (AND mask, value to compare, clearing mask).

## The heap (SysMemAllocate $E947, SysMemFree $E94A)

Bounds: the heap's start (32-bit) at $2BAB and its size (32-bit) at $2BAF
($2C00 and $1400 when a program starts: one free block up to $4000); $2BB3
is set to 1 when a block is found broken. Blocks have a 4-byte header before
their data: free ($62 'b') or used ($75 'u'); another follows ($6E 'n') or
the last ($65 'e'); the data size (16-bit). The next block is at
p + 4 + size.

- Walking (8:$80BF): no next block if p is outside the heap, is the last, or
  is broken (8:$7FAC: its follow byte is neither 'n' nor 'e', or the next
  block is outside the heap).
- SysMemAllocate(n): n rounded up to a multiple of 4 (written back into its
  argument); first fit: a free block with size - 4 ≥ n is split when more
  than 4 bytes would remain (the rest a free block taking over the follow
  byte), marked used, and its data address returned in $20/$21; 0 if none.
- SysMemFree(p): the block at p - 4, if inside the heap and found by
  walking, is marked free and every free block then absorbs the free blocks
  after it (8:$86D8). Returns 1 (also if it was already free), else 0.

Being compiled C checking 32-bit bounds with the runtime, both leave the
heap's end in the scratch area (+8) and the last address checked (+$10),
and pointers to them in $20/$23; src/fulu/heap.ts models that. Checked on
1,500 random calls.

## FileNum ($E9E9), as far as read

`FileNum(type in A, &count)`, D:$74C5: $2100 = type; then

- D:$604D: a nesting count $216A; on the first entry the pages of banks 9,
  10, 11, 12 and 4 are saved to $215C-$2167 (D:$64B2 maps them back on the
  last exit, and is called at the end);
- D:$60B0: on the first entry, maps the flash: banks 9-12 to pages
  $0202-$0205 and bank 4 to $0200 (through D:$610A, which maps X
  consecutive banks from A starting at the page in $2177/$2178);
- D:$721E: $2117/$2118 = $FFFF; for a type below $20 (D:$723A) counts the
  directory's entries of that type into $2119/$211A: directory sectors
  from $2182 (7 at a time, $2183 of them, from D:$6C1C), each mapped at
  $A000 by D:$6151, 16-byte entries with the type at +15 (src/bbk/flashfs.ts
  has the layout); types from $20 go to D:$718D.

It then writes the count through its pointer and returns 1. Still to read:
D:$6C1C, D:$54CB, D:$718D, and which of $2100-$2184 are only temporaries.

## GuiMsgBox ($E953)

A wrapper (9:$8A7C) calls the body (9:$8195) as body(text, timeout, 1), the
1 meaning "restore the screen afterwards"; 57 locals on the software stack.
src/fulu/msgbox.ts does it through the same calls to the other OS functions,
keeping its locals where the OS does, so that when GuiGetMsg waits it goes on
from them when asked again.

1. strlen(text); its low byte 0 → return $FF.
2. Lines of 16 bytes, at most 5: a byte > $80 counts a run of double-byte
   bytes; at column 16 the line breaks after this byte if the run is even,
   before it (column 1) if odd.
3. top = (90 − 16 × lines) / 2, bottom = top + 16 × lines + 4. The frame is
   x 11 to $92, its shadow to $94, y top to bottom + 2.
4. $E874 for the size, SysMemAllocate (0 → return $FE), SysSaveScreen;
   SysLcdPartClear; each line strncpy'd into a 17-byte buffer and drawn with
   SysPrintString at (15, top + 2 + 16i); SysRect; two SysFillRects (the
   shadow below and to the right).
5. With a timeout: the old period ($E7B8) kept, timer 1 closed if open and
   opened with period 1.
6. GuiGetMsg until: a key (type 1); message $0A with parameter 3 (then
   $E92F(msg), result $FD; Fulu stops there: not yet); type 6 counted up to
   the timeout.
7. Timer 1 closed and the old period reopened; SysRestoreScreen, SysMemFree.
   Returns 1 (A = X = Y).

## Still to do

A shadow run only checks what its key script reaches (60 s: the title, the
first dialogue, the menus). What a game can call is found instead by
`scripts/bbk/gam-calls.mjs`, which traces its code from the entry: branches,
JSR/JMP, far calls into its own segments and C switch tables ($DB5C) are
followed. For each of the six games it reaches every far-call site into the
OS that a byte search finds (and ~136,000 instructions), so the lists below
are complete for direct calls. (`scripts/bbk/os-calls.mjs` is the cruder byte
search.) What Fulu still lacks, in the 伏魔记 series and 英雄坛说:

| Entry | What | Size | Calls |
|---|---|---|---|
| $E9CE | FileOpen | 424 | 11 |
| $E9D1 | close a handle (clears its record at $2122 + 12h) | 12 | 8-12 |
| $E9D4 | read from a file (by its record) | 960 | 5 |
| $E9C8 | write to a file (programs the flash) | 2845 | 3 |
| $E9D7 | seek in a file (by its record) | 244 | 8 |
| $E9EF | a file's record: position / length | 112 | 6 |
| $E9EC | FileSearch | 372 | 4 |
| $E9DD | FileDel | 1380 | 5 |
| $E950 | a dialog in the save code (伏魔记 1.0 only; tests 'Y', 'N', 'y', 'n'; draws a 24 x 24 icon copied from the OS's ROM at 9:$8ADA, which Fulu will need its own of) | 1623 | 1 |

These are what saving and loading use: until they are done a save or a load
stops the game on Fulu.

Done since the first audit, each checked against the firmware on random
arguments: SysRand; strcat $E712, strcmp $E718; itoa $E709 and ltoa $E70F
(their constants read where the OS has them); SysPlayMelody $E8A1 and
SysStopMelody $E8A4 (Fulu plays no sound: what the melody takes from the
OS's tune data, the notes' pointers and Y, is declared `fromRom`, and the
comparison leaves it out; the emulated machine never raises the sound timer
MT's interrupt, on the firmware either); GuiSetKbdState $E968; memcmp $E904;
and the runtime's float routines (divide $E520, multiply $E52C, int and
byte to float $DD32 / $DD52 through long to float $E31D), negate long
$D7B4, negate int $D7A6, shift int right $D90B and shift long right $D93F
(logical for counts under 32 on the OS: its BMI to the sign-filling loop
follows an LDY that clears N). The OS's float division hangs when its
rounding overflows; Fulu stops there instead.

**Keys.** On the device the system keys (power, 目录, 双解, 现代) leave the
program, for the power-off, the OS's menu or a dictionary; on Fulu,
GuiGetMsg ends the program instead, and the player ignores those keys (a
stray press should not end a game). Character, shift and delete keys go
through GuiTranslateMsg as above, checked by a second shadow run that types
(letters, digits, space, shift, delete, the input key). Still not written:
input methods (the six games keep the mode 2 and $2B28 = 3, so none is
switched on), $E92F (GuiMsgBox's message $0A 3), input mode changes in
$E93B, GuiGetMsg's other events. 15 minutes idle on Fulu: fine (no other
interrupt came).

**三国霸业** needs, besides: $E7FA, $E8BF, $E9E3, and more runtime helpers
($D506, $D572, $D81D, $D825, $D8AE, $DD19, $DD6F, $E517), with many more calls
to $E709, $E70F, $E712.

To do one: disassemble it (scripts/bbk/os-function.mjs, then
scripts/bbk/fold-c.mjs for compiled C), write it, check it on random
arguments against the firmware (tests/fulu-shadow.test.ts), and give the
shadow run a key script that reaches it in a game (a save, a battle).
