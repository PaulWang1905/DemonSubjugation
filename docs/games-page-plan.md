# The Games page (2026): plan

The site now has three engines, and the Games page hides them: a `.gam`
plays on the original OS if its files were added, on Fulu otherwise, and in
FMJ React ("Remastered") when it carries a library. There is no choice, the
cards overflow (a `.gam` card's buttons do not fit), firmware and fonts are
two lines of small print, and the page is in the site's older style (rounded
cards) while the home page is editorial: square edges, hairline rules,
monospaced labels and numbers, Geist, one signal colour (the LCD's lime).

## Logic

- **Engines** (src/app/engines.ts): `react` (FMJ React, this site's engine:
  `.lib`, and a `.gam`'s library), `fulu` (the stand-in OS, for any `.gam`),
  `original` (BBK's firmware, emulated: needs its files). `enginesFor(game)`
  lists the ones a game can use, each ready or not and why.
- **A choice per game**, remembered in the browser. The default is what Play
  did before: the original OS when its files are there, Fulu otherwise; a
  `.lib` has only FMJ React.
- **Fulu and the original OS keep separate saved devices** (a device saved on
  one does not resume on the other): the original keeps `gam:<id>`, Fulu
  `gam:<id>:fulu`; a Fulu device saved under the old key resumes once and
  moves. Removing a game forgets both.
- The device player is told which OS to run instead of choosing by itself.

## Look

The home page's language, on the light paper:

1. **Head**: an editorial title row (mono eyebrow, big tight title, lead), with
   "Add a game" as the page's one dark button and "or drop files anywhere".
   Messages from adding files are one status strip (mono, an LCD dot), not
   a bulleted box.
2. **Library**: a grid of tiles divided by hairlines (like the home page's two
   demos): the LCD cover with its number and the name in pixel type; a mono
   meta line (kind · size · date); the title; the description; for a `.gam`,
   an **engine switch** (square segments: Original · Fulu · FMJ React; one
   that is not ready is greyed with the reason); Play, full width, dark, with
   its arrow; Remove as a quiet text button. The locked game and "Add a game"
   are tiles of the same grid; the 4988 itself is a tile when its firmware is
   there. Columns from the width (one on a phone), nothing overflows.
3. **Engines**: a section like the home page's numbered rows, 01 FMJ React,
   02 Fulu, 03 Original OS, each with what it is for and its state (built
   in; ready with n files; or the files to drop), and the optional original
   fonts. This is where firmware and fonts are added (dropping works
   anywhere).
4. **Add from a link**: the same form under a section rule.

Checked by screenshots at desktop and phone width, light and dark, with demos,
a locked game, `.lib` and `.gam` games, with and without the firmware; the
engine switch playing each engine; no horizontal scroll.

## Status: done

src/app/engines.ts, Library.tsx and Tile.tsx (LockedCard on the same tile),
DevicePlayer's `os`, the Games styles at the end of src/styles.css. Checked in
the browser: each engine plays 伏魔记 (FMJ React, Fulu, and the original once
its files are added: the switch then offers it, the Original OS row reads
ready), the choice survives a reload, Original OS is greyed without the
files; desktop and phone, light and dark, English and Chinese; the document
never wider than the window.
