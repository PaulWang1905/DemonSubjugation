import { useCallback, useEffect, useRef, useState } from "react";
import { createDeviceFont } from "./deviceFont";
import { createEngine, EngineSettings, type SmallFonts, type UiLanguage, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, Keys, type Engine, type EngineKey } from "../engine";
import { exportSaves, importSaves, savesFor } from "../storage/saves";
import type { StoredGame } from "../storage/db";
import { KEY_HELP, KEYMAP } from "./keys";
import { Keypad } from "./Keypad";
import { DebugMenu } from "./DebugMenu";
import { useLongPress } from "./longPress";
import { applyPalette, PALETTES } from "./palettes";
import { HiresText, hiresScale, type TextStyle } from "./hiresText";
import { FONT_SETS, isFontSet, loadFontSet, loadSmallFonts, SMALL_FONT_CREDIT, type FontSetId } from "./fonts";

/** Pixel text with the uploaded files (or the device fallback), a bundled pixel font, or Sharp. */
type TextMode = "pixel" | `pixel:${FontSetId}` | TextStyle;

/** The bundled font set a text mode uses, if any. */
function fontSetOf(mode: TextMode): FontSetId | null {
  const id = mode.startsWith("pixel:") ? mode.slice(6) : "";
  return isFontSet(id) ? id : null;
}

interface Props {
  game: StoredGame;
  /** Uploaded font files; when missing, the device's own fonts are used. */
  fonts: { hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null };
  onExit: () => void;
}

type ScreenSize = "fit" | "large" | "fill";
const screenSizeOf = (v: string): ScreenSize => (v === "large" || v === "fill" ? v : "fit");
/** The page column's inner width (#root: 980 px with 16 px padding). */
const PAGE_WIDTH = 948;

function pref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem("fmj-react:" + key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function setPref(key: string, v: string): void {
  try {
    localStorage.setItem("fmj-react:" + key, v);
  } catch {
    /* ignore */
  }
}

const SPEEDS = [1, 2, 4];
/** Key repeat: first repeat after this long, then one every REPEAT_RATE ms. */
const REPEAT_DELAY = 250;
const REPEAT_RATE = 100;
/** Where the keypad goes beside the screen instead of under it. */
const SIDE_PAD_QUERY = "(orientation: landscape) and (max-height: 560px)";
/** Phones and small tablets: the full-screen play layout. */
const TOUCH_QUERY = "(pointer: coarse) and (max-width: 1024px), (pointer: coarse) and (max-height: 600px), (max-width: 560px), (max-height: 480px)";

/** Whether a media query matches, kept up to date. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const ch = () => setOn(m.matches);
    ch();
    m.addEventListener("change", ch);
    return () => m.removeEventListener("change", ch);
  }, [query]);
  return on;
}
const REPEATS = new Set<EngineKey>([Keys.UP, Keys.DOWN, Keys.LEFT, Keys.RIGHT, Keys.PAGEUP, Keys.PAGEDOWN]);

export function Player({ game, fonts, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [speed, setSpeed] = useState(() => Number(pref("speed", "1")) || 1);
  const [paletteId, setPaletteId] = useState<string>(() => pref<string>("palette", "lcd"));
  const [scale, setScale] = useState(3);
  // Screen size on a computer: whole device pixels per game pixel inside the
  // page ("fit"); or bigger, wider than the page and in quarter-pixel steps:
  // up to half as big again ("large") or as big as the window allows ("fill").
  const [screenSize, setScreenSize] = useState<ScreenSize>(() => screenSizeOf(pref<string>("screenSize", "fit")));
  const [showPad, setShowPad] = useState(() => pref("keypad", matchMedia("(pointer: coarse)").matches ? "on" : "off") === "on");
  const [originalFormula, setOriginalFormula] = useState(() => pref("originalDamage", "on") === "on");
  const [notice, setNotice] = useState<string | null>(null);
  const [uiLang, setUiLang] = useState<UiLanguage | "auto">(() => pref<string>("uiLanguage", "auto") as UiLanguage | "auto");
  // The original bitmap fonts when they were added, Retro 8-bit pixel text otherwise.
  const [textMode, setTextMode] = useState<TextMode>(() => pref<TextMode>("text", fonts.hzk16 && fonts.asc16 ? "pixel" : "pixel:retro"));
  const textRef = useRef(textMode);
  textRef.current = textMode;
  // A bundled pixel font: loaded when chosen, then swapped in without restarting.
  const setId = fontSetOf(textMode);
  const [bundled, setBundled] = useState<{ id: FontSetId; hzk16: Uint8Array; asc16: Uint8Array } | null>(null);
  useEffect(() => {
    if (!setId) return;
    let alive = true;
    loadFontSet(setId).then(
      (f) => alive && setBundled({ id: setId, ...f }),
      (e) => alive && setNotice(String((e as Error).message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, [setId]);
  // The fonts the engine draws with: the chosen bundled set once loaded,
  // otherwise the uploaded files (null: the device fallback).
  const useBundled = !!setId && bundled?.id === setId;
  const fontPick = useBundled
    ? { hzk16: bundled!.hzk16, asc16: bundled!.asc16 }
    : { hzk16: fonts.hzk16 ? new Uint8Array(fonts.hzk16) : null, asc16: fonts.asc16 ? new Uint8Array(fonts.asc16) : null };
  const fontPickRef = useRef(fontPick);
  fontPickRef.current = fontPick;
  // Wait for a chosen bundled font before the first start, so the game does
  // not open in another font; later changes only swap the font.
  const startedRef = useRef(false);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // The hidden debug menu: press and hold the game screen. The game is paused
  // while it is open.
  const [debugOpen, setDebugOpen] = useState(false);
  // The options sheet of the phone layout; the game is paused while it is open.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // True while the game is paused (debug menu or options sheet).
  const debugRef = useRef(false);
  debugRef.current = debugOpen || optionsOpen;
  // Phones and tablets with the keypad get a full-screen play layout.
  const touchDevice = useMedia(TOUCH_QUERY);
  const sideways = useMedia(SIDE_PAD_QUERY);
  const touch = showPad && touchDevice;
  // True while the player fills the screen: only the game (and the keypad) show.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const ch = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", ch);
    return () => document.removeEventListener("fullscreenchange", ch);
  }, []);
  // Let go of every key the game still thinks is held, then pause it.
  const releaseKeys = useCallback(() => {
    if (repeat.current) window.clearTimeout(repeat.current.t);
    repeat.current = null;
    for (const k of pressed.current) engineRef.current?.keyUp(k);
    pressed.current.clear();
  }, []);
  const openDebug = useCallback(() => {
    releaseKeys();
    setDebugOpen(true);
  }, [releaseKeys]);
  const openOptions = useCallback(() => {
    releaseKeys();
    setOptionsOpen(true);
  }, [releaseKeys]);
  const hold = useLongPress(openDebug);
  // Keys the game has seen pressed: only their releases are passed on, so the
  // Esc that closes the debug menu does not reach the game.
  const pressed = useRef(new Set<EngineKey>());
  const speedRef = useRef(speed);
  const paletteRef = useRef(paletteId);
  speedRef.current = speed;
  paletteRef.current = paletteId;
  EngineSettings.originalDamageFormula = originalFormula;
  // Experimental: smaller text cells so dialogue, menus and descriptions hold more.
  const [textSize, setTextSize] = useState(() => Number(pref("textSize", "16")) as 16 | 12 | 10);
  EngineSettings.textSize = textSize === 12 || textSize === 10 ? textSize : 16;
  // Fonts drawn for those sizes, loaded the first time they are needed.
  const [small, setSmall] = useState<SmallFonts | null>(null);
  const smallRef = useRef(small);
  smallRef.current = small;
  useEffect(() => {
    if (textSize === 16 || small) return;
    let alive = true;
    loadSmallFonts().then(
      (f) => alive && setSmall(f),
      (e) => alive && setNotice(String((e as Error).message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, [textSize, small]);
  // (also wait for these on the first start)
  if ((!setId || useBundled) && (textSize === 16 || small)) startedRef.current = true;
  const canStart = startedRef.current;

  // Boot the engine and run the fixed-step loop (the original ticks every 40 ms).
  useEffect(() => {
    if (!canStart) return;
    setError(null);
    let engine: Engine;
    try {
      engine = createEngine({
        resources: {
          datLib: new Uint8Array(game.data),
          hzk16: fontPickRef.current.hzk16,
          asc16: fontPickRef.current.asc16,
        },
        fontFallback: fonts.hzk16 && fonts.asc16 ? undefined : createDeviceFont(),
        uiLanguage: uiLang,
        saves: savesFor(game.id),
        onExit,
      });
    } catch (e) {
      setError(String((e as Error).stack ?? e));
      return;
    }
    if (smallRef.current) engine.setFonts(fontPickRef.current.hzk16, fontPickRef.current.asc16, smallRef.current);
    engineRef.current = engine;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const hires: Partial<Record<TextStyle, HiresText>> = {};
    let frame = engine.render();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let stopped = false;

    const loop = (now: number) => {
      if (stopped) return;
      acc = debugRef.current ? 0 : acc + Math.min(now - last, 250) * speedRef.current;
      last = now;
      try {
        let steps = 0;
        while (acc >= TICK_MS && steps < 40) {
          engine.update(TICK_MS);
          acc -= TICK_MS;
          steps++;
        }
        frame = engine.render();
      } catch (e) {
        stopped = true;
        console.error(e);
        setError(String((e as Error).stack ?? e));
        return;
      }
      const pal = PALETTES.find((p) => p.id === paletteRef.current) ?? PALETTES[0];
      const mode = textRef.current;
      if (mode === "pixel" || fontSetOf(mode)) {
        if (cv.width !== SCREEN_WIDTH) {
          cv.width = SCREEN_WIDTH;
          cv.height = SCREEN_HEIGHT;
        }
        applyPalette(frame, image.data, pal);
        ctx.putImageData(image, 0, 0);
      } else {
        const h = (hires[mode as TextStyle] ??= new HiresText(mode as TextStyle));
        h.draw(cv, frame, engine.textLayer(), pal, hiresScale(scaleRef.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      engineRef.current = null;
    };
  }, [game, fonts, onExit, generation, uiLang, canStart]);

  // Switch the engine's font when the choice (or its loading) changes.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setFonts(fontPick.hzk16, fontPick.asc16, small);
    e.redraw();
    // fontPick is rebuilt each render; these say when it really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBundled, bundled, setId, fonts, small]);

  // Held keys repeat at one fixed rate whatever sends them (keypad, keyboard,
  // gamepad), so walking feels the same everywhere. Each repeat is one more
  // key message, as on the device: one step on the map, one line in a menu.
  const repeat = useRef<{ key: EngineKey; t: number } | null>(null);
  const stopRepeat = useCallback(() => {
    if (repeat.current) window.clearTimeout(repeat.current.t);
    repeat.current = null;
  }, []);
  const startRepeat = useCallback(
    (k: EngineKey, delay: number) => {
      stopRepeat();
      const fire = () => {
        if (!repeat.current || debugRef.current) return;
        try {
          engineRef.current?.keyDown(k);
        } catch (e) {
          setError(String((e as Error).stack ?? e));
          return;
        }
        repeat.current.t = window.setTimeout(fire, REPEAT_RATE);
      };
      repeat.current = { key: k, t: window.setTimeout(fire, delay) };
    },
    [stopRepeat],
  );

  const keyDown = useCallback(
    (k: EngineKey) => {
      if (debugRef.current || pressed.current.has(k)) return;
      pressed.current.add(k);
      try {
        engineRef.current?.keyDown(k);
      } catch (e) {
        setError(String((e as Error).stack ?? e));
      }
      if (REPEATS.has(k)) startRepeat(k, REPEAT_DELAY);
    },
    [startRepeat],
  );
  const keyUp = useCallback(
    (k: EngineKey) => {
      if (!pressed.current.delete(k)) return;
      if (repeat.current?.key === k) {
        stopRepeat();
        // another held direction takes over, as on a keyboard
        const other = [...pressed.current].reverse().find((x) => REPEATS.has(x));
        if (other !== undefined) startRepeat(other, REPEAT_DELAY);
      }
      if (debugRef.current) return;
      try {
        engineRef.current?.keyUp(k);
      } catch (e) {
        setError(String((e as Error).stack ?? e));
      }
    },
    [startRepeat, stopRepeat],
  );
  useEffect(() => stopRepeat, [stopRepeat]);

  // Keyboard input. The browser's own auto-repeat is ignored: holding a key
  // repeats at the same rate as the keypad.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (debugRef.current) {
        if (e.code === "Escape") {
          setDebugOpen(false);
          setOptionsOpen(false);
        }
        return;
      }
      const k = KEYMAP[e.code];
      if (k === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) keyDown(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code];
      if (k === undefined) return;
      e.preventDefault();
      keyUp(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [keyDown, keyUp]);

  // Fit the screen into what is left of the window. On a computer the scale
  // is a whole number of device pixels per game pixel, so the 160x96 pixels
  // stay crisp. In the phone layout the screen takes all the room the
  // controls leave: the full width when upright, the full height between
  // the controls when sideways.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const bezel = stage.querySelector(".bezel") as HTMLElement | null;
      const frame = bezel ? bezel.offsetWidth - (canvasRef.current?.offsetWidth ?? 0) : 18;
      const size = (sel: string, wide: boolean) =>
        Math.max(0, ...Array.from(stage.querySelectorAll(sel)).map((x) => (wide ? (x as HTMLElement).offsetWidth : (x as HTMLElement).offsetHeight)));
      let w = stage.clientWidth;
      let h: number;
      if (touch) {
        h = stage.clientHeight;
        if (sideways) {
          // the widest control column, measured by its contents (grid cells stretch)
          w -= 2 * (Math.max(size(".kp-pad", true), size(".kp-ab", true), size(".kp-pages", true)) + 10);
        } else {
          // what the keypad needs at least, measured by its parts (it stretches)
          h -= Math.max(size(".kp-pad", false), size(".kp-ab", false)) + size(".kp-pages", false) + 36;
        }
        const fitted = Math.min((w - frame) / SCREEN_WIDTH, (h - frame) / SCREEN_HEIGHT, 8);
        setScale(Math.max(1, Math.floor(fitted * dpr * 4) / 4) / dpr);
        return;
      }
      const kp = stage.querySelector(".kp") as HTMLElement | null;
      if (document.fullscreenElement) {
        // fullscreen: the game takes the whole screen (above the keypad, if shown)
        h = window.innerHeight - (kp ? kp.offsetHeight + 10 : 0);
        w = window.innerWidth;
        const fitted = Math.min((w - frame) / SCREEN_WIDTH, (h - frame) / SCREEN_HEIGHT, 16);
        setScale(Math.max(1, Math.floor(fitted * dpr * 4) / 4) / dpr);
        return;
      }
      const top = stage.getBoundingClientRect().top + window.scrollY;
      h = window.innerHeight - top - 6;
      if (kp) h -= kp.offsetHeight + 10;
      else h -= 60; // leave the options bar in view
      // Fit: whole device pixels, within the page column
      const pageW = Math.min(w, PAGE_WIDTH);
      const fit = Math.max(1, Math.floor(Math.min((pageW - frame) / SCREEN_WIDTH, (h - frame) / SCREEN_HEIGHT, 8) * dpr)) / dpr;
      if (screenSize === "fit") {
        setScale(fit);
        return;
      }
      let fitted = Math.min((w - frame) / SCREEN_WIDTH, (h - frame) / SCREEN_HEIGHT, 12);
      if (screenSize === "large") fitted = Math.min(fitted, fit * 1.5);
      setScale(Math.max(fit, Math.floor(fitted * dpr * 4) / 4 / dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [showPad, touch, sideways, fullscreen, screenSize]);

  // The phone layout covers the page; stop the page behind it scrolling.
  useEffect(() => {
    if (!touch) return;
    const html = document.documentElement;
    html.classList.add("playing-touch");
    return () => html.classList.remove("playing-touch");
  }, [touch]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const downloadSaves = () => {
    const blob = new Blob([exportSaves(game.id)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${game.name}-saves.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const uploadSaves = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((t) => {
        const n = importSaves(game.id, t);
        flash(`Imported ${n} save slot${n === 1 ? "" : "s"}. Load them from the title menu.`);
      })
      .catch((e) => flash(`Could not import saves: ${(e as Error).message}`));
  };

  const toggleFullscreen = () => {
    const el = document.querySelector(".player") as HTMLElement | null;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // Screen colours and text style: in the toolbar, or under options on a phone.
  const lookOptions = (
    <>
      <label className="field">
        <span className="lbl">Screen</span>
        <select
          value={paletteId}
          onChange={(e) => {
            setPaletteId(e.target.value);
            setPref("palette", e.target.value);
          }}
        >
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field" title="Sharp redraws text in your device's fonts at full resolution; Pixel (original) uses the HZK16 / ASC16 files you added; the other Pixel choices are open-source pixel fonts that come with the player">
        <span className="lbl">Text</span>
        <select
          value={textMode}
          onChange={(e) => {
            setTextMode(e.target.value as TextMode);
            setPref("text", e.target.value);
          }}
        >
          <option value="sans">Sharp</option>
          <option value="serif">Sharp serif</option>
          <option value="pixel">Pixel (original)</option>
          {FONT_SETS.map((f) => (
            <option key={f.id} value={`pixel:${f.id}`}>
              Pixel · {f.label}
            </option>
          ))}
        </select>
      </label>
      {!touch && (
        <label className="field" title="Fit keeps every game pixel the same size, inside the page. Larger (up to half as big again) and Largest (the whole window) use more of a big screen; game pixels may then differ by one screen pixel">
          <span className="lbl">Size</span>
          <select
            value={screenSize}
            onChange={(e) => {
              setScreenSize(screenSizeOf(e.target.value));
              setPref("screenSize", e.target.value);
            }}
          >
            <option value="fit">Fit</option>
            <option value="large">Larger</option>
            <option value="fill">Largest</option>
          </select>
        </label>
      )}
    </>
  );

  const speedField = (
    <label className="field">
      <span className="lbl">Speed</span>
      <select
        value={speed}
        onChange={(e) => {
          setSpeed(Number(e.target.value));
          setPref("speed", e.target.value);
        }}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </label>
  );

  const optionsPanel = (
    <div className="extras-grid">
      <table className="keys">
        <tbody>
          {KEY_HELP.map(([what, keys]) => (
            <tr key={what}>
              <th>{what}</th>
              <td>{keys}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="opts">
        <div className="opts-look">{lookOptions}</div>
        <label className="check">
          <input
            type="checkbox"
            checked={showPad}
            onChange={(e) => {
              setShowPad(e.target.checked);
              setPref("keypad", e.target.checked ? "on" : "off");
            }}
          />
          On-screen keypad
        </label>
        <label className="field">
          Menu language
          <select
            value={uiLang}
            onChange={(e) => {
              setUiLang(e.target.value as UiLanguage | "auto");
              setPref("uiLanguage", e.target.value);
            }}
          >
            <option value="auto">Auto (from the game title)</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field" title="Smaller text in dialogue, message boxes, script menus and descriptions, so more fits on the screen">
          More text (experimental)
          <select
            value={textSize}
            onChange={(e) => {
              setTextSize(Number(e.target.value) as 16 | 12 | 10);
              setPref("textSize", e.target.value);
            }}
          >
            <option value="16">Off (device size)</option>
            <option value="12">More: 12-pixel text</option>
            <option value="10">Most: 10-pixel text</option>
          </select>
        </label>
        {textSize !== 16 && (textMode === "pixel" || setId) && <p className="muted small">Pixel text at this size uses fonts drawn for it: {SMALL_FONT_CREDIT}.</p>}
        <label className="check">
          <input
            type="checkbox"
            checked={originalFormula}
            onChange={(e) => {
              setOriginalFormula(e.target.checked);
              setPref("originalDamage", e.target.checked ? "on" : "off");
            }}
          />
          Original engine rules
        </label>
        <div className="row">
          <button className="ghost" onClick={downloadSaves}>
            Export saves
          </button>
          <label className="button ghost">
            Import saves
            <input type="file" accept=".json,application/json" hidden onChange={(e) => uploadSaves(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );

  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;

  return (
    <div
      className={
        (touch ? (sideways ? "player touch sideways" : "player touch") : showPad ? "player with-pad" : "player") +
        (fullscreen ? " fs" : "") +
        (!touch && screenSize !== "fit" ? " large" : "") +
        (!touch && screenSize === "fill" ? " fill" : "")
      }
    >
      {fullscreen && (
        <button className="fs-exit" onClick={toggleFullscreen} aria-label="Exit fullscreen" title="Exit fullscreen (Esc)">
          ✕
        </button>
      )}
      {touch ? (
        <div className="tbar">
          <button className="tb-btn" onClick={onExit} aria-label="Back to library" title="Back to library">
            ←
          </button>
          <span className="title">{game.name}</span>
          {canFullscreen && (
            <button className="tb-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen">
              ⛶
            </button>
          )}
          <button className="tb-btn" onClick={openOptions} aria-label="Options" title="Options">
            ⚙
          </button>
        </div>
      ) : (
        <div className="toolbar">
          <button className="ghost" onClick={onExit} title="Back to library">
            ← Library
          </button>
          <span className="title" title={game.fileName}>
            {game.name}
          </span>
          <div className="spacer" />
          {speedField}
          <span className="tb-opt">{lookOptions}</span>
          <button className="ghost" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
            ⛶
          </button>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        <div className="screen-wrap">
          <div className="bezel">
            <canvas
              ref={canvasRef}
              style={{
                width: SCREEN_WIDTH * scale,
                height: SCREEN_HEIGHT * scale,
              }}
              aria-label="Game screen"
              {...hold.bind}
            />
            {hold.ring}
            {error && (
              <div className="crash" role="alert">
                <strong>The engine stopped.</strong>
                <p>This archive may use something the engine does not support yet.</p>
                <pre>{error.split("\n").slice(0, 6).join("\n")}</pre>
                <div className="row">
                  <button onClick={() => setGeneration((g) => g + 1)}>Restart</button>
                  <button className="ghost" onClick={onExit}>
                    Back to library
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showPad && <Keypad onDown={keyDown} onUp={keyUp} />}
      </div>

      {notice && <div className="notice">{notice}</div>}

      {debugOpen && engineRef.current && <DebugMenu engine={engineRef.current} onClose={() => setDebugOpen(false)} />}

      {touch ? (
        optionsOpen && (
          <div className="sheet" role="dialog" aria-label="Options" onClick={(e) => e.target === e.currentTarget && setOptionsOpen(false)}>
            <div className="sheet-body">
              <div className="sheet-head">
                <strong>Options</strong>
                <span className="muted small">The game is paused</span>
                <button onClick={() => setOptionsOpen(false)}>Resume</button>
              </div>
              <div className="sheet-row">{speedField}</div>
              {optionsPanel}
            </div>
          </div>
        )
      ) : (
        <details className="extras">
          <summary>Controls &amp; options</summary>
          {optionsPanel}
        </details>
      )}
    </div>
  );
}
