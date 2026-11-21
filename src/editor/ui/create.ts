// Making new resources: the next free number, sensible defaults, and the
// list of everything an author can create (used by the sidebar's "+"
// buttons, the command palette and the project home).
import {
  encodeGoods, encodeLevelChain, encodeMagic, encodeMagicChain, encodeMap, encodeMonster, encodeNpc, encodePlayer, encodeSceneObj,
} from "../format/encode";
import { assemble } from "../format/gut";
import { findEntry, putEntry, type LibArchive } from "../format/lib";
import { blankAnimation, blankGraphic } from "../template/newres";
import type { GroupId } from "./workspace";

export const ITEM_KINDS = ["Hat", "Clothes", "Shoes", "Armour", "Bracers", "Accessory", "Weapon", "Thrown weapon", "Medicine", "Revival", "Elixir", "Stimulant", "Escape item", "Story item"];
export const SPELL_KINDS = ["Attack", "Enhance", "Restore", "Revive", "Steal"];

/** A new level table: ten levels of steady growth. */
export const defaultLevels = (index: number) =>
  encodeLevelChain(index, Array.from({ length: 10 }, (_, i) => ({ maxHP: 60 + i * 12, maxMP: 10 + i * 3, attack: 10 + i * 3, defend: 5 + i * 2, nextExp: 15 + i * i * 10, speed: 10 + i, lingli: 5 + i, luck: 10 + i, magics: 1 })));

export function nextIndex(a: LibArchive, resType: number, type: number): number {
  for (let i = 1; i < 256; i++) if (!findEntry(a, resType, type, i)) return i;
  throw new Error("No free index left");
}

/** Resources store their own number in byte 1; keep it in step with the index. */
export function withIndex(data: Uint8Array, index: number): Uint8Array {
  const out = data.slice();
  if (out.length > 1) out[1] = index;
  return out;
}

/** Point a script's `.gut` header line at a new number. */
export function withGutIndex(source: string, index: number): string {
  return source.replace(/^(\s*\.gut\s+\d+\s+)\d+/m, `$1${index}`);
}

/** Something an author can make: `what` is what createResource takes. */
export interface CreateOption {
  what: string;
  label: string;
  group: GroupId;
}

export const CREATE_OPTIONS: CreateOption[] = [
  { what: "script", label: "Script", group: "story" },
  { what: "map", label: "Map", group: "world" },
  { what: "player", label: "Party member", group: "characters" },
  { what: "npc", label: "Person (NPC)", group: "characters" },
  { what: "monster", label: "Monster", group: "characters" },
  { what: "object", label: "Object (chest, sign…)", group: "characters" },
  ...ITEM_KINDS.map((n, i) => ({ what: `item:${i + 1}`, label: n, group: "items" as const })),
  ...SPELL_KINDS.map((n, i) => ({ what: `magic:${i + 1}`, label: `${n} spell`, group: "items" as const })),
  ...(
    [
      ["7-1", "Tileset"],
      ["8-1", "Party walk sprite"],
      ["8-2", "Person walk sprite"],
      ["8-3", "Monster battle sprite"],
      ["8-4", "Object sprite"],
      ["11-1", "Portrait"],
      ["11-3", "Party battle sprite"],
      ["11-4", "Battle background"],
      ["11-5", "Story picture"],
    ] as const
  ).map(([k, n]) => ({ what: `gfx:${k}`, label: n, group: "art" as const })),
  ...ITEM_KINDS.map((n, i) => ({ what: `gfx:9-${i + 1}`, label: `${n} icon`, group: "art" as const })),
  { what: "anim:1", label: "Cut-scene animation", group: "art" },
  { what: "anim:2", label: "Spell / item effect", group: "art" },
  { what: "chain", label: "Spell list", group: "advanced" },
  { what: "levels", label: "Level table", group: "advanced" },
];

/** A new map: 20×14 tiles, a wall of tile 2 around a walkable floor. */
function newMap(index: number): Uint8Array {
  const w = 20;
  const h = 14;
  const cells = Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    const border = x < 3 || y < 2 || x >= w - 3 || y >= h - 2;
    return { tile: border ? 2 : 0, walkable: !border, event: 0 };
  });
  return encodeMap({ type: 1, index, tileset: 1, name: `MAP ${index}`, width: w, height: h, cells });
}

/**
 * Create a resource with sensible defaults (`what` as in CREATE_OPTIONS) and
 * return its key ("resType-type-index"). Party members also get their
 * portrait, battle sprite and level table. Throws when nothing is free.
 */
export function createResource(a: LibArchive, what: string): string {
  const [kind, sub] = what.split(":");
  let resType = 0;
  let type = 0;
  let index = 0;
  let data: Uint8Array;
  const idx = (rt: number, t: number) => nextIndex(a, rt, t);
  switch (kind) {
    case "script":
      [resType, type, index] = [1, 1, idx(1, 1)];
      data = assemble(`.gut 1 ${index}\n.desc "chapter ${index}"\n.events 40\n\n@start:\n  callback\n`);
      break;
    case "map":
      [resType, type, index] = [2, 1, idx(2, 1)];
      data = newMap(index);
      break;
    case "player":
      [resType, type, index] = [3, 1, idx(3, 1)];
      // The engine finds a party member's portrait (11-1-N), battle
      // sprite (11-3-N) and level table (12-2-N) by the member's own number.
      for (const t of [1, 3]) {
        if (findEntry(a, 11, t, index)) continue;
        const like = findEntry(a, 11, t, 1);
        putEntry(a, { resType: 11, type: t, index, data: like ? withIndex(like.data, index) : blankGraphic(a, 11, t, index) });
      }
      if (!findEntry(a, 12, 2, index)) putEntry(a, { resType: 12, type: 2, index, data: defaultLevels(index) });
      data = encodePlayer({ index, name: `Hero ${index}`, walkSprite: 1, magicChain: 1, magicsKnown: 1, level: 1, maxHP: 60, maxMP: 10, attack: 10, defend: 5, speed: 10, lingli: 5, luck: 10 });
      break;
    case "npc":
      [resType, type, index] = [3, 2, idx(3, 2)];
      data = encodeNpc({ index, name: `NPC ${index}`, sprite: 1 });
      break;
    case "monster":
      [resType, type, index] = [3, 3, idx(3, 3)];
      data = encodeMonster({ index, name: `Monster ${index}`, sprite: 1, level: 1, maxHP: 30, attack: 8, defend: 3, speed: 6, money: 5, exp: 5 });
      break;
    case "object":
      [resType, type, index] = [3, 4, idx(3, 4)];
      data = encodeSceneObj({ index, name: `Object ${index}`, sprite: 1 });
      break;
    case "item": {
      type = Number(sub);
      [resType, index] = [6, idx(6, type)];
      const icon = a.entries.find((e) => e.resType === 9 && e.type === type)?.index ?? 1;
      data = encodeGoods({ type, index, name: `Item ${index}`, icon, description: "A new item.", buy: 10, sell: 5, hp: type === 9 ? 30 : undefined });
      break;
    }
    case "magic":
      type = Number(sub);
      [resType, index] = [4, idx(4, type)];
      data = encodeMagic({ type: type as 1 | 2 | 3 | 4 | 5, index, name: `Spell ${index}`, description: "A new spell.", cost: 3, animation: 1, hp: type === 1 ? 20 : type === 3 ? 30 : type === 4 ? 50 : 0 });
      break;
    case "chain":
      [resType, type, index] = [12, 1, idx(12, 1)];
      data = encodeMagicChain(index, []);
      break;
    case "levels":
      [resType, type, index] = [12, 2, idx(12, 2)];
      data = defaultLevels(index);
      break;
    case "gfx": {
      [resType, type] = sub.split("-").map(Number);
      index = idx(resType, type);
      data = blankGraphic(a, resType, type, index);
      break;
    }
    case "anim":
      [resType, type, index] = [5, Number(sub), idx(5, Number(sub))];
      data = blankAnimation(type, index);
      break;
    default:
      throw new Error(`Cannot make “${what}”`);
  }
  putEntry(a, { resType, type, index, data });
  return `${resType}-${type}-${index}`;
}
