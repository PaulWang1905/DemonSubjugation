# Fulu: the games

<!-- Written by scripts/bbk/fulu-games-doc.mts from src/app/fuluGames.ts: change that file, then run the script. -->

The programs Fulu should run, how far each has got, the ones the owner has
played by hand, and the problems known. The programs are the bbk-games
collection's 138 for the Longman 4988 (`eebbk/roms`). The site's Fulu page
shows the same lists, in its progress report (/fulu/progress).

Updated 2026-11-21.

- **On Fulu alone** (180 s each of random keys from every key a player can press, `scripts/bbk/fulu-play.mts`, docs/fulu-report.md §16): 105 play the whole time, 33 end as on the device (their `main` returns: a game-over box, a menu's quit, Exit; the test starts them again), 0 stop at something Fulu lacks.
- **Compared with BBK's firmware** (the shadow run): 7 in full (their code traced, play, typing and saves compared), 34 for a minute of play.
- **Tested by hand**: 2 reports (below).
- **Problems**: 4 open, 10 decided or fixed.
- **Code scan** (`scripts/bbk/fulu-coverage.mts --programs`): 138 programs call nothing Fulu lacks. The programs call 107 OS functions (Fulu answers 107) and 63 runtime routines (all answered); about 48,400 instructions of OS code are written and 0 left, not counting the OS's own input method (Fulu takes Chinese from the computer's own instead).

## How it got here

Up to Chinese input the play test pressed Enter, the arrows and space; from F9, every key (Shift and Exit included), so more programs end.

| Step | Play 180 s | End as on the device |
|---|---|---|
| First play of all 138 | 103 | 0 |
| Round 1 | 114 | 3 |
| Round 2 | 128 | 5 |
| Round 3, first part | 129 | 5 |
| Round 3, the help screen | 130 | 5 |
| Round 3, the menu | 131 | 5 |
| Chinese typed with the computer's input method | 132 | 6 |
| Every key, Shift and Exit included | 105 | 33 |

| Date | Step | What |
|---|---|---|
| 2026-11-08 | F1 | **The foundation**: The OS's memory filled with one trapping byte; the far call, the C runtime and the interrupts reach TypeScript. The shadow run compares Fulu with BBK's firmware from the same machine state. |
| 2026-11-08 | F2 | **The seven games' OS functions**: The 55 functions the 伏魔记 series and 英雄坛说 call: screen, text, keys and messages, the heap, the GUI's start-up, the message box. A minute of play of each: 0 differences. |
| 2026-11-08 | F3 | **Play without firmware, on the site**: Fulu becomes an engine on the Games page. |
| 2026-11-09 |  | **Saving, the Yes/No dialog, the device's pace**: The file functions (saves stay in the browser), the dialog, and a cost model that charges each call the firmware's measured time. |
| 2026-11-09 | F4, F7 | **HD text and the debug menu**: Every character Fulu draws can be redrawn in a real font; a menu reads and changes party, items and story flags. |
| 2026-11-18 | F5, F6 | **Wider map view and More text**: For the RPG kit's games: more of the map around the device's screen, and dialogues and message boxes in smaller type, more per page. Both checked by hand by the owner. |
| 2026-11-20 |  | **三国霸业, the seventh game**: Three more OS functions and eight floating-point routines; checked against the firmware in full. |
| 2026-11-20 | F8 | **The whole collection, in rounds**: All 138 programs played on Fulu: 103 ran the whole time. Round 1 (small OS functions, the runtime's divides) took it to 114; round 2 (bitmaps, circles, the text cursor, the status bar, the message queue) to 128, and 5 more end on their own. |
| 2026-11-20 | F8 | **Round 3, first part**: A number drawn in a radix ($E9AD: 挖金子 plays), today's date and the calendar under it ($E99E and seven more), a whole screen from memory ($E791) and taking a message from the queue ($EA25), each compared with the firmware on random arguments. 幸运花 now gets past its date to the help screen ($E980). Measured on the way: $E94D is 5,278 instructions with its key cases, and the input methods need the OS's pinyin tables. |
| 2026-11-20 | F8 | **Round 3: the help screen**: $E980, a text shown a page at a time and scrolled by the keys, with the screen saved and put back ($E8CB, $E8CE) and the cursor's state ($E8E9): compared with the firmware on 200 random texts and key sequences, and in 幸运花's play. 幸运花 plays; the 43 programs that can call it no longer stop there. |
| 2026-11-20 | F8 | **Round 3: the menu**: $E94D, a menu of items in a grid with its own key loop (arrows, page keys, 1-9 and A-Z, Enter, Exit, help), with $E96B for its help key: compared with the firmware on 300 random menus and key sequences, and in 中国象棋's play. 中国象棋 plays: every program now plays but the two that type Chinese. |
| 2026-11-20 |  | **Continue past a stop**: A program that meets something Fulu lacks no longer ends there: Continue skips it (the call returns as if done) and the game plays on. |
| 2026-11-20 |  | **Chinese typed with the computer's own input method**: When a program switches to Chinese input, the player shows a box for the computer's or phone's own input method, and Fulu gives what is typed to the program as the OS's input method gives a chosen character; with $E929 and $D7F1, 宠物精灵 plays and 电子宠物 plays until it ends. Every program of the collection now plays or ends as on the device. |
| 2026-11-20 |  | **This progress report; sound kept off**: The games list, the owner's hand tests and the problems in one place. The owner decided to keep the sound off for now. |
| 2026-11-21 | F9 | **Every key, and every path the scans find**: A check of all 138 with two code scans (the byte search and a new code-flow scan), a play test pressing every key and a log of all 138 played on BBK's firmware found what random play with Enter, the arrows and space had missed. Done: the Shift key as GuiTranslateMsg has it; programs start in the state BBK's launcher leaves, with the device's clock set to the computer's date and time; $E8E0 (Exit in 华容道 and 滑雪), $E706 (atol: 宠物精灵's cheat box, 体闲麻将's high scores), $E7BE (智多星's answer field), and the link cable as the device with no cable plugged in, each compared with the firmware. Now both scans find nothing Fulu lacks in any program, the every-key play test finds no stop in any, and the firmware log found nothing a program entered that Fulu lacks (102 OS functions and 70 routines entered in all, calls through pointers included). |

## What is left

Nothing the checks find: both code scans find nothing Fulu lacks in any program, the every-key play test no stop, and the firmware log nothing a program entered that Fulu lacks. What they cannot reach (the long RPGs' endings, say) is covered only by hand tests. Not counted: the OS's own input method (not written: the computer's is used) and sound (kept off).

## Problems

| | Problem | Status | Decision | Games |
|---|---|---|---|---|
| `sound` | **Sound**: Fulu plays no sound, and keeps the sound off. Programs that switch the sound on ($EA52, $EA64: Eros方块, 二十四点, 滑雪, 豪斯 on the original OS) run as if it were off; their sound-on paths are not written, and the firmware comparison leaves those calls out. | decided | Keep the sound off; ignore sound-on for games that ask for it. The owner will decide later whether to do more. | Eros方块, 二十四点, 滑雪, 豪斯 |
| `input-methods` | **Chinese input: the computer's own input method**: The OS's own input method (its pinyin bar, about 3,800 instructions, and its tables of pinyin and hanzi, which Fulu cannot copy) is not written. Instead, when a program switches to Chinese input (modes 4 and 8), the player shows a box under the screen: what is typed there with the computer's or phone's own input method (pinyin, handwriting, any) goes to the program as the OS's input method gives a chosen character (a message of type 3 with its GB2312 code). The mode changes, their icon and messages are the OS's; BBK's bar is not drawn, and letters pressed on the device go to the box's place (not to the program, as on the device while typing). In the firmware comparison those calls differ in the input method's own scratch only. 宠物精灵 plays; 电子宠物 plays until it ends, as on the device. | decided | Use the computer's or phone's own input method (the owner's choice). | 宠物精灵, 对对碰, 恶龙传说, 电子宠物, 碰碰车 |
| `e94d` | **$E94D (a menu)**: A menu of items in a grid with its own key loop (5,278 instructions with its nine key cases; the first count, 3,400, missed them). Done in round 3: compared with the firmware on 300 random menus and key sequences, and in 中国象棋's play; 中国象棋 plays. Its help key ($E96B) shows a text in memory through $E980; one of the OS's own help texts, which Fulu does not have, would stop it (not seen). | fixed | — | — |
| `e99e` | **$E99E**: Today's date, from the clock's day counter, through seven more of the OS's calendar functions (about 1,750 instructions). Done in round 3 and compared with the firmware on random dates. | fixed | — | — |
| `e9ad` | **$E9AD**: A number drawn in a radix (about 870 instructions). Done in round 3: 挖金子 plays, and its calls, and 跳蛋's, match the firmware. | fixed | — | — |
| `help-dialog` | **$E980 (a help screen)**: A text shown a page at a time and scrolled by the keys (2,429 instructions with its key cases, and $E8CB, $E8CE, $E8E9). Done in round 3: compared with the firmware on 200 random texts and key sequences, and 幸运花, which opens it 28 times a minute, matches the firmware and plays. The 43 programs that can call it no longer stop there. | fixed | — | — |
| `shift-launcher` | **The Shift key, and the state the launcher leaves**: The play test pressed Enter, the arrows and space at random, and never Shift (中英) or Exit. Played with every key, Shift stopped 7 programs (平面魔方, 碰碰车, 对对碰, 搬运工, 滑雪, 宠物精灵, 电子宠物): Fulu's GuiTranslateMsg had only some of Shift's cases, and programs started with the OS's variables at 0, where BBK's launcher leaves input mode 2, the keyboard state, the help word and the year. Now Shift is written as GuiTranslateMsg has it (compared with the firmware on random input modes, keyboard states and keys), programs start in the state the launcher leaves (measured on nine launches), and the player sets the device's clock to the computer's date and time, so 幸运花's calendar shows today. The play test now presses every key a player can, Shift and Exit included, and none of the 138 stops. | fixed | — | — |
| `unreached` | **Functions a program can call but none did in random play**: Found by the code scans and traced to what a player does: $E8E0 (Exit in 华容道 and 滑雪 blanks the status bar's number), $E706 (atol: 宠物精灵's cheat box, 体闲麻将's high scores), $E7BE (one double-byte character drawn: 智多星's answer field) and the link cable's serial port ($E8D1, and the resident $E90D and $E910, which the byte scan's list had missed), from 宠物精灵's and 恶龙传说's two-player link menus. All written and compared with the firmware on random arguments; the link as the device with nothing plugged in: sends go out, nothing comes back, and each game shows its own "could not connect" (宠物精灵's 建立连接失败 matches the firmware's screens exactly). The firmware emulator itself hangs there, having no transmitter. | fixed | The link cable: as the device with no cable plugged in. | — |
| `file-place` | **Where a new save goes in the flash**: The original OS places a new file by pages among its own files; Fulu gives it sectors of its own. Games see only a different file id (电子宠物 in the firmware comparison); saving and loading work. | open | — | 电子宠物 |
| `unexplained-reads` | **Unexplained reads in 宠物精灵**: In the firmware comparison the OS reads two of its scratch bytes ($2088, $20C8) before writing them, in one of the game's own calls; the results match. | open | — | 宠物精灵 |
| `wrapped-drawing` | **Drawing that wraps past the screen**: A bitmap window whose sizes wrap past 255 passes the OS's checks, and the OS then draws into its own variables; Fulu draws nothing. No game seen doing it. | open | — | — |
| `pace` | **Pace**: Fulu charges each OS call the firmware's measured time, within a few percent on the games measured; some openings run about a second longer (三国霸业). | open | — | — |
| `game-bugs` | **The games' own bugs, kept** (not Fulu's): 一中传奇 and 热血传奇 show 烫烫烫 (uninitialised memory) in places; 伏魔记 1.3 stops with RunErr:12 after 结束游戏 → 新的征程. Both as on the original OS. | decided | Kept as on the device. | 一中传奇, 伏魔记-1.3, 热血传奇 |
| `os-bugs` | **The original OS's bugs** (not Fulu's): $E86B with the cursor off the screen returns into the stack (a crash on the device): Fulu returns 0. The circles' carry and $E8C5's 0-wide windows are kept as the OS does them. | decided | Crashes are not copied; harmless quirks are. | — |

## Tested by hand

What the owner played and reported, as reported. Each new report is added here.

| Date | Game | Where | What | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-19 | (not named) | fulu | Battles with the wider map view | works | The border goes as it should in battles (docs/fulu-plan.md §12). |
| 2026-11-19 | (not named) | fulu | More text, past the openings | works | Dialogues and message boxes work (docs/fulu-plan.md §13). |

## Every program

Kit: made with BBK's RPG kit (FMJ React's own engine plays it too). On Fulu: plays (the whole 180 s), ends (as on the device), or stops (at what). Code scan: what its code can call that Fulu lacks.

| # | Game | Kit | On Fulu | Firmware comparison | Code scan | By hand | Problems |
|---|---|---|---|---|---|---|---|
| 1 | Eros方块 |  | ends | a minute of play |  |  | `sound` |
| 2 | 一中传奇 | yes | plays | — |  |  | `game-bugs` |
| 3 | 一中传奇2 | yes | plays | — |  |  |  |
| 4 | 七剑 | yes | plays | — |  |  |  |
| 5 | 三国霸业 |  | plays | full |  |  |  |
| 6 | 中国象棋 |  | plays | a minute of play |  |  |  |
| 7 | 丰收 |  | ends | a minute of play |  |  |  |
| 8 | 乒乓球 |  | plays | — |  |  |  |
| 9 | 二十一点 |  | ends | — |  |  |  |
| 10 | 二十四点 |  | plays | a minute of play |  |  | `sound` |
| 11 | 五子棋 |  | ends | a minute of play |  |  |  |
| 12 | 仙三外传 | yes | plays | — |  |  |  |
| 13 | 仙剑三 | yes | plays | — |  |  |  |
| 14 | 仙剑奇侠传二之虎啸飞剑 | yes | plays | — |  |  |  |
| 15 | 仙剑奇侠传四回梦游仙 | yes | plays | — |  |  |  |
| 16 | 仙界传说 | yes | plays | — |  |  |  |
| 17 | 伏魔记-1.0 | yes | plays | full |  |  |  |
| 18 | 伏魔记-1.2 | yes | plays | full |  |  |  |
| 19 | 伏魔记-1.3 | yes | plays | full |  |  | `game-bugs` |
| 20 | 伏魔记完美版1.0 | yes | plays | full |  |  |  |
| 21 | 伏魔记怀旧终曲v1.0(原版精修) | yes | plays | full |  |  |  |
| 22 | 体闲麻将 |  | plays | a minute of play |  |  |  |
| 23 | 侠客行 | yes | plays | — |  |  |  |
| 24 | 侠客行4988(终曲版) | yes | plays | — |  |  |  |
| 25 | 公路快车 |  | ends | — |  |  |  |
| 26 | 冒险岛 | yes | plays | — |  |  |  |
| 27 | 剑缘-第一部 | yes | plays | — |  |  |  |
| 28 | 十字之门 | yes | plays | — |  |  |  |
| 29 | 升级 |  | ends | a minute of play |  |  |  |
| 30 | 华容道 |  | ends | a minute of play |  |  |  |
| 31 | 同福奇缘 | yes | plays | — |  |  |  |
| 32 | 地牢围攻 | yes | plays | — |  |  |  |
| 33 | 坦克大战 |  | ends | a minute of play |  |  |  |
| 34 | 基督山传奇 | yes | plays | — |  |  |  |
| 35 | 大乱斗之火影忍者 | yes | plays | — |  |  |  |
| 36 | 大话三国 | yes | plays | — |  |  |  |
| 37 | 天之骄子 | yes | plays | — |  |  |  |
| 38 | 天之骄子终曲版 | yes | plays | — |  |  |  |
| 39 | 妖 传说 | yes | plays | — |  |  |  |
| 40 | 妖·传说终曲版 | yes | plays | — |  |  |  |
| 41 | 娱乐无极限之无影奸细 | yes | plays | — |  |  |  |
| 42 | 宠物精灵 |  | ends | a minute of play |  |  | `input-methods`, `unexplained-reads` |
| 43 | 对对碰 |  | ends | a minute of play |  |  | `input-methods` |
| 44 | 封魔录 | yes | plays | — |  |  |  |
| 45 | 将门风云 | yes | plays | — |  |  |  |
| 46 | 少年行 | yes | plays | — |  |  |  |
| 47 | 屠魔 | yes | plays | — |  |  |  |
| 48 | 平面魔方 |  | plays | a minute of play |  |  |  |
| 49 | 幸运花 |  | plays | a minute of play |  |  |  |
| 50 | 异世大陆 | yes | plays | — |  |  |  |
| 51 | 异时空游记 | yes | plays | — |  |  |  |
| 52 | 异时空游记2-纵横之旅 | yes | plays | — |  |  |  |
| 53 | 志在青云 | yes | plays | — |  |  |  |
| 54 | 恶龙传说 |  | ends | a minute of play |  |  | `input-methods` |
| 55 | 我的世界 | yes | plays | — |  |  |  |
| 56 | 战国争霸 | yes | plays | — |  |  |  |
| 57 | 扫雷 |  | ends | — |  |  |  |
| 58 | 投篮游戏 |  | ends | a minute of play |  |  |  |
| 59 | 抗日小兵 | yes | plays | — |  |  |  |
| 60 | 拱猪 |  | ends | a minute of play |  |  |  |
| 61 | 挖金子 |  | plays | a minute of play |  |  |  |
| 62 | 接龙 |  | ends | — |  |  |  |
| 63 | 搬运工 |  | ends | a minute of play |  |  |  |
| 64 | 新仙剑奇侠传 | yes | plays | — |  |  |  |
| 65 | 新仙剑奇侠传终曲版 | yes | plays | — |  |  |  |
| 66 | 新能源危机 | yes | plays | — |  |  |  |
| 67 | 智多星 |  | plays | a minute of play |  |  |  |
| 68 | 最终幻想 | yes | plays | — |  |  |  |
| 69 | 末日传说 | yes | plays | — |  |  |  |
| 70 | 校园传奇 | yes | plays | — |  |  |  |
| 71 | 梦幻校园 | yes | plays | — |  |  |  |
| 72 | 梦幻西游 | yes | plays | — |  |  |  |
| 73 | 步步高网友俱乐部 | yes | plays | — |  |  |  |
| 74 | 武林新传 | yes | plays | — |  |  |  |
| 75 | 比大小 |  | ends | — |  |  |  |
| 76 | 泡泡侠 |  | plays | a minute of play |  |  |  |
| 77 | 泡泡侠 加速版 |  | plays | — |  |  |  |
| 78 | 洛克人 | yes | plays | — |  |  |  |
| 79 | 洛特传奇 | yes | plays | — |  |  |  |
| 80 | 海盗船 |  | ends | — |  |  |  |
| 81 | 混战三国 | yes | plays | — |  |  |  |
| 82 | 滑雪 |  | ends | a minute of play |  |  | `sound` |
| 83 | 潜艇大战 |  | ends | a minute of play |  |  |  |
| 84 | 炸弹小子 |  | plays | — |  |  |  |
| 85 | 烈中轶事 | yes | plays | — |  |  |  |
| 86 | 热血传奇 | yes | plays | — |  |  | `game-bugs` |
| 87 | 牛妞历险记 | yes | plays | — |  |  |  |
| 88 | 猪小弟 |  | ends | a minute of play |  |  |  |
| 89 | 猫狗大战 |  | plays | a minute of play |  |  |  |
| 90 | 王氏传 | yes | plays | — |  |  |  |
| 91 | 生命女神之暗之诅咒 | yes | plays | — |  |  |  |
| 92 | 电子宠物 |  | ends | a minute of play |  |  | `input-methods`, `file-place` |
| 93 | 疯狂校园 | yes | plays | — |  |  |  |
| 94 | 疯狂盗墓人 | yes | plays | — |  |  |  |
| 95 | 白中传奇 | yes | ends | — |  |  |  |
| 96 | 碰碰车 |  | plays | a minute of play |  |  | `input-methods` |
| 97 | 秘密潜入 |  | plays | — |  |  |  |
| 98 | 紫璇刀 | yes | plays | — |  |  |  |
| 99 | 纯蓝记 | yes | plays | — |  |  |  |
| 100 | 英雄剑 | yes | plays | — |  |  |  |
| 101 | 英雄剑1 | yes | plays | — |  |  |  |
| 102 | 英雄剑2 | yes | plays | — |  |  |  |
| 103 | 英雄坛 | yes | plays | — |  |  |  |
| 104 | 英雄坛说 | yes | plays | full |  |  |  |
| 105 | 英雄坛说终曲版 | yes | plays | — |  |  |  |
| 106 | 英雄战士 | yes | plays | — |  |  |  |
| 107 | 落世沉浮 | yes | plays | — |  |  |  |
| 108 | 蜘蛛侠三 | yes | plays | — |  |  |  |
| 109 | 螃蟹回家 |  | plays | a minute of play |  |  |  |
| 110 | 诸神黄昏 | yes | plays | — |  |  |  |
| 111 | 豪斯 |  | ends | a minute of play |  |  | `sound` |
| 112 | 贪食蛇 |  | plays | — |  |  |  |
| 113 | 赛马 |  | plays | a minute of play |  |  |  |
| 114 | 赤壁之战 乱世枭雄 | yes | plays | — |  |  |  |
| 115 | 赤壁之战乱世枭雄终曲版 | yes | plays | — |  |  |  |
| 116 | 跟花 |  | ends | a minute of play |  |  |  |
| 117 | 跳蛋 |  | ends | a minute of play |  |  |  |
| 118 | 过关斩将 | yes | plays | — |  |  |  |
| 119 | 过关斩将4988(终曲版) | yes | plays | — |  |  |  |
| 120 | 过关斩将4988改主角 | yes | plays | — |  |  |  |
| 121 | 迷宫游戏 |  | plays | — |  |  |  |
| 122 | 遗忘传说 | yes | plays | — |  |  |  |
| 123 | 遗忘传说终曲版 | yes | plays | — |  |  |  |
| 124 | 释厄传 | yes | plays | — |  |  |  |
| 125 | 金庸群侠传 | yes | plays | — |  |  |  |
| 126 | 金庸群侠传终曲版 | yes | plays | — |  |  |  |
| 127 | 金庸群侠黑暗时代终曲版 | yes | plays | — |  |  |  |
| 128 | 钓鱼 |  | ends | — |  |  |  |
| 129 | 钓鲨鱼 |  | ends | a minute of play |  |  |  |
| 130 | 问道 | yes | plays | — |  |  |  |
| 131 | 阶梯小子 |  | ends | a minute of play |  |  |  |
| 132 | 飞行特训 |  | plays | a minute of play |  |  |  |
| 133 | 魔塔 |  | ends | — |  |  |  |
| 134 | 魔塔BT版 |  | ends | — |  |  |  |
| 135 | 魔塔超级版 |  | ends | — |  |  |  |
| 136 | 魔法学院 | yes | plays | — |  |  |  |
| 137 | 黑暗之心 | yes | plays | — |  |  |  |
| 138 | 黑白子 |  | ends | — |  |  |  |
