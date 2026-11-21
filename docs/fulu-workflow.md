# Fulu: how the work is done

How Fulu is extended and shipped, and how the work is shared between the
lead (the session working with the owner) and helper agents. The technical
background is in `docs/fulu-report.md`, the plan in `docs/fulu-plan.md`,
what has been learned in `docs/fulu-notes.md`, and the state of every
program in `src/app/fuluGames.ts` (written to `docs/fulu-games.md`).

## Branches and deploying

- Work and commit on **`main`** only, and push only `main`: Vercel deploys
  it (https://fumo-game.vercel.app). Other branches are not pushed: their
  preview deployments cost money and are not needed.
- Check a deploy: `gh api repos/PaulWang1905/DemonSubjugation/commits/<sha>/statuses --jq '.[0].state'`
  until it says `success`.
- Push once per finished piece of work, not after every step.
- Never commit game files (`*.lib`, `*.gam`, `HZK16`, `ASC16`) or firmware.

## Checking before a commit

Both must pass:

```bash
npm run build
```

```bash
BBK_GAMES=<folder of .gam> FMJ_DATA_DIR=<folder with HZK16, ASC16> BBK_FIRMWARE=<firmware folder> npx vitest run
```

- `BBK_FIRMWARE` (the firmware dumps) turns on the comparisons with BBK's
  OS (`tests/fulu-shadow.test.ts`); `BBK_GAMES` adds the games' shadow runs
  (`BBK_SECONDS` of play each, 30 by default).
- In the random-argument tests, `FULU_ONLY=E9AD,E791` runs only those
  functions' cases and `FULU_TRIALS` sets the trials; `FULU_COUNTS=1` prints
  which OS functions the menu test reached.
- Temporary tests are named `tests/zz-*.ts` and are never committed (keep
  copies outside the repository).

## A round

1. **Scan and play** all 138 programs of the collection: two code scans
   say what each program's code can call that Fulu lacks: the byte search
   (`npx tsx scripts/bbk/fulu-coverage.mts <roms folder> <0E00.DAT> --programs`),
   and the code flow (`npx tsx scripts/bbk/fulu-flow.mts <roms folder>`,
   which also says how much of each program's code it followed, what it
   cannot follow, and any code it missed); the play test (180 s on Fulu
   alone with **every key** a player can press but the four system keys,
   Continue past each stop, each distinct stop recorded) says where each
   stops in play. Random play with a few keys is not enough: Shift and
   Exit stopped 8 programs that Enter, the arrows and space never did.
2. **Write** what programs stop at: read the OS function
   (`node scripts/bbk/os-function.mjs <0E00.DAT> <entry>`, and
   `seg:addr,addr` for code behind a switch's table;
   `node scripts/bbk/fold-c.mjs` to read compiled C), write it in
   `src/fulu` (compiled C through `compiled.ts`'s idioms and the runtime's
   helpers, flags and all), with its tables made, not copied from the ROM.
3. **Compare** it with the firmware on random arguments (a case in
   `tests/fulu-shadow.test.ts`), then **shadow-run** the programs that use
   it (`BBK_GAMES` set to a folder with just them, `-t "while games play"`).
4. **Play all 138 again**, and update the data: `src/app/fuluGames.ts`
   (each program's status and scan, the problems, what is left, the
   history and milestones, the counts), then
   `npx tsx scripts/bbk/fulu-games-doc.mts`, and the report, plan and notes.
5. Check (above), commit on `main`, push, check the deploy.

The owner's decisions go into `PROBLEMS` (`decision`), and what the owner
plays and reports into `HAND_TESTS`, as reported.

## Helper agents

The lead may hand independent pieces to helper agents. Each is given what
it needs in its brief (paths, commands, the files to read), works on its
own, and reports back; the lead checks what comes back, merges, runs the
checks and ships once. Agents never push.

1. **Scanner** (reads only). Scans every program's code (the code scan) and
   plays every program (the play test), and reports for each: playable by
   the scan (calls nothing Fulu lacks), how it did in play (plays, ends on
   its own, stops at what), and where this differs from
   `src/app/fuluGames.ts`. It changes nothing in the repository (its
   temporary test is removed afterwards).
2. **Site updater** (in its own worktree). Brings the progress data, its
   document, the Fulu page, the progress report page and the Games page's
   texts up to date with the work so far, runs the checks, commits in its
   worktree, and reports what it changed; the lead reviews it and merges.
3. **Reviewer** (reads only, fresh context). Reads the code changed since
   the last review for bugs and errors, without being told what the lead
   thinks of it, and reports each finding with the file and line, what goes
   wrong and when. It changes nothing.

When the owner asks for several independent OS functions at once, one
agent each writes one in its own worktree (a new file in `src/fulu`, its
cases in `tests/fulu-shadow.test.ts`), compares it with the firmware, and
commits in its worktree; the lead merges them, runs everything, and ships
once.

After the agents finish, the lead reports to the owner what each found and
what was shipped.
