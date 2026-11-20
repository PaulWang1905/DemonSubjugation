# Fulu: the games

<!-- Written by scripts/bbk/fulu-games-doc.mts from src/app/fuluGames.ts: change that file, then run the script. -->

The programs Fulu should run, how far each has got, the ones the owner has
played by hand, and the problems known. The programs are the bbk-games
collection's 138 for the Longman 4988 (`eebbk/roms`). The site's Fulu page
shows the same lists.

- **On Fulu alone** (180 s of random keys each, docs/fulu-report.md §16): 128 play the whole time, 5 end on their own (their `main` returns, as on the device), 5 stop at something Fulu lacks.
- **Compared with BBK's firmware** (the shadow run): 7 in full (their code traced, play, typing and saves compared), 33 for a minute of play.
- **Tested by hand**: 2 reports (below).
- **Problems**: 9 open, 3 decided or fixed.

## Problems

| | Problem | Status | Decision | Games |
|---|---|---|---|---|
| `sound` | **Sound**: Fulu plays no sound, and keeps the sound off. Programs that switch the sound on ($EA52, $EA64: Eros方块, 二十四点, 滑雪, 豪斯 on the original OS) run as if it were off; their sound-on paths are not written, and the firmware comparison leaves those calls out. | decided | Keep the sound off; ignore sound-on for games that ask for it. The owner will decide later whether to do more. | Eros方块, 二十四点, 滑雪, 豪斯 |
| `input-methods` | **Chinese input methods**: Typing Chinese (the input modes 4 and 8, $E919, $E925…) is not written. 宠物精灵 and 电子宠物 switch to it at once and stop on Fulu; 恶龙传说, 碰碰车 and 对对碰 reach it in the firmware comparison. | open | — | 宠物精灵, 对对碰, 恶龙传说, 电子宠物, 碰碰车 |
| `e94d` | **$E94D (a GUI dialog)**: About 3,900 instructions with what it calls; only 中国象棋 needs it, at its start. | open | — | 中国象棋 |
| `e99e` | **$E99E**: About 1,800 instructions with what it calls; only 幸运花 needs it, at its start. | open | — | 幸运花 |
| `e9ad` | **$E9AD**: About 870 instructions; only 挖金子 needs it, at its start. | open | — | 挖金子 |
| `help-dialog` | **$E980 (probably a help screen)**: 43 programs can call it, none did in play; it calls a 1,969-instruction dialog ($F262) and 13 more functions. A program that opens it stops on Fulu. | open | — | — |
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

Kit: made with BBK's RPG kit (FMJ React's own engine plays it too). On Fulu: plays (the whole 180 s), ends on its own, or stops (at what).

| # | Game | Kit | On Fulu | Firmware comparison | By hand | Problems |
|---|---|---|---|---|---|---|
| 1 | Eros方块 |  | plays | a minute of play |  | `sound` |
| 2 | 一中传奇 | yes | plays | — |  | `game-bugs` |
| 3 | 一中传奇2 | yes | plays | — |  |  |
| 4 | 七剑 | yes | plays | — |  |  |
| 5 | 三国霸业 |  | plays | full |  |  |
| 6 | 中国象棋 |  | stops at $E94D | a minute of play |  | `e94d` |
| 7 | 丰收 |  | plays | a minute of play |  |  |
| 8 | 乒乓球 |  | plays | — |  |  |
| 9 | 二十一点 |  | plays | — |  |  |
| 10 | 二十四点 |  | plays | a minute of play |  | `sound` |
| 11 | 五子棋 |  | plays | a minute of play |  |  |
| 12 | 仙三外传 | yes | plays | — |  |  |
| 13 | 仙剑三 | yes | plays | — |  |  |
| 14 | 仙剑奇侠传二之虎啸飞剑 | yes | plays | — |  |  |
| 15 | 仙剑奇侠传四回梦游仙 | yes | plays | — |  |  |
| 16 | 仙界传说 | yes | plays | — |  |  |
| 17 | 伏魔记-1.0 | yes | plays | full |  |  |
| 18 | 伏魔记-1.2 | yes | plays | full |  |  |
| 19 | 伏魔记-1.3 | yes | plays | full |  | `game-bugs` |
| 20 | 伏魔记完美版1.0 | yes | plays | full |  |  |
| 21 | 伏魔记怀旧终曲v1.0(原版精修) | yes | plays | full |  |  |
| 22 | 体闲麻将 |  | plays | a minute of play |  |  |
| 23 | 侠客行 | yes | plays | — |  |  |
| 24 | 侠客行4988(终曲版) | yes | plays | — |  |  |
| 25 | 公路快车 |  | plays | — |  |  |
| 26 | 冒险岛 | yes | plays | — |  |  |
| 27 | 剑缘-第一部 | yes | plays | — |  |  |
| 28 | 十字之门 | yes | plays | — |  |  |
| 29 | 升级 |  | plays | a minute of play |  |  |
| 30 | 华容道 |  | plays | a minute of play |  |  |
| 31 | 同福奇缘 | yes | plays | — |  |  |
| 32 | 地牢围攻 | yes | plays | — |  |  |
| 33 | 坦克大战 |  | ends on its own | a minute of play |  |  |
| 34 | 基督山传奇 | yes | plays | — |  |  |
| 35 | 大乱斗之火影忍者 | yes | plays | — |  |  |
| 36 | 大话三国 | yes | plays | — |  |  |
| 37 | 天之骄子 | yes | plays | — |  |  |
| 38 | 天之骄子终曲版 | yes | plays | — |  |  |
| 39 | 妖 传说 | yes | plays | — |  |  |
| 40 | 妖·传说终曲版 | yes | plays | — |  |  |
| 41 | 娱乐无极限之无影奸细 | yes | plays | — |  |  |
| 42 | 宠物精灵 |  | stops at input methods | a minute of play |  | `input-methods`, `unexplained-reads` |
| 43 | 对对碰 |  | plays | a minute of play |  | `input-methods` |
| 44 | 封魔录 | yes | plays | — |  |  |
| 45 | 将门风云 | yes | plays | — |  |  |
| 46 | 少年行 | yes | plays | — |  |  |
| 47 | 屠魔 | yes | plays | — |  |  |
| 48 | 平面魔方 |  | plays | a minute of play |  |  |
| 49 | 幸运花 |  | stops at $E99E | a minute of play |  | `e99e` |
| 50 | 异世大陆 | yes | plays | — |  |  |
| 51 | 异时空游记 | yes | plays | — |  |  |
| 52 | 异时空游记2-纵横之旅 | yes | plays | — |  |  |
| 53 | 志在青云 | yes | plays | — |  |  |
| 54 | 恶龙传说 |  | ends on its own | a minute of play |  | `input-methods` |
| 55 | 我的世界 | yes | plays | — |  |  |
| 56 | 战国争霸 | yes | plays | — |  |  |
| 57 | 扫雷 |  | plays | — |  |  |
| 58 | 投篮游戏 |  | plays | a minute of play |  |  |
| 59 | 抗日小兵 | yes | plays | — |  |  |
| 60 | 拱猪 |  | plays | a minute of play |  |  |
| 61 | 挖金子 |  | stops at $E9AD | a minute of play |  | `e9ad` |
| 62 | 接龙 |  | plays | — |  |  |
| 63 | 搬运工 |  | plays | a minute of play |  |  |
| 64 | 新仙剑奇侠传 | yes | plays | — |  |  |
| 65 | 新仙剑奇侠传终曲版 | yes | plays | — |  |  |
| 66 | 新能源危机 | yes | plays | — |  |  |
| 67 | 智多星 |  | plays | a minute of play |  |  |
| 68 | 最终幻想 | yes | plays | — |  |  |
| 69 | 末日传说 | yes | plays | — |  |  |
| 70 | 校园传奇 | yes | plays | — |  |  |
| 71 | 梦幻校园 | yes | plays | — |  |  |
| 72 | 梦幻西游 | yes | plays | — |  |  |
| 73 | 步步高网友俱乐部 | yes | plays | — |  |  |
| 74 | 武林新传 | yes | plays | — |  |  |
| 75 | 比大小 |  | plays | — |  |  |
| 76 | 泡泡侠 |  | plays | a minute of play |  |  |
| 77 | 泡泡侠 加速版 |  | plays | — |  |  |
| 78 | 洛克人 | yes | plays | — |  |  |
| 79 | 洛特传奇 | yes | plays | — |  |  |
| 80 | 海盗船 |  | plays | — |  |  |
| 81 | 混战三国 | yes | plays | — |  |  |
| 82 | 滑雪 |  | plays | a minute of play |  | `sound` |
| 83 | 潜艇大战 |  | ends on its own | a minute of play |  |  |
| 84 | 炸弹小子 |  | plays | — |  |  |
| 85 | 烈中轶事 | yes | plays | — |  |  |
| 86 | 热血传奇 | yes | plays | — |  | `game-bugs` |
| 87 | 牛妞历险记 | yes | plays | — |  |  |
| 88 | 猪小弟 |  | plays | a minute of play |  |  |
| 89 | 猫狗大战 |  | plays | a minute of play |  |  |
| 90 | 王氏传 | yes | plays | — |  |  |
| 91 | 生命女神之暗之诅咒 | yes | plays | — |  |  |
| 92 | 电子宠物 |  | stops at input methods | a minute of play |  | `input-methods`, `file-place` |
| 93 | 疯狂校园 | yes | plays | — |  |  |
| 94 | 疯狂盗墓人 | yes | plays | — |  |  |
| 95 | 白中传奇 | yes | plays | — |  |  |
| 96 | 碰碰车 |  | plays | a minute of play |  | `input-methods` |
| 97 | 秘密潜入 |  | plays | — |  |  |
| 98 | 紫璇刀 | yes | plays | — |  |  |
| 99 | 纯蓝记 | yes | plays | — |  |  |
| 100 | 英雄剑 | yes | plays | — |  |  |
| 101 | 英雄剑1 | yes | plays | — |  |  |
| 102 | 英雄剑2 | yes | plays | — |  |  |
| 103 | 英雄坛 | yes | plays | — |  |  |
| 104 | 英雄坛说 | yes | plays | full |  |  |
| 105 | 英雄坛说终曲版 | yes | plays | — |  |  |
| 106 | 英雄战士 | yes | plays | — |  |  |
| 107 | 落世沉浮 | yes | plays | — |  |  |
| 108 | 蜘蛛侠三 | yes | plays | — |  |  |
| 109 | 螃蟹回家 |  | plays | a minute of play |  |  |
| 110 | 诸神黄昏 | yes | plays | — |  |  |
| 111 | 豪斯 |  | plays | a minute of play |  | `sound` |
| 112 | 贪食蛇 |  | plays | — |  |  |
| 113 | 赛马 |  | plays | a minute of play |  |  |
| 114 | 赤壁之战 乱世枭雄 | yes | plays | — |  |  |
| 115 | 赤壁之战乱世枭雄终曲版 | yes | plays | — |  |  |
| 116 | 跟花 |  | plays | a minute of play |  |  |
| 117 | 跳蛋 |  | ends on its own | — |  |  |
| 118 | 过关斩将 | yes | plays | — |  |  |
| 119 | 过关斩将4988(终曲版) | yes | plays | — |  |  |
| 120 | 过关斩将4988改主角 | yes | plays | — |  |  |
| 121 | 迷宫游戏 |  | plays | — |  |  |
| 122 | 遗忘传说 | yes | plays | — |  |  |
| 123 | 遗忘传说终曲版 | yes | plays | — |  |  |
| 124 | 释厄传 | yes | plays | — |  |  |
| 125 | 金庸群侠传 | yes | plays | — |  |  |
| 126 | 金庸群侠传终曲版 | yes | plays | — |  |  |
| 127 | 金庸群侠黑暗时代终曲版 | yes | plays | — |  |  |
| 128 | 钓鱼 |  | plays | — |  |  |
| 129 | 钓鲨鱼 |  | ends on its own | a minute of play |  |  |
| 130 | 问道 | yes | plays | — |  |  |
| 131 | 阶梯小子 |  | plays | a minute of play |  |  |
| 132 | 飞行特训 |  | plays | a minute of play |  |  |
| 133 | 魔塔 |  | plays | — |  |  |
| 134 | 魔塔BT版 |  | plays | — |  |  |
| 135 | 魔塔超级版 |  | plays | — |  |  |
| 136 | 魔法学院 | yes | plays | — |  |  |
| 137 | 黑暗之心 | yes | plays | — |  |  |
| 138 | 黑白子 |  | plays | — |  |  |
