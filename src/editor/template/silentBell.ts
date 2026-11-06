// "The Silent Bell": an original demo game of about twenty minutes, built in
// code like Lantern Path. Five maps, two party members, three dungeons with
// bosses, a lever puzzle, a shop, an inn and a final battle.
//
// Story: every dawn the great bell of Bellhaven rings the Mire Fog away.
// This morning it was silent: the Fog Warden broke its heartstone into three
// shards and hid them in the Whisperwood, the Old Quarry and the Mire. Rin,
// the bell-ringer's apprentice, sets out to bring them back.
import {
  encodeGoods, encodeImage, encodeLevelChain, encodeMagic, encodeMagicChain, encodeMap, encodeMonster,
  encodeNpc, encodePlayer, encodeSceneObj, type MapCell,
} from "../format/encode";
import { assemble } from "../format/gut";
import type { LibArchive, LibEntry } from "../format/lib";
import { wrapMessage, SAY_PLAIN, SAY_WITH_PORTRAIT, wrapForBox } from "../format/text";
import { gbkBytes } from "../../engine/java";
import { Pix } from "./draw";
import { CHEST, CLOUD, ICONS, MOTH, SHELLBUG, STONE, TUFT, WISP, bolt, glow, sparkle } from "./demo";
import {
  BAT, BELL, BOULDER, BRAM, BRAM_FACE, ELDER, ELDER_FACE, GATE, GOLEM, ICONS2, JOSS, LEVER, MERCHANT, MIRA, ORDER, PIP, REEDS,
  RIN, RIN_FACE, ROCKS, SIGN, STAG, THORN_RAT, TILES, TOAD, WARDEN, WARDEN_FACE, WITCH, WOLF, bramBattle, caveBackground,
  forestBackground, marshBackground, rinBattle, slash, tileIndex, towerBackground, wave,
} from "./bellArt";
import { systemResources } from "./system";

const R = { GUT: 1, MAP: 2, ARS: 3, MRS: 4, SRS: 5, GRS: 6, TIL: 7, ACP: 8, GDP: 9, PIC: 11, MLR: 12 };

// ---------------------------------------------------------------------------
// maps. The hero stands at screen tile (4,3), so loadmap's screen position
// is the hero's map position minus (4,3). Reachable tiles keep 4 columns and
// 3 rows away from the edges; exits sit just beyond.

export interface MapDef {
  index: number;
  name: string;
  rows: string[];
  /** Map event tiles: "x,y" -> n (script event 40 + n). */
  events: Record<string, number>;
}

export const MAPS: MapDef[] = [
  {
    index: 1, name: "BELLHAVEN",
    rows: [
      "TTTTTTTTTTTTTTTTTTTTTTTTTT",
      "TTTTT,TTTTTTSSSSSTTTTTTTTT",
      "TTTTT,TTTTTTSSDSSTTTTTTTTT",
      "TTTTT,...,,,,,,,,,....TTTT",
      "TTTTT,.RRRR.,..RRRR...TTTT",
      "TTTT*,.RRRR.,..RRRR.*.TTTT",
      "TTTT.,.HwDH.,..HDwH...TTTT",
      "TTTT.,,,,,,,,,,,,,,,,,,,,,",
      "TTTT..,....,.....~~~..TTTT",
      "TTTT..,.RRRR,..*.~~~.*TTTT",
      "TTTT*.,.RRRR,....~~...TTTT",
      "TTTT..,.HwDH,.........TTTT",
      "TTTT..,,,,,,,,,,......TTTT",
      "TTTT.*......,.....*...TTTT",
      "TTTT~~~~~~~~b~~~~~~~~~TTTT",
      "TTTT~~~~~~~~b~~~~~~~~~TTTT",
      "TTTTTTTTTTTTbTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    ],
    events: { "22,7": 1, "5,2": 2, "12,15": 3, "14,2": 4, "9,6": 5, "16,6": 6, "10,11": 7 },
  },
  {
    index: 2, name: "WHISPERWOOD",
    rows: [
      "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
      'TTTTTTTT""..**..""TTTTTTTTTTTT',
      'TTTTTTT""........""TTT""TTTTTT',
      'TTTTTTT"..TT..*..."TT"..""TTTT',
      'TTTTTT""..TTT"""".."""..*.TTTT',
      'TTTT"""..TTTT""TT""..TT"".TTTT',
      ',,,,,,"..TT""..TT"..TTTT"..TTT',
      'TTTT""...""..TTTT"""..TT"..TTT',
      'TTTT"TT"""..TT*.."TT"..."".TTT',
      'TTTT"TT""..TTTT..""TT""..*TTTT',
      'TTTT"*."..."TTTT"..""TT..TTTTT',
      'TTTT""""TT"""TTT""TTTTTTTTTTTT',
      "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    ],
    events: { "3,8": 1 },
  },
  {
    index: 3, name: "OLD QUARRY",
    rows: [
      "CCCCCCCCCCCCCCCCCCCCCCCCCC",
      "CCCCCCCCCCCCCCCCCCCCCCCCCC",
      "CCCCCCCCCCCCCCCCCCCCCCCCCC",
      "CCCCCCcccCCCCCCCCcccccCCCC",
      "CCCCCcccccCCCCCCcccccccCCC",
      "CCCCCcccccCCCCCCCcccccCCCC",
      "CCCCCCcLcCCCCCCCCCCcCCCCCC",
      "CCCCccLLcccccCCCCccccCCCCC",
      "CCCCcccLLcccccCCcccccccCCC",
      "CCCCccccLLccCCCcccoccccCCC",
      "CCCCCCcccLcccccccccccccCCC",
      "CCCCCCCccLLcccCCCcccccCCCC",
      "CCCCCCCCccLccCCCCCcccCCCCC",
      "CCCCCCCCCcLccCCCCCCcCCCCCC",
      "CCCCCCCCCcLcCCCCCCCCCCCCCC",
      "CCCCCCCCCcLcCCCCCCCCCCCCCC",
      "CCCCCCCCCCLCCCCCCCCCCCCCCC",
      "CCCCCCCCCCCCCCCCCCCCCCCCCC",
    ],
    events: { "10,16": 1 },
  },
  {
    index: 4, name: "THE MIRE",
    rows: [
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "rrrrrrbrrrrrrrrrrrrrrrrrrrrr",
      "rrrrmmbmmrr~~~~rrrmmmrrrrrrr",
      "rrrrmmmmmmr~~~~rrmmmmmrrrrrr",
      "rrrrrmm*mmbbbbbbbmmmmmmrrrrr",
      "rrrr~~mmmrr~~~~rrrm*mmmrrrrr",
      "rrrr~~~mmmr~~~~~rmmmmssssrrr",
      "rrrr~~~~mmbbbbbbbmmmmsssssrr",
      "rrrr*m~~mmr~~~~~rrmmmssssrrr",
      "rrrrmmm~mmr~~~~rrrrmmmmrrrrr",
      "rrrrmmmmmmrr~~rrrrrrmmmrrrrr",
      "rrrrmm*mmrrr~~rrrrrrrmmmrrrr",
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    ],
    events: { "6,2": 1 },
  },
  {
    index: 5, name: "BELL TOWER",
    rows: [
      "SSSSSSSSSSSSSSSS",
      "SSSSSSSSSSSSSSSS",
      "SSSSSSSSSSSSSSSS",
      "SSSSssssssssSSSS",
      "SSSSssssssssSSSS",
      "SSSSssPsssPsSSSS",
      "SSSSssssssssSSSS",
      "SSSSssPsssPsSSSS",
      "SSSSssssssssSSSS",
      "SSSSssssssssSSSS",
      "SSSSSSSSsSSSSSSS",
      "SSSSSSSSSSSSSSSS",
    ],
    events: { "8,10": 1 },
  },
];

function mapEntry(m: MapDef): LibEntry {
  const height = m.rows.length;
  const width = m.rows[0].length;
  const cells: MapCell[] = [];
  m.rows.forEach((r, y) => {
    if (r.length !== width) throw new Error(`map ${m.name} row ${y} has ${r.length} tiles, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const t = TILES[r[x]];
      if (!t) throw new Error(`map ${m.name}: unknown tile "${r[x]}"`);
      cells.push({ tile: tileIndex(r[x]), walkable: t.walk, event: m.events[`${x},${y}`] ?? 0 });
    }
  });
  return { resType: R.MAP, type: 1, index: m.index, data: encodeMap({ type: 1, index: m.index, tileset: 1, name: m.name, width, height, cells }) };
}

// ---------------------------------------------------------------------------
// scripts. Global events used:
//   1 intro seen          2 quest given        12 Bram joined     13 boulder moved
//  14 wood chest         15 village chest      21 levers solved   22 quarry chest
//  23 ferry running      24 mire chest         31/32/33 shards found
//  40 the bell rings again
// Variables: 0 where the party came from, 10 lever progress.

const say = (portraitId: number, text: string) => `  say ${portraitId}, "${wrapForBox(text, portraitId ? SAY_WITH_PORTRAIT : SAY_PLAIN)}"`;
const msg = (text: string) => `  message "${wrapMessage(text)}"`;
const RIN_P = 1;
const BRAM_P = 2;
const ELDER_P = 3;
const WARDEN_P = 4;

// battle scenery: background, bottom-left and top-right pieces (PIC 4-n)
const WOOD_BG = "1, 2, 3";
const MINE_BG = "4, 5, 0";
const MIRE_BG = "6, 7, 3";
const TOWER_BG = "8, 0, 0";
const fight = (monsters: [number, number, number], bg: string, lose: string, win: string) =>
  `  enterfight 0, ${monsters.join(", ")}, ${bg}, 0, 0, 0, 0, 0, 0, ${lose}, ${win}`;

const VILLAGE = `
.gut 1 1
.desc "Bellhaven"
.events 47
.event 1 @elder
.event 2 @tam
.event 3 @hana
.event 4 @pip
.event 5 @joss
.event 6 @chest
.event 7 @boulder
.event 41 @east
.event 42 @north
.event 43 @pier
.event 44 @tower
.event 45 @home
.event 46 @shop
.event 47 @inn

@start:
  fightdisenable
  ifcmp 0, 1, @from_wood
  ifcmp 0, 2, @from_quarry
  ifcmp 0, 3, @from_mire
  ifcmp 0, 4, @from_tower
  loadmap 1, 1, 5, 4
  createactor 1, 4, 3
  goto @setup
@from_wood:
  loadmap 1, 1, 17, 4
  goto @setup
@from_quarry:
  loadmap 1, 1, 1, 0
  goto @setup
@from_mire:
  loadmap 1, 1, 8, 11
  goto @setup
@from_tower:
  loadmap 1, 1, 10, 0
@setup:
  set 0, 0
  createnpc 1, 1, 13, 8
  createnpc 2, 2, 15, 8
  createnpc 3, 3, 13, 11
  createnpc 4, 4, 18, 12
  npcmovemod 4, 2
  createnpc 5, 5, 13, 13
  createbox 6, 1, 21, 5
  if 15, @chest_was_open
  goto @boulder_state
@chest_was_open:
  boxopen 6
@boulder_state:
  if 13, @named
  createbox 7, 2, 5, 4
@named:
  setscenename "BELLHAVEN"
  showscenename
  if 40, @celebrate
  if 1, @done
  setevent 1
${say(RIN_P, "Morning already... but the bell never rang! And the fog is creeping in.")}
${say(RIN_P, "Elder Wen will know what's wrong. She's by the square.")}
  callback
@celebrate:
  ifcmp 9, 1, @done
  set 9, 1
${say(ELDER_P, "Listen to it ring! The fog is gone, and it's all thanks to you two.")}
  callback

@elder:
  facetoface 0, 1
  if 40, @elder_end
  if 2, @elder_hint
${say(ELDER_P, "Rin! The Fog Warden has broken the bell's heartstone into three shards.")}
${say(ELDER_P, "One fell in the Whisperwood to the east, one in the Old Quarry to the north, one in the Mire to the south.")}
${say(ELDER_P, "Without the bell, the fog will swallow Bellhaven. Take these, and be careful.")}
  gaingoods 9, 1
  gaingoods 9, 1
  gainmoney 60
${msg("Received 2 Herbs and 60 gold.")}
  setevent 2
  callback
@elder_hint:
  if 31, @elder_hint2
${say(ELDER_P, "Bram the woodcutter went into the Whisperwood yesterday. Look for him.")}
  callback
@elder_hint2:
  if 32, @elder_hint3
${say(ELDER_P, "The Old Quarry is up the north path. Bram could shift that boulder.")}
  callback
@elder_hint3:
  if 33, @elder_hint4
${say(ELDER_P, "The last shard is in the Mire. Old Joss's ferry leaves from the south pier.")}
  callback
@elder_hint4:
${say(ELDER_P, "All three shards! Take them up to the bell tower, north of the square.")}
  callback
@elder_end:
${say(ELDER_P, "Bellhaven owes you everything. Come back and visit, you two.")}
  callback

@tam:
  facetoface 0, 2
${say(0, "Tam: Herbs, tonics and gear for brave bell-ringers!")}
  if 32, @tam_best
  if 31, @tam_more
  buy 9:1, 9:2, 10:1, 7:1, 2:1
  callback
@tam_more:
  buy 9:1, 9:2, 9:3, 10:1, 7:1, 7:2, 2:1, 2:2
  callback
@tam_best:
  buy 9:1, 9:2, 9:3, 10:1, 7:2, 7:4, 2:2, 2:3
  callback

@hana:
  facetoface 0, 3
${say(0, "Hana: A warm bed at the Bell and Pillow is 10 gold. Rest a while?")}
  choice "Rest", "Not now", @hana_no
  testmoney 10, @hana_poor
  usemoney 10
  resumeactorhp 1, 100
  if 12, @hana_bram
  goto @hana_slept
@hana_bram:
  resumeactorhp 2, 100
@hana_slept:
${msg("You sleep soundly. HP restored.")}
  callback
@hana_poor:
${say(0, "Hana: Short on coin? Come back when you've a little more.")}
  callback
@hana_no:
  callback

@pip:
  facetoface 0, 4
  if 40, @pip_end
  if 13, @pip3
  if 12, @pip2
${say(0, "Pip: Bram the woodcutter went to the Whisperwood and never came home!")}
  callback
@pip2:
${say(0, "Pip: Bram's so strong! I bet he could shove that big boulder on the north path.")}
  callback
@pip3:
${say(0, "Pip: Mum says the Mire witch steals lanterns. Keep yours close!")}
  callback
@pip_end:
${say(0, "Pip: I heard the bell! Everything sounds brighter now.")}
  callback

@joss:
  facetoface 0, 5
  if 23, @joss_ready
  testgoodsnum 14, 4, 1, @joss_token, @joss_token
${say(0, "Joss: Nobody crosses to the Mire without a Ferry Token. Lost mine up at the old quarry.")}
  callback
@joss_token:
  usegoods 14, 4, @done
  setevent 23
${say(0, "Joss: My token! The boat's at the end of the pier when you're ready.")}
  callback
@joss_ready:
${say(0, "Joss: Step onto the end of the pier and I'll row you over.")}
  callback

@chest:
  if 15, @chest_empty
  gaingoods 9, 1
  gaingoods 9, 2
  boxopen 6
  setevent 15
${msg("Found a Herb and a Tonic!")}
  callback
@chest_empty:
${msg("The chest is empty.")}
  callback

@boulder:
  if 12, @boulder_push
${msg("A huge boulder blocks the north path. It won't budge.")}
  callback
@boulder_push:
${say(BRAM_P, "Stand back, little bell-ringer. Hnnngh!")}
  deletebox 7
  setevent 13
${msg("The path to the Old Quarry is open.")}
  callback

@east:
  if 2, @to_wood
${say(RIN_P, "I should talk to Elder Wen first.")}
  callback
@to_wood:
  startchapter 1, 2
@north:
  startchapter 1, 3
@pier:
  if 23, @sail
${msg("Joss's boat is tied up. You'll need the ferryman.")}
  callback
@sail:
${say(RIN_P, "To the Mire, then.")}
  startchapter 1, 4
@tower:
  if 31, @tower2
  goto @tower_sealed
@tower2:
  if 32, @tower3
  goto @tower_sealed
@tower3:
  if 33, @tower_open
@tower_sealed:
${msg("A cold fog seals the tower door.")}
  callback
@tower_open:
${say(RIN_P, "The shards are humming... the fog is parting!")}
  startchapter 1, 5
@home:
${msg("Rin's home. Save your journey from the menu at any time.")}
  callback
@shop:
${msg("Tam's shop. Tam is out front.")}
  callback
@inn:
${msg("The Bell and Pillow inn. Hana is outside.")}
  callback
@done:
  callback
`;

const WOOD = `
.gut 1 2
.desc "Whisperwood"
.events 41
.event 1 @bram
.event 2 @chest
.event 3 @shard
.event 41 @west

@start:
  loadmap 1, 2, 0, 5
  initfight 1, 2, 3, 1, 2, 0, 0, 0, ${WOOD_BG}
  fightenable
  if 12, @no_bram
  createnpc 1, 6, 12, 4
@no_bram:
  createbox 2, 1, 5, 12
  if 14, @chest_was_open
  goto @shard_state
@chest_was_open:
  boxopen 2
@shard_state:
  if 31, @named
  createbox 3, 3, 25, 8
@named:
  setscenename "WHISPERWOOD"
  showscenename
  callback

@bram:
  facetoface 0, 1
${say(BRAM_P, "Rin? Get back! These wolves have had me pinned here all night!")}
  fightdisenable
${fight([3, 3, 0], WOOD_BG, "@lose", "@bram_win")}
@bram_win:
  deletenpc 1
  createactor 2, 4, 3
  setevent 12
  fightenable
${say(BRAM_P, "Thanks, little bell-ringer. A shard of the bell, you say? Then I'm coming with you.")}
${msg("Bram joined the party!")}
  callback

@chest:
  if 14, @chest_empty
  gaingoods 9, 2
  gaingoods 6, 1
  gainmoney 40
  boxopen 2
  setevent 14
${msg("Found a Tonic, a Luck Charm and 40 gold!")}
  callback
@chest_empty:
${msg("The chest is empty.")}
  callback

@shard:
  if 12, @shard_fight
${say(RIN_P, "There's the shard... and something huge is watching it. I can't face that alone.")}
  callback
@shard_fight:
${say(RIN_P, "The shard! Wait, the bracken is moving...")}
${say(0, "The Hollow Stag rises, antlers dripping with fog!")}
  fightdisenable
${fight([4, 0, 0], WOOD_BG, "@lose", "@shard_win")}
@shard_win:
  gaingoods 14, 1
  deletebox 3
  setevent 31
  fightenable
${say(RIN_P, "The Dawn Shard! One down, two to go.")}
${say(BRAM_P, "Elder Wen will want to hear. Let's head back to the village.")}
  callback
@lose:
  gameover

@west:
  set 0, 1
  startchapter 1, 1
`;

const QUARRY = `
.gut 1 3
.desc "Old Quarry"
.events 41
.event 1 @lever_west
.event 2 @lever_high
.event 3 @lever_east
.event 4 @gate
.event 5 @sign
.event 6 @chest
.event 7 @shard
.event 41 @south

@start:
  loadmap 1, 3, 6, 12
  initfight 5, 6, 7, 5, 6, 0, 0, 0, ${MINE_BG}
  fightenable
  createbox 5, 6, 8, 4
  createbox 6, 1, 21, 8
  if 22, @chest_was_open
  goto @levers
@chest_was_open:
  boxopen 6
@levers:
  createbox 1, 4, 5, 8
  createbox 2, 4, 7, 3
  createbox 3, 4, 12, 8
  if 21, @solved
  set 10, 0
  createbox 4, 5, 19, 6
  goto @shard_state
@solved:
  boxopen 1
  boxopen 2
  boxopen 3
@shard_state:
  if 32, @named
  createbox 7, 3, 19, 3
@named:
  setscenename "OLD QUARRY"
  showscenename
  callback

@sign:
${msg("Carved in the rock: Dawn climbs the peak, falls into the west, and sleeps in the east.")}
  callback

@lever_high:
  ifcmp 10, 0, @high_ok
  goto @wrong
@high_ok:
  boxopen 2
  set 10, 1
${msg("Clunk!")}
  callback
@lever_west:
  ifcmp 10, 1, @west_ok
  goto @wrong
@west_ok:
  boxopen 1
  set 10, 2
${msg("Clunk!")}
  callback
@lever_east:
  ifcmp 10, 2, @east_ok
  goto @wrong
@east_ok:
  boxopen 3
  set 10, 3
  setevent 21
  deletebox 4
${msg("Somewhere ahead, an iron gate grinds open!")}
  callback
@wrong:
  if 21, @stuck
${msg("The levers snap back up with a clang.")}
  deletebox 1
  deletebox 2
  deletebox 3
  createbox 1, 4, 5, 8
  createbox 2, 4, 7, 3
  createbox 3, 4, 12, 8
  set 10, 0
  randrade 400, @noise
  callback
@noise:
${say(BRAM_P, "That racket woke something up!")}
${fight([5, 5, 0], MINE_BG, "@lose", "@done")}
@stuck:
${msg("The lever is stuck fast.")}
  callback

@gate:
${msg("A rusted iron gate. There must be a way to open it.")}
  callback

@chest:
  if 22, @chest_empty
  gaingoods 2, 2
  gaingoods 9, 3
  boxopen 6
  setevent 22
${msg("Found a Hide Vest and a Honey Bun!")}
  callback
@chest_empty:
${msg("The chest is empty.")}
  callback

@shard:
${say(RIN_P, "The second shard, buried in the ore... and the ore is standing up!")}
  fightdisenable
${fight([8, 0, 0], MINE_BG, "@lose", "@shard_win")}
@shard_win:
  gaingoods 14, 2
  gaingoods 14, 4
  deletebox 7
  setevent 32
  fightenable
${say(RIN_P, "The Ember Shard! And look, a Ferry Token was stuck in the golem's ore.")}
${say(BRAM_P, "That'll be Old Joss's. Now we can cross to the Mire.")}
  callback
@lose:
  gameover

@south:
  set 0, 2
  startchapter 1, 1
@done:
  callback
`;

const MIRE = `
.gut 1 4
.desc "The Mire"
.events 41
.event 1 @sela
.event 2 @chest
.event 3 @shard
.event 41 @dock

@start:
  loadmap 1, 4, 2, 0
  initfight 9, 10, 9, 10, 0, 0, 0, 0, ${MIRE_BG}
  fightenable
  createnpc 1, 7, 19, 4
  createbox 2, 1, 5, 12
  if 24, @chest_was_open
  goto @shard_state
@chest_was_open:
  boxopen 2
@shard_state:
  if 33, @named
  createbox 3, 3, 24, 8
@named:
  setscenename "THE MIRE"
  showscenename
  callback

@sela:
  facetoface 0, 1
  if 33, @sela_after
${say(0, "Sela: The witch at the drowned shrine guards the last shard. Let me tend your wounds first.")}
  goto @sela_heal
@sela_after:
${say(0, "Sela: The witch is gone? Then the marsh will breathe again. Rest a moment.")}
@sela_heal:
  resumeactorhp 1, 100
  if 12, @sela_bram
  goto @sela_done
@sela_bram:
  resumeactorhp 2, 100
@sela_done:
${msg("Sela's herbs restore your HP.")}
  callback

@chest:
  if 24, @chest_empty
  gaingoods 10, 1
  gaingoods 10, 1
  gainmoney 80
  boxopen 2
  setevent 24
${msg("Found 2 Bell Waters and 80 gold!")}
  callback
@chest_empty:
${msg("The chest is empty.")}
  callback

@shard:
${say(RIN_P, "The Mire Shard! Someone is standing over it...")}
${say(0, "Witch: Little bell-ringer, you'll ring no bells in my fog!")}
  fightdisenable
${fight([11, 0, 0], MIRE_BG, "@lose", "@shard_win")}
@shard_win:
  gaingoods 14, 3
  deletebox 3
  setevent 33
  fightenable
${say(RIN_P, "That's all three shards! Back to Bellhaven, to the bell tower.")}
  callback
@lose:
  gameover

@dock:
  set 0, 3
  startchapter 1, 1
`;

const ENDING =
  "The great bell of Bellhaven rang out over the hills. The fog fled across the Mire and did not come back. " +
  "Bram went home to his axe and his woodpile, and Rin rang the bell every dawn after that. THE END. " +
  "Thank you for playing THE SILENT BELL, a demo made entirely in FMJ React.";

const TOWER = `
.gut 1 5
.desc "Bell Tower"
.events 41
.event 1 @bell
.event 41 @door

@start:
  fightdisenable
  loadmap 1, 5, 4, 6
  createbox 1, 7, 8, 4
  if 40, @rung
  goto @named
@rung:
  boxopen 1
@named:
  setscenename "BELL TOWER"
  showscenename
  callback

@bell:
  if 40, @bell_after
${say(RIN_P, "The great bell... Let's put the shards back where they belong.")}
  usegoods 14, 1, @done
  usegoods 14, 2, @done
  usegoods 14, 3, @done
${msg("The three shards rise and fly into the bell...")}
${say(WARDEN_P, "Foolish child. This village was mine the moment the bell fell silent!")}
${say(BRAM_P, "Then we'll just have to clear the air.")}
${fight([12, 0, 0], TOWER_BG, "@lose", "@win")}
@win:
  boxopen 1
  setevent 40
${say(RIN_P, "Now... ring!")}
  showgut 0, 0, "${wrapForBox(ENDING, [20])}"
  set 0, 4
  startchapter 1, 1
@lose:
  gameover
@bell_after:
${msg("The bell hums softly, warm to the touch.")}
  callback

@door:
  set 0, 4
  startchapter 1, 1
@done:
  callback
`;

/** The game's script sources, so the editor shows them with their labels. */
export function silentBellSources(): Record<string, string> {
  return { "1-1-1": VILLAGE.trimStart(), "1-1-2": WOOD.trimStart(), "1-1-3": QUARRY.trimStart(), "1-1-4": MIRE.trimStart(), "1-1-5": TOWER.trimStart() };
}

// ---------------------------------------------------------------------------

export function silentBell(): LibArchive {
  const entries: LibEntry[] = [...systemResources({ title: "THE SILENT BELL", subtitle: "A DEMO FOR FMJ REACT" })];
  const add = (resType: number, type: number, index: number, data: Uint8Array) => entries.push({ resType, type, index, data });
  const img = (resType: number, type: number, index: number, frames: Pix[]) => add(resType, type, index, encodeImage(type, index, frames.map((f) => f.frame())));

  img(R.TIL, 1, 1, ORDER.map((c) => TILES[c].pix));
  for (const m of MAPS) entries.push(mapEntry(m));

  // walking sprites
  img(R.ACP, 1, 1, RIN);
  img(R.ACP, 1, 2, BRAM);
  [ELDER, MERCHANT, MIRA, PIP, JOSS, BRAM].forEach((s, i) => img(R.ACP, 2, i + 1, s));
  // scene objects
  img(R.ACP, 4, 1, [...CHEST, CHEST[1]]);
  img(R.ACP, 4, 2, [BOULDER[0], BOULDER[0]]);
  img(R.ACP, 4, 3, [...STONE, STONE[0]]);
  img(R.ACP, 4, 4, [...LEVER, LEVER[1]]);
  img(R.ACP, 4, 5, [GATE[0], GATE[0]]);
  img(R.ACP, 4, 6, [SIGN[0], SIGN[0]]);
  img(R.ACP, 4, 7, [...BELL, BELL[1]]);
  // monsters
  const darkWisp = WISP.map((f) => {
    const p = f.clone();
    p.invert(0, 0, p.width, p.height);
    return p;
  });
  [MOTH, THORN_RAT, WOLF, STAG, BAT, SHELLBUG, WISP, GOLEM, TOAD, darkWisp, WITCH, WARDEN].forEach((s, i) => img(R.ACP, 3, i + 1, s));
  // portraits, battle sprites, battle scenery
  [RIN_FACE, BRAM_FACE, ELDER_FACE, WARDEN_FACE].forEach((f, i) => img(R.PIC, 1, i + 1, f));
  img(R.PIC, 3, 1, rinBattle());
  img(R.PIC, 3, 2, bramBattle());
  img(R.PIC, 4, 1, [forestBackground()]);
  img(R.PIC, 4, 2, [TUFT]);
  img(R.PIC, 4, 3, [CLOUD]);
  img(R.PIC, 4, 4, [caveBackground()]);
  img(R.PIC, 4, 5, [ROCKS]);
  img(R.PIC, 4, 6, [marshBackground()]);
  img(R.PIC, 4, 7, [REEDS]);
  img(R.PIC, 4, 8, [towerBackground()]);

  // the party
  const rinRow = (i: number) => ({
    maxHP: 70 + i * 18, maxMP: 18 + i * 5, attack: 14 + i * 4, defend: 6 + i * 3, speed: 12 + i, lingli: 10 + i * 2, luck: 12 + i,
    nextExp: [15, 25, 40, 55, 75, 100, 130, 160, 200, 250, 300, 999][i], magics: i >= 8 ? 4 : i >= 5 ? 3 : 2,
  });
  const bramRow = (i: number) => ({
    maxHP: 100 + i * 24, maxMP: 8 + i * 3, attack: 18 + i * 5, defend: 10 + i * 4, speed: 8 + i, lingli: 4 + i, luck: 8 + i,
    nextExp: [15, 25, 40, 60, 80, 110, 140, 180, 220, 270, 330, 999][i], magics: 1,
  });
  const rin = rinRow(0);
  add(R.ARS, 1, 1, encodePlayer({ index: 1, name: "Rin", walkSprite: 1, magicChain: 1, magicsKnown: 2, level: 1, ...rin }));
  const bram = bramRow(2);
  add(R.ARS, 1, 2, encodePlayer({ index: 2, name: "Bram", walkSprite: 2, magicChain: 2, magicsKnown: 1, level: 3, ...bram, equip: { weapon: 3 } }));
  add(R.MLR, 2, 1, encodeLevelChain(1, Array.from({ length: 12 }, (_, i) => rinRow(i))));
  add(R.MLR, 2, 2, encodeLevelChain(2, Array.from({ length: 12 }, (_, i) => bramRow(i))));

  // townsfolk
  const npcs = [
    { name: "Wen", sprite: 1 }, { name: "Tam", sprite: 2 }, { name: "Hana", sprite: 3 }, { name: "Pip", sprite: 4, delay: 6 },
    { name: "Joss", sprite: 5 }, { name: "Bram", sprite: 6 }, { name: "Sela", sprite: 3 },
  ];
  npcs.forEach((n, i) => add(R.ARS, 2, i + 1, encodeNpc({ index: i + 1, ...n })));
  ["Chest", "Boulder", "Bell Shard", "Lever", "Iron Gate", "Carving", "Great Bell"].forEach((name, i) =>
    add(R.ARS, 4, i + 1, encodeSceneObj({ index: i + 1, name, sprite: i + 1, step: 0, delay: name === "Bell Shard" ? 3 : 0 })),
  );

  // monsters
  const herb = { type: 9, index: 1, count: 1 };
  const tonic = { type: 9, index: 2, count: 1 };
  const monsters: Parameters<typeof encodeMonster>[0][] = [
    { index: 1, name: "Dusk Moth", sprite: 1, level: 1, maxHP: 30, attack: 14, defend: 2, speed: 9, money: 6, exp: 5 },
    { index: 2, name: "Thorn Rat", sprite: 2, level: 2, maxHP: 40, attack: 18, defend: 4, speed: 12, money: 8, exp: 7, drop: herb },
    { index: 3, name: "Grey Wolf", sprite: 3, level: 3, maxHP: 55, attack: 24, defend: 6, speed: 13, money: 10, exp: 10 },
    { index: 4, name: "Hollow Stag", sprite: 4, level: 6, maxHP: 450, maxMP: 60, attack: 48, defend: 10, speed: 10, lingli: 10, money: 100, exp: 70, iq: 30, magicChain: 3, magicsKnown: 1 },
    { index: 5, name: "Cave Bat", sprite: 5, level: 4, maxHP: 60, attack: 52, defend: 4, speed: 15, money: 10, exp: 12 },
    { index: 6, name: "Rock Beetle", sprite: 6, level: 5, maxHP: 100, attack: 58, defend: 24, speed: 6, money: 14, exp: 16, drop: herb },
    { index: 7, name: "Ember Wisp", sprite: 7, level: 5, maxHP: 70, maxMP: 40, attack: 46, defend: 6, speed: 12, lingli: 12, money: 12, exp: 15, iq: 40, magicChain: 4, magicsKnown: 1 },
    { index: 8, name: "Ore Golem", sprite: 8, level: 9, maxHP: 650, attack: 90, defend: 24, speed: 8, money: 160, exp: 140 },
    { index: 9, name: "Bog Toad", sprite: 9, level: 7, maxHP: 130, attack: 90, defend: 8, speed: 9, money: 16, exp: 22, drop: tonic },
    { index: 10, name: "Mire Wisp", sprite: 10, level: 7, maxHP: 90, maxMP: 50, attack: 72, defend: 6, speed: 12, lingli: 14, money: 14, exp: 20, iq: 50, magicChain: 4, magicsKnown: 1 },
    { index: 11, name: "Mire Witch", sprite: 11, level: 11, maxHP: 800, maxMP: 200, attack: 88, defend: 16, speed: 13, lingli: 20, money: 200, exp: 220, iq: 50, magicChain: 5, magicsKnown: 2 },
    { index: 12, name: "Fog Warden", sprite: 12, level: 14, maxHP: 1100, maxMP: 300, attack: 120, defend: 20, speed: 13, lingli: 24, money: 0, exp: 0, iq: 35, magicChain: 6, magicsKnown: 1 },
  ];
  for (const m of monsters) add(R.ARS, 3, m.index, encodeMonster(m));

  // goods
  const g = (type: number, index: number, iconPix: Pix, def: Omit<Parameters<typeof encodeGoods>[0], "type" | "index" | "icon">) => {
    img(R.GDP, type, index, [iconPix]);
    add(R.GRS, type, index, encodeGoods({ type, index, icon: index, ...def }));
  };
  const RIN_ONLY = 1;
  const BRAM_ONLY = 2;
  g(9, 1, ICONS.herb, { name: "Herb", description: "Restores 60 HP.", buy: 8, sell: 4, hp: 60, animation: 3 });
  g(9, 2, ICONS.tonic, { name: "Tonic", description: "Restores 25 MP.", buy: 15, sell: 7, mp: 25, animation: 1 });
  g(9, 3, ICONS2.bun, { name: "Honey Bun", description: "Hana's baking. Restores 160 HP.", buy: 30, sell: 15, hp: 160, animation: 3 });
  g(10, 1, ICONS2.water, { name: "Bell Water", description: "Water from the bell's spring. Revives a fallen friend.", buy: 40, sell: 20, percent: 50 });
  g(7, 1, ICONS2.rod, { name: "Oak Rod", description: "A bell-ringer's rod. Attack +5.", buy: 30, sell: 15, attack: 5, usableBy: RIN_ONLY });
  g(7, 2, ICONS2.rod, { name: "Iron Rod", description: "Heavy and true. Attack +12.", buy: 110, sell: 55, attack: 12, usableBy: RIN_ONLY });
  g(7, 3, ICONS2.axe, { name: "Hand Axe", description: "A woodcutter's axe. Attack +8.", buy: 60, sell: 30, attack: 8, usableBy: BRAM_ONLY });
  g(7, 4, ICONS2.axe, { name: "War Axe", description: "Bites through stone. Attack +18.", buy: 200, sell: 100, attack: 18, usableBy: BRAM_ONLY });
  g(2, 1, ICONS.tunic, { name: "Wool Coat", description: "Warm and sturdy. Defence +4.", buy: 30, sell: 15, defend: 4 });
  g(2, 2, ICONS.tunic, { name: "Hide Vest", description: "Tough hide. Defence +9.", buy: 100, sell: 50, defend: 9 });
  g(2, 3, ICONS2.shirt, { name: "Chain Shirt", description: "Rings of iron. Defence +16.", buy: 240, sell: 120, defend: 16 });
  g(6, 1, ICONS2.charm, { name: "Luck Charm", description: "A carved acorn. Luck +10, speed +3.", buy: 0, sell: 30, luck: 10, speed: 3 });
  g(14, 1, ICONS2.shard, { name: "Dawn Shard", description: "Warm as morning light.", buy: 0, sell: 0, eventId: 1 });
  g(14, 2, ICONS2.shard, { name: "Ember Shard", description: "It glows like a coal.", buy: 0, sell: 0, eventId: 1 });
  g(14, 3, ICONS2.shard, { name: "Mire Shard", description: "Cold and humming.", buy: 0, sell: 0, eventId: 1 });
  g(14, 4, ICONS2.token, { name: "Ferry Token", description: "Old Joss's brass token.", buy: 0, sell: 0, eventId: 1 });

  // magic
  entries.push(sparkle(), bolt(), glow(), slash(4), wave(5));
  const magics: Parameters<typeof encodeMagic>[0][] = [
    { type: 1, index: 1, name: "Spark", description: "A bolt of bell-fire at one foe.", cost: 4, animation: 2, hp: 40 },
    { type: 3, index: 1, name: "Mend", description: "Heals one friend by 70 HP.", cost: 5, animation: 3, hp: 70 },
    { type: 1, index: 2, name: "Peal", description: "A ringing wave that strikes every foe.", cost: 10, animation: 5, hp: 70, forAll: true },
    { type: 4, index: 1, name: "Renew", description: "Wakes a fallen friend.", cost: 12, animation: 1, hp: 50 },
    { type: 1, index: 3, name: "Cleave", description: "Bram swings at every foe.", cost: 6, animation: 4, hp: 45, forAll: true },
    { type: 1, index: 4, name: "Thorn Gust", description: "A storm of thorns.", cost: 8, animation: 4, hp: 30, forAll: true },
    { type: 1, index: 5, name: "Ember", description: "A spitting flame.", cost: 6, animation: 2, hp: 40 },
    { type: 1, index: 6, name: "Hex", description: "A curse on everyone.", cost: 12, animation: 5, hp: 45, forAll: true },
    { type: 3, index: 2, name: "Dark Mend", description: "The witch knits her wounds.", cost: 15, animation: 3, hp: 120 },
    { type: 1, index: 7, name: "Fog Wave", description: "Choking fog rolls over everyone.", cost: 15, animation: 5, hp: 70, forAll: true },
  ];
  for (const m of magics) add(R.MRS, m.type, m.index, encodeMagic(m));
  add(R.MLR, 1, 1, encodeMagicChain(1, [{ type: 1, index: 1 }, { type: 3, index: 1 }, { type: 1, index: 2 }, { type: 4, index: 1 }]));
  add(R.MLR, 1, 2, encodeMagicChain(2, [{ type: 1, index: 3 }]));
  add(R.MLR, 1, 3, encodeMagicChain(3, [{ type: 1, index: 4 }]));
  add(R.MLR, 1, 4, encodeMagicChain(4, [{ type: 1, index: 5 }]));
  add(R.MLR, 1, 5, encodeMagicChain(5, [{ type: 1, index: 6 }, { type: 3, index: 2 }]));
  add(R.MLR, 1, 6, encodeMagicChain(6, [{ type: 1, index: 7 }]));

  add(R.GUT, 1, 1, assemble(VILLAGE));
  add(R.GUT, 1, 2, assemble(WOOD));
  add(R.GUT, 1, 3, assemble(QUARRY));
  add(R.GUT, 1, 4, assemble(MIRE));
  add(R.GUT, 1, 5, assemble(TOWER));

  return { titleBytes: Uint8Array.from(gbkBytes("BELL"), (b) => b & 0xff), entries };
}
