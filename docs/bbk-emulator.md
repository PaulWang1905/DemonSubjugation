# Longman 4988 emulator: notes and progress

Working notes for `src/bbk/`, the emulator of the BBK Longman 4988 (步步高朗文
4988) that runs `.gam` programs on the device's own firmware. The README has
the user-facing summary; this file keeps what was learned, how it was checked,
and what is next.

## Goal

Run every program the real device runs, in the browser, including programs
not seen yet. Two ways to get there:

1. **Firmware mode (done).** Emulate the hardware faithfully and let the real
   OS (from a dump the user supplies) do everything. Complete by construction.
2. **JS OS mode (next, "like WSL").** Replace the OS with JavaScript that
   answers the programs' OS calls, so no firmware is needed, with text drawn
   by the site (HD text, translations). Firmware mode is the reference every
   JS function is checked against.

The fmj engine in `src/engine` stays: it plays `.lib` archives, powers the
editor, and is offered as **Remastered** for `.gam` programs built on it.

## Status

| Phase | What | State |
|---|---|---|
| 1 | 65C02 core (`cpu.ts`) | done: SingleStepTests wdc65c02 (first ~450 cases of every opcode, cycles included) and both Dormann functional tests pass; ~45× real time in Node |
| 2 | 4988 hardware + firmware mode (`machine.ts`, `flash.ts`, `lcd.ts`, `keys.ts`) | done: the full dictionary boots and works (menus, Longman dictionaries in the channel ROMs, tools) |
| 2b | Programs (`flashfs.ts`, `gam.ts`, `device.ts`) | done: 138 of 138 programs of the bbk-games collection install and start from the OS's game menu |
| 3 | Site (`DevicePlayer.tsx`, `deviceStore.ts`, `playerShell.tsx`, import, library) | done: on branch `bbk-emulator`, preview deployed |
| 4 | Referee tools: API catalogue, call recorder, per-call diff | next |
| 5 | JS OS core: boot without firmware, far call, C runtime, interrupts | planned |
| 6 | JS OS wave 1: the ~52 functions every program uses (covers 100 of 138) | planned |
| 7 | JS OS wave 2: the whole API table | planned |
| 8 | Sound, HD text for all programs, input method, debugger | planned |

## The hardware (as implemented in `machine.ts`)

Sources: the BA4988 simulator (GPL-2, `gitee.com/BA4988/BBK-simulator`),
gam4980 (GPL-3, `codeberg.org/iyzsong/gam4980`, reference only), and reading
the firmware. Where the two emulators differ, the choice is noted.

**Memory.** 16 MB physical, 4 KB pages; the CPU sees 16 banks of 4 KB.
Bank 0 is fixed to physical page 0. Bank n (1-15) maps the page written via
`BK_SEL` ($0C, bank number), `BK_ADRL` ($0D, page low byte), `BK_ADRH` ($0E,
page high nibble); reading them back works.

| Physical | What |
|---|---|
| 000000-007FFF | RAM 32 KB (page 0 holds the I/O registers) |
| 200000-3FFFFF | NOR flash 2 MB (file system) |
| 400000-5FFFFF, 600000-7FFFFF | dictionary ROMs, channel = `PB` ($21B) bits 7-6 |
| 800000 | font ROM (`4988.font`; gam4980's `8.BIN` differs, from the 4980) |
| A00000, C00000 | data ROMs |
| E00000 | OS ROM (`0E00.DAT` = `E.BIN`, the same build in every dump) |

Page $03 ($0300-$03FF) is RAM loaded at reset from the OS ROM's last 256
bytes (BA4988; gam4980 maps it read-only). It holds the interrupt vector table
(`$0300 + 4 × n`, each a `JMP`) and the boot code at $0350, plus OS constants
($03E4/$03E5 = OS base page $E80).

**Registers** (physical page 0):

| Addr | Name | Behaviour |
|---|---|---|
| $00-$03 | DATA1-4 | read/write physical memory at ADDRn ($208 + 3n, 24-bit); step it when `INCR` ($207) bit n is set |
| $04 | ISR | bit 7 keyboard, bit 0 alarm, bit 1 CT; writing ANDs (0 clears) |
| $05 | TISR | bits 0-3 ST1-4, 5 MT, 6 GTL, 7 GTH; writing ANDs |
| $0C-$0E | BK_SEL / BK_ADRL / BK_ADRH | bank mapping |
| $200 | SYSCON | bit 3: halt until an interrupt source fires |
| $21B | PB | port B: bits 7-6 dictionary channel; bits 0-1 out, bit 4 in to some peripheral (see open questions) |
| $226 | STCON | ST1-4 enable |
| $227-$22A | ST1LD-ST4LD | reload values |
| $22B | MTCT | the OS writes $FE when its start-up is done |
| $22E | STCTCON | bit 4 CT enable, bit 5 alarm enable, bit 6 RTC enable |
| $22F | CTLD | CT reload |
| $230-$233 | alarm minute, hour, day (2) | |
| $234-$238 | RTC second, minute, hour, day low, day high bit | |
| $23A / $23B | IER / TIER | interrupt enables |
| $24E | KEYCODE | key code with bit 7 set when a key is pressed |

Reset values come from BA4988's register init (`RESET_REGISTERS`).

**Interrupts.** Level-triggered: while `(ISR & IER) | (TISR & TIER)` is non-zero
and I is clear, push PC and P and jump to `$0300 + 4 × source`. Priority:
keyboard (2), alarm ($13), CT ($12), MT ($11), GTH ($10), GTL ($0F), ST1-4
(3-6). The OS's handlers far-call OS functions through the table at $E74C
(`$E74C + 3 × X`), so the firmware does the key, timer and clock work. Both
reference emulators skip parts of this (gam4980 writes keys into the OS key
buffer and fakes the timer tick); here nothing is faked.

**BRK** goes to vector 1 ($0304): the OS handler there prints a message and
halts, i.e. a fatal error. (Inferred from the handler; gam4980 treats BRK as
"program exit", BA4988 as an unknown instruction.)

**Timers.** One count every 400 CPU cycles at 4 MHz (both emulators agree).
ST1-4 count up and reload from STnLD on overflow; CT is 12-bit and reloads
from CTLD. The RTC ticks once per emulated second. Events set their flag only
when enabled (as both emulators do) and wake the CPU from halt.

**Keyboard.** One latched key: `KEYCODE = code | $80`, ISR bit 7. The next
queued key is delivered only after the firmware has cleared ISR bit 7
(overwriting lost keys in the 游戏 menu during testing). No key-release
events (none in either emulator); the player repeats held arrow keys.

**LCD.** RAM $0400-$0FFF, 96 rows of 32 bytes, MSB left. RAM rows 0-65 are
display rows 65-0, rows 66-95 follow; bytes 0-18 are display bytes 1-19;
byte 19 is display byte 0 with rows shifted by one (RAM row 95 → display row
65); RAM row 0 byte 0 is replaced by $1000. Pixel 159 is the status icon of
the row (bit 0 of byte 18). Both emulators agree on this.

**Flash.** SST39VF160-class, JEDEC sequences on A14-A0 ($5555/$2AAA): byte
program ($A0; programming only clears bits, as on the chip), sector ($30, 4 KB),
block ($50, 64 KB) and chip ($10) erase, software ID ($90) and CFI query ($98,
the table from both emulators), $F0 to exit. Operations finish at once.

## The OS and its programs

**Flash file system** (`flashfs.ts`): directory at $0000, 16-byte entries
`{address >> 8 (2), name (10, GBK), size (3), type}`, type $FF ends the list,
$00 is a deleted entry. Sector maps: $1000 + sector (sectors 0-$FF) and
$8000 + sector - $100 (sectors $100-$1FF); $04 system, $01 used, $FF free;
$1FE/$1FF hold OS data ($03/$02). Files take whole 4 KB sectors, allocated
from sector $0F. Type $3D is a program (`.gam`); the download tool's other
types are in `FileType`.

**Installing and starting a program** (`device.ts`): edit the flash image as the
download tool would (delete the other programs, write the new one), then cold
start so the OS reads the file system afresh. Installing next to a deleted
entry without a restart made the OS list the wrong program: it keeps its own
view of the files. Then: 目录 (home), 下一页 ×9 to 游戏, ↓ past the built-in
Eros方块, 输入. Success = a CPU bank maps one of the program's flash pages.
A cold start answers 要清内存吗 with 否; a blank flash is formatted by the OS.

**The launcher** is OS API $E995 → segment 08, $76D7; it takes a descriptor the
menu builds at $2B2E and far-calls the program's entry. Not called directly:
that would mean imitating OS internals.

**`.gam` header:** "GAM\0", name at 6 (10 bytes GBK), entry address at $40,
data offset at $42. The code segment is mapped at $5000-$8FFF, data at
$9000-$CFFF. 87 of the 138 programs embed an fmj resource library ("LIB",
index at +$10, locations at +$2000), found by `findLib`.

**Calling convention** (the BBK C compiler): a software stack at $28/$29,
arguments pushed by runtime helpers ($DAAA pushes A, $DACA pushes $20/$21, ...),
return values in $20/$21. The caller pops its arguments after the call
(`PHP SEI CLC LDA $28 ADC #n ...`), which gives each function's argument size.

**Far call:** `LDX #lo / STX $26 / LDX #hi / STX $27 / JSR $D2F6`. $D2F6 reads
the 3-byte entry at ($26) = address, 16 KB segment. Segment < $E0 is the OS
(page $E80 + 4 × segment), ≥ $E0 the program's own (relative to its base
page in $2029/$202A). The segment is swapped into $5000-$8FFF for the call.
Banks D-F ($D000-$FFFF) are the OS's resident code: the C runtime and the
far-call machinery.

**OS API used by the 138 programs:** 107 distinct functions, all through the
table at $E700-$EA64 (one program also reaches one through its own table). About
50 are linked into nearly every program:

| Functions implemented | Programs fully covered |
|---|---|
| 52 | 100 (84 of the 87 fmj-engine ones) |
| 70 | 118 |
| 90 | 130 |
| 107 | 138 |

Names: 29 of them were matched to the SDK's names by aligning the call order in
BA4988/fmj-engine's disassembly (`assemble/*.txt`) with its C reconstruction;
no conflicting matches. `middle.c` in fmj-engine (GPL-2) implements about 45
SDK functions on Windows and is the reference for their behaviour. The table
(entry, segment:address, SDK name where known, argument bytes from the
callers' clean-up, programs using it; "varies" = callers clean up differently
or not at all):

| Entry | Target | Name | Arg bytes | Programs |
|---|---|---|---|---|
| `E935` | 08:5093 | GuiGetMsg | 0 (varies) | 138 |
| `E93E` | 08:6111 | GuiTranslateMsg | 0 (varies) | 138 |
| `E78E` | 05:67E2 | SysPicture | 6 | 137 |
| `E85D` | 05:6FDE | SysLcdPartClear | 3 | 137 |
| `E938` | 08:5D45 |  | 0 | 136 |
| `E93B` | 08:5FF3 |  | 0 | 136 |
| `E7B2` | 07:7770 | SysTimer1Open | 0 (varies) | 136 |
| `E7B5` | 07:7793 | SysTimer1Close | 0 (varies) | 136 |
| `E8EC` | 06:624D |  | 0 | 135 |
| `E932` | 08:5000 |  | 0 | 133 |
| `E944` | 08:7D92 |  | 4 | 130 |
| `E95C` | 08:7093 |  | 6 | 126 |
| `E965` | 08:6A79 |  | 0 | 126 |
| `E968` | 08:6B12 | GuiSetKbdState | 2 | 126 |
| `E959` | 08:6FAB | SysRand | 2 | 124 |
| `E79A` | 05:582C | SysPrintString | 3 | 123 |
| `E860` | 05:7336 | SysLcdReverse | 3 | 114 |
| `E7D9` | 07:759F |  | 0 | 111 |
| `E953` | 09:8A7C | GuiMsgBox | 4 (varies) | 110 |
| `E797` | 05:860B | SysRect | 3 | 106 |
| `E947` | 08:8515 | SysMemAllocate | 2 | 105 |
| `E709` | 04:5456 |  | 6 | 104 |
| `E94A` | 08:88DD | SysMemFree | 0 (varies) | 102 |
| `E794` | 05:8309 | SysLine | 3 | 100 |
| `E877` | 05:77CD | SysSaveScreen | 5 | 98 |
| `E87A` | 05:6CEA | SysRestoreScreen | 5 | 96 |
| `E700` | 04:5000 |  | 5 | 95 |
| `E718` | 04:604F |  | 4 | 95 |
| `E87D` | 05:86A9 | SysFillRect | 3 | 94 |
| `E9E9` | 0D:74C5 | FileNum | 0 (varies) | 94 |
| `E9EC` | 0D:7A30 | FileSearch | 0 (varies) | 94 |
| `E9CE` | 0D:6EDC | FileOpen | 0 (varies) | 94 |
| `E9C8` | 0D:70B7 |  | 0 (varies) | 94 |
| `E9D4` | 0D:6E54 |  | 0 (varies) | 94 |
| `E9D1` | 0D:6E49 |  | 0 | 94 |
| `E7BB` | 05:638C | SysAscii | 2 | 94 |
| `E9D7` | 0D:6CF5 |  | 0 (varies) | 94 |
| `E9DD` | 0D:7C59 | FileDel | 0 | 93 |
| `E71E` | 04:63DD | strlen | 2 | 92 |
| `E712` | 04:5EA4 |  | 4 | 91 |
| `E7C1` | 07:76CC | SysGetKey | 0 | 91 |
| `E9C2` | 0D:6911 |  | 0 | 90 |
| `E71B` | 04:6132 |  | 4 | 88 |
| `E7C7` | 07:772E |  | 0 | 87 |
| `E7C4` | 07:7716 | SysSetKeySound | 0 | 87 |
| `E9EF` | 0D:7953 |  | 0 | 87 |
| `E8A4` | 07:79EF | SysStopMelody | 0 | 86 |
| `E8A1` | 07:7A08 | SysPlayMelody | 0 (varies) | 86 |
| `E889` | 06:5B18 | SysPictureDummy | 8 | 81 |
| `E980` | 08:7A6E |  | 2 | 43 |
| `E950` | 09:7540 |  | 0 (varies) | 15 |
| `EA64` | 07:88AB |  | 2 | 11 |
| `E8BF` | 05:8603 |  | 3 | 9 |
| `E8C5` | 06:5000 |  | 7 | 7 |
| `E92F` | 08:6D5D |  | 2 | 6 |
| `E70F` | 04:58DB |  | 8 | 6 |
| `E7F7` | 05:5762 |  | 0 (varies) | 6 |
| `E7DC` | 07:75A5 |  | 0 | 5 |
| `E818` | 06:6B19 |  | 0 (varies) | 5 |
| `E81B` | 06:6B71 |  | 0 | 5 |
| `E81E` | 06:6BCF |  | 0 | 5 |
| `E821` | 06:6C2D |  | 0 (varies) | 5 |
| `E788` | 05:7C17 |  | 2 | 5 |
| `E9E3` | 0D:7AA4 |  | 2 | 4 |
| `E7FA` | 05:852A |  | 2 | 4 |
| `E7F4` | 07:7618 |  | 2 | 4 |
| `E863` | 05:51D6 |  | 1 | 4 |
| `E86E` | 05:523C |  | 0 | 4 |
| `E871` | 05:526E |  | 1 | 4 |
| `E7B8` | 07:77A1 |  | 0 | 3 |
| `E812` | 06:66EA |  | 0 (varies) | 3 |
| `E815` | 06:66EF |  | 0 | 3 |
| `E874` | 05:7AC4 |  | 5 | 3 |
| `E86B` | 05:5208 |  | 1 | 3 |
| `E8BC` | 05:7C0F |  | 2 | 3 |
| `E8B9` | 05:8301 |  | 3 | 3 |
| `E8E3` | 06:6956 |  | 0 | 2 |
| `E7DF` | 07:75AB |  | 0 | 2 |
| `E706` | 04:524D |  | 2 | 2 |
| `E8E0` | 06:6A40 |  | 0 | 2 |
| `E866` | 05:51E9 |  | 0 | 2 |
| `E8D4` | 07:7B0D |  | 0 | 2 |
| `E8D1` | 07:7A7A |  | 0 | 2 |
| `E80F` | 06:69CA |  | 2 | 2 |
| `E78B` | 05:8102 |  | 2 | 2 |
| `E9AD` | 08:7253 |  | 7 | 2 |
| `E800` | 06:66D6 |  | 0 | 2 |
| `EA52` | 07:7CE5 |  | 0 | 1 |
| `E791` | 05:66B2 |  | 2 | 1 |
| `E94D` | 09:5024 |  | 0 | 1 |
| `E92C` | 08:6C3E |  | 2 | 1 |
| `E7D0` | 07:770F |  | 0 | 1 |
| `E99E` | 14:6D02 |  | 2 | 1 |
| `E8AD` | 07:74F4 |  | 2 | 1 |
| `E7D3` | 07:7531 |  | 7 | 1 |
| `E7E5` | 07:75CC |  | 0 | 1 |
| `E824` | 06:66F4 |  | 0 | 1 |
| `E827` | 06:66F9 |  | 0 | 1 |
| `E82A` | 06:66FE |  | 0 | 1 |
| `E848` | 06:6730 |  | 0 | 1 |
| `E8EF` | 06:614C |  | 2 | 1 |
| `E8F2` | 06:61C5 |  | 2 | 1 |
| `E7BE` | 05:5C57 |  | 3 | 1 |
| `E803` | 06:66DB |  | 0 (varies) | 1 |
| `E7E2` | 07:75B1 |  | 2 | 1 |
| `E929` | 08:6BC2 |  | 0 | 1 |
| `902D` | 00:9F7C |  | 0 | 1 |

## How it is checked

- `tests/bbk-hardware.test.ts` (always runs): banks, DATA ports, timer interrupts
  through the vector table with halt, the keyboard latch, save/restore, flash
  commands, the file system, LCD decoding, keys, `.gam` headers. A few bytes
  of hand-written code stand in for the OS.
- `tests/bbk-cpu.test.ts` with `BBK_CPU_TESTS`: SingleStepTests 65x02
  (`wdc/<op>.json`; a prefix of each file is enough, fetched with an HTTP range
  request) and Dormann's `6502_functional_test.bin` / `65C02_extended_opcodes_test.bin`.
- `tests/bbk-device.test.ts` with `BBK_FIRMWARE` (+ `BBK_GAMES`): boots, starts
  every `.gam`, and boots from the OS and font alone.
- In the browser (Playwright): import of firmware and programs, Play, resume
  after leaving, Remastered, the device itself, LCD effects, the phone layout.
  (Playwright's `setInputFiles` drops files with non-ASCII names: copy them to
  ASCII names for tests.)

None of the firmware, programs or test suites are committed; `.gitignore`
blocks them.

## Open questions

- **PB bit 4.** At every cold start the OS toggles PB bits 0-1 and waits for
  bit 4 for about 1.5 s of device time, then gives up ("正在初始化系统…"). Some
  peripheral (speech chip? serial EEPROM?) is not there. Harmless, but unknown.
- **Sound.** `AUDCON` ($23F) and the melody hardware are not emulated (neither
  reference emulator does). Programs run silently.
- **CPU clock.** 4 MHz is gam4980's figure; the real clock is not confirmed.
  Speed feels right in the games tried.
- **Key release / held keys.** The keyboard controller is modelled as press-only.
  Action games that poll held keys may want more; to be checked with the
  firmware's keyboard handler.
- **D flag on interrupts.** Cleared (65C02 behaviour); neither emulator does.
- **Interrupt sources never raised:** MT, GTL, GTH, serial (RXD), MMC.

## Next steps (phase 4 onwards)

1. **API catalogue** from the firmware: walk the whole table at $E700-$EA64
   (about 290 slots, 204 pointing at code), name what middle.c and the
   disassembly give, record argument sizes.
2. **Call recorder**: in firmware mode, log every far call into an OS segment
   with its arguments and a RAM snapshot (32 KB, cheap), across scripted
   openings of every program.
3. **Per-call comparison**: from each snapshot, run the original function to its
   return, rewind, run the JS version, and diff RAM; differences are bugs or
   OS scratch memory (catalogued once).
4. **JS OS core**: boot without firmware (the RAM state the OS leaves, learned
   from firmware mode), the far-call stub, the C runtime helpers (fuzzed against
   the originals), interrupt handlers.
5. Then the functions in order of use (the table above), until every slot of
   the table is covered, so programs not seen yet also run.

## Files

```
src/bbk/cpu.ts        65C02
src/bbk/machine.ts    hardware, state save/restore
src/bbk/flash.ts      NOR flash chip
src/bbk/flashfs.ts    the OS's flash file system
src/bbk/lcd.ts        screen decoding
src/bbk/keys.ts       device keys, keyboard map
src/bbk/gam.ts        .gam header, embedded fmj library
src/bbk/firmware.ts   firmware dumps by region
src/bbk/device.ts     boot, install, launch
src/app/DevicePlayer.tsx   the player for device programs
src/app/deviceStore.ts     keeping a device between visits (IndexedDB, gzip)
src/app/playerShell.tsx    what both players share
scripts/bbk/d65.mjs        65C02 disassembler (for reading the firmware)
scripts/bbk/api-scan.mjs   OS calls in a folder of .gam: targets, argument sizes, users
scripts/bbk/api-names.mjs  SDK names for table entries, from fmj-engine's disassembly + C
scripts/bbk/api-table.mjs  the table above, from the two results
```
