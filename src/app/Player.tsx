import { useCallback, useEffect, useRef, useState } from "react";
import { createDeviceFont } from "./deviceFont";
import { createEngine, EngineSettings, type UiLanguage, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, type Engine, type EngineKey } from "../engine";
import { exportSaves, importSaves, savesFor } from "../storage/saves";
import type { StoredGame } from "../storage/db";
import { KEY_HELP, KEYMAP } from "./keys";
import { Keypad } from "./Keypad";
import { DebugMenu, SECRET } from "./DebugMenu";
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

export function Player({ game, fonts, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
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
  // The hidden debug menu: the secret code on the game keys, or five quick
  // taps on the game's name. The game is paused while it is open.
  const [debugOpen, setDebugOpen] = useState(false);
  const debugRef = useRef(false);
  debugRef.current = debugOpen;
  // Let go of every key the game still thinks is held, then pause it.
  const openDebug = useCallback(() => {
    for (const k of pressed.current) engineRef.current?.keyUp(k);
    pressed.current.clear();
    setDebugOpen(true);
  }, []);
  const recent = useRef<EngineKey[]>([]);
  const taps = useRef<number[]>([]);
  // Keys the game has seen pressed: only their releases are passed on. B and
  // A that complete the code are kept from the game (so typing it does not
  // open the in-game menu), and so is the Esc that closes the debug menu.
  const pressed = useRef(new Set<EngineKey>());
  const endsWith = (r: EngineKey[], n: number) => r.length >= n && SECRET.slice(0, n).every((x, i) => r[r.length - n + i] === x);
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

  const keyDown = useCallback((k: EngineKey) => {
    if (debugRef.current) return;
    const r = recent.current;
    if ((k === SECRET[8] && endsWith(r, 8)) || (k === SECRET[9] && endsWith(r, 9))) return;
    pressed.current.add(k);
    try {
      engineRef.current?.keyDown(k);
    } catch (e) {
      setError(String((e as Error).stack ?? e));
    }
  }, []);
  const keyUp = useCallback((k: EngineKey) => {
    if (debugRef.current) return;
    if (pressed.current.delete(k)) {
      try {
        engineRef.current?.keyUp(k);
      } catch (e) {
        setError(String((e as Error).stack ?? e));
      }
    }
    // Releases, not presses, so held keys that auto-repeat count once.
    const r = [...recent.current, k].slice(-SECRET.length);
    recent.current = r;
    if (r.length === SECRET.length && r.every((x, i) => x === SECRET[i])) {
      recent.current = [];
      openDebug();
    }
  }, [openDebug]);

  const tapTitle = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      if (debugRef.current) setDebugOpen(false);
      else openDebug();
    }
  };

  // Keyboard input. Auto-repeat keydowns are passed through, which is how
  // holding a direction keeps walking.
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
      keyDown(k);
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

  // Integer scaling keeps the 160x96 pixels crisp.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = document.fullscreenElement ? window.innerHeight - 24 : Math.max(window.innerHeight * 0.62, 200);
      const s = Math.max(1, Math.min(Math.floor(w / SCREEN_WIDTH), Math.floor(h / SCREEN_HEIGHT), 8));
      setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, []);

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

  return (
    <div className="player">
      <div className="toolbar">
        <button className="ghost" onClick={onExit} title="Back to library">
          ← Library
        </button>
        <span className="title" title={game.fileName} onClick={tapTitle}>
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
        <button className="ghost" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
          ⛶
        </button>
      </div>

      <div className="screen-wrap" ref={screenRef}>
        <div className="bezel" style={{ width: SCREEN_WIDTH * scale + 16 }}>
          <canvas
            ref={canvasRef}
            style={{ width: SCREEN_WIDTH * scale, height: SCREEN_HEIGHT * scale }}
            aria-label="Game screen"
          />
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

      {notice && <div className="notice">{notice}</div>}

      {debugOpen && engineRef.current && <DebugMenu engine={engineRef.current} onClose={() => setDebugOpen(false)} />}

      {showPad && <Keypad onDown={keyDown} onUp={keyUp} />}

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
              Original damage formula
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
