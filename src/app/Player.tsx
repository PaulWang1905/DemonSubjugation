import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDeviceFont } from "./deviceFont";
import { createEngine, detectUiLanguage, EngineSettings, type UiLanguage, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, type Engine } from "../engine";
import type { SaveStorage } from "../engine/java";
import { exportSaves, importSaves, savesFor, savesStored } from "../storage/saves";
import type { StoredGame } from "../storage/db";
import { useEngineKeys } from "./useEngineKeys";
import { usePlayerFonts } from "./usePlayerFonts";
import { Keypad } from "./Keypad";
import { DebugMenu } from "./DebugMenu";
import { useLongPress } from "./longPress";
import { applyPalette, PALETTES } from "./palettes";
import { HiresText, outputScale, type ScreenEffect, type TextStyle } from "./hiresText";
import { effectOf, MAP_VIEWS, mapViewOf, type MapView, pref, ScreenOptions, setPref, SIDE_PAD_QUERY, SpeedField, toggleFullscreen, TOUCH_QUERY, useFullscreen, useMedia, useScreenFit, useZoom } from "./playerShell";
import { PLAYER_TEXT } from "./playerText";
import { SITE_TEXT } from "./siteText";
import { useSiteLang } from "./siteLang";
import { HD_CHINESE, HD_ENGLISH, ORIGINAL_LABEL, PIXEL_CHINESE, PIXEL_ENGLISH, readTextChoice, textChoiceEntries, type TextChoice } from "./textChoice";

interface Props {
  game: StoredGame;
  /** Uploaded font files; when missing, the device's own fonts are used. */
  fonts: { hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null };
  onExit: () => void;
  /** Where the back button goes: the game library, or the editor for a playtest. */
  backTo?: "library" | "editor";
}


/** A game's save slots, calling `refused` after a save the browser's storage would not keep (it is then kept for this page only). */
function savesTelling(gameId: string, refused: () => void): SaveStorage {
  const saves = savesFor(gameId);
  return {
    ...saves,
    set(path, value) {
      saves.set(path, value);
      if (!savesStored()) refused();
    },
  };
}
export function Player({ game, fonts, onExit, backTo = "library" }: Props) {
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
  // Zoom on a computer: steps of one device pixel per game pixel from the default size.
  const [zoom, changeZoom] = useZoom();
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
  const fullscreen = useFullscreen();
  const { scale, zoomInfo } = useScreenFit(stageRef, canvasRef, { touch, sideways, showPad, fullscreen, zoom, frameW, frameH });
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // Keys from the keyboard and the keypad (paused with the game).
  const { keyDown, keyUp, releaseKeys } = useEngineKeys({
    engine: engineRef,
    paused: debugRef,
    onEscapePaused: () => {
      setDebugOpen(false);
      setOptionsOpen(false);
    },
    onError: (e) => setError(String((e as Error).stack ?? e)),
  });
  const openDebug = useCallback(() => {
    releaseKeys();
    setDebugOpen(true);
  }, [releaseKeys]);
  const openOptions = useCallback(() => {
    releaseKeys();
    setOptionsOpen(true);
  }, [releaseKeys]);
  const hold = useLongPress(openDebug);
  const speedRef = useRef(speed);
  const paletteRef = useRef(paletteId);
  speedRef.current = speed;
  paletteRef.current = paletteId;
  EngineSettings.originalDamageFormula = originalFormula;
  // Experimental: smaller text cells so dialogue, menus and descriptions hold more.
  const [textSize, setTextSize] = useState(() => Number(pref("textSize", "16")) as 16 | 12 | 10);
  EngineSettings.textSize = textSize === 12 || textSize === 10 ? textSize : 16;
  // The fonts the engine draws with, More text's included; the first start waits for them.
  const playerFonts = usePlayerFonts({ text, uploaded: fonts, textSize, engine: engineRef, onError: setNotice });
  const fontPickRef = playerFonts.pick, smallRef = playerFonts.small, canStart = playerFonts.canStart;

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
        saves: savesTelling(game.id, () => setNotice(PLAYER_TEXT[lang].savesNotStored)),
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
      <ScreenOptions
        pt={pt}
        name={nm}
        paletteId={paletteId}
        onPalette={setPaletteId}
        effect={effect}
        onEffect={setEffect}
        zoom={touch ? undefined : { info: zoomInfo, change: changeZoom }}
      />
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

  const speedField = <SpeedField pt={pt} speed={speed} onSpeed={setSpeed} />;

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
          <p className="muted small">{pt.smallFonts(playerFonts.boldSmall, pt.smallCredit)}</p>
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
          <button className="tb-btn" onClick={onExit} aria-label={backTo === "editor" ? pt.backToEditor : pt.backToLibrary} title={backTo === "editor" ? pt.backToEditor : pt.backToLibrary}>
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
          <button className="ghost" onClick={onExit} title={backTo === "editor" ? pt.backToEditor : pt.backToLibrary}>
            {backTo === "editor" ? pt.editor : pt.library}
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
                    {backTo === "editor" ? pt.backToEditor : pt.backToLibrary}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showPad && <Keypad onDown={keyDown} onUp={keyUp} labels={pt.keys} />}
      </div>

      {notice && <div className="notice">{notice}</div>}

      {debugOpen && engineRef.current && <DebugMenu cheats={engineRef.current.cheats} onChange={() => engineRef.current?.redraw()} onClose={() => setDebugOpen(false)} />}

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
