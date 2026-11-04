// Test tools for the player's hidden debug menu: read and change the running
// game's party, inventory and story flags, plus a few switches.
import { EngineSettings } from "./fmj/config/EngineSettings";
import type { MainGame } from "./fmj/Game";
import { Player } from "./fmj/characters/Player";
import { Combat } from "./fmj/combat/Combat";
import type { BaseGoods } from "./fmj/goods/BaseGoods";
import { DatLib, ResType } from "./fmj/lib/DatLib";
import { ScriptResources } from "./fmj/script/ScriptResources";

export const STAT_KEYS = ["level", "currentExp", "maxHP", "hp", "maxMP", "mp", "attack", "defend", "speed", "lingli", "luck"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Upper limits the engine itself applies (or needs). */
export const STAT_MAX: Record<StatKey, number> = {
  level: 99,
  currentExp: 65535,
  maxHP: 999,
  hp: 999,
  maxMP: 999,
  mp: 999,
  attack: 999,
  defend: 999,
  speed: 99,
  lingli: 99,
  luck: 99,
};

export interface PartyMember extends Record<StatKey, number> {
  slot: number;
  name: string;
  magicsKnown: number;
  magicsTotal: number;
}

export interface ItemInfo {
  type: number;
  index: number;
  name: string;
  count: number;
}

export interface CheatSwitches {
  noRandomBattles: boolean;
  walkThroughWalls: boolean;
  alwaysFull: boolean;
}

export interface Cheats {
  party(): PartyMember[];
  setStat(slot: number, key: StatKey, value: number): void;
  heal(): void;
  learnAllMagic(slot: number): void;
  money(): number;
  setMoney(v: number): void;
  inventory(): ItemInfo[];
  /** Every item in the game archive. */
  catalogue(): ItemInfo[];
  setItemCount(type: number, index: number, count: number): void;
  flags(): number[];
  setFlag(n: number, on: boolean): void;
  location(): { map: string; type: number; index: number; x: number; y: number } | null;
  inCombat(): boolean;
  winCombat(): void;
  switches(): CheatSwitches;
  setSwitch(name: keyof CheatSwitches, on: boolean): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(Number.isFinite(v) ? v : 0)));

function info(g: BaseGoods, count = g.goodsNum): ItemInfo {
  return { type: g.type, index: g.index, name: g.name, count };
}

export function createCheats(game: MainGame): Cheats {
  const members = () => game.playerList;
  const api: Cheats = {
    party() {
      return members().map((p, slot) => ({
        slot,
        name: p.name,
        level: p.level,
        currentExp: p.currentExp,
        maxHP: p.maxHP,
        hp: p.hp,
        maxMP: p.maxMP,
        mp: p.mp,
        attack: p.attack,
        defend: p.defend,
        speed: p.speed,
        lingli: p.lingli,
        luck: p.luck,
        magicsKnown: p.magicChain?.learnNum ?? 0,
        magicsTotal: p.magicChain?.size ?? 0,
      }));
    },
    setStat(slot, key, value) {
      const p = members()[slot];
      if (!p) return;
      const v = clamp(value, key === "level" ? 1 : 0, STAT_MAX[key]);
      p[key] = v;
      // keep current values within their maximum
      if (key === "maxHP") p.hp = Math.min(p.hp, v);
      if (key === "maxMP") p.mp = Math.min(p.mp, v);
    },
    heal() {
      for (const p of members()) {
        p.hp = p.maxHP;
        p.mp = p.maxMP;
      }
    },
    learnAllMagic(slot) {
      const c = members()[slot]?.magicChain;
      if (c) c.learnNum = c.size;
    },
    money: () => Player.sMoney,
    setMoney(v) {
      Player.sMoney = clamp(v, 0, 999999);
    },
    inventory() {
      const g = Player.sGoodsList;
      return [...g.equipList, ...g.goodsList].map((x) => info(x));
    },
    catalogue() {
      return DatLib.instance
        .listResources()
        .filter((r) => r.resType === ResType.GRS)
        .flatMap((r) => {
          const g = DatLib.getRes(ResType.GRS, r.type, r.index, true) as unknown as BaseGoods | null;
          return g ? [info(g, Player.sGoodsList.getGoodsNum(r.type, r.index))] : [];
        });
    },
    setItemCount(type, index, count) {
      const list = Player.sGoodsList;
      const want = clamp(count, 0, 99);
      const have = list.getGoodsNum(type, index);
      if (want > have) list.addGoods(type, index, want - have);
      else if (want < have) list.useGoodsNum(type, index, have - want);
    },
    flags() {
      const out: number[] = [];
      for (let i = 1; i < ScriptResources.globalEvents.length; i++) if (ScriptResources.globalEvents[i]) out.push(i);
      return out;
    },
    setFlag(n, on) {
      if (n >= 1 && n < ScriptResources.globalEvents.length) ScriptResources.globalEvents[n] = on;
    },
    location() {
      const s = game.mainScene;
      const m = s.currentMap;
      if (!m || !s.player) return null;
      return { map: m.mapName ?? "", type: m.type, index: m.index, x: s.player.posInMap.x, y: s.player.posInMap.y };
    },
    inCombat: () => Combat.IsActive(),
    winCombat() {
      if (Combat.IsActive()) Combat.ForceWin();
    },
    switches: () => ({
      noRandomBattles: EngineSettings.noRandomBattles,
      walkThroughWalls: EngineSettings.walkThroughWalls,
      alwaysFull: EngineSettings.alwaysFull,
    }),
    setSwitch(name, on) {
      EngineSettings[name] = on;
    },
  };
  return api;
}
