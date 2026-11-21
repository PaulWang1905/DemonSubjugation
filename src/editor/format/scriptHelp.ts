// Help for the script editor: every instruction grouped by purpose, with
// operand names and an example; ready-made snippets for common tasks; which
// instruction and operand the caret is on; and the dialogue-box layout checks
// (words split across lines, characters the game cannot show).
import { gbkBytes } from "../../engine/java";
import { OPS, type OpSpec } from "./gut";
import { MESSAGE_BOX, SAY_PLAIN, SAY_WITH_PORTRAIT, wrapForBox, wrapMessage } from "./text";

export interface OpHelp {
  name: string;
  group: string;
  /** Operand names, one per operand of the instruction ("type:index, …" for buy). */
  args: string[];
  text: string;
  example?: string;
  /** The engine accepts it but does nothing. */
  noop?: boolean;
}

export const GROUPS = [
  "Dialogue",
  "Maps and camera",
  "Party",
  "NPCs and objects",
  "Battles",
  "Items and money",
  "Flags and variables",
  "Flow",
  "Saving",
  "Does nothing in this engine",
] as const;

type G = (typeof GROUPS)[number];

const h = (name: string, group: G, args: string[], text: string, example?: string): OpHelp => ({ name, group, args, text, example });
const noop = (name: string, args: string[]): OpHelp => ({ name, group: "Does nothing in this engine", args, text: "Accepted for compatibility; has no effect.", noop: true });

const HELP: OpHelp[] = [
  // dialogue
  h("say", "Dialogue", ["portrait", '"text"'], "Show a line of dialogue. Portrait N is picture 1-N (0 = no portrait). The box holds 11 then 15 letters a line with a portrait, 15 without: use Wrap dialogue.", 'say 1, "Hello there!"'),
  h("message", "Dialogue", ['"text"'], "Show a message box (15 letters a line).", 'message "Found a Herb!"'),
  h("choice", "Dialogue", ['"first"', '"second"', "@ifSecond"], "Ask the player to pick one of two answers; jumps when the second is picked.", 'choice "Yes", "No", @said_no'),
  h("menu", "Dialogue", ["var", '"item1 item2 …"'], "Show a menu of words (separated by spaces); the number picked (0, 1, …) goes into variable var.", 'menu 5, "Inn Shop Leave"'),
  h("timemsg", "Dialogue", ["time", '"text"'], "Show a message that closes by itself after time (in 1/100 s; 0 waits for a key).", 'timemsg 200, "The bell is silent."'),
  h("showgut", "Dialogue", ["topPicture", "bottomPicture", '"text"'], "Scroll text up the screen between two pictures (5-N, 0 = none), as in an ending.", 'showgut 0, 0, "THE END"'),
  h("setscenename", "Dialogue", ['"name"'], "Set the place name shown by showscenename and in the save list.", 'setscenename "BELLHAVEN"'),
  h("showscenename", "Dialogue", [], "Show the place name for a moment."),
  // maps
  h("loadmap", "Maps and camera", ["type", "index", "screenX", "screenY"], "Go to map type-index (type is 1). screenX, screenY: the map tile at the top-left of the 9×6 screen.", "loadmap 1, 1, 4, 4"),
  h("screens", "Maps and camera", ["screenX", "screenY"], "Move the camera so map tile screenX, screenY is at the top-left.", "screens 2, 3"),
  h("showscreen", "Maps and camera", [], "Redraw the map now (after changes made while the screen was hidden)."),
  h("movie", "Maps and camera", ["type", "index", "x", "y", "mode"], "Play animation type-index at x, y (pixels). mode: 0 plays it through, 1 a key stops it, 2 over the map, 3 both.", "movie 1, 3, 0, 0, 2"),
  // party
  h("createactor", "Party", ["member", "x", "y"], "Add party member N and put them at x, y on the screen (not the map: map tile = screen + loadmap's screenX, screenY).", "createactor 1, 4, 3"),
  h("deleteactor", "Party", ["member"], "Remove a party member.", "deleteactor 2"),
  h("setcontrolid", "Party", ["member"], "Make this party member the leader shown on the map.", "setcontrolid 2"),
  h("learnmagic", "Party", ["member", "type", "index"], "Teach a party member spell type-index.", "learnmagic 1, 1, 2"),
  h("resumeactorhp", "Party", ["member", "percent"], "Restore a party member's HP to a percentage.", "resumeactorhp 1, 100"),
  h("actorlayerup", "Party", ["member", "level"], "Raise a party member to a level.", "actorlayerup 1, 5"),
  h("attribtest", "Party", ["member", "attribute", "value", "@less", "@greater"], "Compare an attribute (0 level, 1 attack, 2 defence, 3 speed, 4 HP, 5 MP, 6 experience, 7 spirit, 8 luck, 23 max HP, 24 max MP) with value; jumps when less or greater.", "attribtest 1, 0, 5, @too_weak, @strong"),
  h("attribset", "Party", ["member", "attribute", "value"], "Set an attribute (numbers as in attribtest).", "attribset 1, 4, 50"),
  h("attribadd", "Party", ["member", "attribute", "value"], "Add to an attribute (numbers as in attribtest).", "attribadd 1, 1, 5"),
  // NPCs
  h("createnpc", "NPCs and objects", ["id", "npc", "x", "y"], "Put NPC resource npc on the map at tile x, y as id (1-40). Talking to it runs this script's event id.", "createnpc 1, 1, 10, 6"),
  h("deletenpc", "NPCs and objects", ["id"], "Remove an NPC or object from the map.", "deletenpc 1"),
  h("delallnpc", "NPCs and objects", [], "Remove every NPC and object from the map."),
  h("move", "NPCs and objects", ["id", "x", "y"], "Make an NPC walk to map tile x, y (the script waits).", "move 1, 12, 6"),
  h("npcmovemod", "NPCs and objects", ["id", "state"], "How an NPC moves: 0 stand, 1 forced, 2 wander, 3 pause, 4 animate in place.", "npcmovemod 1, 2"),
  h("npcstep", "NPCs and objects", ["id", "facing", "step"], "Turn an NPC (0 north, 1 east, 2 south, 3 west) and show a step frame (0-2). id 0 is the player.", "npcstep 1, 2, 1"),
  h("facetoface", "NPCs and objects", ["a", "b"], "Turn b to face a (0 = the player).", "facetoface 0, 1"),
  h("createbox", "NPCs and objects", ["id", "object", "x", "y"], "Put scene object resource object (a chest, a sign, …) at tile x, y as id (1-40). Facing it and pressing OK runs this script's event id.", "createbox 2, 1, 5, 12"),
  h("deletebox", "NPCs and objects", ["id"], "Remove a scene object.", "deletebox 2"),
  h("boxopen", "NPCs and objects", ["id"], "Show a scene object's second frame (an open chest).", "boxopen 2"),
  // battles
  h("enterfight", "Battles", ["rounds", "m1", "m2", "m3", "background", "bottomLeft", "topRight", "round1", "round2", "round3", "event1", "event2", "event3", "@lose", "@win"], "Start a battle with up to three monsters (3-N, 0 = none) on battle pictures 4-N (0 = none). rounds: 0 = fight to the end. The roundN / eventN pairs run an event at a round (0 = none).", "enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lose, @win"),
  h("initfight", "Battles", ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "background", "bottomLeft", "topRight"], "Set the monsters (3-N, 0 = none) and pictures of random battles on this map; fightenable turns them on.", "initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0"),
  h("fightenable", "Battles", [], "Turn random battles on."),
  h("fightdisenable", "Battles", [], "Turn random battles off."),
  // items
  h("gaingoods", "Items and money", ["type", "index"], "Give the player item type-index.", "gaingoods 9, 1"),
  h("deletegoods", "Items and money", ["type", "index", "@ifMissing"], "Take one item away; jumps when the player has none.", "deletegoods 14, 1, @no_key"),
  h("usegoods", "Items and money", ["type", "index", "@ifMissing"], "Use up one item; jumps when the player has none.", "usegoods 14, 1, @no_key"),
  h("usegoodsnum", "Items and money", ["type", "index", "count", "@ifMissing"], "Use up count items; jumps when the player has fewer.", "usegoodsnum 9, 1, 3, @not_enough"),
  h("testgoodsnum", "Items and money", ["type", "index", "count", "@equal", "@greater"], "Compare how many of an item the player has with count.", "testgoodsnum 9, 1, 3, @three, @more"),
  h("buy", "Items and money", ["type:index, …"], "Open a shop selling these items.", "buy 9:1, 9:2, 7:1"),
  h("sale", "Items and money", [], "Open the pawn shop (the player sells)."),
  h("gainmoney", "Items and money", ["amount"], "Give money.", "gainmoney 100"),
  h("usemoney", "Items and money", ["amount"], "Take money.", "usemoney 20"),
  h("setmoney", "Items and money", ["amount"], "Set the money.", "setmoney 0"),
  h("money", "Items and money", ["amount"], "Set the money (like setmoney).", "money 50"),
  h("testmoney", "Items and money", ["amount", "@ifLess"], "Jumps when the player has less money than amount.", "testmoney 20, @too_poor"),
  // flags
  h("setevent", "Flags and variables", ["flag"], "Set a story flag (kept in saves). Flags remember what has happened.", "setevent 12"),
  h("clrevent", "Flags and variables", ["flag"], "Clear a story flag.", "clrevent 12"),
  h("if", "Flags and variables", ["flag", "@label"], "Jump when the story flag is set.", "if 12, @already_done"),
  h("set", "Flags and variables", ["var", "value"], "Set a variable (0-255).", "set 0, 1"),
  h("add", "Flags and variables", ["var", "value"], "Add to a variable.", "add 3, 1"),
  h("sub", "Flags and variables", ["var", "value"], "Subtract from a variable.", "sub 3, 1"),
  h("setto", "Flags and variables", ["from", "to"], "Copy variable from into variable to.", "setto 1, 2"),
  h("ifcmp", "Flags and variables", ["var", "value", "@label"], "Jump when the variable equals value.", "ifcmp 0, 1, @from_wood"),
  h("discmp", "Flags and variables", ["var", "value", "@less", "@greater"], "Compare a variable with value; jumps when less or greater (equal goes on).", "discmp 3, 5, @few, @many"),
  h("randrade", "Flags and variables", ["perMille", "@label"], "Jump at random, perMille times in 1000.", "randrade 500, @heads"),
  // flow
  h("callback", "Flow", [], "End this event and give control back to the player."),
  h("goto", "Flow", ["@label"], "Jump to a label.", "goto @done"),
  h("startchapter", "Flow", ["type", "index"], "Switch to script type-index (its @start runs).", "startchapter 1, 2"),
  h("callchapter", "Flow", ["type", "index"], "Run script type-index, then come back here (it ends with return).", "callchapter 1, 9"),
  h("return", "Flow", [], "End a script started by callchapter."),
  h("event", "Flow", ["n"], "Run event n of this script.", "event 41"),
  h("gutevent", "Flow", ["script", "event"], "Switch to script 1-script and run its event.", "gutevent 2, 3"),
  h("seteventtimer", "Flow", ["event", "halfSeconds"], "Run an event of this script after a delay.", "seteventtimer 5, 10"),
  h("gameover", "Flow", [], "End the game (back to the title)."),
  // saving
  h("gamesave", "Saving", [], "Open the save screen."),
  h("disablesave", "Saving", [], "Stop the player from saving."),
  h("enablesave", "Saving", [], "Let the player save again."),
  // no-ops
  noop("music", ["type", "index"]),
  noop("mapevent", ["n"]),
  noop("actorevent", ["member", "event"]),
  noop("actormove", ["member", "x", "y"]),
  noop("actorspeed", ["member", "speed"]),
  noop("screenr", ["value"]),
  noop("screena", ["value"]),
  noop("setfightmiss", ["n"]),
  noop("setarmstoss", ["n"]),
  { ...h("enableshowpos", "Does nothing in this engine", [], "Show the map position in a corner (on the device)."), noop: true },
  { ...h("disableshowpos", "Does nothing in this engine", [], "Hide the map position."), noop: true },
];

const BY_NAME = new Map(HELP.map((x) => [x.name, x]));

/** Help for an instruction. */
export function opHelp(name: string): OpHelp | undefined {
  return BY_NAME.get(name);
}

/** Every instruction's help, in group order. */
export function allHelp(): OpHelp[] {
  return GROUPS.flatMap((g) => HELP.filter((x) => x.group === g));
}

/** "say portrait, "text"" */
export function signature(x: OpHelp): string {
  return x.args.length ? `${x.name} ${x.args.join(", ")}` : x.name;
}

/** A line to insert for an instruction: its example, or its name with blank operands. */
export function template(x: OpHelp): string {
  if (x.example) return x.example;
  const blank = specOf(x).args.map((k) => (k === "str" ? '""' : k === "addr" ? "@label" : k === "buy" ? "9:1" : "0"));
  return blank.length ? `${x.name} ${blank.join(", ")}` : x.name;
}

export function specOf(x: OpHelp): OpSpec {
  return OPS.find((o) => o.name === x.name)!;
}

export interface Snippet {
  label: string;
  note: string;
  /** Lines inserted at the caret. */
  here: string;
  /** Lines added at the end of the script (event handlers). */
  end?: string;
  /** `.event` lines added at the top. */
  events?: string;
}

// Placeholders: _N makes labels unique; {id} is a free NPC / object id (and
// its event), {ev} a free script event for a map event ({mapev} = ev - 40),
// {flag} a story flag no script uses yet.
/** Ready-made pieces for common tasks. */
export const SNIPPETS: Snippet[] = [
  {
    label: "Dialogue",
    note: "Two lines of dialogue, the first with portrait 1.",
    here: `  say 1, "Who goes there?"\n  say 0, "Only a traveller."`,
  },
  {
    label: "Yes / no question",
    note: "A choice; the second answer jumps to its label.",
    here: `  choice "Yes", "No", @no_N\n  say 0, "Then let's go!"\n  callback\n@no_N:\n  say 0, "Maybe later."\n  callback`,
  },
  {
    label: "Do something once",
    note: "A story flag remembers that it happened (also in saves).",
    here: `  if {flag}, @done_N\n  setevent {flag}\n  gaingoods 9, 1\n  message "You got a Herb!"\n@done_N:`,
  },
  {
    label: "Battle",
    note: "Monster 3-1 on battle picture 4-1; @won_N runs after a win, @lost_N after a loss.",
    here: `  enterfight 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lost_N, @won_N`,
    end: `@won_N:\n  message "You won!"\n  callback\n@lost_N:\n  gameover`,
  },
  {
    label: "Random battles",
    note: "Monsters 3-1 and 3-2 attack at random on this map.",
    here: `  initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0\n  fightenable`,
  },
  {
    label: "NPC who talks",
    note: "NPC 2-1 on the map at 10, 6; talking to it runs its event.",
    here: `  createnpc {id}, 1, 10, 6`,
    events: `.event {id} @talk_N`,
    end: `@talk_N:\n  facetoface 0, {id}\n  say 0, "Nice weather today."\n  callback`,
  },
  {
    label: "Chest",
    note: "Object 4-1 at 5, 5, opened once (a story flag remembers it).",
    here: `  createbox {id}, 1, 5, 5\n  if {flag}, @chest_open_N\n  goto @chest_ready_N\n@chest_open_N:\n  boxopen {id}\n@chest_ready_N:`,
    events: `.event {id} @chest_N`,
    end: `@chest_N:\n  if {flag}, @chest_empty_N\n  setevent {flag}\n  boxopen {id}\n  gaingoods 9, 1\n  message "Found a Herb!"\n  callback\n@chest_empty_N:\n  message "The chest is empty."\n  callback`,
  },
  {
    label: "Shop",
    note: "A shop selling two medicines and a weapon.",
    here: `  buy 9:1, 9:2, 7:1\n  callback`,
  },
  {
    label: "Map exit",
    note: "Put map event {mapev} on a tile with the map editor's Event tool: stepping there goes to script 1-2.",
    here: ``,
    events: `.event {ev} @exit_N`,
    end: `@exit_N:\n  ; map event {mapev}\n  set 0, 1\n  startchapter 1, 2`,
  },
];

const numbersAfter = (src: string, re: RegExp): Set<number> => new Set([...src.matchAll(re)].map((m) => Number(m[1])));

/**
 * Insert a snippet into a script: its lines after line `afterLine` (1-based;
 * 0 = before the first), its event handlers at the end, its `.event` lines at
 * the top (raising `.events` when needed), with unique labels, a free NPC id,
 * a free map event and a story flag no script uses (`others`: the other
 * scripts' text). Returns the new text, the first line of the inserted part
 * and the snippet's note with its numbers filled in.
 */
export function insertSnippet(source: string, s: Snippet, afterLine: number, others: string[] = []): { text: string; line: number; note: string } {
  const events = numbersAfter(source, /^\s*\.event\s+(\d+)/gm);
  const ids = new Set([...events, ...numbersAfter(source, /^\s*(?:@\w+:\s*)?(?:createnpc|createbox)\s+(\d+)/gim)]);
  const flags = numbersAfter([source, ...others].join("\n"), /^\s*(?:@\w+:\s*)?(?:setevent|clrevent|if)\s+(\d+)/gim);
  let n = 1;
  while (new RegExp(`@\\w+_${n}\\b`).test(source)) n++;
  let id = 1;
  while (ids.has(id) && id < 40) id++;
  let ev = 41;
  while (events.has(ev) && ev < 255) ev++;
  let flag = 1;
  while (flags.has(flag)) flag++;
  const fill = (t: string) =>
    t
      .replace(/_N\b/g, `_${n}`)
      .replace(/\{id\}/g, String(id))
      .replace(/\{ev\}/g, String(ev))
      .replace(/\{mapev\}/g, String(ev - 40))
      .replace(/\{flag\}/g, String(flag));

  const lines = source.replace(/\n$/, "").split("\n");
  let first = Math.min(Math.max(0, afterLine), lines.length) + 1;
  if (s.end) {
    if (lines[lines.length - 1]?.trim()) lines.push("");
    if (!s.here) first = lines.length + 1;
    lines.push(...fill(s.end).split("\n"));
  }
  if (s.here) lines.splice(first - 1, 0, ...fill(s.here).split("\n"));
  if (s.events) {
    const add = fill(s.events).split("\n");
    let at = -1;
    lines.forEach((l, i) => {
      if (/^\s*\.events?\s/.test(l) && i < first - 1) at = i;
    });
    lines.splice(at + 1, 0, ...add);
    if (at + 1 < first) first += add.length;
    // raise the event count to cover the new events
    const top = Math.max(...add.map((l) => Number(/^\s*\.event\s+(\d+)/.exec(l)?.[1] ?? 0)));
    const ci = lines.findIndex((l) => /^\s*\.events\s+\d+/.test(l));
    if (ci >= 0) lines[ci] = lines[ci].replace(/(\.events\s+)(\d+)/, (m, a, c) => (Number(c) < top ? `${a}${top}` : m));
  }
  return { text: lines.join("\n") + "\n", line: first, note: fill(s.note) };
}

/**
 * The instruction on a line and the operand the caret (column, 0-based) is
 * in, or null when the line holds no instruction.
 */
export function instructionAt(line: string, column: number): { help: OpHelp; arg: number } | null {
  const m = /^(\s*(?:@[A-Za-z_]\w*:\s*)?)([A-Za-z_]\w*)/.exec(line);
  if (!m) return null;
  const help = BY_NAME.get(m[2].toLowerCase());
  if (!help) return null;
  const start = m[0].length;
  if (column <= start) return { help, arg: -1 };
  let arg = 0;
  let quoted = false;
  for (let i = start; i < Math.min(column, line.length); i++) {
    const c = line[i];
    if (c === "\\" && quoted) i++;
    else if (c === '"') quoted = !quoted;
    else if (c === ";" && !quoted) return { help, arg: -1 };
    else if (c === "," && !quoted) arg++;
  }
  // "buy" lists any number of pairs: all are its one operand
  return { help, arg: help.name === "buy" ? 0 : Math.min(arg, help.args.length - 1) };
}

// ---------------------------------------------------------------------------
// Dialogue boxes

export interface TextIssue {
  line: number;
  message: string;
}

/** A `say` / `message` line: its parts, for checking and re-wrapping. */
const SAY = /^(\s*(?:@[A-Za-z_]\w*:\s*)?say\s+)(\d+)(\s*,\s*)"((?:[^"\\]|\\.)*)"(.*)$/i;
const MESSAGE = /^(\s*(?:@[A-Za-z_]\w*:\s*)?message\s+)"((?:[^"\\]|\\.)*)"(.*)$/i;
const ANY_STRING = /"((?:[^"\\]|\\.)*)"/g;

/** The words split across the box's lines: the text runs over `widths` cells a line (repeating). */
export function splitWords(text: string, widths: number[]): string[] {
  const bytes = Array.from(gbkBytes(text), (b) => b & 0xff);
  const out: string[] = [];
  let at = 0;
  for (let i = 0; at < bytes.length; i++) {
    at += widths[i % widths.length];
    if (at >= bytes.length) break;
    const before = bytes[at - 1];
    const after = bytes[at];
    const word = (b: number) => b > 0x20 && b < 0x7f;
    if (word(before) && word(after)) {
      let s = at - 1;
      while (s > 0 && word(bytes[s - 1])) s--;
      let e = at;
      while (e < bytes.length && word(bytes[e])) e++;
      out.push(String.fromCharCode(...bytes.slice(s, at)) + "|" + String.fromCharCode(...bytes.slice(at, e)));
    }
  }
  return out;
}

const unescape = (s: string) => s.replace(/\\(["\\])/g, "$1");
const escape = (s: string) => s.replace(/(["\\])/g, "\\$1");

/** Characters the game's fonts cannot show (they become "?"). */
export function unshowable(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) if (ch !== "?" && gbkBytes(ch).length === 1 && gbkBytes(ch)[0] === 0x3f) bad.add(ch);
  return [...bad];
}

/** Dialogue problems in a script's text: words split across lines, unshowable characters. */
export function checkDialogue(src: string): TextIssue[] {
  const out: TextIssue[] = [];
  src.split(/\r?\n/).forEach((l, i) => {
    const line = i + 1;
    if (l.trim().startsWith(";")) return;
    for (const m of l.matchAll(ANY_STRING)) {
      const bad = unshowable(unescape(m[1]));
      if (bad.length) out.push({ line, message: `the game cannot show ${bad.map((c) => `"${c}"`).join(" ")} (shown as ?)` });
    }
    const say = SAY.exec(l);
    const msg = say ? null : MESSAGE.exec(l);
    const text = say ? say[4] : msg ? msg[2] : null;
    if (text === null || /\\[nx]/.test(text)) return;
    const widths = say ? (Number(say[2]) ? SAY_WITH_PORTRAIT : SAY_PLAIN) : MESSAGE_BOX;
    const split = splitWords(unescape(text), widths);
    if (split.length) out.push({ line, message: `${split.map((w) => `"${w}"`).join(", ")} split across lines of the box (Wrap dialogue fixes it)` });
  });
  return out;
}

/**
 * Re-wrap the `say` and `message` lines whose words are split across the
 * box's lines (others are left alone, spacing and all). Returns the new text
 * and how many lines changed.
 */
export function wrapDialogue(src: string): { text: string; changed: number } {
  let changed = 0;
  const lines = src.split("\n").map((l) => {
    const say = SAY.exec(l);
    const msg = say ? null : MESSAGE.exec(l);
    const raw = say ? say[4] : msg ? msg[2] : null;
    if (raw === null || /\\[nx]/.test(raw)) return l;
    const text = unescape(raw);
    const widths = say ? (Number(say[2]) ? SAY_WITH_PORTRAIT : SAY_PLAIN) : MESSAGE_BOX;
    if (!splitWords(text, widths).length) return l;
    const words = text.trim().replace(/\s+/g, " ");
    const wrapped = escape(say ? wrapForBox(words, widths) : wrapMessage(words));
    changed++;
    return say ? `${say[1]}${say[2]}${say[3]}"${wrapped}"${say[5]}` : `${msg![1]}"${wrapped}"${msg![3]}`;
  });
  return { text: lines.join("\n"), changed };
}

/** The screen is 9×6 tiles. */
export const SCREEN_TILES = { w: 9, h: 6 };

/**
 * Where to put the camera (loadmap's screenX, screenY) and the party leader
 * (createactor's screen x, y) so the leader stands on map tile x, y: the
 * leader near the middle of the screen, the screen inside the map.
 */
export function playerStart(x: number, y: number, mapW: number, mapH: number): { screenX: number; screenY: number; actorX: number; actorY: number } {
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, Math.max(0, hi)));
  const screenX = clamp(x - 4, mapW - SCREEN_TILES.w);
  const screenY = clamp(y - 3, mapH - SCREEN_TILES.h);
  return { screenX, screenY, actorX: x - screenX, actorY: y - screenY };
}
