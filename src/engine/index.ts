// Public engine API used by the React shell (and tests).
import { Global } from "./fmj/Global";
import { MainGame } from "./fmj/Game";
import { Player } from "./fmj/characters/Player";
import { Combat } from "./fmj/combat/Combat";
import { EngineSettings } from "./fmj/config/EngineSettings";
import { WideView, type DialogPart } from "./fmj/config/WideView";
import { setUiLanguage, type UiLanguage } from "./fmj/i18n";

export type { UiLanguage };
import { glyphChar, glyphVisibility, TextRender } from "./fmj/graphics/TextRender";
import { Util } from "./fmj/graphics/Util";
import { Bitmap, Canvas } from "./graphics";
import { DatLib, ResType } from "./fmj/lib/DatLib";
import { ResBase } from "./fmj/lib/ResBase";
import type { ResMap } from "./fmj/lib/ResMap";
import { registerResources } from "./fmj/registry";
import { SaveLoadGame } from "./fmj/scene/SaveLoadGame";
import { ScriptResources } from "./fmj/script/ScriptResources";
import { ScriptVM } from "./fmj/script/ScriptVM";
import { getPlatform, setPlatform, type FontFallback, type SaveStorage } from "./java";
import { createCheats, type Cheats, type ItemInfo } from "./cheats";

export { STAT_KEYS, STAT_MAX, type Cheats, type CheatSwitches, type ItemInfo, type PartyMember, type StatKey } from "./cheats";

export type { FontFallback };

/** Fonts drawn for the More text cells (see Engine.setFonts). */
export interface SmallFonts {
  hzk12: Uint8Array;
  asc12: Uint8Array;
  hzk10: Uint8Array;
  asc10: Uint8Array;
}

export { EngineSettings };

/** Virtual keys understood by the engine (same values as the original device). */
export const Keys = {
  UP: Global.KEY_UP,
  DOWN: Global.KEY_DOWN,
  LEFT: Global.KEY_LEFT,
  RIGHT: Global.KEY_RIGHT,
  PAGEUP: Global.KEY_PAGEUP,
  PAGEDOWN: Global.KEY_PAGEDOWN,
  ENTER: Global.KEY_ENTER,
  CANCEL: Global.KEY_CANCEL,
} as const;

export type EngineKey = (typeof Keys)[keyof typeof Keys];

export const SCREEN_WIDTH = Global.SCREEN_WIDTH;
export const SCREEN_HEIGHT = Global.SCREEN_HEIGHT;
/** Milliseconds per engine tick (the original runs at 25 fps). */
export const TICK_MS = Global.delta;

export interface EngineResources {
  /** The game archive (DAT.LIB, or a renamed *.lib from another BBK game). */
  datLib: Uint8Array;
  /** 16x16 GB2312 font (optional: see EngineOptions.fontFallback). */
  hzk16?: Uint8Array | null;
  /** 8x16 ASCII font (optional). */
  asc16?: Uint8Array | null;
}

export interface EngineOptions {
  resources: EngineResources;
  saves: SaveStorage;
  onExit?: () => void;
  random?: () => number;
  /** Glyphs for text when a font file is missing; without it text is blank. */
  fontFallback?: FontFallback;
  /** Language of the engine's own menus. "auto": English if the game title is ASCII. */
  uiLanguage?: UiLanguage | "auto";
}

/** Guess the interface language from the archive's title ("LIB" + name). */
export function detectUiLanguage(datLib: Uint8Array): UiLanguage {
  let end = 3;
  while (end < 12 && datLib[end] !== 0) end++;
  const title = datLib.subarray(3, end);
  return title.length > 0 && title.every((b) => b >= 0x20 && b < 0x7f) ? "en" : "zh";
}

function asInt8(u: Uint8Array): Int8Array {
  return new Int8Array(u.buffer, u.byteOffset, u.byteLength);
}

function resetStatics(): void {
  DatLib.reset();
  TextRender.reset();
  Util.reset();
  Combat.resetAll();
  SaveLoadGame.reset();
  ScriptResources.initGlobalVar();
  ScriptResources.initLocalVar();
  ScriptResources.initGlobalEvents();
  Player.sGoodsList.clear();
  Player.sMoney = 0;
  Global.disableSave = false;
  Global.fgColor = Global.COLOR_BLACK;
  Global.bgColor = Global.COLOR_WHITE;
}

/** A character on screen, for redrawing text at a higher resolution. */
export interface TextMark {
  x: number;
  y: number;
  /** Cell width: 16 for HZK16 characters, 8 for ASC16 (less in compact text). */
  w: number;
  /** Cell height: 16, or 12 / 10 for compact text. */
  h: number;
  text: string;
  /** Engine colours (0xAABBGGRR), as in the frame from render(). */
  fg: number;
  bg: number;
  /**
   * Part of the cell drawn over since, as [x0, y0, x1, y1) relative to the
   * cell; null when the whole character is visible.
   */
  hidden: [number, number, number, number] | null;
}

export interface Engine {
  /**
   * Advance the game by one tick of `delta` ms and redraw the framebuffer.
   * Update and draw always run in pairs, like the original 25 fps loop
   * (some script operations count drawn frames).
   */
  update(delta?: number): void;
  /** The current frame (RGBA, 160x96). The array is reused between frames. */
  render(): Uint8ClampedArray;
  keyDown(key: EngineKey): void;
  keyUp(key: EngineKey): void;
  /**
   * Characters visible in the current frame, with the part of each cell that
   * later drawing covers (if any).
   */
  textLayer(): TextMark[];
  /** Redraw the current frame without advancing the game (after cheat edits). */
  redraw(): void;
  /**
   * Draw text with other HZK16 / ASC16 fonts from now on (null: the font
   * fallback), and optionally fonts drawn for the 12- and 10-pixel cells
   * (null: shrink the 16-pixel ones). The game goes on; call redraw() to see
   * it at once.
   */
  setFonts(hzk16: Uint8Array | null, asc16: Uint8Array | null, small?: SmallFonts | null): void;
  /** Test tools for the debug menu. */
  readonly cheats: Cheats;
  /** Compile every script in the archive; returns the failures. */
  checkScripts(): string[];
  readonly game: MainGame;
  /**
   * Show more of the map: `mx` extra tile columns on each side and `my` rows
   * above and below (0, 0: the device's 160x96 screen). The game itself is
   * unchanged; render() and textLayer() then use the larger frame.
   */
  setView(mx: number, my: number): void;
  /** The size of the frame render() returns. */
  readonly width: number;
  readonly height: number;
}

/**
 * Boot the engine. Throws if the resources cannot be parsed. Only one engine
 * may run at a time (the original keeps its state in globals).
 */
export function createEngine(opts: EngineOptions): Engine {
  registerResources();
  setPlatform({
    rom: new Map(
      [
        ["DAT.LIB", opts.resources.datLib],
        ["HZK16", opts.resources.hzk16],
        ["ASC16", opts.resources.asc16],
      ]
        .filter((e): e is [string, Uint8Array] => e[1] instanceof Uint8Array && e[1].length > 0)
        .map(([k, v]) => [k, asInt8(v)] as [string, Int8Array]),
    ),
    fontFallback: opts.fontFallback,
    saves: opts.saves,
    exit: () => opts.onExit?.(),
    random: opts.random ?? Math.random,
  });
  resetStatics();
  const lang = opts.uiLanguage ?? "auto";
  setUiLanguage(lang === "auto" ? detectUiLanguage(opts.resources.datLib) : lang);

  const game = new MainGame();
  game.vm.prepare();
  game.start();
  const frame = new Uint8ClampedArray(game.canvas.buffer.buffer);

  // The wider map view (WideView): a larger canvas with the map drawn around
  // the device's screen. Where the game's own frame differs from its plain map
  // (dialogue, menus, effects), its pixels go on top.
  WideView.mx = 0;
  WideView.my = 0;
  WideView.screen = game.canvas;
  game.canvas.onCover = () => {
    WideView.last = "cover";
    WideView.dialog = false;
  };
  let wide: { canvas: Canvas; ref: Canvas; frame: Uint8ClampedArray } | null = null;
  // what the view showed last frame, kept while the game does not redraw
  let lastShowMap = false;
  let lastDialog = false;
  let lastDialogTop = 50;
  // the portrait's opaque pixels, drawn on a transparent bitmap
  let headMask: { part: DialogPart; bmp: Bitmap } | null = null;
  const maskOf = (part: DialogPart | null): Uint32Array | null => {
    if (!part) return null;
    const h = headMask?.part;
    if (!h || h.key !== part.key || h.x !== part.x || h.y !== part.y) {
      const bmp = new Bitmap(Global.SCREEN_WIDTH, Global.SCREEN_HEIGHT, new Uint32Array(Global.SCREEN_WIDTH * Global.SCREEN_HEIGHT));
      part.draw(new Canvas(bmp), part.x, part.y);
      headMask = { part, bmp };
      return bmp.buffer;
    }
    return headMask!.bmp.buffer;
  };
  let lastHead: DialogPart | null = null;
  const compose = (): void => {
    const { mx, my } = WideView;
    const W = Global.SCREEN_WIDTH + 32 * mx;
    const H = Global.SCREEN_HEIGHT + 32 * my;
    if (!wide || wide.canvas.width !== W || wide.canvas.height !== H) {
      const canvas = Canvas.ofSize(W, H);
      wide = { canvas, ref: Canvas.ofSize(Global.SCREEN_WIDTH, Global.SCREEN_HEIGHT), frame: new Uint8ClampedArray(canvas.buffer.buffer) };
    }
    const big = wide.canvas;
    big.drawColor(Global.COLOR_WHITE);
    const scene = game.mainScene;
    let showMap = WideView.last === "scene" ? true : WideView.last === "cover" ? false : lastShowMap;
    let dialog = WideView.last === null ? lastDialog : WideView.dialog;
    const top = WideView.last === null ? lastDialogTop : WideView.dialogTop;
    const head = WideView.last === null ? lastHead : WideView.dialogHead;
    showMap &&= !!scene?.currentMap;
    dialog &&= showMap;
    lastShowMap = showMap;
    lastDialog = dialog;
    lastDialogTop = top;
    lastHead = head;
    const out = big.buffer;
    const src = game.canvas.buffer;
    const ox = 16 * mx;
    const oy = 16 * my;
    // the dialogue box (and portrait) sit at the bottom of the wider view, as on the device
    const dy = dialog ? oy : 0;
    const mask = dialog ? maskOf(head) : null;
    if (showMap) {
      scene.drawSceneAt(big, mx, my);
      const ref = wide.ref;
      ref.drawColor(Global.COLOR_WHITE);
      scene.drawSceneAt(ref, 0, 0);
      const rb = ref.buffer;
      for (let y = 0; y < Global.SCREEN_HEIGHT; y++) {
        for (let x = 0; x < Global.SCREEN_WIDTH; x++) {
          const i = y * Global.SCREEN_WIDTH + x;
          const inBox = dialog && y >= top && x >= 9 && x <= 151;
          if (inBox || (mask && mask[i] >>> 24)) out[(y + oy + dy) * W + x + ox] = src[i];
          else if (src[i] !== rb[i]) out[(y + oy) * W + x + ox] = src[i];
        }
      }
    } else {
      for (let y = 0; y < Global.SCREEN_HEIGHT; y++) out.set(src.subarray(y * Global.SCREEN_WIDTH, (y + 1) * Global.SCREEN_WIDTH), (y + oy) * W + ox);
    }
    Util.drawSideFramesAround(big);
  };
  const draw = (): void => {
    WideView.last = null;
    game.draw();
    if (WideView.mx || WideView.my) compose();
  };
  draw();

  // Debug switches are per session, never carried over from another game.
  EngineSettings.noRandomBattles = false;
  EngineSettings.walkThroughWalls = false;
  EngineSettings.alwaysFull = false;
  const cheats = createCheats(game);

  return {
    game,
    cheats,
    update(delta = TICK_MS) {
      game.update(delta);
      if (EngineSettings.alwaysFull) cheats.heal();
      draw();
    },
    setFonts(hzk16, asc16, small) {
      const rom = getPlatform().rom;
      const files: [string, Uint8Array | null | undefined][] = [["HZK16", hzk16], ["ASC16", asc16]];
      if (small !== undefined) {
        files.push(["HZK12", small?.hzk12], ["ASC12", small?.asc12], ["HZK10", small?.hzk10], ["ASC10", small?.asc10]);
      }
      for (const [name, data] of files) {
        if (data && data.length > 0) rom.set(name, asInt8(data));
        else rom.delete(name);
      }
      TextRender.reset();
    },
    redraw() {
      draw();
    },
    render() {
      return WideView.mx || WideView.my ? wide!.frame : frame;
    },
    setView(mx, my) {
      WideView.mx = Math.max(0, Math.min(8, Math.trunc(mx)));
      WideView.my = Math.max(0, Math.min(8, Math.trunc(my)));
      draw();
    },
    get width() {
      return Global.SCREEN_WIDTH + 32 * WideView.mx;
    },
    get height() {
      return Global.SCREEN_HEIGHT + 32 * WideView.my;
    },
    keyDown(key) {
      game.keyDown(key);
    },
    keyUp(key) {
      game.keyUp(key);
    },
    textLayer() {
      const bmp = game.canvas.bitmap;
      const list = bmp.glyphs;
      if (!list) return [];
      const keep = [];
      const out: TextMark[] = [];
      for (const g of list) {
        const vis = glyphVisibility(g, bmp.buffer, bmp.width, bmp.height);
        if (!vis) continue; // drawn over since: forget it
        keep.push(g);
        const text = glyphChar(g);
        const hidden = vis.length === 4 ? (vis as [number, number, number, number]) : null;
        if (text.trim()) out.push({ x: g.x + 16 * WideView.mx, y: g.y + 16 * WideView.my * (lastDialog && g.y + (g.h ?? 16) > lastDialogTop ? 2 : 1), w: g.w, h: g.h ?? 16, text, fg: g.fg, bg: g.bg, hidden });
      }
      bmp.glyphs = keep;
      return out;
    },
    checkScripts() {
      const errors: string[] = [];
      game.vm.decodeWarnings.length = 0;
      for (const r of DatLib.instance.listResources()) {
        if (r.resType !== 1) continue;
        try {
          game.vm.loadScript(r.type, r.index);
        } catch (e) {
          errors.push(`GUT ${r.type}-${r.index}: ${(e as Error).message}`);
        }
      }
      return [...errors, ...game.vm.decodeWarnings];
    },
  };
}

/** Quick validation of an uploaded archive without booting a game. */
export function inspectDatLib(data: Uint8Array): { resources: number; scripts: number; maps: number; playable: boolean } {
  registerResources();
  const lib = new DatLib(asInt8(data));
  const all = lib.listResources();
  return {
    resources: all.length,
    scripts: all.filter((r) => r.resType === 1).length,
    maps: all.filter((r) => r.resType === 2).length,
    // A new game always starts with story script 1-1.
    playable: all.some((r) => r.resType === 1 && r.type === 1 && r.index === 1),
  };
}

/** What tools outside the engine need of a game archive (the debug menu of .gam games): names and maps. */
export interface Library {
  /** Every item in the archive (count 0). */
  items(): ItemInfo[];
  itemName(type: number, index: number): string;
  map(type: number, index: number): { name: string; canWalk(x: number, y: number): boolean } | null;
  /** A magic chain's spells, in the order they are learnt, as [type, index]. */
  magicChain(id: number): [number, number][];
}

export function readLibrary(data: Uint8Array): Library {
  registerResources();
  const lib = new DatLib(asInt8(data));
  // (an item's name is at +6; its other fields are not needed, nor its picture)
  const itemName = (type: number, index: number) => {
    const b = lib.bytes(ResType.GRS, type, index);
    return b ? ResBase.getString(b, 6) : "";
  };
  const maps = new Map<number, ReturnType<Library["map"]>>();
  return {
    items: () =>
      lib
        .listResources()
        .filter((r) => r.resType === ResType.GRS)
        .map((r) => ({ type: r.type, index: r.index, name: itemName(r.type, r.index), count: 0 })),
    itemName: (type, index) => itemName(type, index) || `${type}-${index}`,
    map(type, index) {
      const key = (type << 8) | index;
      if (!maps.has(key)) {
        const m = lib.getRes(ResType.MAP, type, index, true) as ResMap | null;
        maps.set(key, m && { name: m.mapName ?? "", canWalk: (x: number, y: number) => m.canWalk(x, y) });
      }
      return maps.get(key)!;
    },
    magicChain(id) {
      // (type, index, count, then a type and an index a spell)
      const b = lib.bytes(ResType.MLR, 1, id);
      if (!b) return [];
      return Array.from({ length: b[2] & 0xff }, (_, i) => [b[3 + 2 * i] & 0xff, b[4 + 2 * i] & 0xff]);
    },
  };
}

export { ScriptVM };
