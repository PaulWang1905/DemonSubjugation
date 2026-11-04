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

## Still different

- **Items in battle**: medicine and thrown weapons still use fmj.kt's code;
  the original also takes the item from the bag at the start of the turn.
- **Stealing** (`_0022F5CE`) uses fmj.kt's 50% roll.
- **Automatic commands** the original recalculates for asleep/confused
  members (`_0024327E`) and the round limit of scripted battles.
- **Unknown script opcodes** 4, 5, 8, 17, 18, 19, 25, 78 and 79 stop a
  script on the device; here they are skipped, so archives made for other
  engines keep running.
- Shops, the item and status menus and saving were not compared in detail.
