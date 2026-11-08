// Plays a program on the emulated Longman 4988. With the firmware's files the
// device runs its own OS: the program is installed in its flash and opened
// from the OS's game menu. Without them it runs on Fulu (src/fulu), the
// site's stand-in for the OS. Like the real device it stays as it was left
// between visits.
import { useCallback, useEffect, useRef, useState } from "react";
import { Device, FPS } from "../bbk/device";
import { missingRegions } from "../bbk/firmware";
import { Key, KEYBOARD } from "../bbk/keys";
import { decodeLcd, LCD_HEIGHT, LCD_STRIDE, LCD_WIDTH } from "../bbk/lcd";
import { CPU_HZ } from "../bbk/machine";
import { Keys, type EngineKey } from "../engine";
import { getFirmware, type StoredGame } from "../storage/db";
import { FULU_OS, FuluDevice } from "../fulu/device";
import { forgetDevice, osDigest, restoreDevice, saveDevice } from "./deviceStore";
import { loadFontSet } from "./fonts";
import { HiresText, outputScale, type ScreenEffect } from "./hiresText";
import { Keypad } from "./Keypad";
import { applyPalette, PALETTES } from "./palettes";
import { PLAYER_TEXT } from "./playerText";
import { effectOf, pref, ScreenOptions, setPref, SIDE_PAD_QUERY, SpeedField, toggleFullscreen, TOUCH_QUERY, useFullscreen, useMedia, useScreenFit, useZoom } from "./playerShell";
import { useSiteLang } from "./siteLang";

interface Props {
  /** The program to play; null turns on the device itself. */
  game: StoredGame | null;
  onExit: () => void;
}

const FRAME_MS = 1000 / FPS;
/** Held keys repeat after this long, then every REPEAT_RATE ms. */
const REPEAT_DELAY = 300;
const REPEAT_RATE = 90;
const REPEATS = new Set<number>([Key.up, Key.down, Key.left, Key.right, Key.pageUp, Key.pageDown, Key.del]);
/** The on-screen keypad's keys on the device. */
const PAD_KEYS = new Map<EngineKey, number>([
  [Keys.UP, Key.up],
  [Keys.DOWN, Key.down],
  [Keys.LEFT, Key.left],
  [Keys.RIGHT, Key.right],
  [Keys.PAGEUP, Key.pageUp],
  [Keys.PAGEDOWN, Key.pageDown],
  [Keys.ENTER, Key.enter],
  [Keys.CANCEL, Key.exit],
]);
/** How often a running device is put away (besides when the page is left). */
const SAVE_EVERY_MS = 30_000;

type Status = { kind: "loading" | "starting" | "running" } | { kind: "error"; message: string };

export function DevicePlayer({ game, onExit }: Props) {
  const lang = useSiteLang();
  const pt = PLAYER_TEXT[lang];
  const dt = pt.device;
  const nm = (o: { label: string; zh: string }) => (lang === "zh" ? o.zh : o.label);
  const id = game ? `gam:${game.id}` : "4988";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<{ device: Device | FuluDevice; os: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [onFulu, setOnFulu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [speed, setSpeed] = useState(() => Number(pref("speed", "1")) || 1);
  const [paletteId, setPaletteId] = useState<string>(() => pref<string>("palette", "lcd"));
  const [effect, setEffect] = useState<ScreenEffect>(() => effectOf(pref<string>("effect", "none")));
  const [zoom, changeZoom] = useZoom();
  const [showPad, setShowPad] = useState(() => pref("keypad", matchMedia("(pointer: coarse)").matches ? "on" : "off") === "on");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const touchDevice = useMedia(TOUCH_QUERY);
  const touch = showPad && touchDevice;
  const sideways = useMedia(SIDE_PAD_QUERY);
  const fullscreen = useFullscreen();
  const { scale, zoomInfo } = useScreenFit(stageRef, canvasRef, { touch, sideways, showPad, fullscreen, zoom, frameW: LCD_WIDTH, frameH: LCD_HEIGHT });
  // the loop reads these without restarting
  const live = useRef({ speed, paletteId, effect, scale, paused: optionsOpen });
  live.current = { speed, paletteId, effect, scale, paused: optionsOpen };
  const textRef = useRef(dt);
  textRef.current = dt;

  // Turn the device on: resume it as it was left, or install the program and
  // open it. With the firmware's files it runs the original OS; without, a
  // program runs on Fulu, the site's stand-in for it.
  useEffect(() => {
    let alive = true;
    const fresh = generation > 0;
    setStatus({ kind: "loading" });
    (async () => {
      const text = textRef.current;
      const fw = { regions: await getFirmware() };
      const original = !missingRegions(fw).length;
      if (!original && !game) return setStatus({ kind: "error", message: text.needFirmware });
      const fonts = original ? null : await loadFontSet("unifont");
      const make = () => (fonts ? new FuluDevice(fonts) : new Device(fw));
      let device = make();
      const os = original ? await osDigest(fw.regions.os!) : FULU_OS;
      if (fresh) await forgetDevice(id);
      let restored = !fresh && (await restoreDevice(id, os, device));
      // a program that had stopped on Fulu starts again
      if (restored && device instanceof FuluDevice && device.machine.cpu.stopped) {
        device = make();
        restored = false;
      }
      if (restored && device instanceof FuluDevice) device.resumed();
      if (!restored) {
        setStatus({ kind: "starting" });
        await new Promise((r) => setTimeout(r, 30)); // let "Turning on…" show
        if (!alive) return;
        if (game) {
          const file = device.install(new Uint8Array(game.data));
          if (!file) return setStatus({ kind: "error", message: text.tooBig });
          if (!device.launch(file)) setNotice(text.notStarted);
        } else if (device instanceof Device) {
          device.boot();
        }
      }
      if (!alive) return;
      deviceRef.current = { device, os };
      setOnFulu(!original);
      setStatus({ kind: "running" });
    })().catch((e) => alive && setStatus({ kind: "error", message: String((e as Error).message ?? e) }));
    return () => {
      alive = false;
      const d = deviceRef.current;
      deviceRef.current = null;
      if (d) void saveDevice(id, d.os, d.device);
    };
  }, [id, game, generation]);

  // Put the device away when the page is hidden, and now and then.
  useEffect(() => {
    if (status.kind !== "running") return;
    const save = () => {
      const d = deviceRef.current;
      if (d) void saveDevice(id, d.os, d.device);
    };
    const hidden = () => document.visibilityState === "hidden" && save();
    const timer = window.setInterval(save, SAVE_EVERY_MS);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", save);
    };
  }, [id, status.kind]);

  // Run in real time (or faster) and draw each new picture.
  useEffect(() => {
    if (status.kind !== "running") return;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const pixels = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    const rgba = new Uint8ClampedArray(LCD_WIDTH * LCD_HEIGHT * 4);
    const image = new ImageData(LCD_WIDTH, LCD_HEIGHT);
    const hires = new HiresText(null);
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      const d = deviceRef.current?.device;
      const o = live.current;
      acc = o.paused ? 0 : acc + Math.min(now - last, 250) * o.speed;
      last = now;
      if (d) {
        for (let steps = 0; acc >= FRAME_MS && steps < 16; steps++, acc -= FRAME_MS) d.machine.run(CPU_HZ / FPS);
        // on Fulu, a program stops when it ends or needs what Fulu does not have yet
        if (d instanceof FuluDevice && d.stopped) {
          const why = d.stopped, text = textRef.current;
          d.fulu.stopped = null;
          setStatus({ kind: "error", message: why === "The program ended" ? text.ended : text.fuluCannot(why) });
        }
        decodeLcd(d.machine.ram, pixels);
        for (let y = 0, i = 0; y < LCD_HEIGHT; y++) {
          for (let x = 0; x < LCD_WIDTH; x++, i += 4) {
            const v = pixels[y * LCD_STRIDE + x] ? 0 : 255;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
            rgba[i + 3] = 255;
          }
        }
        const pal = PALETTES.find((p) => p.id === o.paletteId) ?? PALETTES[0];
        if (o.effect === "none") {
          if (cv.width !== LCD_WIDTH || cv.height !== LCD_HEIGHT) {
            cv.width = LCD_WIDTH;
            cv.height = LCD_HEIGHT;
          }
          applyPalette(rgba, image.data, pal);
          ctx.putImageData(image, 0, 0);
        } else {
          hires.draw(cv, rgba, [], pal, outputScale(o.scale, LCD_WIDTH), LCD_WIDTH, LCD_HEIGHT, o.effect);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status.kind]);

  // Keys: a press goes to the device; held direction keys repeat.
  const held = useRef(new Map<number, number>());
  const keyDown = useCallback((k: number) => {
    if (held.current.has(k) || live.current.paused) return;
    deviceRef.current?.device.press(k);
    const repeat = () => {
      deviceRef.current?.device.press(k);
      held.current.set(k, window.setTimeout(repeat, REPEAT_RATE));
    };
    held.current.set(k, REPEATS.has(k) ? window.setTimeout(repeat, REPEAT_DELAY) : 0);
  }, []);
  const keyUp = useCallback((k: number) => {
    window.clearTimeout(held.current.get(k));
    held.current.delete(k);
  }, []);
  useEffect(() => {
    const keys = held.current;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      const k = KEYBOARD[e.code];
      if (k === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) keyDown(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYBOARD[e.code];
      if (k !== undefined) keyUp(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      for (const t of keys.values()) window.clearTimeout(t);
      keys.clear();
    };
  }, [keyDown, keyUp]);

  // The phone layout covers the page; stop the page behind it scrolling.
  useEffect(() => {
    if (!touch) return;
    document.documentElement.classList.add("playing-touch");
    return () => document.documentElement.classList.remove("playing-touch");
  }, [touch]);

  const title = game?.name ?? nm({ label: "Longman 4988", zh: "朗文 4988" });
  const restart = () => {
    setOptionsOpen(false);
    setNotice(null);
    setGeneration((g) => g + 1);
  };
  const screen = (
    <ScreenOptions
      pt={pt}
      name={nm}
      paletteId={paletteId}
      onPalette={setPaletteId}
      effect={effect}
      onEffect={setEffect}
      zoom={touch ? undefined : { info: zoomInfo, change: changeZoom }}
    />
  );
  const speedField = <SpeedField pt={pt} speed={speed} onSpeed={setSpeed} />;
  const optionsPanel = (
    <div className="extras-grid">
      <table className="keys">
        <tbody>
          {dt.keys.map(([what, keys]) => (
            <tr key={what}>
              <th>{what}</th>
              <td>{keys}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="opts">
        {touch && <div className="opts-look">{screen}</div>}
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
        <div className="row">
          <button className="ghost" onClick={restart} title={dt.restartTitle}>
            {dt.restart}
          </button>
        </div>
        {status.kind === "running" && <p className="muted small">{onFulu ? dt.osFulu : dt.osOriginal}</p>}
      </div>
    </div>
  );

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
          <span className="title">{title}</span>
          <button className="tb-btn" onClick={() => setOptionsOpen(true)} aria-label={pt.options} title={pt.options}>
            ⚙
          </button>
        </div>
      ) : (
        <div className="toolbar">
          <button className="ghost" onClick={onExit} title={pt.backToLibrary}>
            {pt.library}
          </button>
          <span className="title" title={game?.fileName}>
            {title}
          </span>
          <div className="spacer" />
          {speedField}
          <span className="tb-opt">{screen}</span>
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
              style={{ width: LCD_WIDTH * scale, height: LCD_HEIGHT * scale }}
              aria-label={pt.gameScreen}
            />
            {status.kind !== "running" && (
              <div className={status.kind === "error" ? "crash" : "screen-note"} role={status.kind === "error" ? "alert" : "status"}>
                {status.kind === "error" ? (
                  <>
                    <p>{status.message}</p>
                    <div className="row">
                      <button className="ghost" onClick={onExit}>
                        {pt.backToLibrary}
                      </button>
                    </div>
                  </>
                ) : (
                  status.kind === "starting" && <p>{dt.starting}</p>
                )}
              </div>
            )}
          </div>
        </div>
        {showPad && <Keypad onDown={(k) => keyDown(PAD_KEYS.get(k)!)} onUp={(k) => keyUp(PAD_KEYS.get(k)!)} labels={pt.keys} />}
      </div>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

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
