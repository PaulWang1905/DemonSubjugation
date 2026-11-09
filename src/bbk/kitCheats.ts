// The debug menu for a game made with BBK's RPG kit (RpgA100.eng: the 伏魔记
// series, 英雄坛说): the JS engine's Cheats, read and written in the running
// game's memory, with names from the fmj library the .gam carries.
//
// Where the kit's engine keeps what is from the C reconstruction of it (gitee
// fmj-engine, engine_internal.h). Builds of the engine differ: 英雄坛说,
// 完美版 and 怀旧终曲 keep their variables at those addresses, 伏魔记 1.3 two
// bytes further on, 1.0 and 1.2 those from $197B on one byte earlier (they
// lack the reconstruction's "show the hero's position" there). So the layout,
// a shift for the variables before $197B and one for those after, is found in the game (its inventory pointers) and confirmed against
// its library (the current map's name) before anything is used.

import { STAT_MAX, type Cheats, type CheatSwitches, type ItemInfo, type Library, type PartyMember, type StatKey } from "../engine";
import type { Machine } from "./machine";

// The engine's variables, at the reconstruction's addresses.
const MONEY = 0x1a8f; // 32 bits
/** The pointer to the inventory (always $4A10 once the engine has started), and how many kinds it holds. */
const INVENTORY_PTR = 0x192f, KINDS = 0x1a95;
/** 3 actor slots of $19 bytes; a party member in each whose resource id is not 0. */
const ACTORS = 0x1988;
/** The pointer to the story flags: 302 bytes in the program's RAM (past the OS's, $2000-$20FF), flag n at bit n % 8 of byte n / 8. */
const FLAGS_PTR = 0x1aa9, RAM = 0x2100, RAM_END = 0x8000;
/** The current map, its name, and the view's top left on it (the hero stands at (4, 3) in the view). */
const MAP_TYPE = 0x1979, MAP_INDEX = 0x197a, MAP_NAME = 0x1942, VIEW_X = 0x197c, VIEW_Y = 0x197d;
/** Random battles: 0 off, 1 on. */
const ENCOUNTERS = 0x1a96;
/** 3 enemy slots of $33 bytes; one is used while its resource id is not 0. */
const ENEMIES = 0x1826;

/** How far a build may have moved its variables from those addresses; where the second part of them starts. */
const SHIFTS = [0, 2, -2, 1, -1, 3, -3, 4, -4], LATE = 0x197b;
const INVENTORY = 0x4a10, MAX_KINDS = 200, FLAGS = 302 * 8;
const ACTOR = 0x19, ENEMY = 0x33;
/** In an actor: resource id, spells learnt from its chain, its chain, spells in its buffer, and pointers to its name, stats, spell buffer and inventory. */
const RES = 0x01, LEARNT = 0x09, CHAIN = 0x0d, KNOWN = 0x0e, NAME = 0x0f, STATS = 0x11, SPELLS = 0x15, ITEMS = 0x17;
/** A spell buffer holds 52 (it is $68 bytes). */
const MAX_SPELLS = 52;
const HERO_X = 4, HERO_Y = 3;
/** In an enemy: level, HP limit, HP. */
const ENEMY_LEVEL = 0x12, ENEMY_MAX_HP = 0x18, ENEMY_HP = 0x1a;

/**
 * Where each stat is in a stats block, and its size in bytes. The block is a
 * copy of the character's record in the library from +$20, so these are the
 * JS engine's offsets (Player.setData) less $20; the game's own status page
 * shows the same (身法, 灵力, 幸运 at +$16-$18). (The reconstruction's
 * ActorStats names these bytes otherwise: +$01-$04 are 0 in every record.)
 */
const STAT_AT: Record<StatKey, [number, 1 | 2]> = {
  level: [0x00, 1],
  maxHP: [0x06, 2],
  hp: [0x08, 2],
  maxMP: [0x0a, 2],
  mp: [0x0c, 2],
  attack: [0x0e, 2],
  defend: [0x10, 2],
  currentExp: [0x12, 2],
  speed: [0x16, 1],
  lingli: [0x17, 1],
  luck: [0x18, 1],
};

const gbk = new TextDecoder("gbk");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(Number.isFinite(v) ? v : 0)));

export class KitCheats implements Cheats {
  private readonly on: CheatSwitches = { noRandomBattles: false, walkThroughWalls: false, alwaysFull: false };
  /** The game's own random-battle setting, while noRandomBattles keeps it off. */
  private encounters = 0;
  /** How far this build's variables before LATE, and from it on, are from the reconstruction's addresses, once found. */
  private shift: [number, number] | null = null;

  constructor(
    private readonly m: Machine,
    private readonly lib: Library,
  ) {}

  /**
   * Whether the kit's engine is running a game whose memory is as described:
   * the layout found (the global and the first actor's inventory pointers
   * both $4A10), the current map's name the library's, the party plausible.
   * Otherwise the menu leaves the game alone.
   */
  ready(): boolean {
    if (!this.shift) {
      const early = SHIFTS.find((s) => this.word(INVENTORY_PTR + s) === INVENTORY);
      const late = SHIFTS.find((s) => this.word(ACTORS + s + ITEMS) === INVENTORY);
      if (early === undefined || late === undefined) return false;
      this.shift = [early, late];
    }
    if (this.word(this.at(INVENTORY_PTR)) !== INVENTORY) return false;
    const map = this.lib.map(this.byte(this.at(MAP_TYPE)), this.byte(this.at(MAP_INDEX)));
    if (!map || map.name !== this.text(this.at(MAP_NAME), 11)) return false;
    const members = this.members();
    return (
      members.length > 0 &&
      members.every((slot) => {
        const s = this.stats(slot), level = this.byte(s);
        return s !== 0 && level >= 1 && level <= STAT_MAX.level && this.word(s + STAT_AT.hp[0]) <= this.word(s + STAT_AT.maxHP[0]);
      })
    );
  }

  /** Keep the switches on: called after each frame the game runs. */
  tick(): void {
    if (!this.ready()) return;
    if (this.on.alwaysFull) this.heal();
    if (this.on.noRandomBattles) {
      // (a script turning them on meanwhile is remembered; one turning them off is not seen)
      const v = this.byte(this.at(ENCOUNTERS));
      if (v) {
        this.encounters = v;
        this.m.write(this.at(ENCOUNTERS), 0);
      }
    }
  }

  party(): PartyMember[] {
    if (!this.ready()) return [];
    return this.members().map((slot) => {
      const a = this.actor(slot), s = this.stats(slot);
      const stats = Object.fromEntries(Object.entries(STAT_AT).map(([k, [at, size]]) => [k, size === 1 ? this.byte(s + at) : this.word(s + at)]));
      return {
        ...(stats as Record<StatKey, number>),
        slot,
        name: this.text(this.word(a + NAME), 12),
        magicsKnown: this.byte(a + KNOWN),
        magicsTotal: Math.min(MAX_SPELLS, this.lib.magicChain(this.byte(a + CHAIN)).length),
      };
    });
  }

  setStat(slot: number, key: StatKey, value: number): void {
    if (!this.ready() || !this.members().includes(slot)) return;
    const s = this.stats(slot), [at, size] = STAT_AT[key];
    const max = key === "hp" ? this.word(s + STAT_AT.maxHP[0]) : key === "mp" ? this.word(s + STAT_AT.maxMP[0]) : STAT_MAX[key];
    const v = clamp(value, key === "level" ? 1 : 0, max);
    if (size === 1) this.m.write(s + at, v);
    else this.setWord(s + at, v);
    // (lowering a maximum lowers what is above it)
    if (key === "maxHP" && this.word(s + STAT_AT.hp[0]) > v) this.setWord(s + STAT_AT.hp[0], v);
    if (key === "maxMP" && this.word(s + STAT_AT.mp[0]) > v) this.setWord(s + STAT_AT.mp[0], v);
  }

  heal(): void {
    for (const p of this.party()) {
      this.setStat(p.slot, "hp", p.maxHP);
      this.setStat(p.slot, "mp", p.maxMP);
    }
  }

  /** As the engine learns a spell: its type and index appended to the actor's buffer, both counts raised. */
  learnAllMagic(slot: number): void {
    if (!this.ready() || !this.members().includes(slot)) return;
    const a = this.actor(slot), buffer = this.word(a + SPELLS);
    const chain = this.lib.magicChain(this.byte(a + CHAIN)).slice(0, MAX_SPELLS);
    if (chain.length <= this.byte(a + KNOWN)) return;
    for (let i = this.byte(a + KNOWN); i < chain.length; i++) {
      this.m.write(buffer + 2 * i, chain[i][0]);
      this.m.write(buffer + 2 * i + 1, chain[i][1]);
    }
    this.m.write(a + KNOWN, chain.length);
    this.m.write(a + LEARNT, chain.length);
  }

  money(): number {
    return this.ready() ? this.word(this.at(MONEY)) + this.word(this.at(MONEY) + 2) * 0x10000 : 0;
  }

  setMoney(v: number): void {
    if (!this.ready()) return;
    const n = clamp(v, 0, 999999);
    this.setWord(this.at(MONEY), n & 0xffff);
    this.setWord(this.at(MONEY) + 2, n >>> 16);
  }

  inventory(): ItemInfo[] {
    if (!this.ready()) return [];
    return Array.from({ length: this.byte(this.at(KINDS)) }, (_, i) => {
      const at = INVENTORY + 3 * i, type = this.byte(at), index = this.byte(at + 1);
      return { type, index, name: this.lib.itemName(type, index), count: this.byte(at + 2) };
    });
  }

  catalogue(): ItemInfo[] {
    const have = this.inventory();
    return this.lib.items().map((i) => ({ ...i, count: have.find((h) => h.type === i.type && h.index === i.index)?.count ?? 0 }));
  }

  /** Change a count in place; an item at 0 leaves the list (the rest move up), a new one goes at its end. */
  setItemCount(type: number, index: number, count: number): void {
    if (!this.ready()) return;
    const want = clamp(count, 0, 99), kinds = this.byte(this.at(KINDS));
    const i = this.inventory().findIndex((it) => it.type === type && it.index === index);
    if (i >= 0 && want > 0) this.m.write(INVENTORY + 3 * i + 2, want);
    else if (i >= 0) {
      for (let at = INVENTORY + 3 * i; at < INVENTORY + 3 * (kinds - 1); at++) this.m.write(at, this.byte(at + 3));
      this.m.write(this.at(KINDS), kinds - 1);
    } else if (want > 0 && kinds < MAX_KINDS) {
      [type, index, want].forEach((v, k) => this.m.write(INVENTORY + 3 * kinds + k, v));
      this.m.write(this.at(KINDS), kinds + 1);
    }
  }

  /** The story flags' address, when it is where this build is understood to keep it (伏魔记 1.0 keeps them elsewhere). */
  private flagsAt(): number | null {
    const p = this.word(this.at(FLAGS_PTR));
    return this.ready() && p >= RAM && p + FLAGS / 8 <= RAM_END ? p : null;
  }

  flags(): number[] {
    const base = this.flagsAt(), out: number[] = [];
    if (base === null) return out;
    for (let n = 1; n < FLAGS; n++) if (this.byte(base + (n >> 3)) & (1 << (n & 7))) out.push(n);
    return out;
  }

  setFlag(n: number, on: boolean): void {
    const base = this.flagsAt();
    if (base === null || n < 1 || n >= FLAGS) return;
    const at = base + (n >> 3), bit = 1 << (n & 7);
    this.m.write(at, on ? this.byte(at) | bit : this.byte(at) & ~bit);
  }

  location(): { map: string; type: number; index: number; x: number; y: number } | null {
    if (!this.ready()) return null;
    return {
      map: this.text(this.at(MAP_NAME), 11),
      type: this.byte(this.at(MAP_TYPE)),
      index: this.byte(this.at(MAP_INDEX)),
      x: this.byte(this.at(VIEW_X)) + HERO_X,
      y: this.byte(this.at(VIEW_Y)) + HERO_Y,
    };
  }

  inCombat(): boolean {
    return this.ready() && this.enemies().length > 0;
  }

  /** Every enemy's HP to 0: the engine ends the battle at its next check. */
  winCombat(): void {
    if (this.ready()) for (const e of this.enemies()) this.setWord(e + ENEMY_HP, 0);
  }

  switches(): CheatSwitches {
    return { ...this.on };
  }

  /**
   * Walking through walls is not offered: these builds read the tiles around
   * the hero from the map's data again as they handle each step, after
   * anything written into their view of it, so it would need the engine's
   * own test answered.
   */
  cannot(name: keyof CheatSwitches | "flags"): string | null {
    if (name === "walkThroughWalls") return "Not for .gam games yet: the engine reads the map again before each step.";
    if (name === "flags" && this.ready() && this.flagsAt() === null) return "Not for this game yet: it keeps its story flags elsewhere.";
    return null;
  }

  setSwitch(name: keyof CheatSwitches, on: boolean): void {
    if (this.on[name] === on || this.cannot(name)) return;
    this.on[name] = on;
    if (!this.ready()) return;
    if (name === "noRandomBattles") {
      if (on) this.encounters = this.byte(this.at(ENCOUNTERS));
      else this.m.write(this.at(ENCOUNTERS), this.encounters);
    }
    if (on) this.tick();
  }

  /** An engine variable's address in this build. */
  private at(variable: number): number {
    return variable + (this.shift?.[variable < LATE ? 0 : 1] ?? 0);
  }

  private actor(slot: number): number {
    return this.at(ACTORS) + slot * ACTOR;
  }

  private stats(slot: number): number {
    return this.word(this.actor(slot) + STATS);
  }

  /** The party's slots. */
  private members(): number[] {
    return [0, 1, 2].filter((slot) => this.byte(this.actor(slot) + RES) !== 0);
  }

  /**
   * The enemy slots in use, and only those that look like enemies (a level,
   * HP within its limit): battles are not yet checked in every build, so a
   * wrong address shows no battle rather than being written to.
   */
  private enemies(): number[] {
    return [0, 1, 2]
      .map((i) => this.at(ENEMIES) + i * ENEMY)
      .filter((e) => {
        const level = this.byte(e + ENEMY_LEVEL), max = this.word(e + ENEMY_MAX_HP);
        return this.byte(e + RES) !== 0 && level >= 1 && level <= STAT_MAX.level && max > 0 && this.word(e + ENEMY_HP) <= max;
      });
  }

  private byte(a: number): number {
    return this.m.read(a & 0xffff);
  }

  private word(a: number): number {
    return this.byte(a) | (this.byte(a + 1) << 8);
  }

  private setWord(a: number, v: number): void {
    this.m.write(a & 0xffff, v & 0xff);
    this.m.write((a + 1) & 0xffff, (v >> 8) & 0xff);
  }

  /** A GBK string of at most `max` bytes, ending at a 0. */
  private text(a: number, max: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < max && this.byte(a + i); i++) bytes.push(this.byte(a + i));
    return gbk.decode(new Uint8Array(bytes));
  }
}
