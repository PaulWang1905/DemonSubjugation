# FMJ React

A browser port of the engine behind the BBK electronic-dictionary RPGs
(步步高电子词典 RPG, e.g. 伏魔记, and the many community games built for the same
format), written in TypeScript with a React shell and deployable as a static
site on Vercel.

**No game content is included.** The engine plays resource archives that you
import yourself in the browser: a game archive (`DAT.LIB` or any `*.lib`) plus
the two system fonts `HZK16` and `ASC16`. Imported files are stored in the
browser (IndexedDB) and are never uploaded anywhere. Only use resources you have
the right to use.

## What it does

- Interprets the original `DAT.LIB` resource format: maps, tiles, sprites,
  characters, items, magic, special effects and the GUT story-script bytecode
  (80 opcodes).
- Exploration, NPCs, dialogue, shops, turn-based combat (attacks, magic, items,
  combined attacks, flee, auto-attack), levelling, equipment and three save slots.
- 160×96 screen rendered pixel-exact with integer scaling and selectable
  palettes (classic, LCD, paper, amber).
- Keyboard controls and an on-screen keypad for phones; 1×/2×/4× speed.
- Save slots are kept per game in `localStorage` and can be exported or imported
  as JSON.
- Also imports the hex-encoded `*.lib.js` / `rom.js` bundles used by the fmj.kt web
  builds.

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

`.gitignore` excludes `*.lib`, `HZK16` and `ASC16` so resources are not committed
by accident.

### Compatibility sweep

`tests/compat.test.ts` boots every `*.lib` under a folder, compiles all scripts
and plays a few thousand ticks with scripted input:

```bash
FMJ_DATA_DIR=/path/to/fonts FMJ_COMPAT_DIR=/path/to/libs FMJ_COMPAT_REPORT=report.txt npm test
```

On the 139-archive community collection in baye-fmj-app, all 135 playable
archives ran without errors; the other 4 are not RPG archives and are rejected at
import. 11 of the 135 contain a script with an unknown opcode, which now ends that
script early.

## Deploying on Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository.
3. The framework preset (Vite), build command (`npm run build`) and output
   directory (`dist`) come from `vercel.json`. Deploy.

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
  app/                 React shell: library/importer, player, keypad
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
- Physical damage uses the formula recovered from the original engine (fork),
  switchable back to fmj.kt's simplified formula under *Controls & options*.
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

Not implemented yet (also missing upstream): music, buff/debuff round counting,
enhancement and auxiliary magic effects in battle, the settings item of the system
menu, and the show-position opcodes.

## Credits and licence

- Engine ported from [fmj.kt](https://gitee.com/bgwp/fmj.kt) by bgwp, licensed
  GPL-2.0, which this port is a derivative of.
- Fixes and extra opcodes from
  [erduoniba/baye-fmj-app](https://github.com/erduoniba/baye-fmj-app).
- Earlier lineage: the Android, Java and C# ports listed in those projects.

This project is licensed under the **GNU General Public License v2.0** (see
`LICENSE`). Game titles, story, art and other content in BBK archives belong to
their respective owners and are not part of this project.
