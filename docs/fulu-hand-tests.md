# Fulu: what to try by hand

Both code scans find nothing Fulu lacks in the 138 programs, and every
program plays 180 s of random presses of every key without stopping. A
firmware log of all 138 shows nothing they enter that Fulu lacks. What none
of that reaches is the long way through a game, so that is what is left to
play by hand. Report what you find (the game, what you did, what happened);
it goes into `HAND_TESTS` in `src/app/fuluGames.ts`.

## The RPG-kit games (86 of the 138)

They share one engine, so a few of them, played far, stand for the rest:
伏魔记-1.3, 金庸群侠传, 仙剑奇侠传二之虎啸飞剑, 英雄坛说, 魔塔.

- Save, turn the device off and on (the player's restart), load the save.
- A shop: buy and sell; equip what you bought.
- Battles: magic, items, running away, a boss; losing one.
- Level up; a new member joining.
- Many map changes in a row; a long dialogue (More text on and off).
- The wider map view while walking: across plain ground, with the map
  position shown, around popup menus (the border should move with the middle
  and never show a wrong tile).
- The keys printed beside others, from the row under the on-screen keypad
  and from the keyboard (Backspace, F3, F2, Insert): in 异世大陆 on the map,
  查找, 插入, 修改 and 删除 open the game's own screens; Space turns
  continuous walking on and off.
- If you can: the ending.

## The others, each for what only it does

| Game | What to try | What should happen |
|---|---|---|
| 三国霸业 | a whole year of turns; a battle; save and load | as on the device (it is about 1 s slower in places) |
| 宠物精灵 | name the pet (the Chinese box); feed it; type b b k quickly on the pet screen, then e.g. clv5 and Enter; Exit, the icon menu, 和朋友联机, 连机 PK | the cheat box takes the number; the link shows 建立连接中, then 建立连接失败 |
| 恶龙传说 | talk to 长腿哥, answer 是, choose 发送道具 (or 接收) | 正在连接..., then after about 20 s 发送数据类型信息失败 (接收数据类型信息失败) |
| 体闲麻将 | finish all four rounds (most money after round 3), twice | the money total; the second time the 富翁排行榜 check |
| 华容道, 滑雪 | press 跳出 (Exit) at the title and in play | the program ends cleanly |
| 碰碰车, 对对碰 | press 中英 (Shift) | the Chinese box under the screen appears and goes again as you press it |
| 幸运花 | its calendar | today's date and weekday (the player sets the device's clock to the computer's) |
| 中国象棋 | the menu, its help key | the menu's help text |
| 电子宠物 | play until it ends | it ends on its own, as on the device |
| 智多星 | a whole quiz; the lifelines | as on the device |

Sound stays off (the owner's decision). The OS's own pinyin bar is not
drawn: Chinese is typed with the computer's own input method in the box.
