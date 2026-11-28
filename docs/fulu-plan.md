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
三国霸业 was deferred, on purpose, to ship first, and is done since: see
"Not done, found later" below.

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

All done, 三国霸业's last.

**Not done, found later:** the shadow runs reach only the first minute of
each game. Tracing each game's code (scripts/bbk/gam-calls.mjs) showed more
that the six call. Done since, each checked against the firmware: SysRand,
the keys a keyboard can send, strcat, strcmp, itoa, ltoa, the melodies,
GuiSetKbdState, memcmp and the runtime's float and 32-bit helpers. Saving and
loading (the file functions) are done since, checked against the firmware
while saving, overwriting and loading. So is 伏魔记 1.0's "overwrite the
save?" dialog $E950, with the site's icon. **For the six games nothing their
code can reach is missing** (scripts/bbk/gam-calls.mjs). 三国霸业's last
three OS functions ($E7FA, $E8BF, $E9E3) and nine runtime routines (floats)
are done since, checked against the firmware on random arguments and in
its shadow runs (play, and a save and load): nothing its code can reach is
missing either, so **all seven games of the plan play on Fulu** (details in
docs/fulu-notes.md, "Still to do"). Also not written: input
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
   or HD in one of the site's fonts, the same setting as FMJ React's
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
17 × 10 tiles), which FMJ React has, for `.gam` games too: on a map, more
of it is shown around what the game draws. Menus, battles and scenes stay
the device's size, centred.

**What can be used.**

1. *The game's data, in a form the site reads.* All six games (the 伏魔记
   series and 英雄坛说) are made with BBK's RPG kit (RpgA100.eng) and carry an
   fmj resource library at $48000 (`findLib`); FMJ React already
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
   the RAM records, using FMJ React's map and sprite drawing.
2. *Check before showing* (the same rule as F4's text: never show what the
   screen does not confirm). Each frame, the window the game shows is drawn
   from the library too and compared with the LCD, tile by tile. The border
   is shown only while the tiles the game's screen shows match the library's
   (those under sprites or a dialogue box are not counted, but most must
   match). Menus, battles, scene pictures and anything unexpected fail the
   check: the border is then blank and only the device's screen shows, as in
   FMJ React's battles. A wrong address or a game whose engine keeps its
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
  screen, not at the bottom of the wider view (as FMJ React places it).
- Only games made with the RPG kit whose library is in the .gam.

**Size.** Two to three sessions: the surroundings and the check (~250 lines,
reusing the engine's map and sprite code), the player (~50), tests and the
screenshot checks. Independent of F4; doing F4 first makes the text work in
the wider view from the start.

**F5 status: done.** src/bbk/wideView.ts (`WideView`), `KitCheats.mapView()`
(the map, the view and the characters, with each build's layout), the Map
option in the device player (the same setting as FMJ React's player).
What the games taught:

- The map area starts at x 8 in four of the games, at x 7 in 伏魔记 1.0 and
  1.2; the view finds which from the first screen that shows the map.
- The characters' records ($19D3) give the picture as ACP(type, +$01), not
  +$16; its frame is (facing - 1) × 3 + step (step 3 as 1), and a picture's
  bottom is the bottom of its tile, for NPCs and scene objects alike. Drawn
  this way, every NPC matched the game's own pixels where nothing covered it.
- A plain tile (one colour) matches a blank screen: 英雄坛说's towns are
  mostly white. The check counts tiles with a pattern: of those in view, at
  least half (and 3) must match, and 27 of the 54 tiles overall.

The check refused the screens that are not the map while the game's memory
still names one (a run error, a blank screen); a battle was not reached in
the automated runs, but the owner played battles with it on the site and
the border goes as it should. It was not tried with the
firmware at first (the code reads the same RAM and screen); the walks below
cover both OSes.
tests/wide-view-gam.test.ts checks the six games on their first map, in
dialogues and around popup menus.

*In step while walking.* The owner saw the border out of step
with the middle now and then. The games move their view in memory before
they draw it: 伏魔记 eight frames before, 英雄坛说 and 异世大陆 two or three;
and on the firmware the drawing itself spans two or three frames. Drawn at
the memory's view, the border ran a tile ahead of the middle for those
frames (headless walks of 7,364 frames: 690-1,790 frames out of step per
game and OS), and on the firmware the middle showed half of each view for a
frame at each step (90-520 frames). Now the border is drawn at the view the
screen shows: of the memory's, the one shown last (with that moment's
characters) and those around it, the one most of the screen's tiles are (on
grass a view a tile off matches too, so not just the first that confirms);
a screen part one view and part another shows the last frame again, at
most four frames. The same walks now give none of either (and none in the
browser, on a computer and a phone). A screen that is not the map drops the border by its
second frame, as before (its first frame now shows the last frame again
rather than the border beside the new screen). The device player composes
only when the device has run a frame, so a display faster than 60 Hz does
not count a frame twice. tests/wide-view-walk.test.ts walks three games on
both OSes; tests/wide-view-sync.test.ts checks the rules on drawn screens.

*Plain ground and the position box.* The border was missing where the
screen shows few patterned tiles: in 怀旧终曲's 伏魔洞 with the map position
on, its box covered six of the nine patterned tiles in sight, and plain
floors and snowfields never confirmed at all. Now `KitCheats.mapView` says
whether the game shows the hero's position (the engine's enableshowpos), and
the tiles under its box (x 12-47, y 4-17) are left out of the count, as a
dialogue box's are. With fewer than three patterned tiles in sight, the view
is confirmed by three quarters of the tiles, every patterned one, and the
hero standing in his place (a frame of a party member's walking picture at
the view's tile 4, 3). A popup menu keeps the border while a patterned tile
or the hero still shows; a map cell whose tile the tile set lacks (异世大陆's
异族之地 and 精灵界) is left out instead of voiding the count. Walking every
map of each game (about 1,900 frames a map, position off and on), map frames
with no border went from 688-4,687 per game to 0 (异世大陆: 9 of 172,776).
tests/wide-view-plain.test.ts and tests/wide-view-gam.test.ts (伏魔洞, 摩天顶).

*Popups over the hero, screens being drawn, repeating patterns.* Three more
the owner saw:
- A popup over the hero on plain ground (怀旧终曲's 属性 submenu at 伏魔洞,
  完美版's on 摩天顶) dropped the border: no patterned tile in sight and the
  hero not whole (怀旧终曲 even clears the map's tiles around its menus).
  Now, while the view is the one shown, the hero counts with a box over
  part of him: every pixel of a walking picture that differs is inside a box
  drawn on the screen (a black frame, with its shadow), and half his ink or
  more is outside it. A page over the whole screen, a battle or a picture
  has no hero there, and still drops the border by its second frame (the
  frames to the drop, measured for battles, pages and pictures on both OSes,
  are as before).
- On the firmware the game's screen reaches the device's over two frames, so
  at a battle's start one frame showed the border beside the battle's first
  rows over the map. Now a screen where tiles that were the map's a frame ago
  are neither the map's nor under a character shows the last frame again
  (as a screen mid-step does, at most four frames); the border still goes
  when it did. A popup's cursor moving changes no tile that was the map's
  and shows at once.
- 异世大陆's 精灵界 repeats its patterns: a view a tile off matched as many
  patterned tiles, and the one with fewer of its own missing won, a tile
  ahead of the screen. Of views with as many patterned tiles, the one more of
  all the screen's tiles are now wins. (The survey's earlier "off-sync"
  frames there were partly its own measure picking a view that looks the
  same; it now counts only cells where the two views' tiles differ.)
Walking every map of the six kit games and 异世大陆 again (Fulu, about 1,900
frames a map, position off and on: 1.9 million frames), the frames showing
the map with no border went from 145 to 0 and those with the border at
another view than the middle from 290 to 0 (all in 异世大陆; the other games
had none before or after), and the frames shown again as if mid-redraw from
81 to 1.
tests/wide-view-plain.test.ts (synthetic), tests/wide-view-gam.test.ts (the
submenus) and tests/wide-view-walk.test.ts (精灵界, and a battle's start on
both OSes).

## 13. F6: More text for `.gam` games (plan)

**Goal.** FMJ React's More text option for `.gam` games on Fulu: Normal
(16 px), 12 px or 10 px text in dialogues and message boxes, so a page holds
more, with the same font menus (Chinese and English pixel fonts at 12 / 10
px, the ones FMJ React bundles; or HD, F4, at that size).

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
4. *Fonts.* The glyphs at 12 / 10 px come from the player (FMJ React's
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

**F6 status: done, more simply than planned, for dialogues.** SAY uses only
the OS (SysLcdPartClear, SysRect, SysLine, SysPrintString, GuiGetMsg) besides
its portrait and the screen's restore, so Fulu follows it there instead of
taking over the game's code (src/fulu/moreText.ts, hooked in Fulu's far
call): the box cleared at SAY's place, then its first line, start a dialogue;
the string is read from the script at the interpreter's base + PC ($1AA2 /
$1AA0: 伏魔记 1.3 has them 2 bytes on, 1.0 8 bytes back), the game's own
pages are worked out from it (SAY's loop) and its first line must be the one
printed, or the dialogue is left alone. The game's lines are not printed; at
each wait Fulu draws FMJ React's compact box (never shorter than the
game's: 3 lines at 12 px, 4 at 10; at most 4 and 5) with the portrait (PIC
1-pos from the library) and a page of text broken as FMJ React breaks it
(TextRender.drawWrapped, which now also places glyphs for others). Once the
reader has seen Fulu's pages, the game's remaining waits are answered with
a key. The small glyphs go into the text marks, so HD text draws them.

Message boxes (MESSAGE and TIMEMSG: the OS's GuiMsgBox, which on Fulu is
Fulu's own code) take the small font too: the box as tall as its lines,
centred as the OS centres it, the screen under it saved and restored as
before; a text too long for the screen keeps the OS's lines. With More text
off, GuiMsgBox is as checked against the firmware.

Not done, on purpose: menus, lists and descriptions. The kit lays them out
in its own code (_00210D5B and the others: rows of 16 px, the selection bar,
scrolling, keys), so showing more of them would mean replacing the game's
code, which is riskier than what Fulu does elsewhere. They keep the device's
size. No shadow comparison was needed, since the game's own code still runs. tests/more-text-gam.test.ts plays the six games' openings:
every dialogue taken, its pages showing its whole string in order, never
more pages than the game's. Past the openings, the owner played on with More
text on the site: dialogues and message boxes work.

## 14. F7: the debug menu for `.gam` games (plan)

**Goal.** FMJ React's hidden debug menu (src/app/DebugMenu.tsx: hold
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
  library; the catalogue is the library's items, as in FMJ React.
- *Tricks*: always full HP / MP (written back each frame, as FMJ React
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
screen in the device player to open it, as in FMJ React's player.

What the games taught: the reconstruction's addresses hold for 英雄坛说,
完美版 and 怀旧终曲; 伏魔记 1.3 has every variable 2 bytes later; 1.0 and 1.2
have those from $197B on 1 byte earlier (they lack the reconstruction's
"show the hero's position" byte there). So the layout is two shifts, found
from the two inventory pointers ($4A10) and confirmed by the current map's
name before anything is used. tests/kit-cheats.test.ts plays all six to
their first map and checks against each game's own menu (the 金钱 line read
through F4's text marks): money read and written, the party (speed, spirit
and luck set and seen on the game's status page: an actor's stats block is
its library record from +$20, at FMJ React's offsets less $20, not the
reconstruction's ActorStats, whose +$01-$04 are 0 in every record), HP kept full,
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

## 15. F8: the rest of the collection (plan)

**Goal.** The 138 programs of the bbk-games collection (`eebbk/roms`) on
Fulu, without firmware. Not the whole OS: about half of the firmware serves
the device's own applications (dictionaries, organiser), which no program
calls. What counts is what the programs call.

**Where it stands** (`npx tsx scripts/bbk/fulu-coverage.mts <roms> 0E00.DAT`):
86 programs call nothing Fulu lacks (84 of the 86 made with the RPG kit,
and 三国霸业, 对对碰). 50 API entries and 6 resident routines are missing,
about 13,000 instructions of the firmware's code; what Fulu answers stands
for about 29,000.

**Order:** the programs each function completes, per instruction (the
script's plan), in four stages:

| Stage | What | Programs complete | Instructions |
|---|---|---|---|
| 1 | `$E980`, `$E7DC`, `$E7F4`, `$E7F7`; resident `$D31A`, `$D435`, `$D65B` | 86 → 110 | ~280 |
| 2 | `$EA64`, `$E7D0`; `$E818`-`$E821`, `$E8E0`; `$E92F`, `$EA52`; `$E800`, `$E824`-`$E82A`; `$E92C` | → 122 | ~1,600 |
| 3 | `$E8C5`, `$E9AD`, `$E8B9`, `$E788`, `$E8BC`, small ones; `$D4C0`, `$D604`, `$D6F5` | → 130 | ~3,650 |
| 4 | `$E94D` (中国象棋's dialog, 3,113), `$E791`, `$E863`-`$E871` (the pet games), `$E78B`, `$E706`, `$E7BE`, `$E99E`, others | → 138 | ~7,950 |

**Each stage:**
1. Disassemble each function (`os-function.mjs`, `fold-c.mjs`), write it as
   behaviour, with the OS's state at its addresses and its temporaries
   declared.
2. Where it takes arguments, compare it with the firmware on random ones
   (the shadow test's random-argument cases).
3. Put the stage's programs in a folder and run the shadow run on them
   (`BBK_GAMES`), with the play and typing scripts: every entry, 0
   mismatches. What the scan cannot see shows up here: interrupts and
   GuiGetMsg events the seven games never raised, calls through pointers.
   Those join the stage.
4. Play each for a few minutes on Fulu alone, looking at its screens.
5. Ship: build, all tests, docs (notes' function table, report §16).

**Done when** every program of the stage plays on Fulu, against the
firmware, with 0 mismatches. A program the scan calls complete but that
needs something else is listed in the notes with what it needs.

**Changed after measuring play.** The scan counts what a program *can*
call. Played on Fulu alone (180 s of random keys each, until a missing
call), 103 of the 138 already ran the whole time, and `$E980`, stage 1's
biggest item (it calls a 1,969-instruction dialog and 13 more functions,
which the first sizes left out), was never called. So the stages are
replaced by rounds by play: write what programs stop at, compare with the
firmware on random arguments, shadow-run the programs affected, play all
again.

- **Round 1, done:** `$E7D0`, `$E7DC`, `$E7DF`, `$E7E2`, `$E7F4`, `$E7F7`,
  `$E818`-`$E821`, `$D31A`, `$D435`, `$D5DC`, input mode 2 ↔ 1, far calls
  through a program's own entries naming an OS segment (阶梯小子), and a
  fix: a file over 4 KB had one sector and ran into the next file's. 114
  play 180 s.
- **Round 2, done:** `$E8C5`, circles `$E788` / `$E8BC` / `$E78B`, `$E8B9`;
  the text cursor `$E863`-`$E871` and its blink (CT); every status icon
  function, the bar graph `$E80F` / `$E8E3`, `$E8EF` / `$E8F2`; the message
  queue `$E92C` / `$E92F`; `$E7D3`, `$E7E5`, `$E8AD`, `$E8D4`; `$EA52` /
  `$EA64` with the sound off; runtime `$D4C0`, `$D534`, `$D604`, `$D65B`,
  `$D6F5`, `$D780`, `$DAC4`. 128 play 180 s, 5 end on their own.
- **Round 3, first part, done:** `$E9AD` (挖金子 plays), `$E99E` and the
  calendar under it (`$EBEF`, `$EBF2`, `$EBF5`, `$EBF8`, `$EC67`, `$EC6A`,
  `$E7EE`), `$E791`, `$EA25`. 129 play 180 s, 5 end on their own; 幸运花
  now stops at `$E980`.
- **Round 3, the help screen, done:** `$E980` / `$F262`, with `$E8CB`,
  `$E8CE`, `$E8E9`. 130 play 180 s.
- **Round 3, the menu, done:** `$E94D` and `$E96B` (but the OS's own help
  texts). 131 play 180 s, 5 end on their own: every program but the two
  that type Chinese.
- **Chinese input, done (the owner's choice):** the computer's own input
  method through a box in the player; the mode changes, their icon and
  messages as the OS's; `$E929`, `$D7F1`. 132 play 180 s, 6 end on their
  own: every program.
- **Then §16 (F9), phases 1 and 2 done:** a check of all 138 with every
  key and a code-flow scan found what random play with Enter, the arrows
  and space had missed: the Shift key stopped 7 programs, Exit stopped 2 at
  `$E8E0`, and the serial port's routines `$E90D` / `$E910` were not in the
  byte scan's list. All written; both scans find nothing Fulu lacks, and
  the every-key play test no stop (105 play 180 s, 33 end as on the
  device).
- **Separately:** the OS's page allocation for new files (§16.2 of the
  report). Sound stays off (the owner's decision): `$EA52` / `$EA64` act
  as with the sound off, and the shadow runs leave out their calls made
  with it on.
- **Tracking:** `src/app/fuluGames.ts` holds the programs Fulu should run
  and how far each has got, the owner's hand tests and the problems (with
  the owner's decisions); the Fulu page's progress tab (`/fulu/progress`)
  shows it and
  `docs/fulu-games.md` is written from it. Update it with each round.

## 16. F9: every program plays (plan)

**Goal.** Every one of the 138 programs plays on Fulu as on the device,
whatever the player presses and however far they get: no stop at
something Fulu lacks, and checked by more than random play.

**What is left** (the check of all 138: `fulu-coverage.mts`'s byte search,
`fulu-flow.mts`'s code flow, every key played for 180 s, and two read-only
reviews of the code; how a player reaches each call was traced, five sites
on the firmware):

| What the player does | Programs | Missing | Size |
|---|---|---|---|
| presses Shift (中英) | 平面魔方, 碰碰车, 对对碰, 搬运工, 滑雪, 宠物精灵, 电子宠物; 体闲麻将, 恶龙传说 in their Chinese input | GuiTranslateMsg's Shift (8:$67CC: the mode changes Fulu has; mode 0 returns 0), and the state the launcher leaves (input mode 2, `$2B28` = $0F, help word $FFFF) | ~60 |
| presses Exit (跳出) | 华容道, 滑雪 | `$E8E0`: the status bar's number blanked | 138 |
| types "bbk" on the pet screen (a cheat box); finishes the four rounds with a saved high-score list | 宠物精灵; 体闲麻将 | `$E706`: atol | 528 |
| links two devices (和朋友联机; 长腿哥's sending) | 宠物精灵, 恶龙传说 | `$E8D1` (serial port open), resident `$E90D` / `$E910` (send, receive), the receive interrupt | ~170, and no device at the other end |
| (no screen reaches it: the field takes a-d only) | 智多星 | `$E7BE`: a double-byte character drawn | 718 |

Also different, without a stop: the year is 0 (the launcher leaves 2004:
幸运花's calendar), the clock always starts at 12:00:29; sound off (the
owner's decision; the device starts with it on).

**Phase 1: what needs no new OS function.** Done.
1. The Shift key, as GuiTranslateMsg has it; compared with the firmware
   on random modes, keyboard states and keys.
2. The launcher's state: measure the RAM the firmware's launcher leaves at
   a program's entry against Fulu's (about 490 bytes of `$2000`-`$2FFF`
   differ), and take over what programs read: the keyboard state, the
   help word, the date and time. Shadow-run all programs after.
3. The every-key play test as a test of the round (all keys but the four
   system ones, Continue past each stop, each distinct stop recorded), and
   the code-flow scan in the round (`docs/fulu-workflow.md`).
4. The progress data and the site say what is true: the programs above
   stop where they do until it is written.

Done: Shift as GuiTranslateMsg has it (8:`$67CC`, compared with the
firmware on 20,000 random input modes, `$2B28` values, latch states and
keys); the launcher's state (`src/fulu/launcher.ts`, measured on nine
launches; the player sets the clock to the computer's date and time);
`scripts/bbk/fulu-play.mts` and `scripts/bbk/fulu-flow.mts` in the round
(`docs/fulu-workflow.md`).

**Phase 2: the missing functions** (the owner says when): `$E8E0`, then
`$E706`; the link (the owner decides how: as the device with no cable
plugged in, so each program shows its own "could not connect"; or more);
`$E7BE` last, or not at all.

Done: `$E8E0`, `$E706` (atol), `$E7BE`, each compared with the firmware on
random arguments; the link as the device with no cable plugged in (the
owner's decision: `$E8D1`, `$E90D`, `$E910`, `src/fulu/link.ts`; 宠物精灵's
建立连接失败 matches the firmware's screens once its emulator is given the
device's transmitter, without which it hangs on the first send). Both scans
now find nothing Fulu lacks in any of the 138 (the code flow's only hit,
`$F1BB` in 宠物精灵, is text taken for code), and the every-key play test
finds no stop in any.

**Phase 3: further than random play reaches.**
1. Every program on the firmware with every key, logging every OS function
   and resident routine it enters: what a program calls through a pointer
   (142 places in 106 programs the code-flow scan cannot follow: jump
   tables, JSRs and JMPs into RAM, far calls whose target is worked out
   while running; `fulu-flow.mts` counts them by kind) shows here,
   whether or not Fulu would stop.
2. Longer runs (30 minutes each) on Fulu and on the firmware with the same
   keys, compared (the shadow run) for the programs that changed.
3. The owner's hand tests of the long RPGs, with a list of what to try
   (saving, shops, battles, the endings).

Status: 1 done (180 s each with every key: 102 of the 106 API entries and
69 of the 75 resident routines in the programs' code entered, besides the far
call, and nothing outside it, none that Fulu lacks now; the calls
through pointers are covered as far as play reaches them); 2 done (the 12
programs that changed, 30 minutes of each of the two key scripts: 华容道,
滑雪, 体闲麻将, 智多星, 搬运工 and 幸运花 match the firmware throughout; in
宠物精灵, 电子宠物, 对对碰, 碰碰车, 平面魔方 and 恶龙传说 what differs is the
OS's own input bar (its memory and the screen it draws), once a program is
in Chinese input, and one byte of a new save's directory entry ($FF on the
device, $D0 on Fulu: 电子宠物, 宠物精灵); the other 97 programs, compared for
a minute each since: 92 match throughout, 4 differ in that save byte only
(武林新传, 洛特传奇, 仙三外传, 洛克人), and 武林新传 once in a message box's
timer count ($E953, `msgbox-timer`, open);
3 to come, with what to try in `docs/fulu-hand-tests.md`. The OS's own
input method stays unwritten (the owner's decision: the computer's is
used). Sound stays off.

**Done when** both scans find nothing Fulu lacks, the every-key run and
the firmware log find no stop, and the shadow runs match.

**Who does what.** The lead writes and ships. Helper agents, each with its
own brief: one per OS function (in its own worktree, with its firmware
comparison); a read-only one for the launcher's state; one for the
firmware log of all programs; the site updater and a fresh reviewer at the
end of each phase (`docs/fulu-workflow.md`).
