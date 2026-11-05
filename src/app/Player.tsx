import { useCallback, useEffect, useRef, useState } from "react";
import { createDeviceFont } from "./deviceFont";
import { createEngine, EngineSettings, type UiLanguage, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, Keys, type Engine, type EngineKey } from "../engine";
import { exportSaves, importSaves, savesFor } from "../storage/saves";
import type { StoredGame } from "../storage/db";
import { KEY_HELP, KEYMAP } from "./keys";
import { Keypad } from "./Keypad";
import { DebugMenu } from "./DebugMenu";
import { useLongPress } from "./longPress";
import { applyPalette, PALETTES } from "./palettes";
import { HiresText, hiresScale, type TextStyle } from "./hiresText";

type TextMode = "pixel" | TextStyle;

interface Props {
  game: StoredGame;
  /** Uploaded font files; when missing, the device's own fonts are used. */
  fonts: { hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null };
  onExit: () => void;
}

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
  const [showPad, setShowPad] = useState(() => pref("keypad", matchMedia("(pointer: coarse)").matches ? "on" : "off") === "on");
  const [originalFormula, setOriginalFormula] = useState(() => pref("originalDamage", "on") === "on");
  const [notice, setNotice] = useState<string | null>(null);
  const [uiLang, setUiLang] = useState<UiLanguage | "auto">(() => pref<string>("uiLanguage", "auto") as UiLanguage | "auto");
  // Sharp text by default; the original bitmap look when the font files were added.
  const [textMode, setTextMode] = useState<TextMode>(() => pref<TextMode>("text", fonts.hzk16 && fonts.asc16 ? "pixel" : "sans"));
  const textRef = useRef(textMode);
  textRef.current = textMode;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // The hidden debug menu: press and hold the game screen. The game is paused
  // while it is open.
  const [debugOpen, setDebugOpen] = useState(false);
  const debugRef = useRef(false);
  debugRef.current = debugOpen;
  // Let go of every key the game still thinks is held, then pause it.
  const openDebug = useCallback(() => {
    if (repeat.current) window.clearTimeout(repeat.current.t);
    repeat.current = null;
    for (const k of pressed.current) engineRef.current?.keyUp(k);
    pressed.current.clear();
    setDebugOpen(true);
  }, []);
  const hold = useLongPress(openDebug);
  // Keys the game has seen pressed: only their releases are passed on, so the
  // Esc that closes the debug menu does not reach the game.
  const pressed = useRef(new Set<EngineKey>());
  const speedRef = useRef(speed);
  const paletteRef = useRef(paletteId);
  speedRef.current = speed;
  paletteRef.current = paletteId;
  EngineSettings.originalDamageFormula = originalFormula;

  // Boot the engine and run the fixed-step loop (the original ticks every 40 ms).
  useEffect(() => {
    setError(null);
    let engine: Engine;
    try {
      engine = createEngine({
        resources: {
          datLib: new Uint8Array(game.data),
          hzk16: fonts.hzk16 ? new Uint8Array(fonts.hzk16) : null,
          asc16: fonts.asc16 ? new Uint8Array(fonts.asc16) : null,
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
      if (mode === "pixel") {
        if (cv.width !== SCREEN_WIDTH) {
          cv.width = SCREEN_WIDTH;
          cv.height = SCREEN_HEIGHT;
        }
        applyPalette(frame, image.data, pal);
        ctx.putImageData(image, 0, 0);
      } else {
        const h = (hires[mode] ??= new HiresText(mode));
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
  }, [game, fonts, onExit, generation, uiLang]);

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
        if (e.code === "Escape") setDebugOpen(false);
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

  // Fit the screen into what is left of the window, at a whole number of
  // device pixels per game pixel so the 160x96 pixels stay crisp. With the
  // keypad, the screen and the keypad fit together without scrolling; on a
  // phone held sideways the controls go either side of the screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const side = showPad && matchMedia(SIDE_PAD_QUERY).matches;
      const bezel = stage.querySelector(".bezel") as HTMLElement | null;
      const frame = bezel ? bezel.offsetWidth - (canvasRef.current?.offsetWidth ?? 0) : 18;
      const top = stage.getBoundingClientRect().top + (document.fullscreenElement ? 0 : window.scrollY);
      const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
      const kp = stage.querySelector(".kp") as HTMLElement | null;
      let w = stage.clientWidth;
      let h = window.innerHeight - top - 6;
      if (side) {
        // the widest control column, measured by its contents (grid cells stretch)
        const widest = (sel: string) => Math.max(0, ...[...stage.querySelectorAll(sel)].map((x) => (x as HTMLElement).offsetWidth));
        w -= 2 * Math.max(widest(".kp-pad"), widest(".kp-act > *")) + 2 * gap + 8;
      } else if (kp) {
        h -= kp.offsetHeight + gap;
      } else if (!document.fullscreenElement) {
        h -= 60; // leave the options bar in view
      }
      const fitted = Math.min((w - frame) / SCREEN_WIDTH, (h - frame) / SCREEN_HEIGHT, 8);
      setScale(Math.max(1, Math.floor(fitted * dpr)) / dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    const tb = stage.previousElementSibling;
    if (tb) ro.observe(tb);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [showPad]);

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
      <label className="field" title="Sharp redraws text in your device's fonts at full resolution; Pixel keeps the original 16x16 bitmap text">
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
        </select>
      </label>
    </>
  );

  return (
    <div className={showPad ? "player with-pad" : "player"}>
      <div className="toolbar">
        <button className="ghost" onClick={onExit} title="Back to library">
          ← Library
        </button>
        <span className="title" title={game.fileName}>
          {game.name}
        </span>
        <div className="spacer" />
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
        <span className="tb-opt">{lookOptions}</span>
        <button className="ghost" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
          ⛶
        </button>
      </div>

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

      <details className="extras">
        <summary>Controls &amp; options</summary>
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
      </details>
    </div>
  );
}
