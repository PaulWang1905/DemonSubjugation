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
| $E706 | (atol) | 4:$524D | 528 | atol(s): skips spaces and tabs only, an optional '-' or '+', then digits (signed chars '0'-'9') as result × 10 + digit in 32 bits, no overflow check; the long in the runtime's scratch at ($2A), $20 at it, A = X = Y = its top byte. Its constants 0 and 10 are in segment 4 at $73FA |
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
| $E7BE | | 5:$5C57 | 718 | (x in A, y, code): a 16 × 16 double-byte character (the code's low byte the trail byte, high the lead: $B0A1 is 啊) at (x, y), x ≤ 144, y ≤ 80; glyphs as in the table above (anything else A1A1), drawn replacing the pixels under it, the icons' column kept at x = 144. SysPrintString's double-byte characters are this code (it calls 5:$5C6D, past the arguments' reading); its only far call is $E749. Off the screen it returns with A = the x or y checked, Y = 2. Its one caller in the collection, 智多星 2:$6778 (猜答案's answer field), is not reached in play |
| $E7FA | (pixel) | 5:$852A | 221 | (x in A, y, colour): set the pixel (colour ≠ 0) or clear it, unclipped, by the OS's address arithmetic (5:$8714: the row from a multiply, then x / 8 by repeated subtraction, flags and all), with the boot page's one-byte redirect at $03F8 |
| $E85D | SysLcdPartClear | 5:$6FDE | 556 | (x1 in A, y1, x2, y2): clear a rectangle; counts $2F/$30 up once a row |
| $E860 | SysLcdReverse | 5:$7336 | 677 | (x1 in A, y1, x2, y2): invert a rectangle; counts $2F/$30 up once a row |
| $E874 | (screen buffer size) | 5:$7AC4 | | (x1 in A, y1, x2, y2, &n): n = (⌊x2/8⌋ − ⌊x1/8⌋ + 1) × (y2 − y1 + 1), by the multiply 5:$7BD2; off screen it writes 0 through $2F/$30 as they are |
| $E87A | SysRestoreScreen | 5:$6CEA | | (x1 in A, y1, x2, y2, buffer): SysSaveScreen's inverse |
| $E87D | SysFillRect | 5:$86A9 | | (x1 in A, y1, x2, y2): checks as SysRect (no swapping), then ORs each row's bytes; A = the last byte written, C = 1 |
| $E877 | SysSaveScreen | 5:$77CD | 517 | (x1 in A, y1, x2, y2, buffer): the screen's bytes under a rectangle, row by row, to a buffer ($2F/$30 left after it) |
| $E889 | SysPictureDummy | 6:$5B18 | 323 | (x1 in A, y1, x2, y2, bitmap, buffer): as SysPicture (mode 0) into a 20-byte-stride buffer; far-calls the multiply $EAEC |
| $E8BF | (clear an outline) | 5:$8603 | 474 | (x1 in A, y1, x2, y2): SysRect's code with the colour at $2080 = 0: the outline cleared |
| $E8EC | (icons off) | 6:$624D | 333 | every status icon off (all icon rows but 6, 7, 8, 13, 20, 31, 41, 68, 78, 89-91); icon n's row is 6:$6D15[n] |
| $E8E0 | (status bar blanked) | 6:$6A40 | 138 | the four digits' 28 segments off (the rows of $E818-$E821), then icons 6, 7, 8 ($E824-$E82A) and 24 ($E8B3, row 61) off through 6:$6753; X = Y = 0, C = Z = 1 as that leaves them. 华容道 and 滑雪 call it on Exit |
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
search.) **For the 伏魔记 series and 英雄坛说, nothing is missing**: every OS
function and runtime routine their code can reach is in Fulu. The last was
$E950, a Yes / No dialog (伏魔记 1.0's "overwrite the save?"): done through
the same calls as the OS's (src/fulu/dialog.ts), drawing its own pictures
where the OS draws ones from its ROM (9:$8ADA, a 24 x 24 icon, and the
buttons at 9:$8CB2): the site's icon (public/favicon.svg at 1.5 x) and 是 /
否 in the font ROM's glyphs. Where those pictures go is declared `fromRom`
(computed per call: the screen under them and the heap blocks they pass
through) and left out of the comparison; the rest matches the firmware.

**The rest of the collection** (docs/fulu-plan.md, F8): played on Fulu,
114 of the 138 programs run 180 s of random keys without stopping. Done for
them, each compared with the firmware on random arguments and in the
shadow run of the programs that call it:

- the clock: $E7DC (minutes, `$0235 & $3F`), $E7DF (hours, `$0236 & $1F`),
  $E7F4(p) (`$0234-$0236` to p[0..2]), $E7E2(p) (`$0237`, and `$0238`'s
  bit 0, to p[0..1]); each through `$2F/$30` where it takes p;
- $E7D0: forget the keys in the OS's buffer (`$2003` = `$2004`);
- $E7F7: clear `$0400-$0FF3` (counting `$20E5/$20E6` down from `$0BF4`),
  then the byte the boot page points at (`($03FB)`);
- $E818, $E81B, $E81E, $E821: the status bar's four seven-segment digits
  (6:$6CDE the patterns of 0-F and blank, 6:$6CC2/$6CC9/$6CD0/$6CD7 each
  digit's seven icon rows; a segment is bit 0 of byte 18 of its row, found
  by the multiply 6:$6C85);
- the runtime's $D31A (float compare $E039 as flags: Z equal, N less, N
  and V greater, through PHP / AND #$1C / PLP), $D435 (signed long divide:
  $D0A8 on the magnitudes, negated if the signs differ), $D5DC (signed int
  remainder, with the dividend's sign);
- $E93B's change of input mode between 2 and 1 (8:$5E6F, 8:$5F8B: the mode,
  $E8D7's icon, and to 1 caps off);
- a far call through an entry in the program's own memory (below $D000)
  naming an OS segment: called as any (阶梯小子 calls its own code at $9F7C,
  in its data banks, through such an entry naming segment 0);
- files over 4 KB: they had one sector and ran into the next file's pages;
  now they take whole sectors just below the user area, in order.

Round 2 (see the report's §16.1 for the list) took the programs that play
180 s to 128; 5 end on their own. Details worth keeping:

- $E8C5 (x in A, y, sx, sy, w, h, bitmap {width, height, rows}): checks, in
  order and as 8-bit sums, sx + w - 1 < width, sy + h - 1 < height, x + w -
  1 < 160, y + h - 1 < 96 (A the sum that failed); $2F/$30 ends at the
  source row after the window; its rows through $EAE6 (5:$8714) and $EAE9
  (5:$65FB, the next row's address by $2082: up $20 above row $40, the
  special rows $40 and $41, down below). Y, C and V come from those and are
  left out of the comparison (ownState).
- the circles (5:$7C1C, the disc 5:$8102) plot through 5:$853B, the disc's
  rows through 7:$7E5A (OR).
- the text cursor: $20BA/$20BB its size, $20BC/$20BD its place, $20BE its
  phase (1 shown), $20BF on; $022E bit 4 runs CT. CT's handler (5:$510E)
  blinks the icons when $20CD = 1, then the cursor when $20BF = 1 (5:$52D7,
  inverting its rectangle as SysLcdReverse does; its scratch $20C0-$20CB).
- the status icons: one routine (6:$6753) for $E800-$E84E, their rows at
  6:$6D15 by index (entry 6:$66D6 + 5 × index); the bar graph's 38 rows at
  6:$6CEE, $E8E3's thresholds at 6:$69A4.
- $E8E0 blanks the status bar's number and four icons (6-8 and 24) the
  same way: compared on random icon state, and in 华容道's and 滑雪's
  shadow runs (Exit); on Fulu alone both now end cleanly on Exit at the
  title and in play. Index 24's routine is $E8B3 (6:$674E), which Fulu
  does not have yet; 6:$6D15 has 25 entries (21-23: rows 6, 68, 0).
- GuiGetMsg's queue: records {type, word} at $2B0F, read index $2B09, write
  index $2B0A, count $2B0B (at most 8); taking one leaves $26/$27 = 3 ×
  index (the record's offset, from the runtime's multiply).
- $E86B off the screen pulls A twice and returns into the stack (a crash on
  the device); $E871's phase other than 0 or 1 would too.

Open: in 宠物精灵's shadow run the firmware reads $2088 and $20C8 (declared
temporaries) before writing them, inside one of the program's own far calls,
with no difference in the result; not looked into yet.

Round 3, first part (the report's §16.1). Details worth keeping:

- the os-function listings name a segment in hex: "13:50b6" is segment
  $13 (19), at page base + 4 × 19.
- $E9AD (x in A, y, a long, radix, signed): locals 32; its digits, lowest
  first, in locals 0-19 (more than 20, in radix 2 or 3, write over its own
  counters); the digit characters at 8:$8BD8 ("0123456789ABCDEF", then its
  long constants 0, 0, 0, 1, 1). It leaves SysAscii's temporaries.
- the calendar: the year at $2B04/$2B05, the day of the year in the clock's
  day counter ($0237/$0238, 9 bits; $E7EE also writes $0232/$0233); tables
  at $13:$8E49 (1 January's weekday, 1901-2100, Sunday 7, then a 0), $13:$8F12
  (days in each month), $14:$8DE7 and $14:$8E01 (days before each month, in
  a year of 365 and 366 days). $EC67 past month 12 returns 13 - 12 = 1.
- $E791 (p): per row, byte 0 to ($38), bytes 1-18 to ($3A)… through the
  $03F8 redirect, byte 19 into ($3A)+18 keeping bit 0; rows by $8714 and
  $65FB (now in screen.ts as nextRow).
- $EA25 (msg): GuiGetMsg's queue path as a function of its own.
- $E94D's key cases are reached through the runtime's switch ($DB5C) on a
  table at 9:$8AB6 (keys $24, $25, $22, $23, $20, $21, $27, $28, $26; then
  their code's addresses). `os-function.mjs <0E00.DAT> 9:55a5,58bd,...`
  disassembles from given addresses, for such cases.

- $E980 / $F262 (25:$73FA): frames: $F262's 33 locals (the icons' bits
  0-11, the cursor's state 12-16, the keyboard state 18, then 20 = 1, 21 =
  0, 22 the lines); its loop 25:$761E (17 locals: 19 the top line, 20 the
  lines, 2 what the page returned, 6 the next page, 8 the top line's
  start, 13-15 the message); the page 25:$7C3A (38 locals, the line in
  2-22: a line over 21 characters runs into its own counters, on the
  device too). The switch's table at 25:$82C7 (keys $23 $22 $21 $20 $28
  $27), the 32-bit 100 at 25:$82DF. Its result is A as its epilogue leaves
  it ($29), not the key.
- $E8CB / $E8CE: ADDR1 = $000401, ADDR2 = $007400 (and back), 12 × 256
  bytes by LDA $00 / STA $01; INCR is the OS's.

- $E94D (9:$5024): (selection in A, menu, layout); its frame: the icons'
  bits 0-11, the help word 12, the keyboard state 14, a digit's item 16,
  the message 17-19, the selection (from the first item shown) 20, "mark
  moved" 21, the old selection 22; the layout 8:$6641 (4 locals), a page
  9:$69E4 (15), the mark 9:$6F1D (14). Its switch's table at 9:$8AB6 (keys
  $24 $25 $22 $23 $20 $21 $27 $28 $26). The help word is $2BA8 (9:$5016).
  中国象棋's call: A 0, the menu at $9FF3 (2 items).
- $E96B (1:$6C66): $FFFF nothing; above $8000 $E980(w); else 1:$69BB, the
  OS's own help texts through a table of far calls ($7E2F): not in Fulu.
- Asked again after waiting, an OS function that waits in a loop of its own
  finds its frame from its caller's software stack pointer, which it puts
  back when it waits: $E94D's is the caller's less 26, $F262's loop's less
  54 (33 + 4 pushed + 17). It keeps nothing outside the machine, so it goes
  on right in a machine restored from a saved state; while $E94D waits in
  its help screen, its L[16] holds $FF. The help command is type 5, $26.

- Chinese input (input modes 4 and 8): the mode changes are 8:$5E2C-$5FF2
  (mode, then $E913 / $E91F to open the bar, $E916 / $E922 to close it,
  $E8D7 for mode 8's icon, and 8:$5D60 posting $0A 1 into Chinese input, 2
  out); in it GuiTranslateMsg answers a letter with type 2, the capital,
  A 0 (the bar takes it), and the chosen character comes as type 3, its
  GB2312 code (high byte first). 电子宠物 returns to the OS (its main ends)
  on the firmware too.
- $E929 (8:$6BC2): the queue's indexes and count 0, memset of its 24
  bytes. $D7F1: the 32-bit complement of ($20) at scratch + 8.

What the others stop at is in the plan. Not Fulu's: 一中传奇 and 热血传奇
show 烫烫烫 (uninitialised memory) in places, on the firmware too.

**三国霸业 is done too.** Its code reaches nothing Fulu lacks (gam-calls.mjs
with the list of what Fulu has: no `<- Fulu lacks`). Its last were $E7FA
(a pixel), $E8BF (an outline cleared), $E9E3 (rename an open file) and the
runtime's $D506, $D572, $D81D, $D825, $D8AE, $DD19, $DD6F, $E517 / $E530
(below).

## The file functions

Saving and loading. Done from what the functions do (src/fulu/files.ts),
not from the OS's code, which programs the flash cell by cell with its own
wear-levelling; but on the OS's own format, so that the two see each other's
files, and checked against the firmware:

- calls: FileSearch(type in A, n, &id, &name); FileOpen(id, type, mode,
  &handle, &size) (a user file by its id alone); create $E9C8(type in A, size
  (3 bytes), name, &id, &handle) (opened to write); read $E9D7 and write $E9D4
  (handle in A, n (a byte), buffer), at the position, unchecked against the
  size; seek $E9EF(handle in A, offset (long), whence: 1 from the start, 2
  from the position, 3 from the end with a negative offset: size + offset -
  1); close $E9D1(handle in A); FileDel $E9DD(handle in A, open to write).
  They return 1 or 0 in A.
- the format: sector maps ($1000, $8000; a byte a sector: $03 a directory
  sector of user files, $02 one of their data sectors, from the top of the
  flash down without a gap, $FF free), page maps ($4000, $B000; a byte a
  256-byte page: $02 used, $00 freed), directory entries {first page (2),
  name (10), size (3), type} ($00 deleted, $FF free), and the open files' 4
  records at $2122 of 12 bytes {mode, first page, position (3), size (3), the
  entry's place (its index in its sector, the sector)}.
- what Fulu does its own way: the OS's workspace while it works ($2100-$219F,
  $80-$8F, $20-$27, X, Y, C, V: declared `ownState`, left out of the
  comparison), and where deleted files' space goes (the OS collects it when it
  needs room; Fulu reuses a data sector no live file uses, from the top, as
  the OS was seen to). The comparison checks the files a program can see in
  the flash (the live entries in order, and each file's contents) instead of
  the raw bytes.
- checked: a third shadow run saves to slot 1, saves over it (覆盖原进度？) and
  loads, in the six games (the 伏魔记 versions reach saving).

Done since the first audit, each checked against the firmware on random
arguments: SysRand; strcat $E712, strcmp $E718; itoa $E709, ltoa $E70F
and atol $E706 (their constants read where the OS has them); SysPlayMelody $E8A1 and
SysStopMelody $E8A4 (Fulu plays no sound: what the melody takes from the
OS's tune data, the notes' pointers and Y, is declared `fromRom`, and the
comparison leaves it out; $EA52 / $EA64 act as with the sound off even when
it is on, by the owner's decision, and the shadow run leaves out calls made
with it on; the emulated machine never raises the sound timer
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

**三国霸业**, done last, each checked against the firmware on random
arguments (the screen functions' and the runtime's tests) and in its shadow
runs (240 s of play by three key scripts, and a save, a second save and a
load: every entry, 0 mismatches):

- $E7FA (a pixel) and $E8BF (an outline cleared), in the table above.
- $E9E3 (handle in A, name): renames an open file (its directory entry's 10
  bytes). Saving does not use it; only code reached through a pointer calls
  it, so it is written from the OS's code and not checked in a game.
- float add $E517 (C clear) and subtract $E530 (C set), the OS's $DE29: the
  smaller operand shifted to the larger's exponent keeping the last bit
  shifted out, a same-sign sum rounded with that bit (a carry shifts right
  and raises the exponent), a different-sign difference normalised, equal
  magnitudes giving 0.
- float to long $E282 (shifts of the exponent − $7F + 1, 256 for 0; the
  sign by negation), and through it $D81D (to char, in A), $D825 (to int,
  $20/$21) and $D835; the frame-tail variants $D506, $DD19, $DD6F (the
  conversion, then the result stored at 10 or 20 in the frame).
- $D8AE: $23/$24 = the word at ($23); $D572: a call through $26/$27 (to the
  word there, + 1, as RTS would).
- $DAFC (copy) now copies byte by byte, so overlapping copies come out as
  the OS's (found by 三国霸业's random arguments).

Its keys: 三国霸业 is busy for about half a second at a time while its
menus animate (the title, the scenarios), without asking for a key, and on
the device a key pressed then is acted on. Fulu's forgetting of keys
(below, "Pace") is for the RPG kit's games only: those whose data area
starts with their library ("LIB"). Its title also reads keys in two places
(GuiGetMsg and SysGetKey after each timer message): a press taken by the
second is not acted on, on the firmware as on Fulu.

To do one: disassemble it (scripts/bbk/os-function.mjs, then
scripts/bbk/fold-c.mjs for compiled C), write it, check it on random
arguments against the firmware (tests/fulu-shadow.test.ts), and give the
shadow run a key script that reaches it in a game (a save, a battle).

## Pace

Fulu answers the OS at once, but on the device the OS's code takes time
(a full-screen SysPicture some 250,000 cycles), and these games pace
themselves partly by their work: with no time charged they ran 10-50% fast.
So on its own machine Fulu charges each entry the cycles the firmware spends
on it (src/fulu/timing.ts: helpers, interrupts and the far call's trampoline
as constants; drawing, clearing, copying and strlen by size, fitted to some
370,000 firmware entries in 伏魔记 1.0, 1.3 and 英雄坛说, the models within 3%
of the firmware's total; GuiGetMsg each time it wakes, as the OS goes round
its loop again), through Machine.stall. Machine.run keeps to an absolute
clock, so a stall longer than a frame is paid back by the next frames rather
than added to the time. Measured over the same script: the number of
pictures drawn within 1% of the firmware's (2145 / 2165, 883 / 875, 1745 /
1767). Not when Fulu answers for the firmware's OS (the shadow run).

Keys pressed while a program has not asked for one for over 0.3 s (a
scene, a notice) are forgotten when it next asks, as the player's own
presses would otherwise skip what comes next; only for the RPG kit's games
(their library at the start of their data area), since 三国霸业's menus are
busy for half a second at a time and act on what was pressed meanwhile.

The device player also repeats a held key only once the program has read the
last one (Machine.keysWaiting: none queued, and the OS's key buffer at
$2003 / $2004 empty); repeats every 90 ms piled up in the 15-key buffer while
a walk step took longer, and the walk went on for seconds after the key was
let go.
When the key is let go, the repeats it queued are dropped (Machine.dropKey:
from the machine's queue, and the OS's buffer when it holds only that key),
so a step does not go on after the release.

The clocks: the CPU runs at 8 MHz and the timer counts at 9 kHz (90 counts,
the OS's reload of $A6, make the games' 10 ms unit: SysTimer1Open(50) is the
map's half-second tick). The reference emulators' 4 MHz with 400 cycles a
count were never measured, and played at half the device's pace: walking and
animation felt slow and sticky, and were right at 2x. Now 3 s holding a
direction walks 23 steps (12 before), and none are left when it is let go.

Keys pressed while the program is busy are forgotten (Fulu.listen). While a
scene plays, a notice shows or a map loads, the games do not ask for keys
(伏魔记 1.3's opening scene: 2 s without asking); the OS keeps what is
pressed meanwhile and hands it over afterwards, and the presses then skip the
dialogues that follow and walk the hero on. So when the program asks
(SysGetKey, GuiGetMsg) after not asking for over 300 ms, the keys pressed
meanwhile are dropped. Measured in the six games: walking and menus ask at
least every 250 ms; scenes, notices (真气不足!, 340 ms) and loading take
longer. Waiting in GuiGetMsg is asking, so the key that ends a wait, however
long, is kept; a held key's next repeat comes within 90 ms. Only on Fulu's own
machine (not in the shadow run); the firmware keeps the device's behaviour.

## Not Fulu: 伏魔记 1.3's RunErr:12

In 伏魔记 1.3, 系统 → 结束游戏 and then 新的征程 shows "RunErr:12" in the
opening scene, and the program ends at the next key. The firmware does the
same (checked with the same keys). Error 12 is the engine's NPC_RECBEUSE (an
NPC created in a slot in use): the engine clears its NPC slots ($19D3) only
when the program starts (the C reconstruction's _00200247), not when a game
is ended from the menu, so the new game's opening scene finds them taken. A
bug of the game, kept as it is.

