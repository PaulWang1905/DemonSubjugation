# The editor, version 2: a plan

**Goal.** Anyone who can describe a scene ("the old man in the square says
hello, gives you a lantern, and the gate opens") can make it, without
learning the engine's script language, while everything an author makes
still plays exactly as before (the same `.lib` / `.gam`, the same engine).

**What is hard now.** The editor shows the game as the engine stores it.
Maps are tiles, a walkable flag and an event number per cell; but who
stands on a map, what they say, what a tile does and where an exit leads
all live in GUT scripts: an assembly language of 80 instructions with
labels, jumps and a table of event numbers (1-40 an NPC talked to, 41+ a
map tile). An author has to know that `createnpc 3, 2, 5, 4` on the map's
load event and `.event 3` with its handler make a person who talks; that
items are `type, index` pairs; that the text box holds 11 or 15 letters.
The forms show raw numbers for references. Nothing shows the world as a
player sees it.

**Principle.** The scripts and resources stay the single source of truth:
no second file format, no lock-in. Every new view reads them and writes
them back, as text an author can still open in the script editor. What the
engine does not store (names for flags and variables, notes) is kept beside
the project in the browser and never needed to play.

## The new editor, as an author sees it

1. **A workspace**: a sidebar by what an author thinks about (Story, World,
   Characters & items, Art, Advanced), tabs for open things, a command
   palette (Ctrl+P: go to any map, script, character, flag), a project
   home with the game's name, start, size and a "what next" list.
2. **The world, on the map**: the map shows the people and boxes the
   scripts put there (their sprites), the player's start, event tiles and
   exits ("→ Forest"). Click a person: what they say. Drag them: their
   place changes in the script. "Add a person", "add a chest", "add an
   exit", "start the game here" are tools on the map. Rooms connect into a
   map of the world.
3. **Events as sentences**: an event is a list of steps in plain words
   ("Old man says: 'Hello!'", "Give the player Lantern ×1", "If flag
   *gate open* is set …", "Battle: 2 slimes; if lost: game over"), each
   with pickers (maps by name and preview, people by sprite, items by icon,
   flags by name), added from a searchable palette, reordered by dragging,
   with branches shown as indented blocks. The text view stays one click
   away and shows the same script.
4. **Dialogue as the player sees it**: the text box drawn in the game's
   font, with the portrait, line breaks and pages, live as you type.
5. **Characters, monsters, items, spells as cards**: sprites and icons, key
   numbers, pickers instead of numbers, "used by" (which scripts and
   resources refer to this), and renumbering that updates every reference.
6. **Help where it is needed**: a guided first game ("make a room, add a
   person, give them a line, playtest"), empty states that say what to do,
   the project check (already there) linked from every view, "play from
   here" (playtest starting on the map and tile you are looking at).

## Phases

Each phase ends with the build, all tests, screenshots of what changed, a
review, and a deploy of `main`.

**Phase 1: foundations** (two helper agents in parallel, separate files)
- *1a. The model* (`src/editor/format`, no UI): a catalog of the 80
  instructions with plain names, categories, sentence templates and what
  each operand means (a map, a person, an item, a flag, a variable, a
  tile, a direction, text, a label); a script model that reads a script
  into events made of steps (labels as markers, jumps as links, recognised
  patterns as blocks: choice, battle with win/lose, if flag) and writes it
  back unchanged when nothing changed (tested on every script of the three
  templates, byte for byte after assembly); a world index of the project
  (which map each script loads, who it creates there and where, which
  events are tiles, exits from map to map, the player's start, flags and
  variables used and where, who refers to what).
- *1b. The workspace* (`src/editor/ui`): the sidebar by topic, tabs,
  the command palette, the project home, and a registry so later views
  plug in by resource kind without touching the shell again.

**Phase 2: the visual tools** (three agents in parallel, each in new files,
on top of 1a and 1b)
- *2a. Events as sentences*, with the live dialogue box.
- *2b. The world on the map*: people, boxes, start, exits, event tiles;
  place, move, open; the world map of connected rooms.
- *2c. Cards and pickers*: characters, monsters, items, spells; reference
  pickers everywhere; "used by"; renumbering with references updated.

**Phase 3: making it easy to start, and proving it**
- *3a.* The guided first game; new-map, new-person and new-shop
  wizards; "play from here"; flag and variable names.
- *3b.* A fresh reviewer makes a small game from nothing with the visual
  tools only (a room, a person who gives an item, a door to a second room
  that opens with a flag, a battle, an ending), in a real browser, and
  reports what got in the way; fixes.

**Done when** that small game can be made without opening the text view,
plays the same in the editor's playtest and exported, and the three
templates' scripts survive the visual editor unchanged.

## Rules for the work

- Scripts stay text the engine's assembler reads; the visual views write
  the same text. A script the model cannot fully understand is shown with
  the parts it does understand as steps and the rest as "script lines"
  (editable as text), never rewritten or lost.
- Round-trip tests for every change to the model; the existing editor
  tests keep passing.
- The editor stays English, desktop-first (phones get the notice).
- Keep the site's look (src/styles.css, the home page's language).
- Helper agents work in their own worktrees and never push; the lead
  merges, checks and deploys.
