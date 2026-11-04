// "Lantern Path": a tiny original demo game built entirely in code.
// It exercises maps, NPCs, a shop, a chest, random and scripted battles,
// items, magic, levelling and saving, and doubles as an end-to-end test of
// the editor's encoders and assembler.
import {
  encodeGoods, encodeImage, encodeLevelChain, encodeMagic, encodeMagicChain, encodeMap, encodeMonster,
  encodeNpc, encodePlayer, encodeSceneObj, encodeSrs, type MapCell,
} from "../format/encode";
import { assemble } from "../format/gut";
import type { LibArchive, LibEntry } from "../format/lib";
import { MESSAGE_BOX, SAY_WITH_PORTRAIT, wrapForBox } from "../format/text";
import { gbkBytes } from "../../engine/java";
import { B, Pix, T, W } from "./draw";
import { systemResources } from "./system";

const R = { GUT: 1, MAP: 2, ARS: 3, MRS: 4, SRS: 5, GRS: 6, TIL: 7, ACP: 8, GDP: 9, PIC: 11, MLR: 12 };

// ---------------------------------------------------------------------------
// tiles (TIL 1-1). Frame n is tile n-1.

function tile(rows: string[]): Pix {
  const p = new Pix(16, 16, W);
  return p.art(rows, 0, 0);
}

const TILES: Record<string, { pix: Pix; walk: boolean }> = {};
const order: string[] = [];
function defTile(ch: string, walk: boolean, rows: string[]): void {
  TILES[ch] = { pix: tile(rows), walk };
  order.push(ch);
}

defTile(".", true, [
  "................", "..#.............", ".#.#........#...", "...........#.#..", "................", "......#.........",
  ".....#.#........", "................", "................", "...........#....", "..........#.#...", "..#.............",
  ".#.#............", "................", "........#.......", ".......#.#......",
]); // grass
defTile(",", true, [
  "................", "....#...........", "................", "..........#.....", "................", "................",
  "......#.........", "................", ".............#..", "................", "...#............", "................",
  "................", "..........#.....", "................", "................",
]); // path
defTile("T", false, [
  "......####......", "....##....##....", "...#..#.#...#...", "..#.#.....#..#..", ".#....#.#.....#.", ".#.#.......#.#.#",
  "#...#.#.#.#....#", "#.#.......#..#.#", ".#..#.#.#....#..", ".##.........##..", "...###.##.###...", "......#..#......",
  "......#..#......", "......#..#......", ".....##..##.....", "....#.#..#.#....",
]); // tree
defTile("~", false, [
  "################", "##.....#########", "#.#####.##....##", "########..####.#", "################", "#####.....######",
  "####.#####.#####", "################", "##....##########", "#.####.####....#", "##########.####.", "################",
  "################", "######.....#####", "#####.#####.####", "################",
]); // water
defTile("*", true, [
  "................", "..##............", ".#..#.....##....", ".#..#....#..#...", "..##.....#..#...", "...#......##....",
  "...#.......#....", "...........#....", "................", "......##........", ".....#..#.......", ".....#..#.......",
  "......##........", ".......#........", ".......#........", "................",
]); // flowers
defTile("R", false, [
  "################", "#.#.#.#.#.#.#.#.", "################", ".#.#.#.#.#.#.#.#", "################", "#.#.#.#.#.#.#.#.",
  "################", ".#.#.#.#.#.#.#.#", "################", "#.#.#.#.#.#.#.#.", "################", ".#.#.#.#.#.#.#.#",
  "################", "#.#.#.#.#.#.#.#.", "################", "................",
]); // roof
defTile("H", false, [
  "################", "#..............#", "#..............#", "################", "#.......#......#", "#.......#......#",
  "################", "#...#.......#..#", "#...#.......#..#", "################", "#.......#......#", "#.......#......#",
  "################", "#...#.......#..#", "#...#.......#..#", "################",
]); // wall
defTile("D", false, [
  "################", "#..############.", "#.##........##.#", "#.#..........#.#", "#.#..........#.#", "#.#..........#.#",
  "#.#..........#.#", "#.#.......##.#.#", "#.#.......##.#.#", "#.#..........#.#", "#.#..........#.#", "#.#..........#.#",
  "#.#..........#.#", "#.#..........#.#", "#.############.#", "################",
]); // door
defTile("w", false, [
  "################", "#..............#", "#.############.#", "#.#....#.....#.#", "#.#....#.....#.#", "#.#....#.....#.#",
  "#.############.#", "#.#....#.....#.#", "#.#....#.....#.#", "#.############.#", "#..............#", "################",
  "#...#.......#..#", "#...#.......#..#", "################", "#..............#",
]); // window
defTile('"', true, [
  "................", ".#...#...#...#..", ".#.#.#.#.#.#.#.#", "#.#.#.#.#.#.#.#.", "................", "...#...#...#...#",
  ".#.#.#.#.#.#.#.#", "#.#.#.#.#.#.#.#.", "................", ".#...#...#...#..", ".#.#.#.#.#.#.#.#", "#.#.#.#.#.#.#.#.",
  "................", "...#...#...#...#", ".#.#.#.#.#.#.#.#", "#.#.#.#.#.#.#.#.",
]); // tall grass
defTile("o", false, [
  "................", "......####......", "....##....##....", "...#..##....#...", "..#..#......#...", "..#.........#...",
  ".#...........#..", ".#..........##..", ".#.........#.#..", "..#........#.#..", "..##......##.#..", "...##########...",
  "................", "................", "................", "................",
]); // rock

const tileIndex = (ch: string) => {
  const i = order.indexOf(ch);
  if (i < 0) throw new Error(`unknown tile "${ch}"`);
  return i;
};

function map(index: number, name: string, rows: string[], events: Record<string, number> = {}): LibEntry {
  const height = rows.length;
  const width = rows[0].length;
  rows.forEach((r, y) => {
    if (r.length !== width) throw new Error(`map ${name} row ${y} has ${r.length} tiles, expected ${width}`);
  });
  const cells: MapCell[] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < width; x++) {
      const t = TILES[r[x]];
      if (!t) throw new Error(`map ${name}: unknown tile "${r[x]}"`);
      cells.push({ tile: tileIndex(r[x]), walkable: t.walk, event: events[`${x},${y}`] ?? 0 });
    }
  });
  return { resType: R.MAP, type: 1, index, data: encodeMap({ type: 1, index, tileset: 1, name, width, height, cells }) };
}

// ---------------------------------------------------------------------------
// walking sprites (ACP). 12 frames: north 1-3, east 4-6, south 7-9, west 10-12;
// within a direction: left foot, standing, right foot.

function walker(face: { down: string[]; up: string[]; side: string[] }, legs: { stand: string[]; left: string[]; right: string[]; side: string[]; sideStep: string[] }): Pix[] {
  const build = (top: string[], bottom: string[]) => Pix.fromArt([...top, ...bottom]);
  const north = [build(face.up, legs.left), build(face.up, legs.stand), build(face.up, legs.right)];
  const south = [build(face.down, legs.left), build(face.down, legs.stand), build(face.down, legs.right)];
  const east = [build(face.side, legs.sideStep), build(face.side, legs.side), build(face.side, legs.sideStep)];
  const west = east.map((p) => p.flipped());
  return [...north, ...east, ...south, ...west];
}

// Mira, the lantern keeper (hooded, with a scarf).
const MIRA = walker(
  {
    down: [
      "                ", "     ######     ", "    #......#    ", "   #.######.#   ", "   #.#....#.#   ", "   #.#.#..#.#   ",
      "   #.#....#.#   ", "    ##.##.##    ", "    #######     ", "   #.#...#.#    ", "   #.#...#.#    ", "    ##...##     ",
      "     #...#      ",
    ],
    up: [
      "                ", "     ######     ", "    #......#    ", "   #........#   ", "   #........#   ", "   #........#   ",
      "   #........#   ", "    ##....##    ", "    #######     ", "   #.#...#.#    ", "   #.#...#.#    ", "    ##...##     ",
      "     #...#      ",
    ],
    side: [
      "                ", "     ######     ", "    #......#    ", "   #...#####    ", "   #...#...#    ", "   #...#..##    ",
      "   #...#...#    ", "    ##..###     ", "     #####      ", "    #.#..#      ", "    #.#..##     ", "     ##...#     ",
      "      #...#     ",
    ],
  },
  {
    stand: ["     #.#.#      ", "     #.#.#      ", "     ## ##      "],
    left: ["     #.#.#      ", "     ## #.#     ", "        ##      "],
    right: ["     #.#.#      ", "    #.# ##      ", "    ##          "],
    side: ["      #.#       ", "      #.#       ", "      ###       "],
    sideStep: ["     #. .#      ", "    #.#  #.#    ", "    ##    ##    "],
  },
);

// Elder Ostra (bald, beard, cane).
const ELDER = walker(
  {
    down: [
      "                ", "      ####      ", "     #....#     ", "    #.#..#.#    ", "    #......#    ", "     #.##.#     ",
      "     #....#     ", "     #.##.#     ", "    ########    ", "   #.#....#.# # ", "   #.#....#.# # ", "    ##....##  # ",
      "     #....#   # ",
    ],
    up: [
      "                ", "      ####      ", "     #....#     ", "    #......#    ", "    #......#    ", "     #....#     ",
      "     ######     ", "     #....#     ", "    ########    ", " # #.#....#.#   ", " # #.#....#.#   ", " #  ##....##    ",
      " #   #....#     ",
    ],
    side: [
      "                ", "      ####      ", "     #....#     ", "     #...#.#    ", "     #.....#    ", "      #..##     ",
      "      #...##    ", "      #.###     ", "     ######     ", "    #.#...#   # ", "    #.#...#   # ", "     ##...## #  ",
      "      #....#    ",
    ],
  },
  {
    stand: ["     #....#     ", "     #.##.#     ", "     ##  ##     "],
    left: ["     #....#     ", "     ## #.#     ", "        ##      "],
    right: ["     #....#     ", "     #.# ##     ", "     ##         "],
    side: ["      #..#      ", "      #..#      ", "      ####      "],
    sideStep: ["     #.  .#     ", "    #.#  #.#    ", "    ##    ##    "],
  },
);

// Tam the merchant (round hat, apron).
const MERCHANT = walker(
  {
    down: [
      "                ", "    ########    ", "   #........#   ", "  ############  ", "    #......#    ", "    #.#..#.#    ",
      "    #......#    ", "     #.##.#     ", "    ########    ", "   #.#....#.#   ", "   #.######.#   ", "    #......#    ",
      "    #......#    ",
    ],
    up: [
      "                ", "    ########    ", "   #........#   ", "  ############  ", "    #......#    ", "    #......#    ",
      "    #......#    ", "     ######     ", "    ########    ", "   #.#....#.#   ", "   #.#....#.#   ", "    #......#    ",
      "    #......#    ",
    ],
    side: [
      "                ", "    ########    ", "   #........#   ", "  ############  ", "     #.....#    ", "     #...#.#    ",
      "     #.....#    ", "      #..##     ", "     ######     ", "    #.#....#    ", "    #.####.#    ", "     #.....#    ",
      "     #.....#    ",
    ],
  },
  {
    stand: ["     #.##.#     ", "     #.##.#     ", "     ##  ##     "],
    left: ["     #.##.#     ", "     ## #.#     ", "        ##      "],
    right: ["     #.##.#     ", "     #.# ##     ", "     ##         "],
    side: ["      #..#      ", "      #..#      ", "      ####      "],
    sideStep: ["     #.  .#     ", "    #.#  #.#    ", "    ##    ##    "],
  },
);

// Scene objects: frame 1 = step 0, frame 2 = step 1 ...
const CHEST = [
  ["                ", "                ", "                ", "                ", "   ##########   ", "  #..........#  ",
    "  #.########.#  ", "  #.#......#.#  ", "  ############  ", "  #....##....#  ", "  #....##....#  ", "  #..........#  ",
    "  #..........#  ", "  ############  ", "                ", "                "],
  ["                ", "   ##########   ", "  #..........#  ", "  #.########.#  ", "  #.#......#.#  ", "  ############  ",
    "  #..........#  ", "  #.#.#..#.#.#  ", "  ############  ", "  #..........#  ", "  #..........#  ", "  #..........#  ",
    "  #..........#  ", "  ############  ", "                ", "                "],
].map((a) => Pix.fromArt(a));

const LANTERN = [
  ["      ####      ", "     #....#     ", "    ########    ", "    #......#    ", "    #.####.#    ", "    #.#..#.#    ",
    "    #.#..#.#    ", "    #.####.#    ", "    ########    ", "       ##       ", "       ##       ", "       ##       ",
    "       ##       ", "       ##       ", "     ######     ", "    ########    "],
  ["  #   ####   #  ", "   # #....# #   ", "    ########    ", " ## #......# ## ", "    #.####.#    ", "    #.####.#    ",
    " ## #.####.# ## ", "    #.####.#    ", "    ########    ", "   #   ##   #   ", "       ##       ", "       ##       ",
    "       ##       ", "       ##       ", "     ######     ", "    ########    "],
].map((a) => Pix.fromArt(a));

const STONE = [
  ["                ", "                ", "       #        ", "      #.#       ", "     #...#      ", "    #.#.#.#     ",
    "   #..#.#..#    ", "  #...#.#...#   ", "   #..#.#..#    ", "    #.#.#.#     ", "     #...#      ", "      #.#       ",
    "       #        ", "   #########    ", "  ###########   ", "                "],
  ["   #       #    ", "    #  #  #     ", "       #        ", "  #   #.#   #   ", "     #...#      ", "    #.#.#.#     ",
    "#  #..#.#..#  # ", "  #...#.#...#   ", "   #..#.#..#    ", "    #.#.#.#     ", "  # #...# #     ", "      #.#       ",
    "       #        ", "   #########    ", "  ###########   ", "                "],
].map((a) => Pix.fromArt(a));

// ---------------------------------------------------------------------------
// battle art

// Monster sprites (ACP 3-n), two frames each.
function twoFrames(rows: string[], shift = 1): Pix[] {
  const a = Pix.fromArt(rows);
  const b = new Pix(a.width, a.height).blit(a, 0, shift);
  return [a, b];
}

const MOTH = twoFrames([
  "                        ", "  ##              ##    ", " #..##          ##..#   ", " #....##      ##....#   ", " #......#    #......#   ",
  "  #...#..#  #..#...#    ", "  #..#.#..##..#.#..#    ", "   #...#..##..#...#     ", "   #....#....#....#     ", "    #....#..#....#      ",
  "     #...####...#       ", "    #...#.##.#...#      ", "   #...# #..# #...#     ", "   #..#  #..#  #..#     ", "    ##   #..#   ##      ",
  "         ####           ",
]);
const SHELLBUG = twoFrames([
  "                        ", "        ########        ", "      ##........##      ", "     #..#..#..#...#     ", "    #...#..#..#....#    ",
  "   #.##########.....#   ", "   #.#........#.....#   ", "  #..#.#....#.#......#  ", "  #..#........#..##..#  ", "  #...########..#..#.#  ",
  "  ##################.#  ", "  #.#.#.#.#.#.#.#.###   ", "   # # # # # # # #      ",
], 0);
const WISP = twoFrames([
  "                                ", "              ##                ", "             #..#               ", "            #....#              ",
  "           #......#             ", "          #...##...#            ", "         #...#..#...#           ", "        #...#....#...#          ",
  "       #...#.####.#...#         ", "      #...#.#....#.#...#        ", "     #....#.#.##.#.#....#       ", "     #....#.#.##.#.#....#       ",
  "     #....#.#....#.#....#       ", "      #...#..####..#...#        ", "       #...#......#...#         ", "        #...######...#          ",
  "         ##........##           ", "        #..##....##..#          ", "       #..#  ####  #..#         ", "       #.#          #.#         ",
  "        #            #          ",
], 2);

// Mira's battle sprite (PIC 3-1): 1 idle, 2-5 attack, 6-8 cast, 9 guard,
// 10 hit, 11 weak, 12 knocked out.
function miraBattle(): Pix[] {
  const base = Pix.fromArt([
    "                        ", "         ######         ", "        #......#        ", "       #.######.#       ", "       #.#....#.#       ",
    "       #.#.#..#.#       ", "       #.#....#.#       ", "        ##.##.##        ", "       ##########       ", "      #.#......#.#      ",
    "     #..#......#..#     ", "     #.##......##.#     ", "      ##........##      ", "       #........#       ", "       #........#       ",
    "      #..........#      ", "      ############      ", "        #.#  #.#        ", "        #.#  #.#        ", "        #.#  #.#        ",
    "       ###    ###       ",
  ]);
  const W24 = 24;
  const H = 28;
  const at = (p: Pix, dx: number, dy: number) => new Pix(W24, H).blit(p, dx, 4 + dy);
  const idle = at(base, 0, 0);
  const lantern = (p: Pix, x: number, y: number) => p.art([" ## ", "#..#", "#..#", " ## "], x, y);
  lantern(idle, 2, 16);
  const attack = [1, 2, 3, 4].map((k) => {
    const p = at(base, -k, 0);
    p.line(3 - k, 12, 0, 12 - k * 2, B).line(4 - k, 12, 1, 12 - k * 2, B);
    return p;
  });
  const cast = [0, 1, 2].map((k) => {
    const p = at(base, 0, 0);
    lantern(p, 10, 0 + k);
    if (k > 0) p.set(8, 1, B).set(16, 2, B).set(12, 0, B);
    return p;
  });
  const guard = at(base, 1, 1);
  guard.fill(3, 12, 4, 10, W).rect(3, 12, 4, 10, B);
  const hit = at(base, 3, 0);
  hit.invert(8, 4, 8, 7);
  const weak = at(base, 0, 3);
  const ko = new Pix(W24, H);
  ko.art(["    ######  ##########  ", "   #......##..........# ", "   #.####.##.......#### ", "    ######  ##########  "], 0, 20);
  return [idle, ...attack, ...cast, guard, hit, weak, ko];
}

function portrait(): Pix[] {
  const p = Pix.fromArt([
    "                      ", "       ########       ", "     ##........##     ", "    #..########..#    ", "   #..#........#..#   ",
    "   #.#..........#.#   ", "  #..#..##..##..#..#  ", "  #.#..#..#..#..#.#   ", "  #.#..........#..#   ", "  #.#....##....#.#    ",
    "  #..#........#..#    ", "   #..##....##..#     ", "    #...####...#      ", "   ##..........##     ", "  #..##......##..#    ",
    " #......####......#   ", " #................#   ", " ##################   ",
  ]);
  const f = new Pix(22, 20).blit(p, 0, 1);
  return [f, f, f, f, f, f, f];
}

function battleBackground(): Pix[] {
  const bg = new Pix(160, 96, W);
  for (let x = 0; x < 160; x++) {
    const h = 40 + Math.round(4 * Math.sin(x / 13) + 2 * Math.sin(x / 5));
    bg.set(x, h, B);
    if (x % 3 === 0) bg.set(x, h + 1, B);
  }
  for (let y = 50; y < 96; y += 7) for (let x = (y * 3) % 11; x < 160; x += 11) bg.art([".#.", "#.#"], x, y);
  return [bg];
}

const TUFT = new Pix(40, 20).art([
  "                                        ", "    #                 #                 ", "   #.#     #         #.#      #         ", "  #...#   #.#   #   #...#    #.#        ",
  " #.....# #...# #.# #.....#  #...#   #   ", "#.......#.....#...#.......##.....# #.#  ", "########################################",
], 0, 13);
const CLOUD = new Pix(48, 22).art([
  "            ######                ", "         ###......###             ", "       ##............##   ####    ", "     ##................###....##  ",
  "    #...........................# ", "   #.............................#", "    #############################  ",
], 10, 3);

// item icons (GDP), 20x20
const icon = (rows: string[]) => new Pix(20, 20).art(rows, 2, 2);
const ICONS = {
  herb: icon(["       ##       ", "      #..#      ", "  ## #....# ##  ", " #..##....##..# ", " #...#....#...# ", "  #...#..#...#  ", "   #...##...#   ", "    #..##..#    ", "     ######     ", "       ##       ", "       ##       ", "      ####      "]),
  tonic: icon(["      ####      ", "      #..#      ", "      #..#      ", "     ##..##     ", "    #......#    ", "   #.######.#   ", "   #.#....#.#   ", "   #.#....#.#   ", "   #.######.#   ", "   #........#   ", "    ########    "]),
  sword: icon(["             ## ", "            #.# ", "           #.#  ", "          #.#   ", "         #.#    ", "        #.#     ", "   #   #.#      ", "    # #.#       ", "     #.#        ", "    ##.#        ", "   #  # #       ", "  #             "]),
  tunic: icon(["   ###    ###   ", "  #...####...#  ", " #............# ", " #.##......##.# ", "  #.#......#.#  ", "    #......#    ", "    #..##..#    ", "    #......#    ", "    #......#    ", "    ########    "]),
  stone: icon(["       #        ", "      #.#       ", "     #...#      ", "    #.#.#.#     ", "   #..#.#..#    ", "  #...#.#...#   ", "   #..#.#..#    ", "    #.#.#.#     ", "     #...#      ", "      #.#       ", "       #        "]),
};

// spell / item animations (SRS 2-n)
function sparkle(): LibEntry {
  const star = (s: number) => {
    const p = new Pix(2 * s + 1, 2 * s + 1);
    p.line(0, s, 2 * s, s).line(s, 0, s, 2 * s);
    if (s > 1) p.set(s - 1, s - 1, B).set(s + 1, s + 1, B).set(s - 1, s + 1, B).set(s + 1, s - 1, B);
    return p.frame();
  };
  return {
    resType: R.SRS, type: 2, index: 1,
    data: encodeSrs(2, 1, [
      { x: 8, y: 8, show: 4, next: 2, image: 0 }, { x: 6, y: 6, show: 4, next: 2, image: 1 }, { x: 4, y: 4, show: 4, next: 4, image: 2 }, { x: 6, y: 6, show: 3, next: 3, image: 1 },
    ], [star(1), star(3), star(5)]),
  };
}
function bolt(): LibEntry {
  const seg = (rows: string[]) => Pix.fromArt(rows).frame();
  return {
    resType: R.SRS, type: 2, index: 2,
    data: encodeSrs(2, 2, [
      { x: 0, y: 0, show: 6, next: 2, image: 0 }, { x: 0, y: 8, show: 6, next: 2, image: 1 }, { x: 0, y: 16, show: 4, next: 4, image: 2 }, { x: -6, y: 18, show: 3, next: 3, image: 3 },
    ], [
      seg(["  ##", " ## ", "##  ", " ## ", "  ##", " ## ", "##  ", "#   "]),
      seg(["##  ", " ## ", "  ##", " ## ", "##  ", " ## ", "  ##", "  # "]),
      seg([" ## ", "  ##", " ## ", "##  ", " ## ", "  ##", "####"]),
      seg(["#   #   #", " # # # # ", "  #   #  ", " # # # # ", "#   #   #"]),
    ]),
  };
}
function glow(): LibEntry {
  const ring = (r: number) => {
    const p = new Pix(2 * r + 1, 2 * r + 1);
    for (let a = 0; a < 64; a++) p.set(r + Math.round(r * Math.cos((a / 64) * 2 * Math.PI)), r + Math.round(r * Math.sin((a / 64) * 2 * Math.PI)), B);
    return p.frame();
  };
  return {
    resType: R.SRS, type: 2, index: 3,
    data: encodeSrs(2, 3, [
      { x: 8, y: 8, show: 3, next: 2, image: 0 }, { x: 4, y: 4, show: 3, next: 2, image: 1 }, { x: 0, y: 0, show: 3, next: 3, image: 2 }, { x: 4, y: 4, show: 3, next: 3, image: 1 },
    ], [ring(3), ring(7), ring(11)]),
  };
}

// ---------------------------------------------------------------------------
// scripts

const say = (portraitId: number, text: string) => `  say ${portraitId}, "${wrapForBox(text, SAY_WITH_PORTRAIT)}"`;
const msg = (text: string) => `  message "${wrapForBox(text, MESSAGE_BOX)}"`;

const HAMLET = `
.gut 1 1
.desc "Willow Hamlet"
.events 42
.event 1 @elder
.event 2 @merchant
.event 3 @chest
.event 4 @lantern
.event 41 @exit_east
.event 42 @door

@start:
  fightdisenable
  if 1, @returning
  loadmap 1, 1, 3, 4
  createactor 1, 4, 3
  goto @setup
@returning:
  loadmap 1, 1, 11, 4
@setup:
  createnpc 1, 1, 10, 6
  createnpc 2, 2, 5, 9
  npcmovemod 2, 2
  createbox 3, 1, 13, 3
  createbox 4, 2, 12, 6
  if 3, @chest_was_open
  goto @lantern_state
@chest_was_open:
  boxopen 3
@lantern_state:
  if 9, @lit
  goto @arrive
@lit:
  boxopen 4
@arrive:
  setscenename "WILLOW HAMLET"
  showscenename
  if 1, @done
  setevent 1
${say(1, "Mira! Come quick, the great lantern has gone dark!")}
  callback

@elder:
  facetoface 0, 1
  if 9, @elder_after
  testgoodsnum 14, 1, 1, @elder_win, @elder_win
  if 2, @elder_reminder
${say(0, "Elder Ostra: Without its light the night creatures will come.")}
${say(0, "A Spark Stone glows in the glade to the east. Bring it here!")}
  setevent 2
  callback
@elder_reminder:
${say(0, "The glade lies east, past the path. Rest if you are hurt.")}
  callback
@elder_win:
  usegoods 14, 1, @done
${say(1, "I found it! Here is the Spark Stone.")}
  boxopen 4
  setevent 9
  showscreen
${say(0, "The lantern burns bright again. Thank you, Mira!")}
${msg("Thanks for playing LANTERN PATH!")}
  callback
@elder_after:
${say(0, "Look how it glows. The hamlet sleeps safely tonight.")}
  resumeactorhp 1, 100
  callback

@merchant:
  facetoface 0, 2
${say(0, "Tam: Herbs, tonics and gear! Take a look.")}
  buy 9:1, 9:2, 7:1, 2:1
  callback

@chest:
  if 3, @chest_empty
  gaingoods 9, 1
  gaingoods 9, 2
  boxopen 3
  setevent 3
  callback
@chest_empty:
${msg("The chest is empty.")}
  callback

@lantern:
  if 9, @lantern_lit
${msg("The great lantern is cold and dark.")}
  callback
@lantern_lit:
${msg("The lantern glows warmly.")}
  callback

@door:
${msg("Mira's house. Saving is done from the menu.")}
  callback

@exit_east:
  if 2, @leave
${say(1, "I should talk to the Elder first.")}
  callback
@leave:
  startchapter 1, 2
@done:
  callback
`;

const GLADE = `
.gut 1 2
.desc "Ember Glade"
.events 41
.event 1 @stone
.event 41 @exit_west

@start:
  loadmap 1, 2, 1, 4
  initfight 1, 2, 0, 0, 0, 0, 0, 0, 1, 2, 3
  fightenable
  if 4, @arrive
  createbox 1, 3, 14, 7
  npcmovemod 1, 4
@arrive:
  setscenename "EMBER GLADE"
  showscenename
  callback

@stone:
${say(1, "There it is, the Spark Stone! Something is stirring...")}
  fightdisenable
  enterfight 0, 3, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0, @lose, @win
@win:
  gaingoods 14, 1
  deletebox 1
  setevent 4
  fightenable
${say(1, "The wisp is gone. Back to the hamlet!")}
  callback
@lose:
  gameover

@exit_west:
  startchapter 1, 1
`;

// ---------------------------------------------------------------------------

export function lanternPath(): LibArchive {
  const entries: LibEntry[] = [...systemResources({ title: "LANTERN PATH", subtitle: "A DEMO FOR FMJ REACT" })];
  const add = (resType: number, type: number, index: number, data: Uint8Array) => entries.push({ resType, type, index, data });
  const img = (resType: number, type: number, index: number, frames: Pix[]) => add(resType, type, index, encodeImage(type, index, frames.map((f) => f.frame())));

  img(R.TIL, 1, 1, order.map((c) => TILES[c].pix));

  entries.push(
    map(1, "HAMLET", [
      "TTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTT",
      "TTTTRRRRRT*.*.*TTTTT",
      "TTTTRRRRRT.*...*TTTT",
      "TTTTHwDwH,....,.TTTT",
      "TTT..,,,,,,,,,,..TTT",
      "TTT.*.,....,..*..TTT",
      "TTT...,....,,,,,,,,,",
      "TTT...,.~~~~..*..TTT",
      "TTT.*.,.~~~~.....TTT",
      "TTT...,,,,,,,,...TTT",
      "TTT*.....o...*...TTT",
      "TTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTT",
    ], { "16,7": 1, "6,4": 2 }),
    map(2, "GLADE", [
      "TTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTT",
      'TTTT""""..**..""TTTT',
      'TTT""..""...""""TTTT',
      'TTT""..**.."""..TTTT',
      'TTT"""....""""o.TTTT',
      'TTT.."""".."""".TTTT',
      ',,,,,,"""....""..TTT',
      'TTT..""**..""""..TTT',
      'TTT"""".."""".."TTTT',
      'TTT.."""""..""""TTTT',
      'TTT"*..""""..*""TTTT',
      "TTTTTTTTTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTTTTTT",
    ], { "3,7": 1 }),
  );

  // characters
  img(R.ACP, 1, 1, MIRA);
  img(R.ACP, 2, 1, ELDER);
  img(R.ACP, 2, 2, MERCHANT);
  img(R.ACP, 4, 1, [...CHEST, CHEST[1]]);
  img(R.ACP, 4, 2, [...LANTERN, LANTERN[1]]);
  img(R.ACP, 4, 3, [...STONE, STONE[0]]);
  img(R.ACP, 3, 1, MOTH);
  img(R.ACP, 3, 2, SHELLBUG);
  img(R.ACP, 3, 3, WISP);
  img(R.PIC, 1, 1, portrait());
  img(R.PIC, 3, 1, miraBattle());
  img(R.PIC, 4, 1, battleBackground());
  img(R.PIC, 4, 2, [TUFT]);
  img(R.PIC, 4, 3, [CLOUD]);

  add(R.ARS, 1, 1, encodePlayer({
    index: 1, name: "Mira", walkSprite: 1, magicChain: 1, magicsKnown: 1, level: 1,
    maxHP: 60, maxMP: 12, attack: 12, defend: 6, speed: 10, lingli: 8, luck: 14,
  }));
  add(R.ARS, 2, 1, encodeNpc({ index: 1, name: "Ostra", sprite: 1 }));
  add(R.ARS, 2, 2, encodeNpc({ index: 2, name: "Tam", sprite: 2, delay: 8 }));
  add(R.ARS, 4, 1, encodeSceneObj({ index: 1, name: "Chest", sprite: 1, step: 0 }));
  add(R.ARS, 4, 2, encodeSceneObj({ index: 2, name: "Lantern", sprite: 2, step: 0 }));
  add(R.ARS, 4, 3, encodeSceneObj({ index: 3, name: "Spark Stone", sprite: 3, step: 0, delay: 3 }));
  add(R.ARS, 3, 1, encodeMonster({ index: 1, name: "Dusk Moth", sprite: 1, level: 1, maxHP: 20, attack: 9, defend: 2, speed: 8, money: 6, exp: 5 }));
  add(R.ARS, 3, 2, encodeMonster({ index: 2, name: "Shellbug", sprite: 2, level: 2, maxHP: 34, attack: 11, defend: 6, speed: 4, money: 10, exp: 8, drop: { type: 9, index: 1, count: 1 } }));
  add(R.ARS, 3, 3, encodeMonster({ index: 3, name: "Glade Wisp", sprite: 3, level: 4, maxHP: 110, attack: 15, defend: 5, speed: 11, money: 60, exp: 40 }));

  // goods
  const g = (type: number, index: number, iconPix: Pix, def: Omit<Parameters<typeof encodeGoods>[0], "type" | "index" | "icon">) => {
    img(R.GDP, type, index, [iconPix]);
    add(R.GRS, type, index, encodeGoods({ type, index, icon: index, ...def }));
  };
  g(9, 1, ICONS.herb, { name: "Herb", description: "Restores 40 HP.", buy: 8, sell: 4, hp: 40, animation: 3 });
  g(9, 2, ICONS.tonic, { name: "Tonic", description: "Restores 15 MP.", buy: 15, sell: 7, mp: 15, animation: 1 });
  g(7, 1, ICONS.sword, { name: "Oak Sword", description: "Attack +5.", buy: 30, sell: 15, attack: 5, usableBy: 1 });
  g(2, 1, ICONS.tunic, { name: "Wool Tunic", description: "Defence +3.", buy: 25, sell: 12, defend: 3, usableBy: 1 });
  g(14, 1, ICONS.stone, { name: "Spark Stone", description: "Warm to the touch. It hums softly.", buy: 0, sell: 0 });

  // magic
  entries.push(sparkle(), bolt(), glow());
  add(R.MRS, 1, 1, encodeMagic({ type: 1, index: 1, name: "Spark", description: "A bolt of lantern fire. 30 damage.", cost: 4, animation: 2, hp: 30 }));
  add(R.MRS, 3, 1, encodeMagic({ type: 3, index: 1, name: "Mend", description: "Heals 40 HP.", cost: 5, animation: 3, hp: 40 }));
  add(R.MLR, 1, 1, encodeMagicChain(1, [{ type: 1, index: 1 }, { type: 3, index: 1 }]));
  add(R.MLR, 2, 1, encodeLevelChain(1, Array.from({ length: 10 }, (_, i) => ({
    maxHP: 60 + i * 14, maxMP: 12 + i * 4, attack: 12 + i * 3, defend: 6 + i * 2,
    nextExp: 12 + i * i * 10, speed: 10 + i, lingli: 8 + i, luck: 14 + i, magics: i >= 2 ? 2 : 1,
  }))));

  add(R.GUT, 1, 1, assemble(HAMLET));
  add(R.GUT, 1, 2, assemble(GLADE));

  return { titleBytes: Uint8Array.from(gbkBytes("LANTERN"), (b) => b & 0xff), entries };
}

void T;
