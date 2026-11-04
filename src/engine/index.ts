// Public engine API used by the React shell (and tests).
import { Global } from "./fmj/Global";
import { MainGame } from "./fmj/Game";
import { Player } from "./fmj/characters/Player";
import { Combat } from "./fmj/combat/Combat";
import { EngineSettings } from "./fmj/config/EngineSettings";
import { TextRender } from "./fmj/graphics/TextRender";
import { Util } from "./fmj/graphics/Util";
import { DatLib } from "./fmj/lib/DatLib";
import { registerResources } from "./fmj/registry";
import { SaveLoadGame } from "./fmj/scene/SaveLoadGame";
import { ScriptResources } from "./fmj/script/ScriptResources";
import { ScriptVM } from "./fmj/script/ScriptVM";
import { setPlatform, type SaveStorage } from "./java";

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
  /** 16x16 GB2312 font. */
  hzk16: Uint8Array;
  /** 8x16 ASCII font. */
  asc16: Uint8Array;
}

export interface EngineOptions {
  resources: EngineResources;
  saves: SaveStorage;
  onExit?: () => void;
  random?: () => number;
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
  /** Compile every script in the archive; returns the failures. */
  checkScripts(): string[];
  readonly game: MainGame;
}

/**
 * Boot the engine. Throws if the resources cannot be parsed. Only one engine
 * may run at a time (the original keeps its state in globals).
 */
export function createEngine(opts: EngineOptions): Engine {
  registerResources();
  setPlatform({
    rom: new Map([
      ["DAT.LIB", asInt8(opts.resources.datLib)],
      ["HZK16", asInt8(opts.resources.hzk16)],
      ["ASC16", asInt8(opts.resources.asc16)],
    ]),
    saves: opts.saves,
    exit: () => opts.onExit?.(),
    random: opts.random ?? Math.random,
  });
  resetStatics();

  const game = new MainGame();
  game.start();
  game.draw();
  const frame = new Uint8ClampedArray(game.canvas.buffer.buffer);

  return {
    game,
    update(delta = TICK_MS) {
      game.update(delta);
      game.draw();
    },
    render() {
      return frame;
    },
    keyDown(key) {
      game.keyDown(key);
    },
    keyUp(key) {
      game.keyUp(key);
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

export { ScriptVM };
