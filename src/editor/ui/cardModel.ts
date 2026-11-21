// The logic behind the record cards (CardView.tsx) and the gallery
// (GalleryView.tsx), without React: what a record is in words, which control
// edits each field of format/schema.ts, what a stored value is allowed to be,
// the key numbers and the effect of an item or a spell in a sentence, where a
// record is used (from the world index) and what a renumbering will touch.
// Tested in tests/editor-cards.test.ts.
import { sentence } from "../format/commands";
import { decodeImage, resourceName } from "../format/decode";
import { assemble } from "../format/gut";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { resourceNote, type ProjectNotes } from "../format/notes";
import { fieldsFor, readField, readMagicChain, writeField, type Field } from "../format/schema";
import { describeKey, parseKey, projectNames, referencesTo, renumberResource, resKey, scriptNames, type Reference, type RenumberResult, type WorldIndex } from "../format/world";

type Ref3 = { resType: number; type: number; index: number };

// ---------------------------------------------------------------------------
// What a record is

export type RecordKind = "party" | "person" | "monster" | "object" | "item" | "spell";

/** The kind of a record that has a card, or null. */
export function recordKind(r: { resType: number; type: number }): RecordKind | null {
  if (r.resType === 3) return (["", "party", "person", "monster", "object"] as const)[r.type] || null;
  if (r.resType === 6 && r.type >= 1 && r.type <= 14) return "item";
  if (r.resType === 4 && r.type >= 1 && r.type <= 5) return "spell";
  return null;
}

/** Whether a resource gets a card (it is a record with a field layout). */
export const hasCard = (r: { resType: number; type: number }) => recordKind(r) !== null && !!fieldsFor(r.resType, r.type);

const SPELL_ROLES = ["Attack spell", "Enhancing spell", "Restoring spell", "Reviving spell", "Special spell"];
const ITEM_ROLES = ["Hat", "Clothes", "Shoes", "Armour (cape)", "Bracers", "Accessory", "Weapon", "Thrown weapon", "Medicine", "Revival item", "Elixir", "Stimulant", "Escape item", "Story item"];
const ITEM_BLURBS = [
  "Worn on the head.",
  "Worn on the body.",
  "Worn on the feet.",
  "Worn over the body.",
  "Worn on the wrists.",
  "Worn as an accessory (two slots).",
  "Held in the hand; adds to attack.",
  "Thrown in battle at the enemies.",
  "Used to restore HP / MP and cure.",
  "Brings a knocked-out party member back.",
  "Changes a party member's stats for good.",
  "Strengthens the party for a battle.",
  "Used to escape (runs event 255 of the running script).",
  "Carried for the story: scripts test for it, it cannot be used.",
];

/** A record's role in words: "Party member #1", "A person", "Monster", "Chest or object", "Weapon", "Attack spell". */
export function roleOf(r: Ref3): string {
  switch (recordKind(r)) {
    case "party":
      return `Party member #${r.index}`;
    case "person":
      return "A person";
    case "monster":
      return "Monster";
    case "object":
      return "Chest or object";
    case "item":
      return ITEM_ROLES[r.type - 1];
    case "spell":
      return SPELL_ROLES[r.type - 1];
    default:
      return "Record";
  }
}

/** One more sentence about the role (what the engine does with it). */
export function roleBlurb(r: Ref3): string {
  switch (recordKind(r)) {
    case "party":
      return r.index <= 4
        ? `Joins the party when a script adds member ${r.index}. Uses portrait 1-${r.index}, battle sprite 3-${r.index} and level table 2-${r.index}.`
        : `Only party members 1-4 can use equipment.`;
    case "person":
      return "Placed on a map by a script; talking to them runs that script's event.";
    case "monster":
      return "Fought in battles a script sets up (random or scripted).";
    case "object":
      return "A chest, sign, door or anything placed on a map; pressing OK on it runs the script's event.";
    case "item":
      return ITEM_BLURBS[r.type - 1];
    case "spell":
      return "Learnt from a spell list by party members and monsters.";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Controls: which input edits each field

export type Control =
  | { kind: "text"; maxBytes: number; multiline: boolean }
  | { kind: "number"; min: number; max: number; unit?: string }
  | { kind: "select"; options: [number, string][] }
  | { kind: "checks"; bits: [number, string][] }
  | { kind: "toggle" }
  /** A picker of resources of `resType`, of `types`; `typeField` (when set) holds the picked sub-type and is written with it. */
  | { kind: "ref"; resType: number; types: number[]; typeField?: Field; allowNone: boolean }
  /** A spell list (12-1-n), shown with its spells. */
  | { kind: "spellList" }
  /** A story flag, picked by name (0: none). */
  | { kind: "flag" }
  /** Shown inside another field's control (a ref's sub-type), or not shown for this kind. */
  | { kind: "hidden" };

/** What a card shows beyond schema.ts: plainer labels, units, help, real ranges. */
interface Meta {
  label?: string;
  unit?: string;
  help?: string;
  min?: number;
  max?: number;
  options?: [number, string][];
}

const STEP_PERSON: [number, string][] = [
  [0, "Left foot forward"],
  [1, "Standing"],
  [2, "Right foot forward"],
];
const STEP_OBJECT: [number, string][] = [
  [0, "First frame (e.g. a closed chest)"],
  [1, "Second frame (e.g. an open chest)"],
];

function metaFor(kind: RecordKind, type: number, f: Field): Meta {
  const k = f.key;
  const common: Record<string, Meta> = {
    buy: { label: "Buy price", unit: "gold", help: "What a shop asks for it." },
    sell: { label: "Sell price", unit: "gold", help: "What a shop pays for it." },
    money: { label: "Gold dropped", unit: "gold" },
    exp: kind === "party" ? { label: "Experience", unit: "exp" } : { label: "Experience given", unit: "exp" },
    cost: { unit: "MP" },
    pct: { unit: "%" },
    df: { unit: "%" },
    at: { unit: "%" },
    spd: { unit: "%" },
    atk: { unit: "%" },
    def: { unit: "%" },
    iq: { label: "Cunning", unit: "%", max: 100 },
    rounds: { unit: "rounds" },
    delay: { label: "Pause between moves", unit: "×100 ms", help: "How long they wait between steps when they wander. 0 makes them stand still." },
    lingli: { label: "Spirit" },
    hp: kind === "party" || kind === "monster" ? { label: "HP at the start", help: "Usually the same as Max HP." } : {},
    mp: kind === "party" || kind === "monster" ? { label: "MP at the start", help: "Usually the same as Max MP." } : {},
    known: { label: "Spells known", unit: "of the list", help: "How many spells of the list (from the top) are known at the start." },
    chain: { label: "Spell list", help: "The spells it can learn, in order." },
    walk: { label: "Walking sprite", help: "How the member looks on the map (party walking sprites)." },
    sprite: kind === "monster" ? { label: "Battle sprite", help: "How the monster looks in battle." } : { label: "Sprite", help: kind === "object" ? "How it looks on the map." : "How they look on the map." },
    icon: { label: "Icon", help: "The picture in menus and shops (item icons of this kind)." },
    ani: { label: "Animation", help: "Played when it is used." },
    event: { label: "Sets story flag while worn", help: "Equipment only: this flag is set while it is worn (and such items cannot be sold). 0: none.", max: 2400 },
    users: { label: "Usable by", help: kind === "item" ? "Who can wear it." : undefined },
    dropIndex: { label: "Drops", help: "The item it may leave behind." },
    dropCount: { label: "How many it drops" },
    stealIndex: { label: "Can be stolen", help: "The item a steal spell takes from it." },
    stealCount: { label: "How many can be stolen" },
    coop: { label: "Combined attack spell" },
    desc: { label: "Description" },
    level: kind === "party" ? { label: "Level", min: 1, help: "The level the member starts at (their level table gives the stats of each level)." } : { label: "Level" },
    step: { label: kind === "object" ? "Frame shown" : "Pose", options: kind === "object" ? STEP_OBJECT : STEP_PERSON, help: kind === "object" ? "Which frame of its sprite it shows (a script can open it)." : "How they stand when they are still." },
    facing: { label: "Facing" },
    state: { label: "Movement" },
  };
  const m = common[k] ?? {};
  if ((k === "hp" || k === "mp") && f.kind === "s16") return { label: `${k.toUpperCase()} damage`, help: `Negative numbers drain ${k.toUpperCase()} instead.${f.help ? ` ${f.help}` : ""}` };
  if (kind === "spell" && k === "rounds") return { unit: "rounds", label: "Lasts", help: "How many rounds its status effect lasts." };
  if (kind === "spell" && k === "all") return { label: "Targets everyone", help: "All enemies (attack) or the whole party (help)." };
  if (kind === "item" && type === 7 && k === "rounds") return { label: "Status lasts", unit: "rounds" };
  return m;
}

/** A field's label on a card. */
export function fieldLabel(kind: RecordKind, type: number, f: Field): string {
  return metaFor(kind, type, f).label ?? f.label;
}

/** A field's help on a card. */
export function fieldHelp(kind: RecordKind, type: number, f: Field): string | undefined {
  const m = metaFor(kind, type, f);
  return m.help ?? f.help;
}

/** The control that edits field `f` of a record (`fields`: the record's whole layout; `data`: its bytes, for a sub-type stored in the record itself). */
export function controlFor(r: { resType: number; type: number }, f: Field, fields: readonly Field[], data: Uint8Array): Control {
  const kind = recordKind(r) ?? "item";
  const meta = metaFor(kind, r.type, f);
  // a byte holding another field's sub-type is edited with that field's picker
  if (fields.some((g) => g.ref && typeof g.ref.type === "object" && g.ref.type.at === f.at && g !== f)) return { kind: "hidden" };
  // only equipment (kinds 1-7) is worn: who can wear it and the flag it sets mean nothing on other items
  if (kind === "item" && r.type > 7 && (f.key === "users" || f.key === "event")) return { kind: "hidden" };
  if (kind === "item" && f.key === "event") return { kind: "flag" };
  if (f.ref) {
    if (f.ref.resType === 12 && f.ref.type === 1) return { kind: "spellList" };
    if (typeof f.ref.type === "number") return { kind: "ref", resType: f.ref.resType, types: [f.ref.type], allowNone: true };
    const at = f.ref.type.at;
    const typeField = fields.find((g) => g.at === at && g !== f);
    if (typeField) return { kind: "ref", resType: f.ref.resType, types: allTypes(f.ref.resType), typeField, allowNone: true };
    // the sub-type is the record's own (an item's icon is of the item's kind)
    return { kind: "ref", resType: f.ref.resType, types: [data[at] ?? 0], allowNone: true };
  }
  switch (f.kind) {
    case "str":
      return { kind: "text", maxBytes: f.max - 1, multiline: f.max > 24 };
    case "enum":
      return { kind: "select", options: f.options };
    case "flags":
      return { kind: "checks", bits: f.bits };
    case "masked":
      return f.max === 1 ? { kind: "toggle" } : { kind: "number", min: 0, max: f.max, unit: meta.unit };
    case "u8":
      if (meta.options) return { kind: "select", options: meta.options };
      return { kind: "number", min: meta.min ?? f.min ?? 0, max: Math.min(meta.max ?? 255, f.max ?? 255), unit: meta.unit };
    case "u16":
      return { kind: "number", min: meta.min ?? 0, max: Math.min(meta.max ?? 65535, f.max ?? 65535), unit: meta.unit };
    case "s8":
      return { kind: "number", min: -127, max: 127, unit: meta.unit };
    case "s16":
      return { kind: "number", min: -32767, max: 32767, unit: meta.unit };
  }
}

/** The sub-types of a kind of resource that a combined picker offers. */
function allTypes(resType: number): number[] {
  if (resType === 6) return Array.from({ length: 14 }, (_, i) => i + 1);
  if (resType === 5) return [1, 2];
  if (resType === 4) return [1, 2, 3, 4, 5];
  return [];
}

/** The resource a ref field points at now ({type, index}; null for none). */
export function refValue(f: Field, c: Extract<Control, { kind: "ref" }>, data: Uint8Array): { type: number; index: number } | null {
  const index = Number(readField(data, f));
  const type = c.typeField ? Number(readField(data, c.typeField)) : c.types[0];
  return index ? { type, index } : null;
}

/** A record's bytes with a ref field (and its sub-type field) set; throws like writeField. */
export function writeRef(data: Uint8Array, f: Field, c: Extract<Control, { kind: "ref" }>, v: { type: number; index: number } | null): Uint8Array {
  let out = writeField(data, f, v ? v.index : 0);
  if (c.typeField) out = writeField(out, c.typeField, v ? v.type : 0);
  return out;
}

// ---------------------------------------------------------------------------
// What a stored value may be

export interface Issue {
  level: "error" | "warning";
  text: string;
}

const RES_WORD: Record<number, string> = { 3: "record", 4: "spell", 5: "animation", 6: "item", 8: "sprite", 9: "icon", 11: "picture", 12: "table" };

/** What is wrong with a field's stored value, said with what is allowed (null when it is fine). */
export function checkValue(archive: LibArchive, r: { resType: number; type: number }, f: Field, fields: readonly Field[], data: Uint8Array): Issue | null {
  const c = controlFor(r, f, fields, data);
  const v = readField(data, f);
  switch (c.kind) {
    case "number": {
      const n = Number(v);
      const capped = n > 999 && c.max === 999 && ["maxHP", "maxMP", "attack", "defend", "hp", "mp"].includes(f.key) ? " (the game treats more as 999)" : "";
      if (n < c.min || n > c.max) return { level: "error", text: `Stored ${n}; allowed ${c.min}-${c.max}${c.unit ? ` ${c.unit}` : ""}${capped}.` };
      return null;
    }
    case "select": {
      const n = Number(v);
      if (!c.options.some(([x]) => x === n)) return { level: "error", text: `Stored ${n}, which is not one of: ${c.options.map(([x, l]) => `${l} (${x})`).join(", ")}.` };
      return null;
    }
    case "checks": {
      const n = Number(v);
      const known = c.bits.reduce((m, [b]) => m | b, 0);
      const extra = n & ~known & 0xff;
      // (items made by the kit store "everyone" as 0xFF: the spare bits mean nothing)
      if (!extra || f.key === "users") return null;
      const bits = [1, 2, 4, 8, 16, 32, 64, 128].filter((b) => extra & b);
      return { level: "warning", text: `Also has bit${bits.length > 1 ? "s" : ""} ${bits.join(", ")} set, which mean${bits.length > 1 ? "" : "s"} nothing here (kept as stored).` };
    }
    case "ref": {
      const ref = refValue(f, c, data);
      if (!ref) return null;
      if (c.typeField && !c.types.includes(ref.type)) return { level: "error", text: `Refers to kind ${ref.type}, which does not exist: kinds are ${c.types[0]}-${c.types[c.types.length - 1]}.` };
      if (!findEntry(archive, c.resType, ref.type, ref.index))
        return { level: "error", text: `Refers to ${RES_WORD[c.resType] ?? "resource"} ${ref.type}-${ref.index}, which does not exist. Pick one, or None.` };
      return null;
    }
    case "spellList": {
      const n = Number(v);
      if (n && !findEntry(archive, 12, 1, n)) return { level: "error", text: `Refers to spell list 1-${n}, which does not exist. Pick one, or None.` };
      return null;
    }
    default:
      return null;
  }
}

/** Problems between fields (HP above max HP, more spells known than listed…), by field key. */
export function crossChecks(archive: LibArchive, e: LibEntry): Map<string, Issue> {
  const out = new Map<string, Issue>();
  const kind = recordKind(e);
  const fields = fieldsFor(e.resType, e.type);
  if (!kind || !fields) return out;
  const get = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f ? Number(readField(e.data, f)) : undefined;
  };
  if (kind === "party" || kind === "monster") {
    for (const [cur, max, word] of [
      ["hp", "maxHP", "HP"],
      ["mp", "maxMP", "MP"],
    ] as const) {
      const a = get(cur)!;
      const b = get(max)!;
      if (a > b) out.set(cur, { level: "warning", text: `${word} at the start (${a}) is more than Max ${word} (${b}).` });
    }
    const chain = get("chain") ?? 0;
    const known = get("known") ?? 0;
    const list = chain ? findEntry(archive, 12, 1, chain) : undefined;
    const n = list ? readMagicChain(list.data).length : 0;
    if (known > n) out.set("known", { level: "warning", text: list ? `Knows ${known} spells, but the list has ${n}.` : `Knows ${known} spells, but has no spell list.` });
  }
  if (kind === "party") {
    const table = findEntry(archive, 12, 2, e.index);
    const levels = table ? (table.data[2] ?? 0) : 0;
    const level = get("level")!;
    if (!table) out.set("level", { level: "error", text: `There is no level table 2-${e.index}: the member needs one (a table per party member, by number).` });
    else if (level > levels) out.set("level", { level: "warning", text: `Level ${level} is above the level table's ${levels} levels.` });
  }
  if (kind === "monster" && !get("sprite")) out.set("sprite", { level: "warning", text: "No battle sprite: the monster cannot be seen in battle." });
  if (kind === "item") {
    const buy = get("buy")!;
    const sell = get("sell")!;
    if (buy > 0 && sell > buy) out.set("sell", { level: "warning", text: `Sells for more (${sell}) than it costs (${buy}): players can buy and sell it for money.` });
    if (e.type <= 7 && !((get("users") ?? 0) & 15)) out.set("users", { level: "warning", text: "No one can use it: tick the party members who can wear it." });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The key numbers and the effect, in words

/** The fields shown big at the top of a card (picture first, then the numbers). */
export function topFields(r: { resType: number; type: number }): { picture: string; stats: string[] } {
  switch (recordKind(r)) {
    case "party":
    case "monster":
      return { picture: r.type === 1 ? "walk" : "sprite", stats: ["level", "maxHP", "maxMP", "attack", "defend", "speed"] };
    case "person":
    case "object":
      return { picture: "sprite", stats: [] };
    case "item":
      return { picture: "icon", stats: ["buy", "sell"] };
    case "spell":
      return { picture: "ani", stats: ["cost"] };
    default:
      return { picture: "", stats: [] };
  }
}

/** The short label of a key number ("HP", "Attack"). */
export function statLabel(key: string): string {
  return ({ level: "Level", maxHP: "Max HP", maxMP: "Max MP", attack: "Attack", defend: "Defence", speed: "Speed", buy: "Price", sell: "Sells for", cost: "MP cost" } as Record<string, string>)[key] ?? key;
}

const STATUS_WORDS: [number, string][] = [
  [8, "poison"],
  [4, "confusion"],
  [2, "seal"],
  [1, "sleep"],
];
const statusList = (v: number) => STATUS_WORDS.filter(([b]) => v & b).map(([, w]) => w);
const andList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const BONUS: [string, string][] = [
  ["attack", "attack"],
  ["defend", "defence"],
  ["maxHP", "max HP"],
  ["maxMP", "max MP"],
  ["speed", "speed"],
  ["lingli", "spirit"],
  ["luck", "luck"],
];

/** What an item or a spell does, in one sentence ("+12 attack; hits cause sleep (3 rounds)", "Restores 50 HP"). */
export function effectText(archive: LibArchive, e: LibEntry): string {
  const fields = fieldsFor(e.resType, e.type);
  if (!fields) return "";
  const v = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f ? Number(readField(e.data, f)) : 0;
  };
  const name = (resType: number, type: number, index: number) => {
    const t = index ? findEntry(archive, resType, type, index) : undefined;
    return t ? resourceName(resType, type, t.data) || `${type}-${index}` : "";
  };
  const bonuses = () => BONUS.filter(([k]) => v(k)).map(([k, w]) => `${signed(v(k))} ${w}`);
  const parts: string[] = [];
  if (e.resType === 6) {
    const t = e.type;
    if (t <= 7) {
      parts.push(...bonuses());
      if (t <= 5 && statusList(v("fx")).length) parts.push(`protects from ${andList(statusList(v("fx")))}`);
      if (t === 6 && v("coop")) parts.push(`combined attack: ${name(4, 1, v("coop")) || `spell 1-${v("coop")}`}`);
      if (t === 7) {
        const st = statusList(v("fx"));
        if (st.length) parts.push(`hits cause ${andList(st)}${v("rounds") ? ` (${v("rounds")} rounds)` : ""}`);
        if (v("fx") & 16) parts.push("hits all enemies");
      }
      return parts.join("; ") || "No bonuses";
    }
    if (t === 8) {
      const hp = v("hp");
      const mp = v("mp");
      if (hp) parts.push(hp > 0 ? `deals ${hp} HP damage` : `drains ${-hp} HP`);
      if (mp) parts.push(mp > 0 ? `takes ${mp} MP` : `drains ${-mp} MP`);
      if (v("all") & 16) parts.push("to all enemies");
      return cap(parts.join(" ") || "does nothing");
    }
    if (t === 9) {
      const got = [v("hp") && `${v("hp")} HP`, v("mp") && `${v("mp")} MP`].filter(Boolean) as string[];
      if (got.length) parts.push(`restores ${andList(got)}`);
      const cures = statusList(v("cures"));
      if (cures.length) parts.push(`cures ${andList(cures)}`);
      if (v("cures") & 16) parts.push("for the whole party");
      return cap(parts.join("; ") || "does nothing");
    }
    if (t === 10) return `Revives with ${v("pct")}% of max HP`;
    if (t === 11) return bonuses().length ? `For good: ${bonuses().join(", ")}` : "Changes nothing";
    if (t === 12) {
      const up = [v("atk") && `${v("atk")}% attack`, v("def") && `${v("def")}% defence`, v("spd") && `${v("spd")}% speed`].filter(Boolean) as string[];
      return up.length ? `+${up.join(", +")} in battle${v("all") & 16 ? " for the whole party" : ""}` : "Changes nothing";
    }
    if (t === 13) return "Escapes (runs event 255 of the running script)";
    return "Carried for the story";
  }
  if (e.resType === 4) {
    const all = v("all") ? " to all enemies" : "";
    switch (e.type) {
      case 1: {
        const hp = v("hp");
        if (hp) parts.push(hp > 0 ? `deals ${hp} HP damage${all}` : `drains ${-hp} HP${all}`);
        const down = [v("df") && `${v("df")}% defence`, v("at") && `${v("at")}% attack`, v("spd") && `${v("spd")}% speed`].filter(Boolean) as string[];
        if (down.length) parts.push(`-${down.join(", -")}`);
        const st = statusList(v("buff"));
        if (st.length) parts.push(`inflicts ${andList(st)}${v("rounds") ? ` (${v("rounds")} rounds)` : ""}`);
        return cap(parts.join("; ") || "does nothing");
      }
      case 2: {
        const up = [v("df") && `${v("df")}% defence`, v("at") && `${v("at")}% attack`, v("spd") && `${v("spd")}% speed`].filter(Boolean) as string[];
        return up.length ? `+${up.join(", +")}${v("all") ? " for the whole party" : ""}` : "Changes nothing";
      }
      case 3: {
        if (v("hp")) parts.push(`heals ${v("hp")} HP${v("all") ? " for the whole party" : ""}`);
        const cures = statusList(v("cures"));
        if (cures.length) parts.push(`cures ${andList(cures)}`);
        return cap(parts.join("; ") || "does nothing");
      }
      case 4:
        return `Revives with ${v("pct")}% of max HP`;
      default:
        return "Special (steals an item)";
    }
  }
  return "";
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The names of party members 1-4 (for "who can use it"), by number. */
export function partyNames(archive: LibArchive): Map<number, string> {
  const out = new Map<number, string>();
  for (let i = 1; i <= 4; i++) {
    const e = findEntry(archive, 3, 1, i);
    if (e) out.set(i, resourceName(3, 1, e.data) || `Member ${i}`);
  }
  return out;
}

/** The "usable by" checkboxes, labelled with the party's names. */
export function userBits(archive: LibArchive): [number, string][] {
  const names = partyNames(archive);
  return [1, 2, 3, 4].map((i) => [1 << (i - 1), names.has(i) ? `${names.get(i)} (#${i})` : `Party member ${i} (none yet)`]);
}

/** Who can use an item, in words ("Rin and Bram", "No one"). */
export function usersText(archive: LibArchive, e: LibEntry): string {
  const f = fieldsFor(e.resType, e.type)?.find((x) => x.key === "users");
  if (!f) return "";
  const v = Number(readField(e.data, f));
  const names = partyNames(archive);
  if (!names.size) return "No party members yet";
  const who = [...names].filter(([i]) => v & (1 << (i - 1))).map(([, n]) => n);
  if (!who.length) return "No one";
  return who.length === names.size && names.size > 1 ? `Everyone (${andList(who)})` : andList(who);
}

/** The spells of a spell list, by name. */
export function spellListNames(archive: LibArchive, list: number): string[] {
  const e = list ? findEntry(archive, 12, 1, list) : undefined;
  if (!e) return [];
  try {
    return readMagicChain(e.data).map((s) => {
      const m = findEntry(archive, 4, s.type, s.index);
      return m ? resourceName(4, s.type, m.data) || `spell ${s.type}-${s.index}` : `missing spell ${s.type}-${s.index}`;
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Where a record is used

export interface UsedBy {
  /** The resource that refers to it. */
  from: string;
  /** "script", "record" (characters, items, spells), "map", "table" (spell lists, level tables), "other". */
  group: "script" | "record" | "map" | "table" | "other";
  /** What refers, in words: "Bellhaven, talking to Wen". */
  title: string;
  /** How: "Give Lantern", "drops it", "spell 2 of the list". */
  detail: string;
  /** How many times on this line or field (a battle with two of the same monster). */
  count: number;
  /** What to open: the resource, at a line. */
  open: { key: string; line?: number };
}

function groupOfKey(key: string): UsedBy["group"] {
  const { resType } = parseKey(key);
  if (resType === 1) return "script";
  if (resType === 3 || resType === 4 || resType === 6) return "record";
  if (resType === 2) return "map";
  if (resType === 12) return "table";
  return "other";
}

const FIELD_WORDS: Record<string, string> = {
  dropIndex: "drops it",
  stealIndex: "can have it stolen",
  hat: "starts wearing it (head)",
  clothes: "starts wearing it (body)",
  armour: "starts wearing it (cape)",
  bracers: "starts wearing it (wrists)",
  weapon: "starts holding it (weapon)",
  shoes: "starts wearing it (feet)",
  deco1: "starts wearing it (accessory 1)",
  deco2: "starts wearing it (accessory 2)",
  sprite: "looks like it",
  walk: "looks like it on the map",
  icon: "uses it as its icon",
  ani: "plays it when used",
  chain: "learns its spells from it",
  coop: "uses it as its combined attack",
};

/** A record's name for lists: "Monster Shellbug", "Spell list 1-2". */
function recordTitle(archive: LibArchive, key: string): string {
  const { resType, type, index } = parseKey(key);
  const e = findEntry(archive, resType, type, index);
  const name = e ? resourceName(resType, type, e.data).trim() : "";
  const kind = recordKind({ resType, type });
  if (kind) return `${roleOf({ resType, type, index })} ${name || `${type}-${index}`}`.replace(/^Party member #(\d+) /, "Party member ");
  return describeKey(archive, key);
}

/**
 * Everything that refers to a resource, one row per script line or record
 * field, scripts first (in script and line order), each said in words.
 */
export function usedBy(world: WorldIndex, archive: LibArchive, key: string, notes?: ProjectNotes): UsedBy[] {
  const refs = referencesTo(world, key);
  const rows = new Map<string, UsedBy>();
  const names = new Map<string, ReturnType<typeof scriptNames>>();
  const project = projectNames(archive, notes);
  for (const r of refs) {
    const id = rowId(r);
    const had = rows.get(id);
    if (had) {
      had.count++;
      continue;
    }
    rows.set(id, describeRef(world, archive, r, names, project, notes));
  }
  const order = ["script", "record", "table", "map", "other"];
  return [...rows.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || cmpKey(a.from, b.from) || (a.open.line ?? 0) - (b.open.line ?? 0));
}

const rowId = (r: Reference) => `${r.from}|${r.via}|${r.where?.line ?? ""}|${r.field?.key ?? ""}|${r.position ?? ""}|${r.note ?? ""}`;
function cmpKey(a: string, b: string): number {
  const x = parseKey(a);
  const y = parseKey(b);
  return x.resType - y.resType || x.type - y.type || x.index - y.index;
}

function describeRef(world: WorldIndex, archive: LibArchive, r: Reference, cache: Map<string, ReturnType<typeof scriptNames>>, project: ReturnType<typeof projectNames>, notes?: ProjectNotes): UsedBy {
  const base = { from: r.from, group: groupOfKey(r.from), count: 1, open: { key: r.from } as UsedBy["open"] };
  if (r.via === "script" && r.where) {
    const w = r.where;
    let names = cache.get(w.script);
    if (!names) cache.set(w.script, (names = scriptNames(world, archive, w.script, notes)));
    const info = world.scripts.get(w.script);
    const { type, index } = parseKey(w.script);
    const scriptName = (project.resource?.(1, type, index) || "").trim() || `Script ${type}-${index}`;
    const when = w.events.length ? w.events.map((n) => names!.event?.(n) ?? `event ${n}`).join(" / ") : w.start ? "at the start" : w.group ? `@${w.group}` : "";
    const step = info?.model.steps.find((s) => s.id === w.stepId);
    const detail = step && step.kind === "instruction" ? sentence(step.op.name, step.values, names).text : step?.text.trim() ?? "";
    return { ...base, title: when ? `${scriptName}, ${when}` : scriptName, detail, open: { key: w.script, line: w.line } };
  }
  const title = recordTitle(archive, r.from);
  if (r.via === "field" && r.field) return { ...base, title, detail: FIELD_WORDS[r.field.key] ?? `as its ${r.field.label.toLowerCase()}` };
  if (r.via === "spellList") {
    const users = referencesTo(world, r.from)
      .filter((x) => x.via === "field")
      .map((x) => recordTitle(archive, x.from));
    const list = parseKey(r.from);
    return { ...base, title: `Spell list ${list.type}-${list.index}${users.length ? ` (${andList([...new Set(users)])})` : ""}`, detail: `spell ${(r.position ?? 0) + 1} of the list` };
  }
  if (r.via === "tileset") return { ...base, title, detail: "is drawn with it" };
  if (r.via === "implicit") return { ...base, title, detail: `uses it as its ${r.note ?? "resource"} (by number)` };
  return { ...base, title, detail: "" };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Used in 3 script lines and 2 records" / "Not used anywhere". */
export function usedBySummary(list: readonly UsedBy[]): string {
  if (!list.length) return "Not used anywhere";
  const lines = list.filter((u) => u.group === "script");
  const scripts = new Set(lines.map((u) => u.from)).size;
  const others = list.filter((u) => u.group !== "script");
  const parts: string[] = [];
  if (lines.length) parts.push(`${plural(lines.length, "script line")}${scripts > 1 ? ` (${scripts} scripts)` : ""}`);
  const records = new Set(others.filter((u) => u.group === "record").map((u) => u.from)).size;
  const tables = new Set(others.filter((u) => u.group === "table").map((u) => u.from)).size;
  const maps = new Set(others.filter((u) => u.group === "map").map((u) => u.from)).size;
  const rest = new Set(others.filter((u) => u.group === "other").map((u) => u.from)).size;
  if (records) parts.push(plural(records, "record"));
  if (tables) parts.push(plural(tables, "table"));
  if (maps) parts.push(plural(maps, "map"));
  if (rest) parts.push(plural(rest, "other resource"));
  return `Used in ${andList(parts)}`;
}

// ---------------------------------------------------------------------------
// Renumbering: what it will change

/** Scripts typed but not applied, merged in where they assemble (nothing is changed; `failed` lists the ones that do not). */
export function mergeDrafts(archive: LibArchive, sources: Record<string, string>, drafts: Record<string, string>): { archive: LibArchive; sources: Record<string, string>; merged: string[]; failed: string[] } {
  const merged: string[] = [];
  const failed: string[] = [];
  let entries = archive.entries;
  let srcs = sources;
  for (const [key, text] of Object.entries(drafts)) {
    const { resType, type, index } = parseKey(key);
    const at = entries.findIndex((e) => e.resType === resType && e.type === type && e.index === index);
    if (at < 0) continue;
    try {
      const data = assemble(text);
      if (data[0] !== type || data[1] !== index) throw new Error("numbers changed");
      if (entries === archive.entries) entries = [...entries];
      entries[at] = { ...entries[at], data };
      srcs = { ...srcs, [key]: text };
      merged.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { archive: entries === archive.entries ? archive : { ...archive, entries }, sources: srcs, merged, failed };
}

export interface RenumberPlan {
  result: RenumberResult;
  /** Resources moved: old key → new key (the resource, and a party member's portrait, battle sprite and level table). */
  moved: [string, string][];
  /** Other resources whose references are updated. */
  updated: string[];
  /** "3 scripts and 2 records will be updated", "Nothing else refers to it." */
  summary: string;
  /** The updated resources, in words. */
  details: string[];
  warnings: string[];
  /** Drafts merged (their text is now the stored source). */
  merged: string[];
}

/**
 * What giving `target` the number `to` does, with every reference updated
 * (world.ts renumberResource), on the project with its unapplied script text
 * merged in. Throws with a readable message (number taken, out of range).
 */
export function planRenumber(
  archive: LibArchive,
  sources: Record<string, string>,
  drafts: Record<string, string>,
  target: Ref3,
  to: number,
  notes?: ProjectNotes,
): RenumberPlan {
  const m = mergeDrafts(archive, sources, drafts);
  const result = renumberResource(m.archive, m.sources, target, to, { notes });
  const before = new Set(m.archive.entries.map((e) => resKey(e.resType, e.type, e.index)));
  const after = new Set(result.archive.entries.map((e) => resKey(e.resType, e.type, e.index)));
  const moved: [string, string][] = [];
  for (const k of before) {
    if (after.has(k)) continue;
    const { resType, type } = parseKey(k);
    const n = resKey(resType, type, to);
    if (after.has(n) && !before.has(n)) moved.push([k, n]);
  }
  const movedTo = new Set(moved.map(([, n]) => n));
  const updated = result.changed.filter((k) => !movedTo.has(k));
  const count = (g: UsedBy["group"]) => updated.filter((k) => groupOfKey(k) === g).length;
  const parts = [
    count("script") && plural(count("script"), "script"),
    count("record") && plural(count("record"), "record"),
    count("table") && plural(count("table"), "table"),
    count("map") && plural(count("map"), "map"),
    count("other") && plural(count("other"), "other resource"),
  ].filter(Boolean) as string[];
  const summary = parts.length ? `${andList(parts)} will be updated.` : "Nothing else refers to it.";
  const warnings = [...result.warnings];
  for (const k of m.failed) warnings.push(`${describeKey(archive, k)} has typed text that does not assemble: its references are not updated.`);
  if (moved.length > 1) warnings.push(`Also moved: ${moved.slice(1).map(([a, b]) => `${describeKey(archive, a)} → ${b.split("-").slice(1).join("-")}`).join(", ")}.`);
  return { result, moved, updated, summary: cap(summary), details: updated.map((k) => describeKey(result.archive, k)), warnings, merged: m.merged };
}

// ---------------------------------------------------------------------------
// The gallery

export interface GalleryGroup {
  id: string;
  label: string;
  /** Which resources it shows. */
  match: (r: Ref3) => boolean;
  /** The numbers shown on each small card (field keys, or "effect"). */
  shown: string[];
}

const ITEM_GROUP_LABELS = ["Hats", "Clothes", "Shoes", "Armour", "Bracers", "Accessories", "Weapons", "Thrown weapons", "Medicine", "Revival items", "Elixirs", "Stimulants", "Escape items", "Story items"];
const ITEM_SHOWN: Record<number, string[]> = { 7: ["buy", "attack"], 8: ["buy", "hp"], 9: ["buy", "hp", "mp"], 10: ["buy", "pct"] };

export const GALLERY_GROUPS: GalleryGroup[] = [
  { id: "3-1", label: "Party", match: (r) => r.resType === 3 && r.type === 1, shown: ["level", "maxHP", "attack"] },
  { id: "3-2", label: "People", match: (r) => r.resType === 3 && r.type === 2, shown: [] },
  { id: "3-3", label: "Monsters", match: (r) => r.resType === 3 && r.type === 3, shown: ["maxHP", "attack", "defend"] },
  { id: "3-4", label: "Chests & objects", match: (r) => r.resType === 3 && r.type === 4, shown: [] },
  { id: "6", label: "All items", match: (r) => r.resType === 6, shown: ["buy"] },
  ...ITEM_GROUP_LABELS.map((label, i) => ({ id: `6-${i + 1}`, label, match: (r: Ref3) => r.resType === 6 && r.type === i + 1, shown: ITEM_SHOWN[i + 1] ?? (i < 6 ? ["buy", "defend"] : ["buy"]) })),
  { id: "4", label: "Spells", match: (r) => r.resType === 4, shown: ["cost", "hp"] },
];

/** The gallery group a record opens in (items: their kind). */
export function galleryGroupOf(r: Ref3): GalleryGroup | undefined {
  if (r.resType === 6) return GALLERY_GROUPS.find((g) => g.id === `6-${r.type}`);
  return GALLERY_GROUPS.find((g) => g.match(r));
}

/** A field's number on a record (undefined when the record has no such field). */
export function numberOf(e: LibEntry, key: string): number | undefined {
  if (key === "index") return e.index;
  const f = fieldsFor(e.resType, e.type)?.find((x) => x.key === key);
  if (!f || f.kind === "str") return undefined;
  return Number(readField(e.data, f));
}

/** The numbers a group can be sorted by: [key, label], the number first. */
export function sortKeys(entries: readonly LibEntry[]): [string, string][] {
  const out: [string, string][] = [["index", "Number"]];
  const seen = new Set<string>(["index"]);
  for (const e of entries) {
    const kind = recordKind(e);
    for (const f of fieldsFor(e.resType, e.type) ?? []) {
      if (seen.has(f.key) || f.ref || !kind || !["u8", "u16", "s8", "s16", "masked"].includes(f.kind)) continue;
      if (f.kind === "masked" && f.max === 1) continue;
      if (["dropType", "stealType", "aniType", "step", "event"].includes(f.key)) continue;
      seen.add(f.key);
      out.push([f.key, fieldLabel(kind, e.type, f)]);
    }
  }
  return out;
}

/** A gallery's records: matching the search (name, number, kind), sorted by a number (then by number). */
export function galleryEntries(archive: LibArchive, group: GalleryGroup, query: string, sort: string, descending: boolean, notes?: ProjectNotes): LibEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const list = archive.entries.filter((e) => group.match(e) && hasCard(e));
  const text = (e: LibEntry) => `${resourceName(e.resType, e.type, e.data)} ${e.type}-${e.index} #${e.index} ${roleOf(e)} ${resourceNote(notes, resKey(e.resType, e.type, e.index))?.note ?? ""}`.toLowerCase();
  const shown = words.length ? list.filter((e) => words.every((w) => text(e).includes(w))) : list;
  const val = (e: LibEntry) => (sort === "index" ? e.type * 256 + e.index : (numberOf(e, sort) ?? Number.NEGATIVE_INFINITY));
  const dir = descending ? -1 : 1;
  return [...shown].sort((a, b) => dir * (val(a) - val(b)) || a.type - b.type || a.index - b.index);
}

// ---------------------------------------------------------------------------
// Pictures

/** The image (and frames) that stands for a record: a sprite, an icon, an animation's first picture. */
export interface PictureSource {
  /** The image resource ("8-3-2"). */
  key: string;
  /** The frame shown still (0-based). */
  still: number;
  /** Frames shown in turn on hover (empty: none). */
  walk: number[];
}

/** Which picture a record shows (null when it has none, or it is missing). */
export function pictureOf(archive: LibArchive, e: LibEntry): PictureSource | null {
  const kind = recordKind(e);
  const img = (resType: number, type: number, index: number): LibEntry | undefined => (index ? findEntry(archive, resType, type, index) : undefined);
  const frames = (t: LibEntry) => {
    try {
      return decodeImage(t.data).frames.length;
    } catch {
      return 0;
    }
  };
  if (kind === "party" || kind === "person") {
    const t = img(8, e.type, e.data[0x16] ?? 0);
    if (!t) return null;
    const n = frames(t);
    // walking sprites: frames 7-9 face south (left foot, standing, right foot)
    return n >= 12 ? { key: keyOf(t), still: 7, walk: [7, 6, 7, 8] } : { key: keyOf(t), still: 0, walk: n > 1 ? range(n) : [] };
  }
  if (kind === "object") {
    const t = img(8, 4, e.data[0x16] ?? 0);
    if (!t) return null;
    const n = frames(t);
    const step = e.data[3] ?? 0;
    return { key: keyOf(t), still: Math.min(step, Math.max(0, n - 1)), walk: n > 1 ? range(n) : [] };
  }
  if (kind === "monster") {
    const t = img(8, 3, e.data[0x2e] ?? 0);
    if (!t) return null;
    const n = frames(t);
    return { key: keyOf(t), still: 0, walk: n > 1 ? range(n) : [] };
  }
  if (kind === "item") {
    const t = img(9, e.data[0] ?? e.type, e.data[5] ?? 0);
    return t ? { key: keyOf(t), still: 0, walk: [] } : null;
  }
  if (kind === "spell") {
    const t = img(5, 2, e.data[5] ?? 0);
    return t ? { key: keyOf(t), still: 0, walk: [] } : null;
  }
  return null;
}
const keyOf = (e: Ref3) => resKey(e.resType, e.type, e.index);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
