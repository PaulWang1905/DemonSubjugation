# Alignment with the original engine

The engine started as a port of [fmj.kt](https://gitee.com/bgwp/fmj.kt), a
re-implementation of the BBK RPG engine. [fmj-engine](https://gitee.com/BA4988/fmj-engine)
is a C reconstruction of the original `RpgA100.eng` from its disassembly, so
it shows what the device really did. This file records how this engine
compares with it, area by area. Function names such as `_0022726A` refer
to fmj-engine's sources.

The player option **Original battle rules** (on by default) uses the
original's logic. Turning it off restores fmj.kt's behaviour.

## Same in both

| Area | Notes |
| --- | --- |
| Script commands | Same 80 opcodes (0-79), same numbering and argument layouts; every script in the test archives (12,660) re-assembles byte for byte. |
| Random battles | 1-3 enemies picked at random from the map's list, checked when the player takes a step. |
| Scripted battles | Cannot be fled. |
| Rewards | Experience and money are the sum over the defeated enemies; fallen members get no experience. |

## Changed to follow the original

| Area | Original | fmj.kt (before) |
| --- | --- | --- |
| Hit / miss (`_0022726A`, `_002264FA`) | Miss when `rand % 200 < (target speed + 50 − attacker speed)` (10 if not positive); MISS picture 2-18 | Always hits |
| Damage to enemies | `atk / max(1, def >> 3) + rand % (atk >> 2 or 10)` | `atk / ((def >> 3) + 1) + rand % ((atk >> 2) + 1)` (baye-fmj-app fork) |
| Damage to the party | `atk / ((def >> 3) + 1) + rand % ((atk >> 4) + 1)`, halved when defending or bracing | `def >> 2` (defence counted double); Defend did nothing |
| Bracing (`_002277CD`) | 9% chance per enemy action for members without ailments | — |
| Spells (`_0023ECA9`, `_00242399`) | Value scaled by caster's and target's spirit (1/64 per point), `+ (rand % v) >> 4`, can be dodged (`rand % 100 < target speed + 20 − caster speed`), MP damage, draining spells give to the caster, ¼ off when defending/bracing, capped at the target's HP | Flat value; draining spells healed the target |
| Flee (`_0023CFE5`) | `rand % (luck+1) + rand % (speed+1)` against the first enemy's | 50% |
| Encounter rate (`_002167B3`) | 4 in 100 per step | 1 in 20 |
| After victory (`_0022C000`) | Fallen members get 1 HP; others recover 15-24% of missing HP and MP | +10% missing HP, +20% max MP, also after fleeing |
| Levelling (`_0022D9E8`, `_0022E655`) | Several levels at once while exp > requirement; HP/MP maximum get a random bonus up to ⅛ of their increase; full HP/MP. Only the last level's requirement is subtracted (kept, as the original does it) | One level per battle; `>=`; stopped the whole party at the first member on the maximum level |
| Drops (`_002435CB`) | One of the enemy's second item, if `rand % leaderLuck + 1 > rand % enemyLuck` and 3 in 4 | Party's best luck as a percentage, whole stack |

### Battle turns, enemies and statuses

| Area | Original (now followed) | fmj.kt (before) |
| --- | --- | --- |
| Turn order (`_0023C000`) | Speed plus its spell change, 8-bit; restoring/reviving spells and medicine/revival items at 1.5x; party before enemies on ties | Plain speed |
| Enemy turns (`_0022475F`) | Decided on the enemy's turn: `rand % 100 < 100 − IQ` attacks, otherwise a random known spell if it has the MP and is not sealed; attack spells on a party member (all with the all-target flag), other spells on its own side; random slot, else the next one | Always a physical attack; targets fixed at the start of the round |
| Status slots (`_0023E7A1`, `_0023D52A`) | Seven per fighter (attack, defence, speed change, poison, confusion, seal, sleep) with rounds left, counted down after the fighter's own turn; immunities checked | Flags without round counting |
| Sleep / confusion / seal | Asleep: turn skipped. Confused: hits itself (party: `atk / ((def >> 2) + 1)`). Sealed: no spells (falls back to a normal attack) | Not applied in battle |
| Poison (`_0023E1E4`) | A quarter of current HP after each of the fighter's turns | — |
| Landing a status (`_0024314B`) | `r = rand % 90`; lands if `luck < r` or `r > 60` | — |
| Normal attacks with statuses (`_0024218A`, `_002264FA`) | Party: the first member's weapon statuses, whoever attacks, also on a miss (original quirk). Enemies: their attack statuses on a hit | — |
| Attack spells' side effects (`_00220000`, `_00220874`) | Attack/defence/speed lowered by percentages and statuses, each behind a status roll, even when the damage was dodged; damage rolled for every opponent even for one target, which drain spells add up (original quirks) | — |
| Enhancement / restoration / revival | Percent increases for some rounds; heal and cure on the standing; revive only the fallen to a percent of max HP | Enhancement did nothing; revival healed by MP |
| Group attack 围攻 (`_0021DDBA`, `_00226D37`) | The chooser's combined spell if their accessory has one, otherwise every member's attack, halved per step away from the chooser, as one hit | Combined spell from the first member only |
| Accessories (`_0023D20C`) | HP/MP each turn, read as unsigned bytes like the original | — |

Checked against the disassembly where the C reconstruction looked off:
the buff percentage function does return `value × pct / 100`, and the
revive branch works on fallen members (the C file has that test inverted).

### Items, equipment and inventory

| Area | Original (now followed) | fmj.kt (before) |
| --- | --- | --- |
| Equipment stat bytes (`_0022111F`, `_00221AE9`) | Sign-and-magnitude (0x83 = −3), subtraction stops at 0; weapons add their attack byte and armour its defence byte as plain numbers. **Applied with either setting**: fmj.kt read 0x83 as −125, which affects about 14% of items in the test archives (including 伏魔记) | Two's-complement bytes |
| Immunities | The status bytes of the five armour pieces | Also accessories, whose byte 0x1c is their combined spell |
| Medicine / revival / elixirs / stimulants in battle (`_002401AE`) | Item leaves the bag when the turn comes (attack instead if none left); "everyone" (byte 0x1c > 0x0f) goes over every member, fallen ones too; revival sets HP to a percentage; stimulants raise stats for some rounds; cures with byte 0x1c | fmj.kt's own effects |
| Throwing (`_00240841`) | Thrown weapons and weapons from the bag; drains scale with the number of enemies hit; a thrown weapon deals the original's flag value of its bytes | Thrown weapons only |
| Stealing (`_0022F65A`) | Only special spell 1; luck against luck, then 2 in 3 (1 in 2); costs MP | 50%, free |
| Bag (`_00239BE2`, `_00239F29`) | 99 per kind, 200 kinds; taking at least as many as there are removes the kind and succeeds; the last kind fills the gap | No limits; not enough failed |
| Fallen members | Lose their statuses (stat changes stay) | — |
| Poses | Weak when asleep or under ¼ HP, guarding when defending | Weak under 1/10 HP |
| Round limit of scripted battles | After limit + 1 rounds the battle ends with neither result; the script continues after ENTERFIGHT and the fallen stay down | Ignored |

### Script commands

| Command | Original (now followed) | fmj.kt (before) |
| --- | --- | --- |
| SET / ADD / SUB / IFCMP / DISCMP / MENU / SETTO | Variables are single bytes (wrap at 256) | 16-bit values |
| GAINMONEY / SETMONEY / USEMONEY | Capped at 65951; spending stops at 0 | No limits |
| TESTMONEY | Compares the low 16 bits | Full value |
| DELETEGOODS | Removes every one of the item; jumps only when there is none | Removed one |
| USEGOODSNUM | Jumps when there are fewer than asked | Same, via the bag |
| TESTGOODSNUM | Does nothing when the item is missing | Could jump to "equal" for 0 |
| RANDRADE | `rand % 1000 < n` | `<=` |
| RESUMEACTORHP | Adds a percentage of max HP (at least 1, 1-100% only) | Set HP to the percentage |
| NPCMOVEMOD | 0 stop, 1 wander, anything else animate in place | The number as a state |
| ATTRIBTEST / ATTRIBSET / ATTRIBADD | Also fields 9-14 (attack-status rounds, immunities, attack statuses, combined spell, per-turn HP/MP) | Unsupported |

| ACTORLAYERUP | Experience becomes the requirement of the level below the target + 5, then the usual level-up (can stop short of the target) | Jumped to the level |
| SETEVENTTIMER | Fires once after n map ticks (500 ms) | Repeated |
| MENU (`_00210D5B`) | The original's list: from y = 10, at most five rows with scroll arrows, wraps round | Centred, every item at once (long menus ran off the screen), no wrap |

### Field, shops and NPCs

| Area | Original (now followed) | fmj.kt (before) |
| --- | --- | --- |
| Medicine outside battle (`_0023516C`) | One item; medicine and elixirs marked "everyone" (byte 0x1c bit 0x10) work on the whole party; revival items do nothing but are used up | One item per member for party medicine |
| Selling (`_00236FD7`) | Anything with an event number cannot be sold; money capped at 65951 | Only story items; 99999 |
| Buying (`_00239068`) | Price check, at most 99 of a kind (as before) | Same |
| Menus and lists (`_00210D5B`, `_00210000`) | Left moves up and Right moves down in the in-game menu, its sub-menus, the system menu and the spell list | Up and Down only |
| NPC wandering (`_00215865`, `_00215A79`, `_00215EDE`) | Every 500 ms map tick: wait `delay` ticks, pick a random direction and 0-4 tiles, walk until there or blocked; "animate in place" steps the frames | Random pauses and turns |

The C reconstruction was checked against the disassembly where it looked
wrong: GAINMONEY's cap is conditional (the C file has a stray `;`), the
steal test reads the spell's number, not its type, throwing a weapon
really deals the flag value, and an NPC walks until it reaches its target
(the C file has that test inverted).

## Still different (on purpose or not checkable)

- **Save files** use fmj.kt's layout; the device stored a memory image.
  What is saved is the same game state.
- **Screens and menus** are drawn as fmj.kt draws them, which already
  follows the device's positions closely (the in-game menu, the system
  menu and the actor list sit within a pixel of the original's boxes). The
  map is drawn the same way: 9 by 6 tiles with striped side borders, one
  whole tile per step.
- **Keys**: menus act when a key is let go, the device when it is
  pressed. Held keys repeat every 100 ms after 250 ms, on the keypad and the
  keyboard alike; each repeat is one more key press, as on the device.
- **Music** (MUSIC, MOVIE sound) is not played.
- **Unknown script opcodes** 4, 5, 8, 17, 18, 19, 25, 78 and 79 stop a
  script on the device; here they are skipped, so archives made for other
  engines keep running (setfightmiss / setarmstoss appear 149 times in the
  test archives).
- **Bag order across kinds**: the original keeps one list for equipment and
  items; here there are two lists, each following the original's rules.
- A status landing on "every enemy" from a thrown item rolls each enemy's
  luck; the original reads past the enemy table there.
- Values a script sets with ATTRIBSET 10-14 are not kept in save files.
- Auto-walk (the device's space key, which keeps walking on each 500 ms
  tick) is not offered; holding a direction does the same.
