// Encoders for every DAT.LIB resource kind. Field offsets mirror the
// engine's setData() implementations (src/engine/fmj/...).
import { gbkBytes } from "../../engine/java";

// ---------------------------------------------------------------------------
// helpers

class Rec {
  readonly b: Uint8Array;
  constructor(size: number) {
    this.b = new Uint8Array(size);
  }
  u8(off: number, v: number): this {
    this.b[off] = v & 0xff;
    return this;
  }
  u16(off: number, v: number): this {
    this.b[off] = v & 0xff;
    this.b[off + 1] = (v >> 8) & 0xff;
    return this;
  }
  /** Sign-magnitude byte (bit 7 = sign), as read by get1ByteSInt. */
  s8(off: number, v: number): this {
    const m = Math.min(127, Math.abs(Math.trunc(v)));
    this.b[off] = v < 0 ? 0x80 | m : m;
    return this;
  }
  /** Sign-magnitude 16-bit, as read by get2BytesSInt. */
  s16(off: number, v: number): this {
    const m = Math.min(0x7fff, Math.abs(Math.trunc(v)));
    this.b[off] = m & 0xff;
    this.b[off + 1] = ((m >> 8) & 0x7f) | (v < 0 ? 0x80 : 0);
    return this;
  }
  /** NUL-terminated GBK string in a fixed field of `max` bytes (including NUL). */
  str(off: number, s: string, max: number, what = "text"): this {
    const bytes = gbkBytes(s);
    if (bytes.length > max - 1) throw new Error(`${what} "${s}" is too long (${bytes.length} bytes, max ${max - 1})`);
    for (let i = 0; i < bytes.length; i++) this.b[off + i] = bytes[i] & 0xff;
    return this;
  }
}

function range(name: string, v: number, lo: number, hi: number): number {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer ${lo}-${hi} (got ${v})`);
  return v;
}

// ---------------------------------------------------------------------------
// images (TIL, ACP, GDP, GGJ, PIC)

/** Pixel values: 0 = white, 1 = black, 2 = transparent. */
export interface Frame {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** Parse ASCII art: '#' black, '.' white, ' ' (or '_') transparent. */
export function frameFromArt(rows: string[]): Frame {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const pixels = new Uint8Array(width * height).fill(2);
  rows.forEach((r, y) => {
    for (let x = 0; x < width; x++) {
      const c = r[x] ?? " ";
      pixels[y * width + x] = c === "#" ? 1 : c === "." ? 0 : 2;
    }
  });
  return { width, height, pixels };
}

export function encodeImage(type: number, index: number, frames: Frame[]): Uint8Array {
  if (frames.length === 0) throw new Error("an image needs at least one frame");
  const { width, height } = frames[0];
  range("image width", width, 1, 255);
  range("image height", height, 1, 255);
  range("frame count", frames.length, 1, 255);
  for (const f of frames) if (f.width !== width || f.height !== height) throw new Error("all frames must have the same size");
  const transparent = frames.some((f) => f.pixels.includes(2));
  const rowBytes = Math.ceil(width / 8) * (transparent ? 2 : 1);
  const out = new Uint8Array(6 + frames.length * rowBytes * height);
  out.set([type, index, width, height, frames.length, transparent ? 2 : 1]);
  let p = 6;
  for (const f of frames) {
    for (let y = 0; y < height; y++) {
      const row = out.subarray(p, p + rowBytes);
      for (let x = 0; x < width; x++) {
        const v = f.pixels[y * width + x];
        if (transparent) {
          const bit = x * 2;
          if (v === 2) row[bit >> 3] |= 0x80 >> (bit & 7);
          else if (v === 1) row[bit >> 3] |= 0x40 >> (bit & 7);
        } else if (v === 1) {
          row[x >> 3] |= 0x80 >> (x & 7);
        }
      }
      p += rowBytes;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// maps

export interface MapCell {
  tile: number; // 0-127
  walkable: boolean;
  event?: number; // 0-255 (map editor event N -> script event N + 40)
}

export function encodeMap(o: { type: number; index: number; tileset: number; name: string; width: number; height: number; cells: MapCell[] }): Uint8Array {
  range("map width", o.width, 1, 127);
  range("map height", o.height, 1, 127);
  if (o.cells.length !== o.width * o.height) throw new Error("cells must contain width*height entries");
  const r = new Rec(0x12 + o.width * o.height * 2);
  r.u8(0, o.type).u8(1, o.index).u8(2, o.tileset).str(3, o.name, 13, "map name").u8(0x10, o.width).u8(0x11, o.height);
  o.cells.forEach((c, i) => {
    r.u8(0x12 + i * 2, (c.walkable ? 0x80 : 0) | range("tile", c.tile, 0, 127));
    r.u8(0x13 + i * 2, c.event ?? 0);
  });
  return r.b;
}

// ---------------------------------------------------------------------------
// characters (ARS)

/** Facing as stored in resource files: 1 north, 2 east, 3 south, 4 west. */
export type Facing = 1 | 2 | 3 | 4;

export interface PlayerDef {
  index: number; // also selects head PIC 1-n, battle sprite PIC 3-n, level chain MLR 2-n
  name: string;
  walkSprite: number; // ACP 1-n
  magicChain?: number; // MLR 1-n
  magicsKnown?: number;
  facing?: Facing;
  x?: number;
  y?: number;
  level: number;
  maxHP: number;
  hp?: number;
  maxMP: number;
  mp?: number;
  attack: number;
  defend: number;
  speed: number;
  lingli: number;
  luck: number;
  exp?: number;
  /** Starting equipment item indexes by slot. */
  equip?: { hat?: number; clothes?: number; armour?: number; bracers?: number; weapon?: number; shoes?: number; deco1?: number; deco2?: number };
}

export function encodePlayer(p: PlayerDef): Uint8Array {
  const r = new Rec(0x3a);
  const e = p.equip ?? {};
  r.u8(0, 1).u8(1, p.index).u8(2, p.facing ?? 3).u8(3, 1).u8(5, p.x ?? 0).u8(6, p.y ?? 0);
  r.u8(9, p.magicsKnown ?? 0).str(0x0a, p.name, 12, "player name").u8(0x16, p.walkSprite).u8(0x17, p.magicChain ?? 0);
  r.u8(0x18, e.hat ?? 0).u8(0x19, e.clothes ?? 0).u8(0x1a, e.armour ?? 0).u8(0x1b, e.bracers ?? 0);
  r.u8(0x1c, e.weapon ?? 0).u8(0x1d, e.shoes ?? 0).u8(0x1e, e.deco1 ?? 0).u8(0x1f, e.deco2 ?? 0);
  r.u8(0x20, p.level).u16(0x26, p.maxHP).u16(0x28, p.hp ?? p.maxHP).u16(0x2a, p.maxMP).u16(0x2c, p.mp ?? p.maxMP);
  r.u16(0x2e, p.attack).u16(0x30, p.defend).u16(0x32, p.exp ?? 0).u8(0x36, p.speed).u8(0x37, p.lingli).u8(0x38, p.luck);
  return r.b;
}

/** NPC movement: 0 stop, 1 forced, 2 walk around, 3 pause, 4 animate in place. */
export interface NpcDef {
  index: number;
  name: string;
  sprite: number; // ACP 2-n (NPC) or ACP 4-n (scene object)
  facing?: Facing;
  step?: number;
  state?: 0 | 1 | 2 | 3 | 4;
  delay?: number; // pause length (x100 ms); 0 forces "stop"
}

function encodeNpcLike(kind: 2 | 4, n: NpcDef): Uint8Array {
  const r = new Rec(0x18);
  r.u8(0, kind).u8(1, n.index).u8(2, n.facing ?? 3).u8(3, n.step ?? 1).u8(4, n.state ?? 0);
  r.str(9, n.name, 12, "name").u8(0x15, n.delay ?? 0).u8(0x16, n.sprite);
  return r.b;
}
export const encodeNpc = (n: NpcDef) => encodeNpcLike(2, n);
/** Chests, signs, lamps... `step` selects the frame (chests: 1 closed, 2 open). */
export const encodeSceneObj = (n: NpcDef) => encodeNpcLike(4, n);

export interface MonsterDef {
  index: number;
  name: string;
  sprite: number; // ACP 3-n
  level: number;
  maxHP: number;
  maxMP?: number;
  attack: number;
  defend: number;
  speed: number;
  lingli?: number;
  luck?: number;
  money: number;
  exp: number;
  magicChain?: number;
  magicsKnown?: number;
  drop?: { type: number; index: number; count: number };
  steal?: { type: number; index: number; count: number };
}

export function encodeMonster(m: MonsterDef): Uint8Array {
  const r = new Rec(0x30);
  r.u8(0, 3).u8(1, m.index).u8(2, m.magicsKnown ?? 0).str(6, m.name, 12, "monster name");
  r.u8(0x12, m.level).u8(0x13, m.speed).u8(0x14, m.lingli ?? 0).u8(0x16, m.luck ?? 0);
  r.u16(0x18, m.maxHP).u16(0x1a, m.maxHP).u16(0x1c, m.maxMP ?? 0).u16(0x1e, m.maxMP ?? 0);
  r.u16(0x20, m.attack).u16(0x22, m.defend).u16(0x24, m.money).u16(0x26, m.exp);
  if (m.steal) r.u8(0x28, m.steal.type).u8(0x29, m.steal.index).u8(0x2a, m.steal.count);
  if (m.drop) r.u8(0x2b, m.drop.type).u8(0x2c, m.drop.index).u8(0x2d, m.drop.count);
  r.u8(0x2e, m.sprite).u8(0x2f, m.magicChain ?? 0);
  return r.b;
}

// ---------------------------------------------------------------------------
// goods (GRS)

/** Goods kinds: 1 hat, 2 clothes, 3 shoes, 4 armour, 5 bracers, 6 decoration,
 *  7 weapon, 8 thrown weapon, 9 medicine, 10 revival, 11 elixir,
 *  12 stimulant, 13 escape item, 14 story item. */
export interface GoodsDef {
  type: number;
  index: number;
  name: string;
  icon: number; // GDP <type>-n
  description: string;
  buy: number;
  sell: number;
  /** Bit mask of players (by ARS index) that may use it; default everyone. */
  usableBy?: number;
  rounds?: number;
  eventId?: number;
  // equipment (1-7)
  maxHP?: number;
  maxMP?: number;
  defend?: number;
  attack?: number;
  lingli?: number;
  speed?: number;
  luck?: number;
  /** 1 sleep, 2 seal, 4 confusion, 8 poison, 16 all (weapons: hits everyone). */
  effectBits?: number;
  // medicine (9) / thrown (8)
  hp?: number;
  mp?: number;
  animation?: number; // SRS 2-n
  // revival (10)
  percent?: number;
}

export function encodeGoods(g: GoodsDef): Uint8Array {
  range("goods type", g.type, 1, 14);
  const r = new Rec(0x86);
  r.u8(0, g.type).u8(1, g.index).u8(3, g.usableBy ?? 0xff).u8(4, g.rounds ?? 0).u8(5, g.icon);
  r.str(6, g.name, 12, "item name").u16(0x12, g.buy).u16(0x14, g.sell);
  r.str(0x1e, g.description, 0x84 - 0x1e, "item description").u16(0x84, g.eventId ?? 0);
  if (g.type <= 7) {
    r.s8(0x16, g.maxMP ?? 0).s8(0x17, g.maxHP ?? 0).s8(0x18, g.defend ?? 0).u8(0x19, g.attack ?? 0);
    r.s8(0x1a, g.lingli ?? 0).s8(0x1b, g.speed ?? 0).u8(0x1c, g.effectBits ?? 0).s8(0x1d, g.luck ?? 0);
  } else if (g.type === 8) {
    r.s16(0x16, g.hp ?? 0).s16(0x18, g.mp ?? 0).u8(0x1a, g.animation ?? 0).u8(0x1b, g.animation ? 2 : 0).u8(0x1c, g.effectBits ?? 0);
  } else if (g.type === 9) {
    r.u16(0x16, g.hp ?? 0).u16(0x18, g.mp ?? 0).u8(0x1a, g.animation ?? 0).u8(0x1c, g.effectBits ?? 0);
  } else if (g.type === 10) {
    r.u8(0x17, g.percent ?? 50);
  } else if (g.type === 11) {
    r.s8(0x16, g.maxMP ?? 0).s8(0x17, g.maxHP ?? 0).s8(0x18, g.defend ?? 0).s8(0x19, g.attack ?? 0);
    r.s8(0x1a, g.lingli ?? 0).s8(0x1b, g.speed ?? 0).s8(0x1d, g.luck ?? 0);
  }
  return r.b;
}

// ---------------------------------------------------------------------------
// magic (MRS)

/** Kinds: 1 attack, 2 enhance, 3 restore, 4 revive, 5 special (steal). */
export interface MagicDef {
  type: 1 | 2 | 3 | 4 | 5;
  index: number;
  name: string;
  description: string;
  cost: number; // MP
  animation: number; // SRS 2-n
  forAll?: boolean;
  rounds?: number;
  hp?: number; // attack: damage; restore: HP healed; revive: percent
  mp?: number;
  cures?: number; // restore: status bits cured
}

export function encodeMagic(m: MagicDef): Uint8Array {
  const r = new Rec(0x80);
  r.u8(0, m.type).u8(1, m.index).u8(2, 0).u8(3, ((m.forAll ? 0x80 : 0) | range("rounds", m.rounds ?? 0, 0, 127)));
  r.u8(4, range("MP cost", m.cost, 0, 127)).u8(5, m.animation).str(6, m.name, 12, "magic name");
  r.str(0x1a, m.description, 0x70 - 0x1a, "magic description");
  if (m.type === 1) r.s16(0x12, m.hp ?? 0).s16(0x14, m.mp ?? 0);
  else if (m.type === 3) r.u16(0x12, m.hp ?? 0).u8(0x18, m.cures ?? 0);
  else if (m.type === 4) r.u16(0x12, m.hp ?? 50);
  return r.b;
}

// ---------------------------------------------------------------------------
// chains (MLR)

export function encodeMagicChain(index: number, magics: { type: number; index: number }[]): Uint8Array {
  const r = new Rec(3 + magics.length * 2);
  r.u8(0, 1).u8(1, index).u8(2, magics.length);
  magics.forEach((m, i) => r.u8(3 + i * 2, m.type).u8(4 + i * 2, m.index));
  return r.b;
}

export interface LevelRow {
  maxHP: number;
  maxMP: number;
  attack: number;
  defend: number;
  nextExp: number;
  speed: number;
  lingli: number;
  luck: number;
  /** Magics from the player's chain known at this level. */
  magics: number;
}

/** Level-up table for player `index`; row 0 is level 1. */
export function encodeLevelChain(index: number, rows: LevelRow[]): Uint8Array {
  range("max level", rows.length, 1, 255);
  const r = new Rec(4 + rows.length * 20);
  r.u8(0, 2).u8(1, index).u8(2, rows.length);
  rows.forEach((l, i) => {
    const o = 4 + i * 20;
    r.u16(o, l.maxHP).u16(o + 2, l.maxHP).u16(o + 4, l.maxMP).u16(o + 6, l.maxMP);
    r.u16(o + 8, l.attack).u16(o + 10, l.defend).u16(o + 14, l.nextExp);
    r.u8(o + 16, l.speed).u8(o + 17, l.lingli).u8(o + 18, l.luck).u8(o + 19, l.magics);
  });
  return r.b;
}

// ---------------------------------------------------------------------------
// animations (SRS)

export interface SrsFrame {
  x: number;
  y: number;
  /** Ticks this frame stays visible. */
  show: number;
  /** Ticks after which the next frame starts (frames may overlap). */
  next: number;
  /** Index into `images`. */
  image: number;
}

export function encodeSrs(type: number, index: number, frames: SrsFrame[], images: Frame[]): Uint8Array {
  range("frame count", frames.length, 1, 255);
  range("image count", images.length, 1, 255);
  const imgs = images.map((f, i) => encodeImage(1, i + 1, [f]));
  const size = 6 + frames.length * 5 + imgs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(size);
  out.set([type, index, frames.length, images.length, 0, frames.length - 1]);
  frames.forEach((f, i) => {
    if (f.image < 0 || f.image >= images.length) throw new Error(`frame ${i} uses missing image ${f.image}`);
    out.set([f.x & 0xff, f.y & 0xff, range("show", f.show, 1, 255), range("next", f.next, 1, 255), f.image], 6 + i * 5);
  });
  let p = 6 + frames.length * 5;
  for (const b of imgs) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}
