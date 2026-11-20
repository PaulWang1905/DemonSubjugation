# Fulu: the games

<!-- Written by scripts/bbk/fulu-games-doc.mts from src/app/fuluGames.ts: change that file, then run the script. -->

The programs Fulu should run, how far each has got, the ones the owner has
played by hand, and the problems known. The programs are the bbk-games
collection's 138 for the Longman 4988 (`eebbk/roms`). The site's Fulu page
shows the same lists, in its progress report (/fulu/progress).

Updated 2026-11-20.

- **On Fulu alone** (180 s of random keys each, docs/fulu-report.md §16): 128 play the whole time, 5 end on their own (their `main` returns, as on the device), 5 stop at something Fulu lacks.
- **Compared with BBK's firmware** (the shadow run): 7 in full (their code traced, play, typing and saves compared), 33 for a minute of play.
- **Tested by hand**: 2 reports (below).
- **Problems**: 10 open, 3 decided or fixed.
- **Code scan** (`scripts/bbk/fulu-coverage.mts --programs`): 92 programs call nothing Fulu lacks. The programs call 107 OS functions (Fulu answers 97) and 61 runtime routines (all answered); about 35,000 instructions of OS code are written and 9,978 left, not counting the input methods.

## How it got here

| Step | Play 180 s | End on their own |
|---|---|---|
| First play of all 138 | 103 | 0 |
| Round 1 | 114 | 3 |
| Round 2 | 128 | 5 |

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
| 2026-11-20 |  | **This progress report; sound kept off**: The games list, the owner's hand tests and the problems in one place. The owner decided to keep the sound off for now. |

## What is left

| What | Instructions | Stops in play | Code can call it | When |
|---|---|---|---|---|
| `$E9AD` | 869 | 挖金子 | 挖金子, 跳蛋 | next round |
| `$E99E`, with `$EBEF` `$EC67` `$EC6A` `$EBF5` `$EBF8` `$EBF2` `$E7EE` | 1,750 | 幸运花 | 幸运花 | next round |
| `$E94D` (a GUI dialog), with `$EA25` | 3,377 | 中国象棋 | 中国象棋 | next round |
| `$E791` | 334 | — | 中国象棋 | next round |
| input methods: typing Chinese ($E919, $E925…, input modes 4 and 8) | not measured | 宠物精灵, 电子宠物 | — | next round |
| `$E980` (probably a help screen), with `$F262` `$E8E9` `$E8CB` `$E8CE` | 2,101 | — | 43 programs | later |
| `$E7BE` | 718 | — | 智多星 | later |
| `$E706` | 528 | — | 体闲麻将, 宠物精灵 | later |
| `$E8E0` | 138 | — | 华容道, 滑雪 | later |
| `$E929` | 98 | — | 电子宠物 | later |
| `$E8D1` | 65 | — | 宠物精灵, 恶龙传说 | later |

## Problems

| | Problem | Status | Decision | Games |
|---|---|---|---|---|
| `sound` | **Sound**: Fulu plays no sound, and keeps the sound off. Programs that switch the sound on ($EA52, $EA64: Eros方块, 二十四点, 滑雪, 豪斯 on the original OS) run as if it were off; their sound-on paths are not written, and the firmware comparison leaves those calls out. | decided | Keep the sound off; ignore sound-on for games that ask for it. The owner will decide later whether to do more. | Eros方块, 二十四点, 滑雪, 豪斯 |
| `input-methods` | **Chinese input methods**: Typing Chinese (the input modes 4 and 8, $E919, $E925…) is not written. 宠物精灵 and 电子宠物 switch to it at once and stop on Fulu; 恶龙传说, 碰碰车 and 对对碰 reach it in the firmware comparison. | open | — | 宠物精灵, 对对碰, 恶龙传说, 电子宠物, 碰碰车 |
| `e94d` | **$E94D (a GUI dialog)**: About 3,400 instructions with what it calls, and 中国象棋 also calls $E791 (334); only 中国象棋 needs them, $E94D at its start. | open | — | 中国象棋 |
| `e99e` | **$E99E**: About 1,800 instructions with what it calls; only 幸运花 needs it, at its start. | open | — | 幸运花 |
| `e9ad` | **$E9AD**: About 870 instructions; only 挖金子 needs it, at its start. | open | — | 挖金子 |
| `help-dialog` | **$E980 (probably a help screen)**: 43 programs can call it, none did in play; it calls a 1,969-instruction dialog ($F262) and 13 more functions. A program that opens it stops on Fulu. | open | — | — |
| `unreached` | **Functions a program can call but none did in play**: $E706, $E7BE, $E8D1, $E8E0, $E929 and $E791 are in the code of one or two programs each (about 1,900 instructions in all), on paths 180 s of random keys never took. A program that takes one stops on Fulu and names it. | open | — | — |
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

Kit: made with BBK's RPG kit (FMJ React's own engine plays it too). On Fulu: plays (the whole 180 s), ends on its own, or stops (at what). Code scan: what its code can call that Fulu lacks.

| # | Game | Kit | On Fulu | Firmware comparison | Code scan | By hand | Problems |
|---|---|---|---|---|---|---|---|
| 1 | Eros方块 |  | plays | a minute of play | `$E980` |  | `sound` |
| 2 | 一中传奇 | yes | plays | — |  |  | `game-bugs` |
| 3 | 一中传奇2 | yes | plays | — |  |  |  |
| 4 | 七剑 | yes | plays | — |  |  |  |
| 5 | 三国霸业 |  | plays | full |  |  |  |
| 6 | 中国象棋 |  | stops at $E94D | a minute of play | `$E791` `$E94D` `$E980` |  | `e94d` |
| 7 | 丰收 |  | plays | a minute of play | `$E980` |  |  |
| 8 | 乒乓球 |  | plays | — | `$E980` |  |  |
| 9 | 二十一点 |  | plays | — | `$E980` |  |  |
| 10 | 二十四点 |  | plays | a minute of play | `$E980` |  | `sound` |
| 11 | 五子棋 |  | plays | a minute of play | `$E980` |  |  |
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
| 22 | 体闲麻将 |  | plays | a minute of play | `$E706` |  |  |
| 23 | 侠客行 | yes | plays | — |  |  |  |
| 24 | 侠客行4988(终曲版) | yes | plays | — |  |  |  |
| 25 | 公路快车 |  | plays | — | `$E980` |  |  |
| 26 | 冒险岛 | yes | plays | — |  |  |  |
| 27 | 剑缘-第一部 | yes | plays | — |  |  |  |
| 28 | 十字之门 | yes | plays | — |  |  |  |
| 29 | 升级 |  | plays | a minute of play | `$E980` |  |  |
| 30 | 华容道 |  | plays | a minute of play | `$E8E0` `$E980` |  |  |
| 31 | 同福奇缘 | yes | plays | — |  |  |  |
| 32 | 地牢围攻 | yes | plays | — |  |  |  |
| 33 | 坦克大战 |  | ends on its own | a minute of play | `$E980` |  |  |
| 34 | 基督山传奇 | yes | plays | — |  |  |  |
| 35 | 大乱斗之火影忍者 | yes | plays | — |  |  |  |
| 36 | 大话三国 | yes | plays | — |  |  |  |
| 37 | 天之骄子 | yes | plays | — |  |  |  |
| 38 | 天之骄子终曲版 | yes | plays | — |  |  |  |
| 39 | 妖 传说 | yes | plays | — |  |  |  |
| 40 | 妖·传说终曲版 | yes | plays | — |  |  |  |
| 41 | 娱乐无极限之无影奸细 | yes | plays | — |  |  |  |
| 42 | 宠物精灵 |  | stops at input methods | a minute of play | `$E706` `$E8D1` |  | `input-methods`, `unexplained-reads` |
| 43 | 对对碰 |  | plays | a minute of play |  |  | `input-methods` |
| 44 | 封魔录 | yes | plays | — |  |  |  |
| 45 | 将门风云 | yes | plays | — |  |  |  |
| 46 | 少年行 | yes | plays | — |  |  |  |
| 47 | 屠魔 | yes | plays | — |  |  |  |
| 48 | 平面魔方 |  | plays | a minute of play |  |  |  |
| 49 | 幸运花 |  | stops at $E99E | a minute of play | `$E980` `$E99E` |  | `e99e` |
| 50 | 异世大陆 | yes | plays | — |  |  |  |
| 51 | 异时空游记 | yes | plays | — |  |  |  |
| 52 | 异时空游记2-纵横之旅 | yes | plays | — |  |  |  |
| 53 | 志在青云 | yes | plays | — |  |  |  |
| 54 | 恶龙传说 |  | ends on its own | a minute of play | `$E8D1` |  | `input-methods` |
| 55 | 我的世界 | yes | plays | — |  |  |  |
| 56 | 战国争霸 | yes | plays | — |  |  |  |
| 57 | 扫雷 |  | plays | — | `$E980` |  |  |
| 58 | 投篮游戏 |  | plays | a minute of play | `$E980` |  |  |
| 59 | 抗日小兵 | yes | plays | — |  |  |  |
| 60 | 拱猪 |  | plays | a minute of play | `$E980` |  |  |
| 61 | 挖金子 |  | stops at $E9AD | a minute of play | `$E980` `$E9AD` |  | `e9ad` |
| 62 | 接龙 |  | plays | — | `$E980` |  |  |
| 63 | 搬运工 |  | plays | a minute of play | `$E980` |  |  |
| 64 | 新仙剑奇侠传 | yes | plays | — |  |  |  |
| 65 | 新仙剑奇侠传终曲版 | yes | plays | — |  |  |  |
| 66 | 新能源危机 | yes | plays | — |  |  |  |
| 67 | 智多星 |  | plays | a minute of play | `$E7BE` `$E980` |  |  |
| 68 | 最终幻想 | yes | plays | — |  |  |  |
| 69 | 末日传说 | yes | plays | — |  |  |  |
| 70 | 校园传奇 | yes | plays | — |  |  |  |
| 71 | 梦幻校园 | yes | plays | — |  |  |  |
| 72 | 梦幻西游 | yes | plays | — |  |  |  |
| 73 | 步步高网友俱乐部 | yes | plays | — |  |  |  |
| 74 | 武林新传 | yes | plays | — |  |  |  |
| 75 | 比大小 |  | plays | — | `$E980` |  |  |
| 76 | 泡泡侠 |  | plays | a minute of play |  |  |  |
| 77 | 泡泡侠 加速版 |  | plays | — |  |  |  |
| 78 | 洛克人 | yes | plays | — |  |  |  |
| 79 | 洛特传奇 | yes | plays | — |  |  |  |
| 80 | 海盗船 |  | plays | — | `$E980` |  |  |
| 81 | 混战三国 | yes | plays | — |  |  |  |
| 82 | 滑雪 |  | plays | a minute of play | `$E8E0` `$E980` |  | `sound` |
| 83 | 潜艇大战 |  | ends on its own | a minute of play | `$E980` |  |  |
| 84 | 炸弹小子 |  | plays | — | `$E980` |  |  |
| 85 | 烈中轶事 | yes | plays | — |  |  |  |
| 86 | 热血传奇 | yes | plays | — |  |  | `game-bugs` |
| 87 | 牛妞历险记 | yes | plays | — |  |  |  |
| 88 | 猪小弟 |  | plays | a minute of play | `$E980` |  |  |
| 89 | 猫狗大战 |  | plays | a minute of play | `$E980` |  |  |
| 90 | 王氏传 | yes | plays | — |  |  |  |
| 91 | 生命女神之暗之诅咒 | yes | plays | — |  |  |  |
| 92 | 电子宠物 |  | stops at input methods | a minute of play | `$E929` `$E980` |  | `input-methods`, `file-place` |
| 93 | 疯狂校园 | yes | plays | — |  |  |  |
| 94 | 疯狂盗墓人 | yes | plays | — |  |  |  |
| 95 | 白中传奇 | yes | plays | — |  |  |  |
| 96 | 碰碰车 |  | plays | a minute of play |  |  | `input-methods` |
| 97 | 秘密潜入 |  | plays | — | `$E980` |  |  |
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
| 109 | 螃蟹回家 |  | plays | a minute of play | `$E980` |  |  |
| 110 | 诸神黄昏 | yes | plays | — |  |  |  |
| 111 | 豪斯 |  | plays | a minute of play | `$E980` |  | `sound` |
| 112 | 贪食蛇 |  | plays | — | `$E980` |  |  |
| 113 | 赛马 |  | plays | a minute of play | `$E980` |  |  |
| 114 | 赤壁之战 乱世枭雄 | yes | plays | — |  |  |  |
| 115 | 赤壁之战乱世枭雄终曲版 | yes | plays | — |  |  |  |
| 116 | 跟花 |  | plays | a minute of play | `$E980` |  |  |
| 117 | 跳蛋 |  | ends on its own | — | `$E980` `$E9AD` |  |  |
| 118 | 过关斩将 | yes | plays | — |  |  |  |
| 119 | 过关斩将4988(终曲版) | yes | plays | — |  |  |  |
| 120 | 过关斩将4988改主角 | yes | plays | — |  |  |  |
| 121 | 迷宫游戏 |  | plays | — | `$E980` |  |  |
| 122 | 遗忘传说 | yes | plays | — |  |  |  |
| 123 | 遗忘传说终曲版 | yes | plays | — |  |  |  |
| 124 | 释厄传 | yes | plays | — |  |  |  |
| 125 | 金庸群侠传 | yes | plays | — |  |  |  |
| 126 | 金庸群侠传终曲版 | yes | plays | — |  |  |  |
| 127 | 金庸群侠黑暗时代终曲版 | yes | plays | — |  |  |  |
| 128 | 钓鱼 |  | plays | — | `$E980` |  |  |
| 129 | 钓鲨鱼 |  | ends on its own | a minute of play | `$E980` |  |  |
| 130 | 问道 | yes | plays | — |  |  |  |
| 131 | 阶梯小子 |  | plays | a minute of play | `$E980` |  |  |
| 132 | 飞行特训 |  | plays | a minute of play | `$E980` |  |  |
| 133 | 魔塔 |  | plays | — | `$E980` |  |  |
| 134 | 魔塔BT版 |  | plays | — | `$E980` |  |  |
| 135 | 魔塔超级版 |  | plays | — | `$E980` |  |  |
| 136 | 魔法学院 | yes | plays | — |  |  |  |
| 137 | 黑暗之心 | yes | plays | — |  |  |  |
| 138 | 黑白子 |  | plays | — | `$E980` |  |  |
