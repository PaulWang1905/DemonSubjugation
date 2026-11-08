# FMJ React

A browser port of the engine behind the BBK electronic-dictionary RPGs
(步步高电子词典 RPG, e.g. 伏魔记, and the many community games built for the same
format), written in TypeScript with a React shell and deployable as a static
site on Vercel.

It also emulates the **Longman 4988 dictionary itself** (步步高朗文 4988): a
65C02 and the device's hardware, running its own firmware, so any program made
for it (`*.gam`) plays as on the device. See [Device emulator](#device-emulator-longman-4988).

**No game content is included.** The engine plays resource archives that you
import yourself in the browser: a game archive (`DAT.LIB` or any `*.lib`).
The original bitmap fonts `HZK16` and `ASC16` are optional: without them, text
is drawn with the fonts installed on the player's device (each character is
rendered once to a 1-bit 16x16 glyph and cached). Imported files are stored in the
browser (IndexedDB) and are never uploaded anywhere. Only use resources you have
the right to use.

## What it does

- **The Silent Bell**, the built-in demo: an original game of about twenty
  minutes, built entirely in code (`src/editor/template/silentBell.ts`).
  Five areas, two party members, a lever puzzle, a shop, an inn, a ferry,
  four bosses and an ending. It can also be opened in the editor.
- The launch page plays the original *Lantern Path* demo live, starts it in one
  click, and takes `.lib` files dropped anywhere on the page.
- Interprets the original `DAT.LIB` resource format: maps, tiles, sprites,
  characters, items, magic, special effects and the GUT story-script bytecode
  (80 opcodes).
- Exploration, NPCs, dialogue, shops, turn-based combat (attacks, magic, items,
  combined attacks, flee, auto-attack), levelling, equipment and three save slots.
- 160×96 screen rendered pixel-exact with integer scaling and selectable
  palettes (classic, LCD, paper, amber). On a computer, **Size** − / + zooms
  the screen one device pixel per game pixel at a time (so every pixel stays
  the same size), from small up to the whole window; the percentage goes back
  to the usual size.
- **Map view**: Original (9×6 tiles), Wider (13×8) or Widest (17×10). The
  game still runs on its 160×96 screen (same camera, scripts and events);
  the engine draws more of the map, its people and the hero around it while
  the map is shown. Dialogue boxes (with their portraits) go to the bottom
  of the view, as on the device; menus and effects stay in the middle (each
  frame keeps the pixels where the game's screen differs from its plain map),
  and battles and full-screen pictures get plain margins. Frames the game
  does not redraw keep the view as it was, so nothing flickers.
  `engine.setView(mx, my)` sets it while playing.
- **Text**: three menus. **Text** is the look: **Pixel** (the device's
  16×16 bitmap fonts, enlarged with hard edges) or **HD** (characters redrawn
  at the display's full resolution while the rest of the picture stays
  pixel-exact). **Chinese** and **English** pick a font for each, from lists
  that follow the look, and can be mixed; each look keeps its own pair, and an
  English game lists English first.
  - Pixel fonts: the bundled ones below, or the HZK16 / ASC16 files when
    added ("Original files").
  - HD Chinese: 黑体 Sans (Noto Sans SC), 宋体 Serif (Noto Serif SC) and
    楷体 Brush (LXGW WenKai Mono), the same on every device, or the device's
    own sans or serif; each loads only when chosen (WenKai only the parts with
    characters on screen).
  - HD English: the Chinese font's own letters, or IBM Plex Mono, JetBrains
    Mono, Fira Mono, Space Mono, Atkinson Hyperlegible Mono, Courier Prime or
    VT323 (old terminal).
  - For HD the engine reports where it drew each character and the player
    checks the pixels each frame, so text that menus or borders cover keeps
    the covering pixels.
- **Effect**: LCD (each lit pixel a cell of a handheld screen, with a fine
  gap between lit cells and a clean background; HD text gets the same
  cells), LCD + shadow (lit cells and text also cast a soft shadow on the
  glass) and Smooth (experimental: Scale2x twice on shapes, outlines and
  portraits, while grass, dithering and text are kept exactly as drawn).
  Effects draw at the display's resolution and work with every Text choice
  and Map view.
- **Bundled pixel fonts** in the device's 16-pixel layout, so games look
  like the handheld without the original font files: **Retro** (bold Ark
  Pixel Chinese, Press Start 2P letters; the default without the original
  files), **Ark Pixel** (sans) and **Unifont** (serif). Chinese and letters
  can come from different ones; they load only when chosen and can be
  switched while playing. Built by
  `scripts/fonts/build_fonts.py`; credits and licences (SIL OFL 1.1) are in
  [public/fonts/LICENSES.md](public/fonts/LICENSES.md).
- **Site language**: the front page, Games, Guide, About, the top bar and
  the footer are in Simplified Chinese or English, following the browser's
  languages, with a 中文 / EN switch in the top bar (the player's toolbar,
  options and keypad too; the debug menu and the editor are still English).
- Keyboard controls, and a full-screen phone layout: the screen as large as it goes, a big on-screen keypad (slide the thumb on the d-pad to turn, hold a direction and A together), controls either side of the screen when held sideways, options in a sheet that pauses the game. Add it to the home screen to play without the browser bars. Held keys repeat at one rate on every device; 1×/2×/4× speed.
- **More text (experimental, off by default)**: dialogue, message boxes,
  script menus, descriptions and scrolling story text can use 12- or 10-pixel
  text instead of the device's 16, so more fits on a page (the first
  dialogue of 伏魔记's opening fits in one box instead of two or three). The
  layout folds the spaces games used to break lines, keeps Latin words whole
  and keeps closing punctuation off the start of a line. Pixel text at these
  sizes uses fonts drawn for them (Cubic 11 and X11 6x12 at 12 pixels,
  Boutique Bitmap 9×9 and X11 5x8 at 10, in bold for Retro 8-bit) instead
  of shrinking the 16-pixel ones.
- **Hidden debug menu** for testing: press and hold the game screen for two
  seconds (mouse or finger; a ring fills while you hold). The game pauses while
  it is open. It edits party stats, money, items, spells and story flags, and
  has switches for no random battles, walking through walls and an always-full
  party, plus "win this battle".
- **Add from a link**: paste a GitHub folder (browse it and pick games), a
  GitHub file page, a direct `.lib` link, or a web folder that lists `.lib`
  files. The games are downloaded into the browser; nothing is bundled with
  the app. GitHub allows 60 folder listings an hour without signing in.
- Save slots are kept per game in `localStorage` and can be exported or imported
  as JSON.
- Also imports the hex-encoded `*.lib.js` / `rom.js` bundles used by the fmj.kt web
  builds.

## Device emulator (Longman 4988)

`src/bbk/` emulates the dictionary the games were made for, at the hardware
level, so it runs whatever the device runs: every program, not only those
built on the fmj engine, and the dictionary itself.

- **CPU**: a WDC 65C02 core with every instruction and its cycle count
  (`cpu.ts`), checked against the SingleStepTests suite and Klaus Dormann's
  functional tests.
- **Hardware** (`machine.ts`): 16 banks of 4 KB over 16 MB of physical memory
  (32 KB RAM, 2 MB NOR flash, font, data and OS ROMs, four dictionary channels
  switched by port B), the DATA1-4 address ports, the four system timers, the
  CT timer, the real-time clock with its alarm, the interrupt controller with
  the OS's vector table at `$0300`, halt, and the keyboard controller. The
  flash (`flash.ts`) answers the JEDEC command sequences: byte program, sector,
  block and chip erase, software ID and CFI.
- **Screen** (`lcd.ts`): 159×96 from RAM `$0400`, in the controller's line
  order, plus its status icons.
- **Programs** go into the OS's flash file system the way the PC download tool
  put them there (`flashfs.ts`), and start from the OS's own 游戏 menu with the
  key presses a person would use (`device.ts`), so the OS sets everything up as
  on the device. Nothing of the OS is imitated.

The firmware is not included. Add the dumps on the Games page; the OS
(`0E00.DAT` or `E.BIN`) and the font ROM (`4988.font` or `8.BIN`) are enough,
and the data ROMs, dictionary channels and factory flash (`4988.flash`) make
the dictionary complete. With a blank flash the OS formats it itself.

In the player, a device program installs, boots and opens in about a second.
The device is kept as it was left (memory and flash, so the game's own saves
too) and resumes there next time; **Restart the device** starts afresh.
Programs built on the fmj engine also offer **Remastered**: the same game in
this site's engine, with HD text, the wider map views and English menus.
**Longman 4988** on the Games page turns on the dictionary itself.

On a 138-program collection (RPGs, card and board games, puzzles, action
games, the dictionary's built-in programs) every program installs and starts.

## Editor (work in progress)

The **Editor** tab builds games in the same format:

- **New project** from the original *Lantern Path* demo or a blank starter game.
  Both ship original system graphics, tiles, sprites, sample monsters, items and
  spells, so a new game needs nobody else's files. You can also open a `.lib`
  you have the right to modify.
- **Resource browser** grouped by kind, with previews of images, sprites,
  tilesets and animations.
- **Map editor**: paint and fill tiles, mark walkable/blocked tiles, place map
  events, rename and resize maps, with undo/redo (Ctrl+Z / Ctrl+Y). The dashed
  box shows where the player can stand.
- **Script editor**: the story scripts as readable text with labels (see the
  built-in instruction reference). Errors point at the line. Your own text and
  labels are kept with the project.
- **Forms** for party members, NPCs, objects, monsters, all item and magic
  kinds, spell lists and level tables (only the edited bytes change).
- **Pixel editor** for tiles, sprites, portraits, icons and pictures: pen,
  fill, picker, undo/redo, frames, resize, PNG import (also slicing a sheet
  into frames) and export.
- **Animation editor** for spell, item and cut-scene effects: a preview played
  by the engine's own animation code, a frame list (image, position, timing),
  dragging frames on the screen, warnings for timings that cut an animation
  short, and the pixel editor for each image.
- **Add** blank tilesets, sprites, portraits, battle sprites, backgrounds,
  pictures, item icons and animations (sized like the game's others); a new
  party member also gets a portrait and battle sprite. Any resource can be
  duplicated, given another number or deleted.
- **Playtest** runs the project in the engine; **Export .lib** downloads it.
- Projects are saved automatically in the browser (IndexedDB).

Script example:

```
.gut 1 1
.events 41
.event 1 @talk          ; NPC 1 was talked to
.event 41 @exit         ; the player stepped on map event 1

@start:
  loadmap 1, 1, 4, 4
  createactor 1, 4, 3
  createnpc 1, 1, 10, 6
  callback
@talk:
  say 0, "Hello there!"
  if 12, @done
  gaingoods 9, 1
  setevent 12
@done:
  callback
@exit:
  startchapter 1, 2
```

The engine's own menus come in Chinese and English; the language follows the
game title by default and can be changed in the player's options.


## Controls

| Action         | Keys                         |
| -------------- | ---------------------------- |
| Move / select  | Arrow keys, WASD             |
| Confirm        | Enter, J, Z                  |
| Back / menu    | Esc, Space, K, X             |
| Page up / down | `[` `]`, Q E, PgUp PgDn      |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (synthetic archives, no game data needed)
npm run build      # type-check + production build into dist/
```

Optional integration tests and frame snapshots run against real resources you
keep outside the repository:

```bash
FMJ_DATA_DIR=/path/to/folder/with/DAT.LIB+HZK16+ASC16 npm test
FMJ_DATA_DIR=... FMJ_SNAPSHOT_DIR=/tmp/frames npm test   # also writes PNG frames
```

`.gitignore` excludes `*.lib`, `*.gam`, `HZK16`, `ASC16` and the firmware dumps
so resources are not committed by accident.

The device emulator has its own optional tests:

```bash
BBK_CPU_TESTS=/path/to/cpu-tests npm test     # wdc/<op>.json (SingleStepTests 65x02, wdc65c02/v1)
                                              # and Dormann's 6502_functional_test.bin, 65C02_extended_opcodes_test.bin
BBK_FIRMWARE=/path/to/4988-dumps BBK_GAMES=/path/to/gams npm test   # boot, then install and start every .gam
```

### Compatibility sweep

`tests/compat.test.ts` boots every `*.lib` under a folder, compiles all scripts
and plays a few thousand ticks with scripted input:

```bash
FMJ_DATA_DIR=/path/to/fonts FMJ_COMPAT_DIR=/path/to/libs FMJ_COMPAT_REPORT=report.txt npm test
```

On a 139-archive community collection, all 135 playable
archives ran without errors; the other 4 are not RPG archives and are rejected at
import. 11 of the 135 contain a script with an unknown opcode, which now ends that
script early.

## Deploying on Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository.
3. The framework preset (Vite), build command (`npm run build`) and output
   directory (`dist`) come from `vercel.json`. Deploy.

Visitor counts use [Vercel Web Analytics](https://vercel.com/docs/analytics)
(`<Analytics />` in `src/main.tsx`). Turn it on under the project's
**Analytics** tab; it records page views only, without cookies, and game files
never leave the browser. On other hosts the component does nothing.

Any static host works the same way: serve the `dist/` folder.

## Layout

```
src/
  engine/              the engine (no React, no DOM besides TextDecoder)
    index.ts           public API: createEngine(), inspectDatLib(), Keys
    java.ts            stand-ins for the JVM/Kotlin runtime + platform hooks
    graphics.ts        Bitmap / Canvas software raster (RGBA)
    fmj/               one file per fmj.kt source file, same package layout
      lib/             DAT.LIB reader and resource types
      script/          ScriptVM (GUT bytecode), shops, script state
      scene/           map screen, save/load
      combat/          battle controller, actions, battle UI
      characters/ goods/ magic/ gamemenu/ views/ graphics/
  editor/
    format/            LIB reader/writer, script assembler, encoders, decoders
    template/          original starter art, blank project and the demo game
    ui/                editor screens (resource list, map and script editors)
  bbk/                 the Longman 4988: 65C02, hardware, flash, LCD, file system, device
  app/                 React shell: library/importer, players, keypad
  storage/             IndexedDB (archives, fonts) and localStorage (saves)
tests/                 vitest: unit tests + optional real-data tests
```

The engine API is small:

```ts
import { createEngine, Keys } from "./src/engine";

const engine = createEngine({ resources: { datLib, hzk16, asc16 }, saves });
setInterval(() => {
  engine.update();            // one 40 ms tick (update + draw)
  const rgba = engine.render(); // 160×96 RGBA frame
}, 40);
engine.keyDown(Keys.ENTER);
engine.keyUp(Keys.ENTER);
```

## Differences from fmj.kt

The port follows fmj.kt closely (same classes, same timing, same save layout).
Deliberate changes:

- Opcodes 4, 5, 7, 8, 15, 17, 18, 19 and 25, unassigned in fmj.kt, decode as in
  the baye-fmj-app fork (`EVENT`, `MONEY`, `GUTEVENT` work; the rest are no-ops)
  so scripts that use them no longer abort.
- `DELETEGOODS` reads its jump address from the right operand (fork fix).
- `GAMESAVE` only closes its own screen, and cancelling it resumes the script (fork fix).
- **Original engine rules** (on by default, under *Controls & options*): hit
  and miss, physical and spell damage, defending, fleeing, the encounter rate,
  turn order, enemy spells and AI, statuses (poison, confusion, seal, sleep,
  stat changes with round counts), the group attack, battle items, stealing,
  recovery after a win, levelling, drops, the bag and many script commands
  (byte-wide variables, money limits, goods tests) follow the original engine as
  reconstructed in [fmj-engine](https://gitee.com/BA4988/fmj-engine). Turning
  the option off restores fmj.kt's simplified rules. See
  [docs/original-engine-alignment.md](docs/original-engine-alignment.md) for
  the comparison and what still differs.
- Script chapters of type 255 load (fmj.kt read resource types as signed
  bytes, so they were missing; mods such as 伏魔圆梦 keep their extra systems there).
- `CALLCHAPTER` runs the chapter before the caller goes on, and `RETURN` ends
  the running script, handing back to the caller, as in the original. In
  fmj.kt the caller ran on at once and `RETURN` let the script continue past it.
- Healing magic now works in battle (fmj.kt's overload was never called).
- Thrown weapons and party-wide medicine apply their effect (TODOs in fmj.kt).
- Combined attacks deal their magic's damage (fmj.kt only played the animation).
- Level-up "learned magic" screens show the newly learned spell.
- Saves always write the magic-chain field, which fmj.kt could skip.
- Tolerates damaged community archives instead of crashing: missing images and
  animations draw as blank placeholders, scripts stop at an unknown opcode (and
  `engine.checkScripts()` reports it), invalid jumps end the current script, and
  unsupported `ATTRIB*` codes are ignored. Set `ScriptVM.strict = true` to make
  decode problems throw. Saves made before the party exists load normally.
- The importer rejects archives without a starting script (GUT 1-1), such as
  三国霸业 (Three Kingdoms Hegemony) files, which use a different engine.

- Follows the original where fmj.kt left gaps: the system menu's **Settings**
  item opens the original's Music on / Music off list, ENABLESHOWPOS /
  DISABLESHOWPOS show the map position in the top-left corner (with the
  archive's label picture 2-17), and the MUSIC command keeps the melody and
  its plays. All of these are saved. Enhancement magic and buff/debuff rounds
  also work with the original battle rules off.

Music itself is silent: MUSIC asks the handheld for one of its built-in
melodies by number, and those tunes are in the device, not in any game file.
伏魔记 never uses MUSIC; about 10 of the 139 games in the
[baye-fmj-app collection](https://github.com/erduoniba/baye-fmj-app) do.

## Credits and licence

- Engine ported from [fmj.kt](https://gitee.com/bgwp/fmj.kt) by bgwp, licensed
  GPL-2.0, which this port is a derivative of.
- Fixes and extra opcodes from the baye-fmj-app fork of the engine.
- Battle rules checked against [BA4988/fmj-engine](https://gitee.com/BA4988/fmj-engine),
  a GPL-2.0 C reconstruction of the original engine (no code copied; the
  formulas are re-implemented).
- Earlier lineage: the Android, Java and C# ports listed in those projects.
- The 4988's hardware was worked out from the emulators
  [BA4988/BBK-simulator](https://gitee.com/BA4988/BBK-simulator) (GPL-2.0, by 无云)
  and [gam4980](https://codeberg.org/iyzsong/gam4980) (GPL-3.0), and from the
  firmware itself; the emulator here is written anew (no code copied).
- CPU tests: [SingleStepTests 65x02](https://github.com/SingleStepTests/65x02) and
  [Klaus Dormann's functional tests](https://github.com/Klaus2m5/6502_65C02_functional_tests)
  (fetched for testing, not included).

This project is licensed under the **GNU General Public License v2.0** (see
`LICENSE`). Game titles, story, art and other content in BBK archives, and the
4988's firmware, belong to their respective owners and are not part of this project.
