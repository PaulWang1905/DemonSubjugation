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

## Still different

These are larger pieces of the original that are not reproduced yet:

- **Enemy behaviour**: original enemies also cast their spells and use
  items; here they only attack.
- **Status effects**: enemy attacks inflicting poison / confusion / seal /
  sleep (`_0024314B` luck roll) and their round counts; buff and debuff
  amounts (the original keeps attack/defence/speed deltas per fighter).
- **Group attack** (围攻, `_00226D37`): damage scaled by distance.
- **Per-turn HP/MP changes** from equipment (`_0023D20C`).
- **Unknown script opcodes** 4, 5, 8, 17, 18, 19, 25, 78 and 79 stop a
  script on the device; here they are skipped, so archives made for other
  engines keep running.
- Shops, the item and status menus and saving were not compared in detail.
