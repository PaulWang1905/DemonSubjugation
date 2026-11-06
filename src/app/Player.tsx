import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDeviceFont } from "./deviceFont";
import { createEngine, detectUiLanguage, EngineSettings, type SmallFonts, type UiLanguage, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, Keys, type Engine, type EngineKey } from "../engine";
import { exportSaves, importSaves, savesFor } from "../storage/saves";
import type { StoredGame } from "../storage/db";
import { KEYMAP } from "./keys";
import { Keypad } from "./Keypad";
import { DebugMenu } from "./DebugMenu";
import { useLongPress } from "./longPress";
import { applyPalette, PALETTES } from "./palettes";
import { HiresText, outputScale, type ScreenEffect, type TextStyle } from "./hiresText";
import { boldSmallFonts, FONT_SETS, loadPixelFonts, loadSmallFonts, type FontSetId } from "./fonts";
import { PLAYER_TEXT } from "./playerText";
import { SITE_TEXT } from "./siteText";
import { useSiteLang } from "./siteLang";
import { HD_CHINESE, HD_ENGLISH, ORIGINAL_LABEL, PIXEL_CHINESE, PIXEL_ENGLISH, readTextChoice, textChoiceEntries, type TextChoice } from "./textChoice";

interface Props {
  game: StoredGame;
  /** Uploaded font files; when missing, the device's own fonts are used. */
  fonts: { hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null };
  onExit: () => void;
}

const effectOf = (v: string): ScreenEffect => (v === "lcd" || v === "lcd-shadow" || v === "smooth" ? v : "none");
/** Map view: how many extra tile columns (each side) and rows (above and below) to show. */
type MapView = "normal" | "wide" | "widest";
const MAP_VIEWS: Record<MapView, { mx: number; my: number }> = {
  normal: { mx: 0, my: 0 },
  wide: { mx: 2, my: 1 },
  widest: { mx: 4, my: 2 },
};
const mapViewOf = (v: string): MapView => (v === "wide" || v === "widest" ? v : "normal");
/** The page column's inner width (#root: 1400 px with 16 px padding). */
const PAGE_WIDTH = 1368;
/** The width the game screen starts at, at most (zoom from there). */
const DEFAULT_WIDTH = 948;

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
  // the player's own text follows the site language
  const lang = useSiteLang();
  const pt = PLAYER_TEXT[lang];
  const nm = (o: { label: string; zh: string }) => (lang === "zh" ? o.zh : o.label);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [speed, setSpeed] = useState(() => Number(pref("speed", "1")) || 1);
  const [paletteId, setPaletteId] = useState<string>(() => pref<string>("palette", "lcd"));
  // How the picture is drawn at the display's resolution (LCD cells, smoothed).
  const [effect, setEffect] = useState<ScreenEffect>(() => effectOf(pref<string>("effect", "none")));
  const effectRef = useRef(effect);
  effectRef.current = effect;
  const [scale, setScale] = useState(3);
  // Screen size on a computer: whole device pixels per game pixel inside the
  // page ("fit"); or bigger, wider than the page and in quarter-pixel steps:
  // up to half as big again ("large") or as big as the window allows ("fill").
  // Zoom on a computer: steps of one device pixel per game pixel (so the
  // pixels stay even) from the default size, which fits the screen in the
  // window and DEFAULT_WIDTH. Kept as the number of steps from the default.
  const [zoom, setZoom] = useState(() => {
    const z = Number(pref<string>("zoom", ""));
    if (Number.isFinite(z) && pref<string>("zoom", "") !== "") return Math.round(z);
    const old = pref<string>("screenSize", "fit"); // the earlier Size menu
    return old === "fill" ? 99 : old === "large" ? 2 : 0;
  });
  const changeZoom = (z: number) => {
    setZoom(z);
    setPref("zoom", String(z));
  };
  // What the zoom allows now: device pixels per game pixel (n), at the
  // default size, and the smallest and largest; wide: past the page column.
  const [zoomInfo, setZoomInfo] = useState({ n: 1, def: 1, min: 1, max: 1, wide: false });
  // More of the map on screen (the game itself still runs on 160x96).
  const [mapView, setMapView] = useState<MapView>(() => mapViewOf(pref<string>("mapView", "normal")));
  const view = MAP_VIEWS[mapView];
  const viewRef = useRef(view);
  viewRef.current = view;
  const frameW = SCREEN_WIDTH + 32 * view.mx;
  const frameH = SCREEN_HEIGHT + 32 * view.my;
  const [showPad, setShowPad] = useState(() => pref("keypad", matchMedia("(pointer: coarse)").matches ? "on" : "off") === "on");
  const [originalFormula, setOriginalFormula] = useState(() => pref("originalDamage", "on") === "on");
  const [notice, setNotice] = useState<string | null>(null);
  const [uiLang, setUiLang] = useState<UiLanguage | "auto">(() => pref<string>("uiLanguage", "auto") as UiLanguage | "auto");
  // How text is drawn: the look (Pixel or HD) and a font for Chinese and one
  // for English, for each look. Pixel defaults to the original font files
  // when they were added, Retro 8-bit otherwise.
  const [text, setText] = useState<TextChoice>(() =>
    readTextChoice((k) => {
      try {
        return localStorage.getItem("fmj-react:" + k);
      } catch {
        return null;
      }
    }, !!(fonts.hzk16 && fonts.asc16)),
  );
  const textRef = useRef(text);
  textRef.current = text;
  const changeText = (part: Partial<TextChoice>) => {
    const next = { ...text, ...part };
    setText(next);
    for (const [k, v] of textChoiceEntries(next)) setPref(k, v);
  };
  // The game's language: its English font menu comes first.
  const englishGame = useMemo(() => (uiLang === "auto" ? detectUiLanguage(new Uint8Array(game.data)) : uiLang) === "en", [game, uiLang]);
  // The pixel fonts the engine draws with (also under HD text, which is
  // drawn over them): bundled ones are loaded when chosen, then swapped in
  // without restarting; "original" is the uploaded files.
  const cjkSet: FontSetId | null = text.pixelChinese === "original" ? null : text.pixelChinese;
  const latinSet: FontSetId | null = text.pixelEnglish === "original" ? null : text.pixelEnglish;
  const wantKey = `${cjkSet ?? "-"}|${latinSet ?? "-"}`;
  const [bundled, setBundled] = useState<{ key: string; hzk16: Uint8Array; asc16: Uint8Array } | null>(null);
  useEffect(() => {
    if (!cjkSet && !latinSet) return;
    let alive = true;
    loadPixelFonts(cjkSet ?? latinSet!, latinSet ?? cjkSet!).then(
      (f) => alive && setBundled({ key: wantKey, ...f }),
      (e) => alive && setNotice(String((e as Error).message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, [cjkSet, latinSet, wantKey]);
  const needBundled = !!(cjkSet || latinSet);
  const useBundled = needBundled && bundled?.key === wantKey;
  const uploadedHzk = fonts.hzk16 ? new Uint8Array(fonts.hzk16) : null;
  const uploadedAsc = fonts.asc16 ? new Uint8Array(fonts.asc16) : null;
  const fontPick = {
    hzk16: cjkSet && useBundled ? bundled!.hzk16 : uploadedHzk,
    asc16: latinSet && useBundled ? bundled!.asc16 : uploadedAsc,
  };
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
  // (bold for the fonts that are bold at full size: Retro's Chinese, its letters)
  const isBold = (id: FontSetId | null) => !!id && !!FONT_SETS.find((f) => f.id === id)?.boldSmall;
  const boldCjk = isBold(cjkSet);
  const boldLatin = isBold(latinSet);
  const smallPick = useMemo(() => {
    if (!small || (!boldCjk && !boldLatin)) return small;
    const b = boldSmallFonts(small);
    return {
      hzk12: boldCjk ? b.hzk12 : small.hzk12,
      hzk10: boldCjk ? b.hzk10 : small.hzk10,
      asc12: boldLatin ? b.asc12 : small.asc12,
      asc10: boldLatin ? b.asc10 : small.asc10,
    };
  }, [small, boldCjk, boldLatin]);
  const smallRef = useRef(smallPick);
  smallRef.current = smallPick;
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
  if ((!needBundled || useBundled) && (textSize === 16 || small)) startedRef.current = true;
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
    engine.setView(viewRef.current.mx, viewRef.current.my);
    engineRef.current = engine;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    let image = ctx.createImageData(engine.width, engine.height);
    const hires: Partial<Record<TextStyle | "pixel", HiresText>> = {};
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
      const tc = textRef.current;
      const fw = engine.width;
      const fh = engine.height;
      const fx = effectRef.current;
      const pixelText = tc.look === "pixel";
      if (pixelText && fx === "none") {
        if (cv.width !== fw || cv.height !== fh) {
          cv.width = fw;
          cv.height = fh;
        }
        if (image.width !== fw || image.height !== fh) image = ctx.createImageData(fw, fh);
        applyPalette(frame, image.data, pal);
        ctx.putImageData(image, 0, 0);
      } else {
        // Sharp text and/or a picture effect, at the display's resolution
        const style = pixelText ? null : tc.hdChinese;
        const key = style ?? "pixel";
        const h = (hires[key] ??= new HiresText(style));
        h.setLetters(tc.hdEnglish);
        const k = outputScale(scaleRef.current, fw);
        h.draw(cv, frame, style || fx === "smooth" ? engine.textLayer() : [], pal, k, fw, fh, fx);
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
    e.setFonts(fontPick.hzk16, fontPick.asc16, smallPick);
    e.redraw();
    // fontPick is rebuilt each render; these say when it really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBundled, bundled, wantKey, fonts, smallPick]);

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
        const fitted = Math.min((w - frame) / frameW, (h - frame) / frameH, 8);
        setScale(Math.max(1, Math.floor(fitted * dpr * 4) / 4) / dpr);
        return;
      }
      const kp = stage.querySelector(".kp") as HTMLElement | null;
      if (document.fullscreenElement) {
        // fullscreen: the game takes the whole screen (above the keypad, if shown)
        h = window.innerHeight - (kp ? kp.offsetHeight + 10 : 0);
        w = window.innerWidth;
        const fitted = Math.min((w - frame) / frameW, (h - frame) / frameH, 16);
        setScale(Math.max(1, Math.floor(fitted * dpr * 4) / 4) / dpr);
        return;
      }
      const top = stage.getBoundingClientRect().top + window.scrollY;
      h = window.innerHeight - top - 6;
      if (kp) h -= kp.offsetHeight + 10;
      else h -= 60; // leave the options bar in view
      // whole device pixels per game pixel: the default fits the window's
      // height and DEFAULT_WIDTH; zooming goes from 2 CSS pixels up to the
      // window's width and height
      const winW = document.documentElement.clientWidth - 32;
      const steps = (width: number) => Math.floor(Math.min((width - frame) / frameW, (h - frame) / frameH) * dpr);
      const max = Math.max(1, Math.min(steps(winW), Math.floor(16 * dpr)));
      const def = Math.max(1, Math.min(steps(Math.min(winW, DEFAULT_WIDTH)), Math.floor(8 * dpr), max));
      const min = Math.max(1, Math.min(def, Math.round(2 * dpr)));
      const n = Math.min(max, Math.max(min, def + zoom));
      setScale(n / dpr);
      setZoomInfo({ n, def, min, max, wide: n / dpr * frameW + frame > PAGE_WIDTH });
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
  }, [showPad, touch, sideways, fullscreen, zoom, frameW, frameH]);

  // Change the map view while playing.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setView(view.mx, view.my);
  }, [view]);

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
        flash(pt.importedSaves(n));
      })
      .catch((e) => {
        const why = (e as Error).message;
        flash(pt.importFailed(why === "Not a save backup file" ? pt.notSaves : why));
      });
  };

  const toggleFullscreen = () => {
    const el = document.querySelector(".player") as HTMLElement | null;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // Screen colours and text style: in the toolbar, or under options on a phone.
  // The two font menus (their lists follow the look).
  const chineseFont =
    text.look === "pixel" ? (
      <label key="zh" className="field" title={pt.chineseTitle}>
        <span className="lbl">{pt.chinese}</span>
        <select value={text.pixelChinese} onChange={(e) => changeText({ pixelChinese: e.target.value as TextChoice["pixelChinese"] })}>
          {PIXEL_CHINESE.map((f) => (
            <option key={f.id} value={f.id}>
              {nm(f)}
            </option>
          ))}
          {fonts.hzk16 && <option value="original">{nm(ORIGINAL_LABEL)}</option>}
        </select>
      </label>
    ) : (
      <label key="zh" className="field" title={pt.chineseTitleHd}>
        <span className="lbl">{pt.chinese}</span>
        <select value={text.hdChinese} onChange={(e) => changeText({ hdChinese: e.target.value as TextChoice["hdChinese"] })}>
          {HD_CHINESE.map((f) => (
            <option key={f.id} value={f.id}>
              {nm(f)}
            </option>
          ))}
        </select>
      </label>
    );
  const englishFont =
    text.look === "pixel" ? (
      <label key="en" className="field" title={pt.englishTitle}>
        <span className="lbl">{pt.english}</span>
        <select value={text.pixelEnglish} onChange={(e) => changeText({ pixelEnglish: e.target.value as TextChoice["pixelEnglish"] })}>
          {PIXEL_ENGLISH.map((f) => (
            <option key={f.id} value={f.id}>
              {nm(f)}
            </option>
          ))}
          {fonts.asc16 && <option value="original">{nm(ORIGINAL_LABEL)}</option>}
        </select>
      </label>
    ) : (
      <label key="en" className="field" title={pt.englishTitle}>
        <span className="lbl">{pt.english}</span>
        <select value={text.hdEnglish} onChange={(e) => changeText({ hdEnglish: e.target.value as TextChoice["hdEnglish"] })}>
          {HD_ENGLISH.map((f) => (
            <option key={f.id} value={f.id}>
              {nm(f)}
            </option>
          ))}
        </select>
      </label>
    );

  const lookOptions = (
    <>
      <label className="field">
        <span className="lbl">{pt.screen}</span>
        <select
          value={paletteId}
          onChange={(e) => {
            setPaletteId(e.target.value);
            setPref("palette", e.target.value);
          }}
        >
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {nm(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="field" title={pt.effectTitle}>
        <span className="lbl">{pt.effect}</span>
        <select
          value={effect}
          onChange={(e) => {
            setEffect(effectOf(e.target.value));
            setPref("effect", e.target.value);
          }}
        >
          {(["none", "lcd", "lcd-shadow", "smooth"] as const).map((v) => (
            <option key={v} value={v}>
              {pt.effects[v]}
            </option>
          ))}
        </select>
      </label>
      {!touch && (
        <span className="field zoom" title={pt.sizeTitle}>
          <span className="lbl">{pt.size}</span>
          <button
            className="ghost zoom-btn"
            onClick={() => changeZoom(zoomInfo.n - 1 - zoomInfo.def)}
            disabled={zoomInfo.n <= zoomInfo.min}
            aria-label={pt.smaller}
            title={pt.smaller}
          >
            −
          </button>
          <button className="ghost zoom-pct" onClick={() => changeZoom(0)} title={pt.usualSize}>
            {Math.round((zoomInfo.n / zoomInfo.def) * 100)}%
          </button>
          <button
            className="ghost zoom-btn"
            onClick={() => changeZoom(zoomInfo.n + 1 - zoomInfo.def)}
            disabled={zoomInfo.n >= zoomInfo.max}
            aria-label={pt.larger}
            title={pt.larger}
          >
            +
          </button>
        </span>
      )}
      <label className="field" title={pt.mapTitle}>
        <span className="lbl">{pt.map}</span>
        <select
          value={mapView}
          onChange={(e) => {
            setMapView(mapViewOf(e.target.value));
            setPref("mapView", e.target.value);
          }}
        >
          {(Object.keys(MAP_VIEWS) as MapView[]).map((k) => (
            <option key={k} value={k}>
              {pt.mapViews[k]}
            </option>
          ))}
        </select>
      </label>
      {/* (the three text menus stay together when the bar wraps) */}
      <span className="field-group">
        <label className="field" title={pt.textTitle}>
          <span className="lbl">{pt.text}</span>
          <select value={text.look} onChange={(e) => changeText({ look: e.target.value === "hd" ? "hd" : "pixel" })}>
            <option value="pixel">{pt.looks.pixel}</option>
            <option value="hd">{pt.looks.hd}</option>
          </select>
        </label>
        {englishGame ? [englishFont, chineseFont] : [chineseFont, englishFont]}
      </span>
    </>
  );

  const speedField = (
    <label className="field">
      <span className="lbl">{pt.speed}</span>
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
          {SITE_TEXT[lang].guide.keys.map(([what, keys]) => (
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
          {pt.keypad}
        </label>
        <label className="field">
          {pt.menuLanguage}
          <select
            value={uiLang}
            onChange={(e) => {
              setUiLang(e.target.value as UiLanguage | "auto");
              setPref("uiLanguage", e.target.value);
            }}
          >
            <option value="auto">{pt.menuAuto}</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field" title={pt.moreTextTitle}>
          {pt.moreText}
          <select
            value={textSize}
            onChange={(e) => {
              setTextSize(Number(e.target.value) as 16 | 12 | 10);
              setPref("textSize", e.target.value);
            }}
          >
            {([16, 12, 10] as const).map((v) => (
              <option key={v} value={v}>
                {pt.moreSizes[v]}
              </option>
            ))}
          </select>
        </label>
        {textSize !== 16 && text.look === "pixel" && (
          <p className="muted small">{pt.smallFonts(boldCjk || boldLatin, pt.smallCredit)}</p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={originalFormula}
            onChange={(e) => {
              setOriginalFormula(e.target.checked);
              setPref("originalDamage", e.target.checked ? "on" : "off");
            }}
          />
          {pt.originalRules}
        </label>
        <div className="row">
          <button className="ghost" onClick={downloadSaves}>
            {pt.exportSaves}
          </button>
          <label className="button ghost">
            {pt.importSaves}
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
        (!touch && zoomInfo.wide ? " large fill" : "")
      }
    >
      {fullscreen && (
        <button className="fs-exit" onClick={toggleFullscreen} aria-label={pt.exitFullscreen} title={pt.exitFullscreen}>
          ✕
        </button>
      )}
      {touch ? (
        <div className="tbar">
          <button className="tb-btn" onClick={onExit} aria-label={pt.backToLibrary} title={pt.backToLibrary}>
            ←
          </button>
          <span className="title">{game.name}</span>
          {canFullscreen && (
            <button className="tb-btn" onClick={toggleFullscreen} aria-label={pt.fullscreen} title={pt.fullscreen}>
              ⛶
            </button>
          )}
          <button className="tb-btn" onClick={openOptions} aria-label={pt.options} title={pt.options}>
            ⚙
          </button>
        </div>
      ) : (
        <div className="toolbar">
          <button className="ghost" onClick={onExit} title={pt.backToLibrary}>
            {pt.library}
          </button>
          <span className="title" title={game.fileName}>
            {game.name}
          </span>
          <div className="spacer" />
          {speedField}
          <span className="tb-opt">{lookOptions}</span>
          <button className="ghost" onClick={toggleFullscreen} title={pt.fullscreen} aria-label={pt.fullscreen}>
            ⛶
          </button>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        <div className="screen-wrap">
          <div className="bezel">
            <canvas
              ref={canvasRef}
              className={effect !== "none" ? "fx" : undefined}
              style={{
                width: frameW * scale,
                height: frameH * scale,
              }}
              aria-label={pt.gameScreen}
              {...hold.bind}
            />
            {hold.ring}
            {error && (
              <div className="crash" role="alert">
                <strong>{pt.crashTitle}</strong>
                <p>{pt.crashText}</p>
                <pre>{error.split("\n").slice(0, 6).join("\n")}</pre>
                <div className="row">
                  <button onClick={() => setGeneration((g) => g + 1)}>{pt.restart}</button>
                  <button className="ghost" onClick={onExit}>
                    {pt.backToLibrary}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showPad && <Keypad onDown={keyDown} onUp={keyUp} labels={pt.keys} />}
      </div>

      {notice && <div className="notice">{notice}</div>}

      {debugOpen && engineRef.current && <DebugMenu engine={engineRef.current} onClose={() => setDebugOpen(false)} />}

      {touch ? (
        optionsOpen && (
          <div className="sheet" role="dialog" aria-label={pt.options} onClick={(e) => e.target === e.currentTarget && setOptionsOpen(false)}>
            <div className="sheet-body">
              <div className="sheet-head">
                <strong>{pt.options}</strong>
                <span className="muted small">{pt.paused}</span>
                <button onClick={() => setOptionsOpen(false)}>{pt.resume}</button>
              </div>
              <div className="sheet-row">{speedField}</div>
              {optionsPanel}
            </div>
          </div>
        )
      ) : (
        <details className="extras">
          <summary>{pt.controlsOptions}</summary>
          {optionsPanel}
        </details>
      )}
    </div>
  );
}
