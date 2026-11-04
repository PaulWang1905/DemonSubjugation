// Field layouts of the fixed-size resource records, for form editing.
// Forms patch only these bytes; everything else in a record is preserved.
import { gbkBytes, sysGbkDecode } from "../../engine/java";

export type FieldKind =
  | { kind: "u8"; min?: number; max?: number }
  | { kind: "u16"; max?: number }
  | { kind: "s8" } // sign-magnitude, -127..127
  | { kind: "s16" } // sign-magnitude, -32767..32767
  | { kind: "str"; max: number } // bytes including the NUL
  | { kind: "enum"; options: [number, string][] }
  | { kind: "flags"; bits: [number, string][] }
  | { kind: "masked"; mask: number; shift: number; max: number };

/** A link to another resource (shown with its name / existence). */
export interface Ref {
  resType: number;
  /** Fixed sub-type, or the offset of a byte holding it. */
  type: number | { at: number };
}

export type Field = FieldKind & { key: string; label: string; at: number; help?: string; ref?: Ref; group?: string };

const STATUS: [number, string][] = [
  [8, "Poison"],
  [4, "Confusion"],
  [2, "Seal"],
  [1, "Sleep"],
];
const FACING: [number, string][] = [
  [1, "North"],
  [2, "East"],
  [3, "South"],
  [4, "West"],
];

const PLAYER: Field[] = [
  { key: "name", label: "Name", at: 0x0a, kind: "str", max: 12 },
  { key: "level", label: "Level", at: 0x20, kind: "u8", min: 1 },
  { key: "exp", label: "Experience", at: 0x32, kind: "u16" },
  { key: "maxHP", label: "Max HP", at: 0x26, kind: "u16", max: 999, group: "Stats" },
  { key: "hp", label: "HP", at: 0x28, kind: "u16", max: 999, group: "Stats" },
  { key: "maxMP", label: "Max MP", at: 0x2a, kind: "u16", max: 999, group: "Stats" },
  { key: "mp", label: "MP", at: 0x2c, kind: "u16", max: 999, group: "Stats" },
  { key: "attack", label: "Attack", at: 0x2e, kind: "u16", max: 999, group: "Stats" },
  { key: "defend", label: "Defence", at: 0x30, kind: "u16", max: 999, group: "Stats" },
  { key: "speed", label: "Speed", at: 0x36, kind: "u8", max: 99, group: "Stats" },
  { key: "lingli", label: "Spirit", at: 0x37, kind: "u8", max: 99, group: "Stats" },
  { key: "luck", label: "Luck", at: 0x38, kind: "u8", max: 99, group: "Stats" },
  { key: "walk", label: "Walking sprite", at: 0x16, kind: "u8", ref: { resType: 8, type: 1 }, group: "Looks", help: "ACP 1-n. Portrait is picture 1-<index>, battle sprite picture 3-<index>." },
  { key: "facing", label: "Facing", at: 2, kind: "enum", options: FACING, group: "Looks" },
  { key: "chain", label: "Spell list", at: 0x17, kind: "u8", ref: { resType: 12, type: 1 }, group: "Magic" },
  { key: "known", label: "Spells known", at: 9, kind: "u8", group: "Magic", help: "How many spells of the list are known at the start." },
  { key: "hat", label: "Head", at: 0x18, kind: "u8", ref: { resType: 6, type: 1 }, group: "Starting equipment" },
  { key: "clothes", label: "Body", at: 0x19, kind: "u8", ref: { resType: 6, type: 2 }, group: "Starting equipment" },
  { key: "armour", label: "Cape", at: 0x1a, kind: "u8", ref: { resType: 6, type: 4 }, group: "Starting equipment" },
  { key: "bracers", label: "Bracers", at: 0x1b, kind: "u8", ref: { resType: 6, type: 5 }, group: "Starting equipment" },
  { key: "weapon", label: "Weapon", at: 0x1c, kind: "u8", ref: { resType: 6, type: 7 }, group: "Starting equipment" },
  { key: "shoes", label: "Feet", at: 0x1d, kind: "u8", ref: { resType: 6, type: 3 }, group: "Starting equipment" },
  { key: "deco1", label: "Accessory 1", at: 0x1e, kind: "u8", ref: { resType: 6, type: 6 }, group: "Starting equipment" },
  { key: "deco2", label: "Accessory 2", at: 0x1f, kind: "u8", ref: { resType: 6, type: 6 }, group: "Starting equipment" },
];

const npcLike = (sprite: number): Field[] => [
  { key: "name", label: "Name", at: 9, kind: "str", max: 12 },
  { key: "sprite", label: "Sprite", at: 0x16, kind: "u8", ref: { resType: 8, type: sprite } },
  { key: "facing", label: "Facing", at: 2, kind: "enum", options: FACING },
  { key: "step", label: "Frame / step", at: 3, kind: "u8", help: sprite === 4 ? "Objects: 0 first frame, 1 second (e.g. an open chest)." : "0 left foot, 1 standing, 2 right foot." },
  {
    key: "state",
    label: "Movement",
    at: 4,
    kind: "enum",
    options: [
      [0, "Stand still"],
      [1, "Forced walk"],
      [2, "Wander"],
      [3, "Paused"],
      [4, "Animate in place"],
    ],
  },
  { key: "delay", label: "Pause length", at: 0x15, kind: "u8", help: "x100 ms between moves. 0 makes NPCs stand still." },
];

const MONSTER: Field[] = [
  { key: "name", label: "Name", at: 6, kind: "str", max: 12 },
  { key: "level", label: "Level", at: 0x12, kind: "u8" },
  { key: "sprite", label: "Battle sprite", at: 0x2e, kind: "u8", ref: { resType: 8, type: 3 } },
  { key: "maxHP", label: "Max HP", at: 0x18, kind: "u16", max: 999, group: "Stats" },
  { key: "hp", label: "HP", at: 0x1a, kind: "u16", max: 999, group: "Stats" },
  { key: "maxMP", label: "Max MP", at: 0x1c, kind: "u16", max: 999, group: "Stats" },
  { key: "mp", label: "MP", at: 0x1e, kind: "u16", max: 999, group: "Stats" },
  { key: "attack", label: "Attack", at: 0x20, kind: "u16", max: 999, group: "Stats" },
  { key: "defend", label: "Defence", at: 0x22, kind: "u16", max: 999, group: "Stats" },
  { key: "speed", label: "Speed", at: 0x13, kind: "u8", max: 99, group: "Stats" },
  { key: "lingli", label: "Spirit", at: 0x14, kind: "u8", max: 99, group: "Stats" },
  { key: "luck", label: "Luck", at: 0x16, kind: "u8", max: 99, group: "Stats" },
  { key: "iq", label: "Cunning", at: 0x15, kind: "u8", group: "Stats", help: "Stored but not used by the engine yet." },
  { key: "money", label: "Money dropped", at: 0x24, kind: "u16", group: "Rewards" },
  { key: "exp", label: "Experience", at: 0x26, kind: "u16", group: "Rewards" },
  { key: "dropType", label: "Drop: item kind", at: 0x2b, kind: "u8", group: "Rewards" },
  { key: "dropIndex", label: "Drop: item #", at: 0x2c, kind: "u8", group: "Rewards", ref: { resType: 6, type: { at: 0x2b } } },
  { key: "dropCount", label: "Drop: count", at: 0x2d, kind: "u8", group: "Rewards" },
  { key: "stealType", label: "Steal: item kind", at: 0x28, kind: "u8", group: "Rewards" },
  { key: "stealIndex", label: "Steal: item #", at: 0x29, kind: "u8", group: "Rewards", ref: { resType: 6, type: { at: 0x28 } } },
  { key: "stealCount", label: "Steal: count", at: 0x2a, kind: "u8", group: "Rewards" },
  { key: "immune", label: "Immune to", at: 3, kind: "flags", bits: STATUS, group: "Status" },
  { key: "hits", label: "Attacks cause", at: 4, kind: "flags", bits: [...STATUS, [16, "Hits all"]], group: "Status" },
  { key: "rounds", label: "Status rounds", at: 0x17, kind: "u8", group: "Status" },
  { key: "chain", label: "Spell list", at: 0x2f, kind: "u8", ref: { resType: 12, type: 1 }, group: "Magic" },
  { key: "known", label: "Spells known", at: 2, kind: "u8", group: "Magic" },
];

const GOODS_BASE: Field[] = [
  { key: "name", label: "Name", at: 6, kind: "str", max: 12 },
  { key: "desc", label: "Description", at: 0x1e, kind: "str", max: 0x84 - 0x1e },
  { key: "icon", label: "Icon", at: 5, kind: "u8", ref: { resType: 9, type: { at: 0 } } },
  { key: "buy", label: "Buy price", at: 0x12, kind: "u16" },
  { key: "sell", label: "Sell price", at: 0x14, kind: "u16" },
  {
    key: "users",
    label: "Usable by",
    at: 3,
    kind: "flags",
    bits: [
      [1, "Party 1"],
      [2, "Party 2"],
      [4, "Party 3"],
      [8, "Party 4"],
    ],
  },
  { key: "event", label: "Sets event while worn", at: 0x84, kind: "u16", help: "Equipment only: global event set while equipped. Such items cannot be sold." },
];

const EQUIP: Field[] = [
  { key: "maxHP", label: "Max HP", at: 0x17, kind: "s8", group: "Bonuses" },
  { key: "maxMP", label: "Max MP", at: 0x16, kind: "s8", group: "Bonuses" },
  { key: "attack", label: "Attack", at: 0x19, kind: "u8", group: "Bonuses" },
  { key: "defend", label: "Defence", at: 0x18, kind: "s8", group: "Bonuses" },
  { key: "speed", label: "Speed", at: 0x1b, kind: "s8", group: "Bonuses" },
  { key: "lingli", label: "Spirit", at: 0x1a, kind: "s8", group: "Bonuses" },
  { key: "luck", label: "Luck", at: 0x1d, kind: "s8", group: "Bonuses" },
];

function goodsFields(type: number): Field[] {
  if (type >= 1 && type <= 5) return [...GOODS_BASE, ...EQUIP, { key: "fx", label: "Protects from", at: 0x1c, kind: "flags", bits: STATUS, group: "Bonuses" }];
  if (type === 6) {
    const deco = EQUIP.map((f) => (f.key === "maxHP" || f.key === "maxMP" ? { ...f, label: `${f.label} per round`, help: "Stored; not applied by the engine yet." } : f));
    return [...GOODS_BASE, ...deco, { key: "coop", label: "Combined attack magic", at: 0x1c, kind: "u8", ref: { resType: 4, type: 1 }, group: "Bonuses" }];
  }
  if (type === 7)
    return [
      ...GOODS_BASE,
      ...EQUIP,
      { key: "fx", label: "Hits cause", at: 0x1c, kind: "flags", bits: [...STATUS, [16, "Hits all"]], group: "Bonuses" },
      { key: "rounds", label: "Status rounds", at: 4, kind: "u8", group: "Bonuses" },
    ];
  if (type === 8)
    return [
      ...GOODS_BASE.filter((f) => f.key !== "event"),
      { key: "hp", label: "HP damage (negative drains)", at: 0x16, kind: "s16", group: "Effect" },
      { key: "mp", label: "MP damage (negative drains)", at: 0x18, kind: "s16", group: "Effect" },
      { key: "aniType", label: "Animation kind", at: 0x1b, kind: "u8", group: "Effect" },
      { key: "ani", label: "Animation", at: 0x1a, kind: "u8", group: "Effect", ref: { resType: 5, type: { at: 0x1b } } },
      { key: "all", label: "Targets", at: 0x1c, kind: "flags", bits: [[16, "All enemies"]], group: "Effect" },
    ];
  if (type === 9)
    return [
      ...GOODS_BASE.filter((f) => f.key !== "event"),
      { key: "hp", label: "HP restored", at: 0x16, kind: "u16", group: "Effect" },
      { key: "mp", label: "MP restored", at: 0x18, kind: "u16", group: "Effect" },
      { key: "ani", label: "Animation", at: 0x1a, kind: "u8", group: "Effect", ref: { resType: 5, type: 2 } },
      { key: "cures", label: "Cures", at: 0x1c, kind: "flags", bits: [...STATUS, [16, "Whole party"]], group: "Effect" },
    ];
  if (type === 10) return [...GOODS_BASE.filter((f) => f.key !== "event"), { key: "pct", label: "Restores %", at: 0x17, kind: "u8", max: 100, group: "Effect" }];
  if (type === 11) return [...GOODS_BASE.filter((f) => f.key !== "event"), ...EQUIP.map((f) => ({ ...f, kind: "s8" as const, group: "Permanent change" }))];
  if (type === 12)
    return [
      ...GOODS_BASE.filter((f) => f.key !== "event"),
      { key: "atk", label: "Attack +%", at: 0x19, kind: "u8", group: "Effect", help: "Stored; not applied by the engine yet." },
      { key: "def", label: "Defence +%", at: 0x18, kind: "u8", group: "Effect" },
      { key: "spd", label: "Speed +%", at: 0x1b, kind: "u8", group: "Effect" },
      { key: "all", label: "Targets", at: 0x1c, kind: "flags", bits: [[16, "Whole party"]], group: "Effect" },
    ];
  return GOODS_BASE.filter((f) => f.key !== "event");
}

const MAGIC_BASE: Field[] = [
  { key: "name", label: "Name", at: 6, kind: "str", max: 12 },
  { key: "desc", label: "Description", at: 0x1a, kind: "str", max: 0x70 - 0x1a },
  { key: "cost", label: "MP cost", at: 4, kind: "u8", max: 127 },
  { key: "ani", label: "Animation", at: 5, kind: "u8", ref: { resType: 5, type: 2 } },
  { key: "rounds", label: "Rounds", at: 3, kind: "masked", mask: 0x7f, shift: 0, max: 127 },
  { key: "all", label: "Targets everyone", at: 3, kind: "masked", mask: 0x80, shift: 7, max: 1 },
];

function magicFields(type: number): Field[] {
  switch (type) {
    case 1:
      return [
        ...MAGIC_BASE,
        { key: "hp", label: "HP damage (negative drains)", at: 0x12, kind: "s16", group: "Effect" },
        { key: "mp", label: "MP damage", at: 0x14, kind: "s16", group: "Effect", help: "Stored; not applied by the engine yet." },
        { key: "df", label: "Defence -%", at: 0x16, kind: "u8", group: "Effect" },
        { key: "at", label: "Attack -%", at: 0x17, kind: "u8", group: "Effect" },
        { key: "buff", label: "Inflicts", at: 0x18, kind: "flags", bits: STATUS, group: "Effect" },
        { key: "spd", label: "Speed -%", at: 0x19, kind: "u8", group: "Effect" },
      ];
    case 2:
      return [
        ...MAGIC_BASE,
        { key: "df", label: "Defence +%", at: 0x16, kind: "u8", group: "Effect", help: "Enhancement magic is stored but not applied by the engine yet." },
        { key: "at", label: "Attack +%", at: 0x17, kind: "u8", group: "Effect" },
        { key: "spd", label: "Speed +%", at: 0x19, kind: "u8", group: "Effect" },
      ];
    case 3:
      return [
        ...MAGIC_BASE,
        { key: "hp", label: "HP healed", at: 0x12, kind: "u16", group: "Effect" },
        { key: "cures", label: "Cures", at: 0x18, kind: "flags", bits: STATUS, group: "Effect" },
      ];
    case 4:
      return [...MAGIC_BASE, { key: "pct", label: "Revives with % of max", at: 0x12, kind: "u16", max: 100, group: "Effect" }];
    default:
      return MAGIC_BASE;
  }
}

/** Field layout for a record, or null if the kind has no form. */
export function fieldsFor(resType: number, type: number): Field[] | null {
  if (resType === 3) return type === 1 ? PLAYER : type === 2 ? npcLike(2) : type === 3 ? MONSTER : type === 4 ? npcLike(4) : null;
  if (resType === 6) return goodsFields(type);
  if (resType === 4) return magicFields(type);
  return null;
}

// ---------------------------------------------------------------------------

export function readField(b: Uint8Array, f: Field): number | string {
  const at = f.at;
  switch (f.kind) {
    case "u8":
    case "enum":
    case "flags":
      return b[at] ?? 0;
    case "u16":
      return (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
    case "s8": {
      const v = b[at] ?? 0;
      return v & 0x80 ? -(v & 0x7f) : v;
    }
    case "s16": {
      const lo = b[at] ?? 0;
      const hi = b[at + 1] ?? 0;
      const m = lo | ((hi & 0x7f) << 8);
      return hi & 0x80 ? -m : m;
    }
    case "masked":
      return ((b[at] ?? 0) & f.mask) >> f.shift;
    case "str": {
      let e = at;
      while (e < b.length && e < at + f.max && b[e] !== 0) e++;
      return sysGbkDecode(b.subarray(at, e));
    }
  }
}

/** Return a copy of `b` with field `f` set to `v`; throws with a readable message on bad input. */
export function writeField(b: Uint8Array, f: Field, v: number | string): Uint8Array {
  const out = b.length >= f.at + 2 ? b.slice() : (() => {
    const c = new Uint8Array(f.at + (f.kind === "str" ? f.max : 2));
    c.set(b);
    return c;
  })();
  const at = f.at;
  const num = (lo: number, hi: number): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${f.label} must be a whole number from ${lo} to ${hi}`);
    return n;
  };
  switch (f.kind) {
    case "u8":
    case "enum":
    case "flags":
      out[at] = num(f.kind === "u8" ? (f.min ?? 0) : 0, f.kind === "u8" ? (f.max ?? 255) : 255);
      break;
    case "u16": {
      const n = num(0, f.max ?? 65535);
      out[at] = n & 0xff;
      out[at + 1] = n >> 8;
      break;
    }
    case "s8": {
      const n = num(-127, 127);
      out[at] = n < 0 ? 0x80 | -n : n;
      break;
    }
    case "s16": {
      const n = num(-32767, 32767);
      const m = Math.abs(n);
      out[at] = m & 0xff;
      out[at + 1] = ((m >> 8) & 0x7f) | (n < 0 ? 0x80 : 0);
      break;
    }
    case "masked": {
      const n = num(0, f.max);
      out[at] = (out[at] & ~f.mask) | ((n << f.shift) & f.mask);
      break;
    }
    case "str": {
      const bytes = gbkBytes(String(v));
      if (bytes.length > f.max - 1) throw new Error(`${f.label} is too long (${bytes.length} of ${f.max - 1} bytes; a Chinese character takes 2)`);
      out.fill(0, at, at + f.max);
      for (let i = 0; i < bytes.length; i++) out[at + i] = bytes[i] & 0xff;
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// tables (MLR)

export function readMagicChain(b: Uint8Array): { type: number; index: number }[] {
  const n = b[2] ?? 0;
  const out: { type: number; index: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ type: b[3 + i * 2], index: b[4 + i * 2] });
  return out;
}

export const LEVEL_COLUMNS: { key: string; label: string; at: number; size: 1 | 2 }[] = [
  { key: "maxHP", label: "Max HP", at: 0, size: 2 },
  { key: "maxMP", label: "Max MP", at: 4, size: 2 },
  { key: "attack", label: "Attack", at: 8, size: 2 },
  { key: "defend", label: "Defence", at: 10, size: 2 },
  { key: "nextExp", label: "Exp to next", at: 14, size: 2 },
  { key: "speed", label: "Speed", at: 16, size: 1 },
  { key: "lingli", label: "Spirit", at: 17, size: 1 },
  { key: "luck", label: "Luck", at: 18, size: 1 },
  { key: "magics", label: "Spells known", at: 19, size: 1 },
];

export function readLevels(b: Uint8Array): number[][] {
  const n = b[2] ?? 0;
  const rows: number[][] = [];
  for (let l = 0; l < n; l++) {
    const o = 4 + l * 20;
    rows.push(LEVEL_COLUMNS.map((c) => (c.size === 2 ? (b[o + c.at] ?? 0) | ((b[o + c.at + 1] ?? 0) << 8) : (b[o + c.at] ?? 0))));
  }
  return rows;
}

/** Rewrite a level table, keeping unknown bytes of existing rows. */
export function writeLevels(b: Uint8Array, rows: number[][]): Uint8Array {
  if (rows.length < 1 || rows.length > 255) throw new Error("A level table needs 1-255 levels");
  const out = new Uint8Array(4 + rows.length * 20);
  out.set(b.subarray(0, Math.min(b.length, out.length)));
  out[2] = rows.length;
  rows.forEach((r, l) => {
    const o = 4 + l * 20;
    LEVEL_COLUMNS.forEach((c, k) => {
      const v = r[k];
      const max = c.size === 2 ? 65535 : 255;
      if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`Level ${l + 1} ${c.label}: 0-${max}`);
      out[o + c.at] = v & 0xff;
      if (c.size === 2) out[o + c.at + 1] = v >> 8;
      if (c.key === "maxHP") {
        out[o + 2] = v & 0xff; // current HP mirrors max HP
        out[o + 3] = v >> 8;
      }
      if (c.key === "maxMP") {
        out[o + 6] = v & 0xff;
        out[o + 7] = v >> 8;
      }
    });
  });
  return out;
}
