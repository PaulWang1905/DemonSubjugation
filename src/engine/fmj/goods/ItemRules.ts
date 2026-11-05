// How the original engine applies an item's effect bytes (0x16-0x1d) to a
// character: equipping and unequipping, medicine, elixirs (_0022111F,
// _00221979, _00221AE9, _00221F23 in BA4988/fmj-engine).
//
// Stat bytes are sign-and-magnitude: 0x85 means -5, not -123. Subtracting
// stops at 0. Weapons add their attack byte and armour its defence byte
// as plain unsigned numbers.
import type { FightingCharacter } from "../characters/FightingCharacter";

/** The effect bytes in the order the original reads them (high byte of each word first). */
export function effectList(raw: Uint8Array): number[] {
  return [raw[1], raw[0], raw[3], raw[2], raw[5], raw[4], raw[7], raw[6]];
}

const ZERO = new Uint8Array(8);
/** A little-endian word of the effect bytes. */
export const word = (raw: Uint8Array, i: number) => raw[i] | (raw[i + 1] << 8);
const FIELDS = ["maxHP", "maxMP", "attack", "defend", "speed", "lingli", "luck"] as const;

/** Which of the seven stat fields an item type changes by sign-and-magnitude. */
const FIELD_MAPS: Record<number, number[]> = {
  0: [0, 1, 3, 4, 5, 6], // weapons (attack is added directly)
  1: [0, 1, 2, 4, 5, 6], // armour (defence is added directly)
  2: [2, 3, 4, 5, 6], // accessories
  3: [0, 1, 2, 3, 4, 5, 6], // elixirs
};

/** Add or subtract a sign-and-magnitude byte (_00221AE9). */
function statDelta(fc: FightingCharacter, field: number, value: number, add: boolean): void {
  if (value >= 0x80) {
    value -= 0x80;
    add = !add;
  }
  const key = FIELDS[field];
  const cur = fc[key];
  if (add) fc[key] = field < 4 ? (cur + value) & 0xffff : (cur + value) & 0xff;
  else fc[key] = cur > value ? cur - value : 0;
}

/** Signed byte add without a floor (_00221F23), for the per-turn bytes. */
export function addSignedByte(field: number, value: number, add: boolean): number {
  if (value >= 0x80) {
    value -= 0x80;
    add = !add;
  }
  return (add ? field + value : field - value) & 0xff;
}

/**
 * Change `fc` from wearing (or having taken) `oldRaw` to `newRaw` for an
 * item of `type` (_0022111F). Pass null for nothing.
 */
export function applyItemChange(type: number, oldRaw: Uint8Array | null, newRaw: Uint8Array | null, fc: FightingCharacter): void {
  const o = effectList(oldRaw ?? ZERO);
  const n = effectList(newRaw ?? ZERO);
  let kind = -1;
  switch (type) {
    case 7: // weapon
      kind = 0;
      fc.attack = (fc.attack - o[2] + n[2]) & 0xffff;
      break;
    case 1:
    case 2:
    case 3:
    case 4:
    case 5: // armour
      kind = 1;
      fc.defend = (fc.defend - o[3] + n[3]) & 0xffff;
      break;
    case 6: // accessory: its per-turn bytes are read from what is worn
      kind = 2;
      break;
    case 9: // medicine
      fc.hp = fc.hp + word(newRaw ?? ZERO, 0);
      fc.mp = fc.mp + word(newRaw ?? ZERO, 2);
      break;
    case 10: // revival: a percentage of max HP
      fc.hp = Math.trunc((fc.maxHP * n[0]) / 100);
      break;
    case 11: // elixir: permanent changes
      kind = 3;
      break;
  }
  if (kind >= 0) {
    for (const f of FIELD_MAPS[kind]) {
      statDelta(fc, f, o[f], false);
      statDelta(fc, f, n[f], true);
    }
  }
  clampStats(fc);
}

/** The original's limits (_00221FE3): 999 and 99, HP and MP within their maximum. */
export function clampStats(fc: FightingCharacter): void {
  if (fc.maxHP > 999) fc.maxHP = 999;
  if (fc.hp > fc.maxHP) fc.hp = fc.maxHP;
  if (fc.maxMP > 999) fc.maxMP = 999;
  if (fc.mp > fc.maxMP) fc.mp = fc.maxMP;
  if (fc.attack > 999) fc.attack = 999;
  if (fc.defend > 999) fc.defend = 999;
  if (fc.speed > 99) fc.speed = 99;
  if (fc.lingli > 99) fc.lingli = 99;
  if (fc.luck > 99) fc.luck = 99;
}
