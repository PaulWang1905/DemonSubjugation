// The script instructions, for authors: every one of the 80 GUT instructions
// with a plain-English name, a category, a sentence that says what a line
// does ("Give Herb", "If flag 12 is set, go to @done"), and what each operand
// means (a map, a person, an item, a flag, a tile, a direction, text, a
// label...), with its range.
//
// The meanings follow the engine's script VM (src/engine/fmj/script/
// ScriptVM.ts) under its default rules (EngineSettings.originalDamageFormula,
// the device's own behaviour): variables and their values are single bytes,
// `npcmovemod` 1 wanders and 2-4 animate in place, `resumeactorhp` heals by a
// percentage, and so on. Where the fork's rules (the setting off) differ, the
// operand's help says so.
//
// Nothing here changes a script: `sentence()` renders a statement in words,
// `formatInstruction()` writes one as text for the assembler, `operandRefs()`
// lists the resources a statement refers to.
import { OPS, type OpSpec, type Tok } from "./gut";
import { subTypeName } from "./decode";

// ---------------------------------------------------------------------------
// Categories

export const CATEGORIES = [
  "Dialogue",
  "People & objects",
  "Movement & camera",
  "Items & money",
  "Battles",
  "Flags & variables",
  "Flow",
  "Maps & scenes",
  "Party",
  "Shops",
  "Other",
] as const;

/** Where an instruction is listed. "Other" holds saving, the position display and the instructions that do nothing here. */
export type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Operands

/**
 * What an operand means.
 *
 * Resource references: `map`, `script`, `item`, `spell`, `animation` are
 * `type, index` pairs spanning two operands (see `OperandInfo.pair`); the
 * others are one operand with a fixed kind (`person` = an NPC resource 3-2-n,
 * `object` = a scene object 3-4-n, `actor` = a party member 3-1-n, `monster`
 * = 3-3-n, `picture` = 11-t-n with the picture kind fixed by the instruction).
 *
 * Positions: `tileX/tileY` a map tile; `cameraX/cameraY` the map tile at the
 * top-left of the 9×6 screen; `screenX/screenY` a tile on the screen (map
 * tile = camera + screen); `pixelX/pixelY` a pixel on the 160×96 screen.
 */
export type OperandKind =
  | "map"
  | "script"
  | "person"
  | "object"
  | "actor"
  | "monster"
  | "item"
  | "spell"
  | "picture"
  | "animation"
  | "flag"
  | "variable"
  | "npcId"
  | "event"
  | "tileX"
  | "tileY"
  | "cameraX"
  | "cameraY"
  | "screenX"
  | "screenY"
  | "pixelX"
  | "pixelY"
  | "direction"
  | "time"
  | "money"
  | "count"
  | "percent"
  | "chance"
  | "level"
  | "attribute"
  | "rounds"
  | "text"
  | "label"
  | "enum"
  | "number"
  | "shopList";

/** A resource an operand refers to: resType, and its type (fixed, or read from another operand). */
export interface OperandRef {
  resType: number;
  type: number | { operand: number };
  /** 0 means "none" (no picture, no monster) rather than a missing resource. */
  zeroNone: boolean;
}

export interface OperandInfo {
  /** Short key, used in sentence templates: "{map}". */
  key: string;
  /** Label for a form field: "Map", "Tile x". */
  label: string;
  kind: OperandKind;
  /** The resource it refers to (on the index half of a pair). */
  ref?: OperandRef;
  /** For `type, index` pairs: which half this is and where the other half is. */
  pair?: { role: "type" | "index"; partner: number };
  min?: number;
  max?: number;
  /** Named values (enums, directions, attributes). */
  values?: readonly (readonly [number, string])[];
  /** Unit for times and amounts: "1/100 s", "half-seconds", "‰". */
  unit?: string;
  /** What 0 means, when it is special ("none", "the player", "wait for a key"). */
  zero?: string;
  /** For labels: when the jump is taken ("if the flag is set", "if lost"). */
  when?: string;
  help: string;
}

/**
 * How the flow goes on after an instruction: `next` (the following line),
 * `end` (the script stops: callback, return, gameover, startchapter),
 * `jump` (goto), `branch` (may jump to its labels, else goes on), `battle`
 * (enterfight: the script stops and goes on at its win / lose label after
 * the fight), `call` (runs another script or event, then goes on).
 */
export type Flow = "next" | "end" | "jump" | "branch" | "battle" | "call";

export interface CommandInfo {
  /** The assembler's name: "gaingoods". */
  name: string;
  code: number;
  /** Plain-English name: "Give item". */
  title: string;
  category: Category;
  /** One or two sentences of help. */
  help: string;
  operands: OperandInfo[];
  /** Sentence template: "Give {item}". Placeholders are operand keys. */
  sentence: string;
  /** A different sentence when an operand is 0 (say without a portrait). */
  sentenceIfZero?: { operand: string; sentence: string };
  flow: Flow;
  /** Waits for the player or for time to pass (a message, a walk...). */
  waits?: boolean;
  /** The engine accepts it but nothing happens. */
  noEffect?: boolean;
  /** An example line. */
  example?: string;
}

// --- operand builders ------------------------------------------------------

type Extra = Partial<Omit<OperandInfo, "key" | "label" | "kind" | "help">>;
const op = (key: string, label: string, kind: OperandKind, help: string, extra: Extra = {}): OperandInfo => ({ key, label, kind, help, ...extra });

/** A `type, index` pair at operands `at` and `at + 1`. */
function pair(at: number, kind: "map" | "script" | "item" | "spell" | "animation", key: string, label: string, resType: number, typeHelp: string, help: string, typeRange: [number, number]): OperandInfo[] {
  return [
    op(`${key}Type`, `${label} kind`, kind, typeHelp, { pair: { role: "type", partner: at + 1 }, min: typeRange[0], max: typeRange[1] }),
    op(key, label, kind, help, { pair: { role: "index", partner: at }, ref: { resType, type: { operand: at }, zeroNone: false }, min: 1, max: 255 }),
  ];
}
const mapPair = (at = 0) => pair(at, "map", "map", "Map", 2, "Map kind (always 1).", "The map to show.", [1, 255]);
const scriptPair = (at = 0) => pair(at, "script", "script", "Script", 1, "Script kind (always 1).", "The script.", [1, 255]);
const itemPair = (at = 0) => pair(at, "item", "item", "Item", 6, "Item kind (1-14: 1 hat … 9 medicine … 14 story item).", "The item.", [1, 14]);

const FLAG = (key = "flag", label = "Flag") =>
  op(key, label, "flag", "A story flag (global event 1-2400): set or clear, kept in saves. Flags remember what has happened.", { min: 1, max: 2400 });
const VAR = (key = "variable", label = "Variable") =>
  op(key, label, "variable", "A variable (0-239). 0-199 keep their value for the whole game; 200-239 are cleared when another script starts. Values are 0-255.", { min: 0, max: 239 });
const VALUE = (key = "value", label = "Value") => op(key, label, "number", "A number (0-255; variables hold single bytes).", { min: 0, max: 255 });
const LABEL = (key: string, label: string, when: string) => op(key, label, "label", `Where to go ${when}.`, { when });
const NPC_ID = (zeroPlayer = false) =>
  op("id", zeroPlayer ? "Person, object or player" : "Person or object", "npcId", "The number (1-40) a person or object was placed with on the current map (createnpc / createbox). Talking to it runs this script's event with the same number." + (zeroPlayer ? " 0 is the player." : ""), {
    min: zeroPlayer ? 0 : 1,
    max: 40,
    ...(zeroPlayer ? { zero: "the player" } : {}),
  });
const ACTOR = (key = "actor", label = "Party member") =>
  op(key, label, "actor", "A party member (character 1-n).", { ref: { resType: 3, type: 1, zeroNone: false }, min: 1, max: 255 });
const MONSTER = (k: number) => op(`monster${k}`, `Monster ${k}`, "monster", "A monster (character 3-n); 0 = none.", { ref: { resType: 3, type: 3, zeroNone: true }, min: 0, max: 255, zero: "none" });
const BATTLE_PIC = (key: string, label: string, what: string) =>
  op(key, label, "picture", `${what}: a battle picture (picture 4-n); 0 = none.`, { ref: { resType: 11, type: 4, zeroNone: true }, min: 0, max: 255, zero: "none" });
const TEXT = (key = "text", label = "Text", help = "The text.") => op(key, label, "text", help);
const MONEY = (help = "An amount of money.") => op("amount", "Amount", "money", help, { min: 0, max: 0xffffffff });
const EVENT_NO = (key = "event", label = "Event", help = "An event number of this script (1-40: talking to person or object n; 41+: map event n-40).") =>
  op(key, label, "event", help, { min: 1, max: 255 });

/** npcstep's facing: note this differs from the resource files' encoding (1 N … 4 W). */
export const DIRECTIONS: readonly (readonly [number, string])[] = [
  [0, "north"],
  [1, "east"],
  [2, "south"],
  [3, "west"],
];

const ATTR_COMMON: [number, string][] = [
  [0, "level"],
  [1, "attack"],
  [2, "defence"],
  [3, "speed"],
  [4, "HP"],
  [5, "MP"],
  [6, "experience"],
  [7, "spirit"],
  [8, "luck"],
];
/** attribtest's attributes (the engine's numbering). */
export const ATTRIBUTES_TEST: readonly (readonly [number, string])[] = [
  ...ATTR_COMMON,
  [9, "status rounds"],
  [10, "immunity bits"],
  [11, "attack status bits"],
  [12, "combined magic"],
  [13, "HP regained each round"],
  [14, "MP regained each round"],
  [15, "head item #"],
  [16, "body item #"],
  [17, "cape item #"],
  [18, "bracers item #"],
  [19, "weapon item #"],
  [20, "feet item #"],
  [21, "accessory 1 item #"],
  [22, "accessory 2 item #"],
  [23, "max HP"],
  [24, "max MP"],
];
/** attribset's attributes: max HP and max MP are 15 and 16 here (not 23, 24 as in attribtest). */
export const ATTRIBUTES_SET: readonly (readonly [number, string])[] = [
  ...ATTR_COMMON,
  [9, "status rounds"],
  [10, "immunity bits"],
  [11, "attack status bits"],
  [12, "combined magic"],
  [13, "HP regained each round"],
  [14, "MP regained each round"],
  [15, "max HP"],
  [16, "max MP"],
];
/** attribadd's attributes: max HP and max MP are 10 and 11 here. */
export const ATTRIBUTES_ADD: readonly (readonly [number, string])[] = [...ATTR_COMMON, [9, "status rounds"], [10, "max HP"], [11, "max MP"]];

/**
 * npcmovemod states. Under the engine's default (original) rules 0 stops, 1
 * wanders and 2-4 animate in place; with the original rules off they are
 * 0 stand, 1 forced walk, 2 wander, 3 pause then walk, 4 animate in place.
 * Use 0, 1 and 4 for the same result under both.
 */
export const MOVE_STATES: readonly (readonly [number, string])[] = [
  [0, "stand still"],
  [1, "walk around"],
  [2, "animate in place (wander with the original rules off)"],
  [3, "animate in place (pause, then walk with the original rules off)"],
  [4, "animate in place"],
];

export const MOVIE_MODES: readonly (readonly [number, string])[] = [
  [0, "play it through"],
  [1, "a key stops it"],
  [2, "over the map"],
  [3, "over the map, a key stops it"],
];

// --- the catalog -----------------------------------------------------------

type Def = Omit<CommandInfo, "code" | "operands"> & { operands?: OperandInfo[] };

const nothing = (name: string, title: string, operands: OperandInfo[], help = "Accepted for compatibility with other engines; has no effect here."): Def => ({
  name,
  title,
  category: "Other",
  help,
  operands,
  sentence: `${title}`,
  flow: "next",
  noEffect: true,
});
const raw = (key: string, label: string, help = "Ignored.") => op(key, label, "number", help, { min: 0, max: 65535 });

const DEFS: Def[] = [
  // ----- dialogue
  {
    name: "say",
    title: "Show dialogue",
    category: "Dialogue",
    help: "Show a line of dialogue in the box at the bottom of the screen, with a portrait or without. The box holds 11 then 15 letters a line with a portrait, 15 without; long text goes on over several pages.",
    operands: [
      op("portrait", "Portrait", "picture", "A portrait (picture 1-n); 0 = no portrait.", { ref: { resType: 11, type: 1, zeroNone: true }, min: 0, max: 255, zero: "no portrait" }),
      TEXT("text", "Text", "What is said."),
    ],
    sentence: "{portrait} says: “{text}”",
    sentenceIfZero: { operand: "portrait", sentence: "Say: “{text}”" },
    flow: "next",
    waits: true,
    example: 'say 1, "Hello there!"',
  },
  {
    name: "message",
    title: "Show message",
    category: "Dialogue",
    help: "Show a message box in the middle of the screen (15 letters a line) until a key is pressed.",
    operands: [TEXT("text", "Text", "The message.")],
    sentence: "Message: “{text}”",
    flow: "next",
    waits: true,
    example: 'message "Found a Herb!"',
  },
  {
    name: "timemsg",
    title: "Show timed message",
    category: "Dialogue",
    help: "Show a message that closes by itself after a time, or when a key is pressed.",
    operands: [op("time", "Time", "time", "How long it stays, in 1/100 s; 0 = until a key is pressed.", { unit: "1/100 s", min: 0, max: 65535, zero: "until a key is pressed" }), TEXT("text", "Text", "The message.")],
    sentence: "Message for {time}: “{text}”",
    flow: "next",
    waits: true,
    example: 'timemsg 200, "The bell is silent."',
  },
  {
    name: "choice",
    title: "Ask a question",
    category: "Dialogue",
    help: "Let the player pick one of two answers. The first goes on with the next line; the second jumps to the label.",
    operands: [TEXT("first", "First answer", "The first answer (goes on with the next line)."), TEXT("second", "Second answer", "The second answer (jumps to the label)."), LABEL("ifSecond", "If the second", "if the second answer is picked")],
    sentence: "Ask: “{first}” or “{second}”; if “{second}”, go to {ifSecond}",
    flow: "branch",
    waits: true,
    example: 'choice "Yes", "No", @said_no',
  },
  {
    name: "menu",
    title: "Show menu",
    category: "Dialogue",
    help: "Show a menu of words (separated by spaces); the number of the one picked (0 for the first, 1, …) goes into the variable.",
    operands: [VAR("variable", "Result variable"), TEXT("items", "Choices", "The choices, separated by spaces.")],
    sentence: "Menu “{items}”; the choice goes into {variable}",
    flow: "next",
    waits: true,
    example: 'menu 5, "Inn Shop Leave"',
  },
  {
    name: "showgut",
    title: "Scroll story text",
    category: "Dialogue",
    help: "Scroll text up the screen between two pictures, as in an ending. Cancel stops it, any other key speeds it up.",
    operands: [
      op("top", "Top picture", "picture", "A story picture (picture 5-n) at the top; 0 = none.", { ref: { resType: 11, type: 5, zeroNone: true }, min: 0, max: 255, zero: "none" }),
      op("bottom", "Bottom picture", "picture", "A story picture (picture 5-n) at the bottom; 0 = none.", { ref: { resType: 11, type: 5, zeroNone: true }, min: 0, max: 255, zero: "none" }),
      TEXT("text", "Text", "The text that scrolls."),
    ],
    sentence: "Scroll the story text “{text}”",
    flow: "next",
    waits: true,
    example: 'showgut 0, 0, "THE END"',
  },
  // ----- maps & scenes
  {
    name: "loadmap",
    title: "Go to map",
    category: "Maps & scenes",
    help: "Show a map, with the given map tile at the top-left of the 9×6 screen. The party leader keeps its place on the screen, so it stands on map tile (camera + its screen position).",
    operands: [...mapPair(0), op("cameraX", "Camera x", "cameraX", "The map column at the left edge of the screen.", { min: 0, max: 255 }), op("cameraY", "Camera y", "cameraY", "The map row at the top of the screen.", { min: 0, max: 255 })],
    sentence: "Go to {map}, view from {cameraX}, {cameraY}",
    flow: "next",
    example: "loadmap 1, 1, 4, 4",
  },
  {
    name: "setscenename",
    title: "Set place name",
    category: "Maps & scenes",
    help: "Set the place name shown by Show place name and in the list of saved games.",
    operands: [TEXT("name", "Name", "The place name.")],
    sentence: "Set the place name to “{name}”",
    flow: "next",
    example: 'setscenename "BELLHAVEN"',
  },
  { name: "showscenename", title: "Show place name", category: "Maps & scenes", help: "Show the place name for a moment.", operands: [], sentence: "Show the place name", flow: "next", waits: true },
  { name: "showscreen", title: "Redraw the screen", category: "Maps & scenes", help: "Draw the map now, with the changes made since it was last drawn.", operands: [], sentence: "Redraw the screen", flow: "next" },
  {
    name: "movie",
    title: "Play animation",
    category: "Maps & scenes",
    help: "Play an animation at a place on the screen.",
    operands: [
      ...pair(0, "animation", "animation", "Animation", 5, "Animation kind.", "The animation.", [1, 255]),
      op("x", "X", "pixelX", "Pixel column on the 160×96 screen.", { min: 0, max: 159 }),
      op("y", "Y", "pixelY", "Pixel row on the 160×96 screen.", { min: 0, max: 95 }),
      op("mode", "Mode", "enum", "How it plays.", { values: MOVIE_MODES, min: 0, max: 3 }),
    ],
    sentence: "Play animation {animation} at {x}, {y} ({mode})",
    flow: "next",
    waits: true,
    example: "movie 1, 3, 0, 0, 2",
  },
  // ----- movement & camera
  {
    name: "screens",
    title: "Move camera",
    category: "Movement & camera",
    help: "Move the view so the given map tile is at the top-left of the screen. The player stays on its map tile.",
    operands: [op("cameraX", "Camera x", "cameraX", "The map column at the left edge of the screen.", { min: 0, max: 255 }), op("cameraY", "Camera y", "cameraY", "The map row at the top of the screen.", { min: 0, max: 255 })],
    sentence: "Move the view to {cameraX}, {cameraY}",
    flow: "next",
    example: "screens 2, 3",
  },
  {
    name: "move",
    title: "Walk person to",
    category: "Movement & camera",
    help: "Make a person walk to a map tile (across, then down or up); the script waits until they are there.",
    operands: [NPC_ID(), op("x", "Tile x", "tileX", "Map column.", { min: 0, max: 255 }), op("y", "Tile y", "tileY", "Map row.", { min: 0, max: 255 })],
    sentence: "{id} walks to {x}, {y}",
    flow: "next",
    waits: true,
    example: "move 1, 12, 6",
  },
  {
    name: "npcstep",
    title: "Turn person",
    category: "Movement & camera",
    help: "Turn a person (or the player) and show a step frame for a moment.",
    operands: [NPC_ID(true), op("facing", "Facing", "direction", "The direction to face (0 north, 1 east, 2 south, 3 west).", { values: DIRECTIONS, min: 0, max: 3 }), op("step", "Step frame", "number", "The walking frame: 0, 1 or 2.", { min: 0, max: 2 })],
    sentence: "{id} turns {facing} (frame {step})",
    flow: "next",
    waits: true,
    example: "npcstep 1, 2, 1",
  },
  {
    name: "facetoface",
    title: "Turn to face",
    category: "Movement & camera",
    help: "Turn the second person to face the first (0 = the player). Usual at the start of a talk: facetoface 0, id.",
    operands: [
      op("a", "Looked at", "npcId", "Who is looked at: 0 the player, 1-40 a person.", { min: 0, max: 40, zero: "the player" }),
      op("b", "Turns", "npcId", "Who turns: 0 the player, 1-40 a person.", { min: 0, max: 40, zero: "the player" }),
    ],
    sentence: "{b} turns to {a}",
    flow: "next",
    example: "facetoface 0, 1",
  },
  // ----- people & objects
  {
    name: "createnpc",
    title: "Place person",
    category: "People & objects",
    help: "Put a person (an NPC) on the current map at a tile, under a number 1-40 shared with objects. Talking to them runs this script's event with that number.",
    operands: [NPC_ID(), op("person", "Person", "person", "The person (character 2-n).", { ref: { resType: 3, type: 2, zeroNone: false }, min: 1, max: 255 }), op("x", "Tile x", "tileX", "Map column.", { min: 0, max: 255 }), op("y", "Tile y", "tileY", "Map row.", { min: 0, max: 255 })],
    sentence: "Place {person} at {x}, {y} as {id}",
    flow: "next",
    example: "createnpc 1, 1, 10, 6",
  },
  {
    name: "createbox",
    title: "Place object",
    category: "People & objects",
    help: "Put an object (a chest, a sign, a lever…) on the current map at a tile, under a number 1-40 shared with people. Facing it and pressing OK runs this script's event with that number.",
    operands: [NPC_ID(), op("object", "Object", "object", "The object (character 4-n).", { ref: { resType: 3, type: 4, zeroNone: false }, min: 1, max: 255 }), op("x", "Tile x", "tileX", "Map column.", { min: 0, max: 255 }), op("y", "Tile y", "tileY", "Map row.", { min: 0, max: 255 })],
    sentence: "Place {object} at {x}, {y} as {id}",
    flow: "next",
    example: "createbox 2, 1, 5, 12",
  },
  { name: "deletenpc", title: "Remove person", category: "People & objects", help: "Take a person or object off the map.", operands: [NPC_ID()], sentence: "Remove {id}", flow: "next", example: "deletenpc 1" },
  { name: "deletebox", title: "Remove object", category: "People & objects", help: "Take an object (or person) off the map.", operands: [NPC_ID()], sentence: "Remove {id}", flow: "next", example: "deletebox 2" },
  { name: "delallnpc", title: "Remove everyone", category: "People & objects", help: "Take every person and object off the map.", operands: [], sentence: "Remove every person and object", flow: "next" },
  { name: "boxopen", title: "Open object", category: "People & objects", help: "Show an object's second frame (an open chest, a pulled lever, a lit lantern).", operands: [NPC_ID()], sentence: "Open {id} (second frame)", flow: "next", example: "boxopen 2" },
  {
    name: "npcmovemod",
    title: "Set how a person moves",
    category: "People & objects",
    help: "How a person moves on their own: 0 stands still, 1 walks around, 4 animates in place (2 and 3 differ between the engine's rule sets).",
    operands: [NPC_ID(), op("state", "Movement", "enum", "0 stand still, 1 walk around, 4 animate in place. Under the original rules (the default) 2 and 3 also animate in place; with them off 2 wanders and 3 pauses, then walks.", { values: MOVE_STATES, min: 0, max: 4 })],
    sentence: "{id}: {state}",
    flow: "next",
    example: "npcmovemod 1, 1",
  },
  // ----- party
  {
    name: "createactor",
    title: "Add party member",
    category: "Party",
    help: "Add a party member. The first one added leads and is shown on the map, at this tile of the 9×6 screen (map tile = loadmap's camera + screen position); the player's screen place then stays the same as the camera follows them.",
    operands: [ACTOR("actor", "Party member"), op("x", "Screen x", "screenX", "Column on the 9×6 screen (0-8); 4 is the middle.", { min: 0, max: 8 }), op("y", "Screen y", "screenY", "Row on the 9×6 screen (0-5); 3 is near the middle.", { min: 0, max: 5 })],
    sentence: "{actor} joins the party, at screen {x}, {y}",
    flow: "next",
    example: "createactor 1, 4, 3",
  },
  { name: "deleteactor", title: "Remove party member", category: "Party", help: "Take a member out of the party.", operands: [ACTOR()], sentence: "{actor} leaves the party", flow: "next", example: "deleteactor 2" },
  { name: "setcontrolid", title: "Change leader", category: "Party", help: "Make this party member the leader, shown and walking on the map in the old leader's place.", operands: [ACTOR()], sentence: "{actor} leads the party", flow: "next", example: "setcontrolid 2" },
  {
    name: "learnmagic",
    title: "Teach spell",
    category: "Party",
    help: "Teach a party member a spell.",
    operands: [ACTOR(), ...pair(1, "spell", "spell", "Spell", 4, "Spell kind (1 attack, 2 enhance, 3 restore, 4 revive, 5 special).", "The spell.", [1, 5])],
    sentence: "{actor} learns {spell}",
    flow: "next",
    waits: true,
    example: "learnmagic 1, 1, 2",
  },
  {
    name: "resumeactorhp",
    title: "Restore HP",
    category: "Party",
    help: "Heal a party member by a percentage of their max HP (with the original rules off: set HP to that percentage).",
    operands: [ACTOR(), op("percent", "Percent", "percent", "Percentage of max HP (1-100).", { min: 0, max: 100, unit: "%" })],
    sentence: "Restore {percent} of {actor}'s HP",
    flow: "next",
    example: "resumeactorhp 1, 100",
  },
  { name: "actorlayerup", title: "Raise level", category: "Party", help: "Raise a party member to a level (as if they had earned the experience).", operands: [ACTOR(), op("level", "Level", "level", "The level to reach.", { min: 1, max: 255 })], sentence: "{actor} rises to level {level}", flow: "next", waits: true, example: "actorlayerup 1, 5" },
  {
    name: "attribtest",
    title: "Compare attribute",
    category: "Party",
    help: "Compare a party member's attribute with a value: jumps to the first label when it is less, to the second when it is greater; equal goes on.",
    operands: [ACTOR(), op("attribute", "Attribute", "attribute", "Which attribute (23 max HP, 24 max MP).", { values: ATTRIBUTES_TEST, min: 0, max: 24 }), op("value", "Value", "number", "The value to compare with.", { min: 0, max: 65535 }), LABEL("ifLess", "If less", "if it is less"), LABEL("ifGreater", "If greater", "if it is greater")],
    sentence: "Compare {actor}'s {attribute} with {value}: if less, go to {ifLess}; if greater, go to {ifGreater}",
    flow: "branch",
    example: "attribtest 1, 0, 5, @too_weak, @strong",
  },
  {
    name: "attribset",
    title: "Set attribute",
    category: "Party",
    help: "Set a party member's attribute (15 max HP, 16 max MP).",
    operands: [ACTOR(), op("attribute", "Attribute", "attribute", "Which attribute.", { values: ATTRIBUTES_SET, min: 0, max: 16 }), op("value", "Value", "number", "The new value.", { min: 0, max: 65535 })],
    sentence: "Set {actor}'s {attribute} to {value}",
    flow: "next",
    example: "attribset 1, 4, 50",
  },
  {
    name: "attribadd",
    title: "Add to attribute",
    category: "Party",
    help: "Add to a party member's attribute (10 max HP, 11 max MP).",
    operands: [ACTOR(), op("attribute", "Attribute", "attribute", "Which attribute.", { values: ATTRIBUTES_ADD, min: 0, max: 11 }), op("value", "Value", "number", "How much to add.", { min: 0, max: 65535 })],
    sentence: "Add {value} to {actor}'s {attribute}",
    flow: "next",
    example: "attribadd 1, 1, 5",
  },
  // ----- battles
  {
    name: "enterfight",
    title: "Start battle",
    category: "Battles",
    help: "Fight up to three monsters. The script stops; after the battle it goes on at the win or the lose label. Round events run an event of this script at a round (0 = none).",
    operands: [
      op("rounds", "Round limit", "rounds", "0 = fight to the end; else the battle ends undecided after that many rounds (the script then stops).", { min: 0, max: 255, zero: "fight to the end" }),
      MONSTER(1),
      MONSTER(2),
      MONSTER(3),
      BATTLE_PIC("background", "Background", "The background"),
      BATTLE_PIC("bottomLeft", "Bottom-left picture", "Drawn at the bottom left"),
      BATTLE_PIC("topRight", "Top-right picture", "Drawn at the top right"),
      op("round1", "Round 1", "rounds", "The round at which event 1 runs.", { min: 0, max: 255 }),
      op("round2", "Round 2", "rounds", "The round at which event 2 runs.", { min: 0, max: 255 }),
      op("round3", "Round 3", "rounds", "The round at which event 3 runs.", { min: 0, max: 255 }),
      op("event1", "Round event 1", "event", "An event of this script run at round 1's round; 0 = none.", { min: 0, max: 255, zero: "none" }),
      op("event2", "Round event 2", "event", "An event of this script run at round 2's round; 0 = none.", { min: 0, max: 255, zero: "none" }),
      op("event3", "Round event 3", "event", "An event of this script run at round 3's round; 0 = none.", { min: 0, max: 255, zero: "none" }),
      LABEL("ifLost", "If lost", "if the party loses"),
      LABEL("ifWon", "If won", "if the party wins"),
    ],
    sentence: "Battle with {monsters}; if won, go to {ifWon}; if lost, go to {ifLost}",
    flow: "battle",
    waits: true,
    example: "enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lose, @win",
  },
  {
    name: "initfight",
    title: "Set random battles",
    category: "Battles",
    help: "Set the monsters (up to 8) and pictures of random battles on this map; Random battles on starts them. Losing a random battle ends the game.",
    operands: [...[1, 2, 3, 4, 5, 6, 7, 8].map(MONSTER), BATTLE_PIC("background", "Background", "The background"), BATTLE_PIC("bottomLeft", "Bottom-left picture", "Drawn at the bottom left"), BATTLE_PIC("topRight", "Top-right picture", "Drawn at the top right")],
    sentence: "Random battles with {monsters}",
    flow: "next",
    example: "initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0",
  },
  { name: "fightenable", title: "Random battles on", category: "Battles", help: "Turn random battles on (as set by Set random battles).", operands: [], sentence: "Turn random battles on", flow: "next" },
  { name: "fightdisenable", title: "Random battles off", category: "Battles", help: "Turn random battles off.", operands: [], sentence: "Turn random battles off", flow: "next" },
  // ----- items & money
  { name: "gaingoods", title: "Give item", category: "Items & money", help: "Give the player one of an item (a note says so for a moment).", operands: itemPair(0), sentence: "Give {item}", flow: "next", waits: true, example: "gaingoods 9, 1" },
  {
    name: "deletegoods",
    title: "Take item away",
    category: "Items & money",
    help: "Take an item away (under the original rules all of them); jumps when the player has none.",
    operands: [...itemPair(0), LABEL("ifMissing", "If missing", "if the player has none")],
    sentence: "Take away {item}; if missing, go to {ifMissing}",
    flow: "branch",
    example: "deletegoods 14, 1, @no_key",
  },
  {
    name: "usegoods",
    title: "Use up item",
    category: "Items & money",
    help: "Take one of an item; jumps when the player has none.",
    operands: [...itemPair(0), LABEL("ifMissing", "If missing", "if the player has none")],
    sentence: "Use up {item}; if missing, go to {ifMissing}",
    flow: "branch",
    example: "usegoods 14, 1, @no_key",
  },
  {
    name: "usegoodsnum",
    title: "Use up items",
    category: "Items & money",
    help: "Take a number of an item; jumps when the player has fewer.",
    operands: [...itemPair(0), op("count", "Count", "count", "How many.", { min: 1, max: 255 }), LABEL("ifMissing", "If too few", "if the player has fewer")],
    sentence: "Use up {count} × {item}; if too few, go to {ifMissing}",
    flow: "branch",
    example: "usegoodsnum 9, 1, 3, @not_enough",
  },
  {
    name: "testgoodsnum",
    title: "Compare item count",
    category: "Items & money",
    help: "Compare how many of an item the player has with a count: jumps to the first label when equal, to the second when more; fewer goes on (under the original rules none at all also goes on).",
    operands: [...itemPair(0), op("count", "Count", "count", "The count to compare with.", { min: 0, max: 255 }), LABEL("ifEqual", "If equal", "if the player has exactly that many"), LABEL("ifMore", "If more", "if the player has more")],
    sentence: "If the player has {count} × {item}, go to {ifEqual}; if more, go to {ifMore}",
    flow: "branch",
    example: "testgoodsnum 9, 1, 3, @three, @more",
  },
  { name: "gainmoney", title: "Give money", category: "Items & money", help: "Give the player money.", operands: [MONEY("How much to give.")], sentence: "Give {amount}", flow: "next", example: "gainmoney 100" },
  { name: "usemoney", title: "Take money", category: "Items & money", help: "Take money from the player (not below 0).", operands: [MONEY("How much to take.")], sentence: "Take {amount}", flow: "next", example: "usemoney 20" },
  { name: "setmoney", title: "Set money", category: "Items & money", help: "Set the player's money.", operands: [MONEY("The new amount.")], sentence: "Set money to {amount}", flow: "next", example: "setmoney 0" },
  { name: "money", title: "Set money (uncapped)", category: "Items & money", help: "Set the player's money, like Set money but without the device's limit.", operands: [MONEY("The new amount.")], sentence: "Set money to {amount}", flow: "next", example: "money 50" },
  {
    name: "testmoney",
    title: "If money is less",
    category: "Items & money",
    help: "Jumps when the player has less money than the amount.",
    operands: [MONEY("The amount to compare with."), LABEL("ifLess", "If less", "if the player has less")],
    sentence: "If money is less than {amount}, go to {ifLess}",
    flow: "branch",
    example: "testmoney 20, @too_poor",
  },
  // ----- shops
  {
    name: "buy",
    title: "Open shop",
    category: "Shops",
    help: "Open a shop that sells these items.",
    operands: [op("items", "Items for sale", "shopList", "The items on sale, as type:index pairs (1-255 each).", { min: 1, max: 255 })],
    sentence: "Open a shop selling {items}",
    flow: "next",
    waits: true,
    example: "buy 9:1, 9:2, 7:1",
  },
  { name: "sale", title: "Open pawn shop", category: "Shops", help: "Open the pawn shop, where the player sells items.", operands: [], sentence: "Open the pawn shop", flow: "next", waits: true },
  // ----- flags & variables
  { name: "setevent", title: "Set flag", category: "Flags & variables", help: "Set a story flag (kept in saves).", operands: [FLAG()], sentence: "Set {flag}", flow: "next", example: "setevent 12" },
  { name: "clrevent", title: "Clear flag", category: "Flags & variables", help: "Clear a story flag.", operands: [FLAG()], sentence: "Clear {flag}", flow: "next", example: "clrevent 12" },
  { name: "if", title: "If flag is set", category: "Flags & variables", help: "Jump when the story flag is set; else go on.", operands: [FLAG(), LABEL("ifSet", "If set", "if the flag is set")], sentence: "If {flag} is set, go to {ifSet}", flow: "branch", example: "if 12, @already_done" },
  { name: "set", title: "Set variable", category: "Flags & variables", help: "Set a variable.", operands: [VAR(), VALUE()], sentence: "Set {variable} to {value}", flow: "next", example: "set 0, 1" },
  { name: "add", title: "Add to variable", category: "Flags & variables", help: "Add to a variable (it wraps past 255).", operands: [VAR(), VALUE()], sentence: "Add {value} to {variable}", flow: "next", example: "add 3, 1" },
  { name: "sub", title: "Subtract from variable", category: "Flags & variables", help: "Subtract from a variable (it wraps below 0).", operands: [VAR(), VALUE()], sentence: "Subtract {value} from {variable}", flow: "next", example: "sub 3, 1" },
  { name: "setto", title: "Copy variable", category: "Flags & variables", help: "Copy one variable into another.", operands: [VAR("from", "From"), VAR("to", "To")], sentence: "Copy {from} into {to}", flow: "next", example: "setto 1, 2" },
  {
    name: "ifcmp",
    title: "If variable equals",
    category: "Flags & variables",
    help: "Jump when the variable equals the value; else go on.",
    operands: [VAR(), VALUE(), LABEL("ifEqual", "If equal", "if it is equal")],
    sentence: "If {variable} is {value}, go to {ifEqual}",
    flow: "branch",
    example: "ifcmp 0, 1, @from_wood",
  },
  {
    name: "discmp",
    title: "Compare variable",
    category: "Flags & variables",
    help: "Compare a variable with a value: jumps to the first label when less, to the second when greater; equal goes on.",
    operands: [VAR(), VALUE(), LABEL("ifLess", "If less", "if it is less"), LABEL("ifGreater", "If greater", "if it is greater")],
    sentence: "Compare {variable} with {value}: if less, go to {ifLess}; if greater, go to {ifGreater}",
    flow: "branch",
    example: "discmp 3, 5, @few, @many",
  },
  {
    name: "randrade",
    title: "By chance",
    category: "Flags & variables",
    help: "Jump at random, this many times in 1000; else go on.",
    operands: [op("chance", "Chance", "chance", "How often, in thousandths (500 = half the time).", { min: 0, max: 1000, unit: "‰" }), LABEL("ifLucky", "If it happens", "when the chance comes up")],
    sentence: "With a chance of {chance}, go to {ifLucky}",
    flow: "branch",
    example: "randrade 500, @heads",
  },
  // ----- flow
  { name: "callback", title: "End event", category: "Flow", help: "End this event: the player can move again.", operands: [], sentence: "End", flow: "end" },
  { name: "goto", title: "Go to", category: "Flow", help: "Go on at a label.", operands: [LABEL("target", "Label", "always")], sentence: "Go to {target}", flow: "jump", example: "goto @done" },
  {
    name: "startchapter",
    title: "Switch to script",
    category: "Flow",
    help: "Stop this script and start another from its beginning (people and objects on the map are cleared; variables 200-239 too). Map exits use it.",
    operands: scriptPair(0),
    sentence: "Switch to {script}",
    flow: "end",
    example: "startchapter 1, 2",
  },
  {
    name: "callchapter",
    title: "Run script and come back",
    category: "Flow",
    help: "Run another script from its beginning; when it ends with Return, go on here.",
    operands: scriptPair(0),
    sentence: "Run {script}, then come back",
    flow: "call",
    waits: true,
    example: "callchapter 1, 9",
  },
  { name: "return", title: "Return", category: "Flow", help: "End this script; one run by Run script and come back hands control back to its caller.", operands: [], sentence: "Return to the calling script", flow: "end" },
  {
    name: "event",
    title: "Go to event",
    category: "Flow",
    help: "Go on at one of this script's events, as if it had been triggered; it does not come back. This engine starts the event at its second line (its first is skipped), so put a line that can be skipped first.",
    operands: [EVENT_NO("event", "Event")],
    sentence: "Go to {event}",
    flow: "jump",
    example: "event 41",
  },
  {
    name: "gutevent",
    title: "Run another script's event",
    category: "Flow",
    help: "Run an event of another script (script 1-n).",
    operands: [op("script", "Script", "script", "The script (script 1-n).", { ref: { resType: 1, type: 1, zeroNone: false }, min: 1, max: 255 }), EVENT_NO("event", "Event", "An event number of that script.")],
    sentence: "Run {event} of {script}",
    flow: "call",
    example: "gutevent 2, 3",
  },
  {
    name: "seteventtimer",
    title: "Run event after a delay",
    category: "Flow",
    help: "Run one of this script's events after a delay (under the original rules once; with them off, again and again).",
    operands: [EVENT_NO("event", "Event"), op("delay", "Delay", "time", "The delay, in half-seconds; 0 stops the timer.", { unit: "half-seconds", min: 0, max: 65535, zero: "no timer" })],
    sentence: "Run {event} after {delay}",
    flow: "next",
    example: "seteventtimer 5, 10",
  },
  { name: "gameover", title: "Game over", category: "Flow", help: "End the game and go back to the title screen.", operands: [], sentence: "Game over", flow: "end" },
  // ----- other
  { name: "gamesave", title: "Open save screen", category: "Other", help: "Let the player save the game now.", operands: [], sentence: "Open the save screen", flow: "next", waits: true },
  { name: "disablesave", title: "Disable saving", category: "Other", help: "Stop the player from saving.", operands: [], sentence: "Disable saving", flow: "next" },
  { name: "enablesave", title: "Enable saving", category: "Other", help: "Let the player save again.", operands: [], sentence: "Enable saving", flow: "next" },
  { name: "enableshowpos", title: "Show map position", category: "Other", help: "Show the map position in the top-left corner.", operands: [], sentence: "Show the map position", flow: "next" },
  { name: "disableshowpos", title: "Hide map position", category: "Other", help: "Hide the map position.", operands: [], sentence: "Hide the map position", flow: "next" },
  {
    ...nothing("music", "Play music", [op("melody", "Melody", "number", "One of the device's built-in melodies (0 stops).", { min: 0, max: 255 }), op("times", "Times", "count", "How many times; 0 = for ever.", { min: 0, max: 255, zero: "for ever" })], "Plays one of the device's built-in melodies; this engine remembers it in saves but plays no sound."),
    sentence: "Play melody {melody}",
  },
  nothing("mapevent", "Map event (no effect)", [raw("n", "Number")]),
  nothing("actorevent", "Party member event (no effect)", [raw("actor", "Party member"), raw("event", "Event")]),
  nothing("actormove", "Move party member (no effect)", [raw("actor", "Party member"), raw("x", "X"), raw("y", "Y")]),
  nothing("actorspeed", "Party member speed (no effect)", [raw("actor", "Party member"), raw("speed", "Speed")]),
  nothing("screenr", "Screen effect (no effect)", [op("value", "Value", "number", "Ignored.", { min: 0, max: 255 })]),
  nothing("screena", "Screen effect (no effect)", [op("value", "Value", "number", "Ignored.", { min: 0, max: 255 })]),
  nothing("setfightmiss", "Battle setting (no effect)", [raw("n", "Number")]),
  nothing("setarmstoss", "Battle setting (no effect)", [raw("n", "Number")]),
];

/** Every instruction, in opcode order. */
export const COMMANDS: readonly CommandInfo[] = OPS.map((spec) => {
  const d = DEFS.find((x) => x.name === spec.name);
  if (!d) throw new Error(`commands: no entry for ${spec.name}`);
  return { ...d, code: spec.code, operands: d.operands ?? [] };
});

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

/** The catalog entry of an instruction ("say"), or undefined. */
export function commandInfo(name: string): CommandInfo | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/** The instructions of a category, in catalog order (no-effect ones last). */
export function commandsIn(category: Category): CommandInfo[] {
  return DEFS.filter((d) => d.category === category).map((d) => BY_NAME.get(d.name)!);
}

/**
 * Instructions matching a search ("give", "battle", "flag"): by title, name,
 * category and help, best matches first; ones with no effect only when asked
 * for by name.
 */
export function searchCommands(query: string): CommandInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEFS.filter((d) => !d.noEffect).map((d) => BY_NAME.get(d.name)!);
  const scored: [number, CommandInfo][] = [];
  for (const d of DEFS) {
    const c = BY_NAME.get(d.name)!;
    const title = c.title.toLowerCase();
    let s = 0;
    if (c.name === q) s = 100;
    else if (title === q) s = 90;
    else if (title.startsWith(q)) s = 70;
    else if (title.split(/\W+/).some((w) => w.startsWith(q))) s = 60;
    else if (c.name.startsWith(q)) s = 50;
    else if (c.category.toLowerCase().includes(q)) s = 30;
    else if (c.help.toLowerCase().includes(q)) s = 20;
    if (s && c.noEffect && s < 50) s = 0;
    if (s) scored.push([s, c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// Operand values

/**
 * An operand's value: a number (also `#123` raw jump addresses), a string
 * for text and labels (a label's name without the @), or the type:index
 * pairs of a shop list.
 */
export type OperandValue = number | string | readonly (readonly [number, number])[];

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return s;
};
let gbk: TextDecoder | null = null;
function bytesText(b: Uint8Array): string {
  gbk ??= new TextDecoder("gbk");
  try {
    return gbk.decode(b);
  } catch {
    return latin1(b);
  }
}

/** Operand values from the assembler's tokens (see gut.statements()). Null when they do not fit the instruction. */
export function valuesFromToks(spec: OpSpec, toks: readonly Tok[]): OperandValue[] | null {
  if (spec.args[0] === "buy") {
    if (toks.every((t) => t.kind === "pair")) return [toks.map((t) => (t as { v: [number, number] }).v)];
    return null;
  }
  if (toks.length !== spec.args.length) return null;
  const out: OperandValue[] = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const kind = spec.args[k];
    if (kind === "addr") {
      if (t.kind === "label") out.push(t.v);
      else if (t.kind === "raw") out.push(t.v);
      else return null;
    } else if (kind === "str") {
      if (t.kind !== "str") return null;
      out.push(bytesText(t.v));
    } else {
      if (t.kind !== "num") return null;
      out.push(t.v);
    }
  }
  return out;
}

/** Escape text for a "string" operand. */
export function quoteText(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** One operand as the assembler reads it. */
export function formatOperand(spec: OpSpec, k: number, v: OperandValue): string {
  const kind = spec.args[k] ?? spec.args[0];
  if (kind === "buy") return (v as readonly (readonly [number, number])[]).map(([t, i]) => `${t}:${i}`).join(", ");
  if (kind === "addr") return typeof v === "number" ? `#${v}` : `@${v}`;
  if (kind === "str") return quoteText(String(v));
  return String(v);
}

/** An instruction as text (no indent): `say 1, "Hello"`. */
export function formatInstruction(name: string, values: readonly OperandValue[]): string {
  const c = commandInfo(name);
  const spec = OPS.find((o) => o.name === name);
  if (!c || !spec) throw new Error(`unknown instruction ${name}`);
  if (spec.args[0] === "buy") return values.length && (values[0] as []).length ? `buy ${formatOperand(spec, 0, values[0])}` : "buy";
  if (values.length !== spec.args.length) throw new Error(`${name} takes ${spec.args.length} operand(s), got ${values.length}`);
  const parts = values.map((v, k) => formatOperand(spec, k, v));
  return parts.length ? `${name} ${parts.join(", ")}` : name;
}

/** Default operand values for a new instruction (from its example, else zeros / empty text / @label). */
export function defaultValues(name: string): OperandValue[] {
  const c = commandInfo(name);
  const spec = OPS.find((o) => o.name === name);
  if (!c || !spec) throw new Error(`unknown instruction ${name}`);
  if (spec.args[0] === "buy") return [[[9, 1]]];
  return spec.args.map((kind, k) => {
    const o = c.operands[k];
    if (kind === "str") return "";
    if (kind === "addr") return "label";
    return o.min !== undefined && o.min > 0 ? o.min : 0;
  });
}

// ---------------------------------------------------------------------------
// References

/** A resource an operand refers to. */
export interface ResourceRef {
  resType: number;
  type: number;
  index: number;
  /** The operand holding the index (for a pair, its index half). */
  operand: number;
  /** For shop lists: which pair. */
  pair?: number;
}

/** The resources a statement refers to (0 = none is left out). */
export function operandRefs(name: string, values: readonly OperandValue[]): ResourceRef[] {
  const c = commandInfo(name);
  if (!c) return [];
  if (name === "buy") return ((values[0] ?? []) as readonly (readonly [number, number])[]).map(([t, i], p) => ({ resType: 6, type: t, index: i, operand: 0, pair: p }));
  const out: ResourceRef[] = [];
  c.operands.forEach((o, k) => {
    if (!o.ref) return;
    const index = values[k];
    if (typeof index !== "number") return;
    const type = typeof o.ref.type === "number" ? o.ref.type : values[o.ref.type.operand];
    if (typeof type !== "number") return;
    if (index === 0 && o.ref.zeroNone) return;
    out.push({ resType: o.ref.resType, type, index, operand: k });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Sentences

/** Names for what operands refer to; any may be left out. */
export interface NameResolver {
  /** A resource's name ("Herb", "HAMLET"), "" when it has none, null when it does not exist. */
  resource?(resType: number, type: number, index: number): string | null;
  /** An author's name for a story flag. */
  flag?(n: number): string | undefined;
  /** An author's name for a variable. */
  variable?(n: number): string | undefined;
  /** Who stands under a person/object number on the current map ("Ostra"). */
  npcId?(id: number): string | undefined;
  /** What an event number of this script is ("talking to Ostra"). */
  event?(n: number): string | undefined;
}

/** A piece of a rendered sentence: plain words, or an operand's value in words. */
export type SentencePart = { text: string; operand?: undefined } | { text: string; operand: number; kind: OperandKind; ref?: ResourceRef; missing?: boolean };

export interface Sentence {
  text: string;
  parts: SentencePart[];
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const kindWord: Record<number, string> = { 1: "script", 2: "map", 4: "spell", 5: "animation", 6: "item", 11: "picture" };

function refWord(resType: number, type: number, index: number): string {
  if (resType === 3) return `${["character", "party member", "person", "monster", "object"][type] ?? "character"} ${index}`;
  if (resType === 11) return `${["picture", "portrait", "picture", "battle sprite", "battle picture", "story picture"][type] ?? "picture"} ${index}`;
  if (resType === 6) return `${subTypeName(6, type).toLowerCase()} ${type}-${index}`;
  return `${kindWord[resType] ?? "resource"} ${type}-${index}`;
}

/** An operand's value in words. */
export function operandText(c: CommandInfo, k: number, values: readonly OperandValue[], names: NameResolver = {}): SentencePart {
  const o = c.operands[k];
  const v = values[k];
  if (!o) return { text: String(v) };
  const base = { operand: k, kind: o.kind };
  if (o.kind === "shopList") {
    const list = (v ?? []) as readonly (readonly [number, number])[];
    const words = list.map(([t, i]) => {
      const n = names.resource?.(6, t, i);
      return n ? n : refWord(6, t, i) + (n === null ? " (missing)" : "");
    });
    return { ...base, text: words.join(", ") || "nothing" };
  }
  if (typeof v === "string") {
    if (o.kind === "label") return { ...base, text: `@${v}` };
    return { ...base, text: collapse(v) };
  }
  if (typeof v !== "number") return { ...base, text: "?" };
  if (o.kind === "label") return { ...base, text: `#${v}` };
  if (v === 0 && o.zero) return { ...base, text: o.zero };
  const refs = operandRefs(c.name, values).filter((r) => r.operand === k);
  if (refs.length) {
    const r = refs[0];
    const n = names.resource?.(r.resType, r.type, r.index);
    const word = n ? n : refWord(r.resType, r.type, r.index);
    return { ...base, text: n === null ? `${word} (missing)` : word, ref: r, missing: n === null };
  }
  switch (o.kind) {
    case "flag": {
      const n = names.flag?.(v);
      return { ...base, text: n ? `“${n}”` : `flag ${v}` };
    }
    case "variable": {
      const n = names.variable?.(v);
      return { ...base, text: n ? `“${n}”` : `variable ${v}` };
    }
    case "npcId": {
      const n = names.npcId?.(v);
      return { ...base, text: n ? `${n} (#${v})` : `#${v}` };
    }
    case "event": {
      const n = names.event?.(v);
      return { ...base, text: n ? `event ${v} (${n})` : `event ${v}` };
    }
    case "money":
      return { ...base, text: `${v} gold` };
    case "percent":
      return { ...base, text: `${v}%` };
    case "chance":
      return { ...base, text: `${v / 10}%` };
    case "time":
      return { ...base, text: o.unit === "1/100 s" ? `${v / 100} s` : o.unit === "half-seconds" ? `${v / 2} s` : String(v) };
    case "direction":
    case "enum":
    case "attribute": {
      const named = o.values?.find((x) => x[0] === v);
      return { ...base, text: named ? named[1] : `${o.label.toLowerCase()} ${v}` };
    }
    default:
      return { ...base, text: String(v) };
  }
}

/**
 * A statement in words: "Give Herb", "If flag 12 is set, go to @done". Names
 * come from `names` (see world.ts's resolvers). `{monsters}` in a battle's
 * template lists its monsters, empty slots left out.
 */
export function sentence(name: string, values: readonly OperandValue[], names: NameResolver = {}): Sentence {
  const c = commandInfo(name);
  if (!c) return { text: name, parts: [{ text: name }] };
  let tpl = c.sentence;
  if (c.sentenceIfZero) {
    const k = c.operands.findIndex((o) => o.key === c.sentenceIfZero!.operand);
    if (values[k] === 0) tpl = c.sentenceIfZero.sentence;
  }
  const parts: SentencePart[] = [];
  const re = /\{(\w+)\}/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m.index > at) parts.push({ text: tpl.slice(at, m.index) });
    if (m[1] === "monsters") {
      // the battle's monsters, empty slots left out
      const list = c.operands.flatMap((o, k) => (o.kind === "monster" && values[k] !== 0 ? [k] : []));
      list.forEach((k, i) => {
        if (i) parts.push({ text: ", " });
        parts.push(operandText(c, k, values, names));
      });
      if (!list.length) parts.push({ text: "no monsters" });
    } else {
      const k = c.operands.findIndex((o) => o.key === m![1]);
      parts.push(k >= 0 ? operandText(c, k, values, names) : { text: m[0] });
    }
    at = m.index + m[0].length;
  }
  if (at < tpl.length) parts.push({ text: tpl.slice(at) });
  const text = parts.map((p) => p.text).join("");
  return { text, parts };
}
