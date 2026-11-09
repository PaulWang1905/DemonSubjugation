# Fulu (符箓): plan, version 2

**Fulu** replaces the Longman 4988's operating system with TypeScript. A
`.gam` program runs its own 6502 code on the emulated 4988 (`src/bbk`), and
every call it makes to the OS is answered by Fulu instead of BBK's firmware,
so no firmware files are needed. (The "WSL" idea: run the programs, replace
the system they call.)

This version is simpler than the first: fewer parts, one checking tool, and
the order of work decided by measurement instead of planned by hand.

---

## 0. Scope: seven games first

Fulu targets the **伏魔记 series** (1.0, 1.2, 1.3, 完美版 1.0, 怀旧终曲 v1.0),
**三国霸业** and **英雄坛说** first. Together they use **55 OS functions**
(each 44-50), half of the 107 the whole collection uses. The shadow run checks
these seven, and "done" for F2 means they play without firmware with 0
mismatches. The rest of the collection follows only if wanted.

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
| F1 | **Foundation**: the address lookup in `src/bbk`, start and exit, the far call, the compiler helpers, interrupts; the shadow run | the seven games run under the shadow run, with the helpers matching and their missing OS functions listed | 1-2 sessions |
| F2 | **The 55 functions the seven games use**, in the order the table gives | the seven play without firmware, 0 mismatches | 4-6 sessions |
| F3 | **In the site**: Play works without firmware for the seven; firmware mode stays as "Original OS" when its files are there | the seven start and play in the browser without firmware | 1 session |

Each milestone goes to main when its checks pass; work in between stays on
the `fulu` branch.

## 6. Kept out, on purpose

- **OS functions no program uses yet** (~90 of the ~200 in the table). When a
  future game needs one, Fulu names it, and it is added and checked with that
  game in the shadow run. Nothing is written for no user.
- **Melodies** (their tunes are firmware data): Fulu stays silent, as the
  emulator is now.
- **HD text for `.gam` games**: not part of F1-F3; planned as F4 (section 11).

## 7. Code

```
src/fulu/
  fulu.ts        install, start, exit; the address lookup, far call,
                 interrupts, "not yet" retries
  runtime.ts     the C compiler's helpers (and the OS's memmove and bank
                 helpers at $E900)
  os.ts          the OS functions and interrupt handlers (split by area,
                 screen, text, keys, ..., as F2 adds them)
  glyphs.ts      the glyph source
tests/fulu.test.ts          without firmware: a hand-made .gam
tests/fulu-shadow.test.ts   the helpers on random arguments, and the shadow
                            run (with BBK_FIRMWARE, and BBK_GAMES)
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

## 10. Status

**F1 is done.** `src/fulu` has the start-up state, the address lookup, the
far call and its return, the interrupts, and the C runtime's 50 helpers.
Fulu matches the firmware exactly (registers, flags, banks, memory) on 400
random calls per helper, and in the shadow run of the seven games (60 s of
play each): about 910,000 entries into the OS checked, 0 mismatches.

**F2 is done for what the shadow runs reach** in six of the seven games (the
伏魔记 series and 英雄坛说): every OS function reached is in `src/fulu`, and the shadow run of the six
(60 s of play each) checks every entry into the OS with 0 mismatches, with
the screen, string and heap functions also checked on random arguments.
三国霸业 is deferred, on purpose, to ship first: what it alone needs is
listed below and in docs/fulu-notes.md ("Deferred").

**F3 is done for the six.** Without the firmware's files, the device player
runs a .gam on Fulu (`src/fulu/device.ts`), with a font ROM made from the
site's Unifont (`src/fulu/glyphs.ts`); with them, on the original OS as
before. Saved devices are kept per OS. A program that needs a function Fulu
lacks stops with its name and a note to add the firmware.

**F2's list**, from the shadow run (games that need each):

- 7 games: GuiGetMsg, GuiTranslateMsg, SysTimer1Open, SysPicture, SysGetKey,
  SysLcdPartClear, SysLcdReverse, SysRect, strlen, SysMemAllocate, SysMemFree,
  FileNum, SysSetKeySound, and $E700, $E932, $E938, $E93B, $E944, $E95C,
  $E965, $E7C7, $E7D9, $E8EC, $E9C2
- 6: SysTimer1Close, SysPictureDummy, SysPrintString, SysAscii, SysLine,
  GuiMsgBox, $E71B
- 5: SysSaveScreen
- 1 (三国霸业): SysRand, GuiSetKbdState, $E7B8, $E709, $E712, $E718, $E7FA,
  $E8BF, and the floating-point helpers ($D506, $D81D, $DD19, $E517, $E520,
  $E52C)

All done but 三国霸业's ($E7B8 too, which GuiMsgBox uses).

**Not done, found later:** the shadow runs reach only the first minute of
each game. Tracing each game's code (scripts/bbk/gam-calls.mjs) showed more
that the six call. Done since, each checked against the firmware: SysRand,
the keys a keyboard can send, strcat, strcmp, itoa, ltoa, the melodies,
GuiSetKbdState, memcmp and the runtime's float and 32-bit helpers. Saving and
loading (the file functions) are done since, checked against the firmware
while saving, overwriting and loading. So is 伏魔记 1.0's "overwrite the
save?" dialog $E950, with the site's icon. **For the six games nothing their
code can reach is missing** (scripts/bbk/gam-calls.mjs); 三国霸业 needs two
more OS functions and eight runtime routines. The
list is in docs/fulu-notes.md ("Still to do"). Also not written: input
methods, $E92F (GuiMsgBox's message $0A 3), the input mode changes in $E93B,
GuiGetMsg's other events.

## 11. F4: HD text for `.gam` games (plan)

**Goal.** With Sharp text on (the player's text options: Kai, Hei, Song,
sans, serif), a `.gam` game on Fulu shows its text in full-resolution fonts,
as 伏魔记 React does: dialogues, menus, item names, numbers. The pictures stay
pixels. Pixel text stays the default, and the firmware mode is not changed.

**Why it is small.** Two things are already there:

1. *Fulu draws all the text.* Programs never read the font ROM; every
   character reaches the screen through SysPrintString ($E79A) or SysAscii
   ($E7BB), in 8 × 16 (ASCII) or 16 × 16 (GBK) cells (src/fulu/text.ts).
   Measured on 伏魔记 1.3: 510 strings and 15 characters in two minutes of
   play, the intro's scrolling text included (it prints again at each step).
2. *The site's HD renderer takes a list of characters.* `HiresText.draw`
   (src/app/hiresText.ts) is given the frame and a `TextMark` list (cell,
   text, colours, the part drawn over since). It clears the glyph's pixels,
   scales the picture with the chosen effect (LCD, smooth) and paints the
   characters on top. DevicePlayer already calls it, with an empty list.

So F4 is: Fulu keeps a list of the characters it drew, and each frame tells
the player which of them are still on screen.

**How.**

1. *Record* (src/fulu/textMarks.ts). Each glyph SysPrintString or SysAscii
   draws is recorded: x, y, width (8 or 16), the character (GBK to Unicode
   with TextDecoder("gbk"); the $FD-$FF symbols and anything without a
   Unicode character stay pixels), and its 16 rows of bits. A new glyph
   removes the records whose cells it overlaps.
2. *Check against the screen, each frame.* A record counts only while the
   screen shows its whole cell as drawn, or whole inverted (the menus'
   selection: fg and bg swap); x need not be a multiple of 8. A character
   drawn over even in part, or cleared, keeps its pixels. Being checked
   against the pixels, a stale record never shows, whatever the program does
   to the screen. A new glyph drops the records whose cells it overlaps, so
   the list stays small.
3. *Hand to the player.* `fulu.textMarks.marks(screen)` gives the `TextMark`
   list; DevicePlayer passes it to `HiresText.draw`. Its Text option (Pixel,
   or HD in one of the site's fonts, the same setting as the JS engine's
   player) shows on Fulu only.
4. *Saves* keep no records: after resuming, text is sharp again when the
   game next draws it.

**Checks.**

- Unit tests (tests/fulu.test.ts): a hand-made program prints, draws over
  part of the text, reverses a line, clears the screen: the marks follow.
- The six games: sheets of screenshots, pixel and sharp side by side, of the
  intro, the dialogues, the menus (selection highlight), the equipment,
  shop, battle and save screens; nothing sharp where the pixel screen shows
  no text, and no pixel text left where a whole character shows.
- The shadow run is not touched (recording only reads what Fulu draws).

**Limits.** Text a game draws as a picture (the 伏魔记 title, the big 穿 / 戴
labels) stays pixels, as do characters cut by the screen's edge or drawn
over entirely. Firmware mode keeps pixel text (its text is drawn by the
real OS, which Fulu does not see).

**Size.** About one session: ~150 lines in src/fulu (records, check), ~30 in
the player, tests and the screenshot check.

**Status: done.** src/fulu/textMarks.ts (records and the check), the glyph
calls in src/fulu/text.ts, the Text option in DevicePlayer;
tests/text-marks.test.ts. Checked on 伏魔记 1.3 and 英雄坛说 by tinting the
cells reported on screenshots of the intro, dialogues, menus (selections
inverted), magic, status and notices: every whole character, nothing else;
and in the browser, the dialogue in Kai and Hei.


## 12. F5: the wider map view for `.gam` games (plan)

**Goal.** The player's map view option (Original 9 × 6, Wider 13 × 8, Widest
17 × 10 tiles), which the JS engine has, for `.gam` games too: on a map, more
of it is shown around what the game draws. Menus, battles and scenes stay
the device's size, centred.

**What can be used.**

1. *The game's data, in a form the site reads.* All six games (the 伏魔记
   series and 英雄坛说) are made with BBK's RPG kit (RpgA100.eng) and carry an
   fmj resource library at $48000 (`findLib`); the site's JS engine already
   plays that library. So the maps, their tiles and the characters' sprites
   can be drawn by the site's own engine code. (三国霸业 has none: no wider
   view.)
2. *Where the game keeps its view, in RAM* (from the C reconstruction of the
   kit's engine, gitee fmj-engine): the current map's chapter and section
   ($1979, $197A), the screen's top-left tile on the map ($197C, $197D), the
   map's size ($197E, $197F), the party ($1988, 3 records of $19 bytes) and
   the NPCs ($19D3: 40 pointers to $20-byte records; +2 facing, +5 x, +6 y,
   +$17 sprite). The game composes each frame in its own buffer (pointer at
   $1936) and shows it with SysPicture.

So the wider view needs no change to the game or to the OS: around the
device's screen, the rest of the map is drawn from the library, at the
position the game's RAM gives. It works the same with Fulu and with the
firmware.

**How.**

1. *Draw the surroundings* (src/bbk/wideView.ts). From the library: the map
   ($1979 / $197A) and its tiles, drawn for the wider window around the
   game's view ($197C / $197D), blank past the map's edges; then the NPCs and
   party members whose positions fall in the border, with their facing, from
   the RAM records, using the JS engine's map and sprite drawing.
2. *Check before showing* (the same rule as F4's text: never show what the
   screen does not confirm). Each frame, the window the game shows is drawn
   from the library too and compared with the LCD, tile by tile. The border
   is shown only while the tiles the game's screen shows match the library's
   (those under sprites or a dialogue box are not counted, but most must
   match). Menus, battles, scene pictures and anything unexpected fail the
   check: the border is then blank and only the device's screen shows, as in
   the JS engine's battles. A wrong address or a game whose engine keeps its
   view elsewhere fails it too, so a game is never shown a wrong map.
3. *Compose.* A frame of 13 × 8 or 17 × 10 tiles: the border from step 1, the
   device's own map area (its 9 × 6 tiles, exact pixels: the hero, effects,
   dialogue boxes) in the middle, placed so the hero is at the centre. The
   decorative strip at the right of the device's screen is left out on maps.
   The player shows the wider frame (`HiresText.draw` already takes any frame
   size), and F4's text marks move with the device's screen.

**Checks.**

- Unit test: for each game with the library, the first map's window drawn
  from the library equals the LCD (sprites aside), which also proves the RAM
  addresses for that game's engine.
- Sheets of screenshots in the six games: walking across several maps and to
  their edges, through doors, with NPCs moving, in dialogues, menus, battles
  and scenes; the border never shows a wrong tile.

**Limits.**

- In the border, NPCs are drawn from their records, so an animation frame or
  a scripted effect there can differ from what the game would draw; inside
  the device's screen everything is the game's own.
- A dialogue box stays where the game draws it, at the bottom of the device's
  screen, not at the bottom of the wider view (as the JS engine places it).
- Only games made with the RPG kit whose library is in the .gam.

**Size.** Two to three sessions: the surroundings and the check (~250 lines,
reusing the engine's map and sprite code), the player (~50), tests and the
screenshot checks. Independent of F4; doing F4 first makes the text work in
the wider view from the start.

## 13. F6: More text for `.gam` games (plan)

**Goal.** The JS engine's More text option for `.gam` games on Fulu: Normal
(16 px), 12 px or 10 px text in dialogues and message boxes, so a page holds
more, with the same font menus (Chinese and English pixel fonts at 12 / 10
px, the ones the JS engine bundles; or HD, F4, at that size).

**Why it is not just smaller glyphs.** The game's engine (BBK's RPG kit,
RpgA100.eng) lays its text out itself. SAY (gitee fmj-engine,
engine_cmd_actor.c `_002085A3`) counts 15 half-width characters for a line
(11 beside a portrait), prints two lines with SysPrintString at y = $3A and
$4D in a box at ($09, $37)-($95, $5F), and waits for a key, page after
page. Fulu sees only the strings of one page; drawing them smaller would
leave the box half empty, and the page breaks stay the game's. So Fulu
takes over the engine's text commands, as it took over the OS.

**How.**

1. *Find the commands.* SAY, MESSAGE (`_00203B8B`, a message box waiting for
   a key) and TIMEMSG (`_00207590`, one shown for a time) are the kit's own
   code, the same in every game made with it. Their addresses in each `.gam`
   are found from the script interpreter's command table (the switch at
   `_51D7`), and their code is checked byte for byte against the version
   this was written for; a game whose code differs keeps its own.
2. *Answer them in TypeScript* (src/fulu/gut.ts), as the OS functions are
   answered: Fulu traps the routine's address and runs its version, which
   reads the command's arguments from the script (advancing the script
   pointer as the original does), draws the box, the portrait (the engine's
   own sprite routine, called as a far call) and the text, waits for a key
   through GuiGetMsg (resumable, as GuiMsgBox), and restores the screen.
3. *First exactly as the game, then more.* At 16 px the TypeScript version
   must do what the game's code does: the shadow run compares the two (the
   game's routine against Fulu's, from the same state) over the six games'
   scripts, 0 mismatches. Only then does the More text layout go in: at 12 px
   a line of the box takes 11 Chinese characters (7 at 16 px) and the box
   three lines (two); at 10 px, 14 and four. Page breaks are recomputed for
   the new size, so a dialogue takes fewer pages.
4. *Fonts.* The glyphs at 12 / 10 px come from the player (the JS engine's
   bundled pixel fonts, by the Chinese and English font menus), handed to
   Fulu as its 16 px font is; the characters go into the text marks (F4) with
   their size, so HD text draws them too.
5. *The option.* More text: Normal, 12, 10, in the device player on Fulu,
   with the font menus when it is not Normal. Changing it applies from the
   next page.

**Checks.** The shadow comparison at 16 px (step 3); screenshot sheets of the
six games' dialogues at 12 and 10 px, pixel and HD: text inside the box, no
character cut or lost (the pages joined give the script's string back), the
portrait and the screen after the dialogue as at 16 px.

**Limits.** Dialogues and message boxes only: menus, item descriptions and
the intro's scrolling text are laid out by the game's other code and stay
at 16 px. Only games made with the RPG kit. Firmware mode is not changed.

**Size.** Two to three sessions: finding and checking the commands, the
three commands in TypeScript with the shadow comparison, the compact layout
and the fonts, the option.

## 14. F7: the debug menu for `.gam` games (plan)

**Goal.** The JS engine's hidden debug menu (src/app/DebugMenu.tsx: hold
the game screen to open it, the game paused while it is open; tabs Party,
Items, Story, Tricks) for `.gam` games too, plus a Device tab that works for
any program.

**Design: the same menu, a second `Cheats`.** DebugMenu.tsx talks to the
game only through the `Cheats` interface (src/engine/cheats.ts: party and
stats, heal, learn all magic, money, inventory and the item catalogue, story
flags, location, win the battle, three switches). The six games are made with
BBK's RPG kit, whose engine keeps all of that at fixed places in RAM (gitee
fmj-engine, engine_internal.h), and their names are in the fmj library the
`.gam` carries (`findLib`, read by the site's resource code). So F7 writes
`kitCheats(machine, lib): Cheats` (src/bbk/kitCheats.ts) and the device player
opens the same menu with it. One menu, two games' worlds behind it.

**Where things are** (engine_internal.h, to be confirmed per game, below):

| | |
|---|---|
| money | $1A8F, 32 bits |
| inventory | the array at the pointer in $192F, $1A95 kinds |
| party | $1926 members; actors at $1988 (3 × $19), with their stats (`ActorStats`) |
| story flags | the 302 bytes at the pointer in $1AA9 (2,416 flags) |
| location | map type and index $1979 / $197A, name $1942, view $197C / $197D |
| random battles | $1A96 (0 off, 1 on) |
| battle | enemies at $1826 (3), round $191E |

**The tabs.**

- *Party, Items, Story*: read and written in RAM as above, names from the
  library; the catalogue is the library's items, as in the JS engine.
- *Tricks*: always full HP / MP (written back each frame, as the JS engine
  does each tick); win the battle (the enemies' HP set to 0, the engine ends
  the battle at its next check); no random battles and walk through walls
  by answering the engine's own encounter and passability tests
  (`_0021554E`), trapped at their addresses the way F6 traps its text
  commands (the same search and byte-for-byte check).
- *Device* (any program, Fulu or firmware, 三国霸业 too): four save-state
  slots (the machine, its flash and Fulu's state), a memory view with
  editing, a value search to find a game's numbers (equal to, changed,
  unchanged, up, down: narrowed step by step), on Fulu the last OS calls
  with their names and arguments, and step one frame.

**Not trusting addresses blindly.** Before the kit tabs show, the menu checks
that the game is the kit's engine as described: its code at the trapped
routines byte for byte, and its RAM plausible (party of 1-3, stats within
their limits, the map's name in RAM the library's name for $1979 / $197A).
If not, only the Device tab shows.

**Checks.** Per game, against the game's own screen, read through F4's text
marks: open the game's menu and its 金钱 line must say the money `kitCheats`
reads; set money and an item count, reopen the menu, and the screen shows
the new values; the status page shows the stats `party()` reads; turning a
flag on replays or skips a known scene; walk-through-walls crosses a wall on
the first map; win the battle ends one. Save-state slots: a run after
restoring a slot repeats exactly.

**Order and size.** The Device tab first (generic, one session), then the
kit tabs (one to two sessions; the routine search is shared with F6, so
whichever comes first builds it).

**F7 status: done, with three limits.** src/bbk/kitCheats.ts (`KitCheats`,
the RPG kit's `Cheats`), src/app/DeviceTools.tsx (the Device tab),
src/bbk/memorySearch.ts, `readLibrary` (src/engine/index.ts: names, maps and
magic chains from a library without the engine's global one), DebugMenu.tsx
taking any `Cheats` and an optional Device tab, `Fulu.recentCalls`. Hold the
screen in the device player to open it, as in the JS engine's player.

What the games taught: the reconstruction's addresses hold for 英雄坛说,
完美版 and 怀旧终曲; 伏魔记 1.3 has every variable 2 bytes later; 1.0 and 1.2
have those from $197B on 1 byte earlier (they lack the reconstruction's
"show the hero's position" byte there). So the layout is two shifts, found
from the two inventory pointers ($4A10) and confirmed by the current map's
name before anything is used. tests/kit-cheats.test.ts plays all six to
their first map and checks against each game's own menu (the 金钱 line read
through F4's text marks): money read and written, the party, HP kept full,
items in and out, story flags, random battles kept off and restored.

Limits:
- *Walking through walls* is not offered for `.gam` games: these builds read
  the tiles around the hero from the map's data again as they handle each
  step, after anything written into their view of it (traced in 伏魔记 1.3
  and 英雄坛说), so it needs the engine's own test answered (F6's routine
  trapping).
- *Story flags* in 伏魔记 1.0 are not where the other builds keep them (one
  more variable differs there): the Story tab says so instead.
- *Win this battle* is not yet checked in a battle (the first maps have none);
  it only acts on enemy slots that look like enemies (a level, HP within its
  limit), so a wrong address shows no battle rather than being written to.
