// Plays a program on the emulated Longman 4988. With the firmware's files the
// device runs its own OS: the program is installed in its flash and opened
// from the OS's game menu. Without them it runs on Fulu (src/fulu), the
// site's stand-in for the OS. Like the real device it stays as it was left
// between visits.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BOOT_FRAMES, Device, FPS } from "../bbk/device";
import { findLib } from "../bbk/gam";
import { KitCheats } from "../bbk/kitCheats";
import { missingRegions } from "../bbk/firmware";
import { Key, KEYBOARD, type Press } from "../bbk/keys";
import { DeviceInput } from "./deviceInput";
import { decodeLcd, LCD_HEIGHT, LCD_STRIDE, LCD_WIDTH } from "../bbk/lcd";
import { WideView } from "../bbk/wideView";
import { CPU_HZ } from "../bbk/machine";
import { Keys, readLibrary, type EngineKey } from "../engine";
import { getFirmware, type StoredGame } from "../storage/db";
import { FULU_OS, FuluDevice } from "../fulu/device";
import { exportDevice, importDevice, installedProgram, loadSlot, osDigest, restoreDevice, saveDevice, savedFlash, saveSlot, slotTimes, storeDevice } from "./deviceStore";
import { loadFontSet, loadSmallFonts } from "./fonts";
import { DebugMenu } from "./DebugMenu";
import { DeviceTools, type Snapshot } from "./DeviceTools";
import { HiresText, outputScale, type ScreenEffect, type TextStyle } from "./hiresText";
import { Keypad } from "./Keypad";
import { DeviceKeys, deviceKeys } from "./DeviceKeys";
import { useLongPress } from "./longPress";
import { PALETTES, type Palette } from "./palettes";
import { PLAYER_TEXT } from "./playerText";
import { effectOf, MAP_VIEWS, mapViewOf, type MapView, pref, ScreenOptions, setPref, SIDE_PAD_QUERY, SpeedField, toggleFullscreen, TOUCH_QUERY, useFullscreen, useMedia, useScreenFit, useSheetFocus, useZoom } from "./playerShell";
import { useSiteLang } from "./siteLang";
import { LoadingScreen, type LoadingStepView } from "./Loading";
import { inSlices, nextFrame } from "./slices";
import { useNotice } from "./useNotice";
import { HD_CHINESE, readTextChoice, type TextChoice } from "./textChoice";

interface Props {
  /** The program to play; null turns on the device itself. */
  game: StoredGame | null;
  /** The OS it runs on: BBK's firmware (its files must have been added), or Fulu. The device itself is always the original. */
  os: "original" | "fulu";
  onExit: () => void;
}

const FRAME_MS = 1000 / FPS;
/**
 * How long a frame of the page may spend emulating (ms), and how much device
 * time may wait to be emulated: on a phone too slow for real time the device
 * runs slower, a frame at a time, instead of catching up in bursts while
 * presses wait behind the backlog.
 */
const FRAME_BUDGET_MS = 10;
const MAX_LAG_MS = 6 * FRAME_MS;
/** The LCD's memory (with $1000, which stands for row 0's first byte). */
const LCD_RAM = 0x400, LCD_BYTES = 0x1001 - LCD_RAM;

/** Whether the LCD's memory is as `shown`. */
function sameLcd(ram: Uint8Array, shown: Uint8Array): boolean {
  for (let i = 0; i < LCD_BYTES; i++) if (ram[LCD_RAM + i] !== shown[i]) return false;
  return true;
}

/** Native-endian RGBA as one 32-bit word. */
const word = (() => {
  const w = new Uint32Array(1), b = new Uint8Array(w.buffer);
  return (c: readonly [number, number, number]) => {
    b.set([c[0], c[1], c[2], 255]);
    return w[0];
  };
})();

/** The device's pixels (1 dark) in the palette's colours, into `image`: what applyPalette makes of them. */
function paint(frame: Uint8Array, stride: number, fw: number, fh: number, image: ImageData, pal: Palette): void {
  const out = new Uint32Array(image.data.buffer, image.data.byteOffset, fw * fh);
  const dark = word(pal.dark), light = word(pal.light);
  for (let y = 0, i = 0; y < fh; y++) for (let x = 0, j = y * stride; x < fw; x++, i++, j++) out[i] = frame[j] ? dark : light;
}
/** Power, the menu and the two dictionaries: they leave the program. */
const SYSTEM_KEYS = new Set<number>([Key.power, Key.home, Key.dualDict, Key.modern]);
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

/** The keys that go from the empty Chinese box to the device (the others type in it). */
const THROUGH_BOX = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Escape", "Backspace", "Delete", "Insert", "Home", "F1", "F2", "F3", "F4", "F12"]);

type Status = { kind: "loading" | "starting" | "running" } | { kind: "error"; message: string; canGoOn?: boolean };

export function DevicePlayer({ game, os: wanted, onExit }: Props) {
  const lang = useSiteLang();
  const pt = PLAYER_TEXT[lang];
  const dt = pt.device;
  const nm = (o: { label: string; zh: string }) => (lang === "zh" ? o.zh : o.label);
  // Each OS keeps its own device (one saved on the firmware does not resume on Fulu)
  const onFuluOs = !!game && wanted === "fulu";
  const id = game ? `gam:${game.id}${onFuluOs ? ":fulu" : ""}` : "4988";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<{ device: Device | FuluDevice; os: string } | null>(null);
  // The hidden debug menu (hold the screen, as in the JS engine's player):
  // the game's party, items and story for games made with BBK's RPG kit,
  // and the device's own tools for any program. The game is paused while it
  // is open; its switches are kept after every frame.
  const [debugOpen, setDebugOpen] = useState(false);
  const kitRef = useRef<KitCheats | null>(null);
  /** The wider map view, for games made with the RPG kit (their library is in the .gam). */
  const wideRef = useRef<WideView | null>(null);
  const [hasMap, setHasMap] = useState(false);
  /** More text (F6, on Fulu): dialogues in 12 or 10 px text, the same setting as the JS engine's player. */
  const [textSize, setTextSize] = useState(() => Number(pref("textSize", "16")) as 16 | 12 | 10);
  const [mapView, setMapView] = useState<MapView>(() => mapViewOf(pref<string>("mapView", "normal")));
  const view = hasMap ? MAP_VIEWS[mapView] : MAP_VIEWS.normal;
  const [frameW, frameH] = view.mx || view.my ? WideView.size(view.mx, view.my) : [LCD_WIDTH, LCD_HEIGHT];
  const slots = useRef<(Snapshot | null)[]>([null, null, null, null]);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [onFulu, setOnFulu] = useState(false);
  const { notice, show: setNotice, flash } = useNotice();
  /** The stops on Fulu the player chose to go on past: when one comes again, Fulu goes on by itself. */
  const goneOnPast = useRef(new Set<string>());
  /** The stop on screen (left as it is, for Continue), so that it is shown once. */
  const shownStop = useRef<string | null>(null);
  /** Whether the program on Fulu takes Chinese now (its input mode 4 or 8): the box for the computer's own input method shows. */
  const [chinese, setChinese] = useState(false);
  const chineseRef = useRef(false);
  const typingBox = useRef<HTMLInputElement>(null);
  /** Storing the device failed (the browser's storage refused it): say so. */
  const notStored = (e: unknown) => {
    console.warn("Could not store the device", e);
    setNotice(dt.saves.notStored);
  };
  const [generation, setGeneration] = useState(0);
  // How the device starts next: resumed as kept, or the machine afresh on the
  // flash it had (restarting keeps the program's saves), which `carry` holds.
  const nextStart = useRef<"resume" | "restart">("resume");
  const carry = useRef<Uint8Array | null>(null);
  /** When each save-state slot was saved (null: empty). */
  const [slotTimesNow, setSlotTimes] = useState<(number | null)[]>([]);
  const [speed, setSpeed] = useState(() => Number(pref("speed", "1")) || 1);
  const [paletteId, setPaletteId] = useState<string>(() => pref<string>("palette", "lcd"));
  const [effect, setEffect] = useState<ScreenEffect>(() => effectOf(pref<string>("effect", "none")));
  // Text on Fulu: the device's pixels, or HD (redrawn in a font at the
  // screen's resolution). The same setting as the JS engine's player.
  const [text, setText] = useState<TextChoice>(() => readTextChoice((k) => pref(k, "") || null, false));
  const changeText = (look: TextChoice["look"], hdChinese = text.hdChinese) => {
    setText({ ...text, look, hdChinese });
    setPref("textLook", look);
    setPref("hdChinese", hdChinese);
  };
  const [zoom, changeZoom] = useZoom();
  const [showPad, setShowPad] = useState(() => pref("keypad", matchMedia("(pointer: coarse)").matches ? "on" : "off") === "on");
  const [optionsOpen, setOptionsOpen] = useState(false);
  useSheetFocus(optionsOpen, () => setOptionsOpen(false));
  const touchDevice = useMedia(TOUCH_QUERY);
  const touch = showPad && touchDevice;
  const sideways = useMedia(SIDE_PAD_QUERY);
  const fullscreen = useFullscreen();
  const { scale, zoomInfo } = useScreenFit(stageRef, canvasRef, { touch, sideways, showPad, fullscreen, zoom, frameW, frameH });
  // the loop reads these without restarting
  /** The HD text style, when text is drawn in HD (only on Fulu, which knows where the text is). */
  const hd: TextStyle | null = onFulu && text.look === "hd" ? text.hdChinese : null;
  const live = useRef({ speed, paletteId, effect, scale, paused: optionsOpen || debugOpen, hd, letters: text.hdEnglish, view });
  live.current = { speed, paletteId, effect, scale, paused: optionsOpen || debugOpen, hd, letters: text.hdEnglish, view };
  const textRef = useRef(dt);
  textRef.current = dt;
  const loadText = useRef(pt.loading);
  loadText.current = pt.loading;
  /** While it turns on: the steps the loading screen lists, and the one under way. */
  const [phase, setPhase] = useState<{ steps: LoadingStepView[]; current: number }>({ steps: [], current: 0 });

  // Turn the device on: resume it as it was left, or install the program and
  // open it, on the OS asked for: the original (its files are needed) or
  // Fulu, the site's stand-in for it.
  useEffect(() => {
    let alive = true;
    const restartNow = nextStart.current === "restart";
    nextStart.current = "resume";
    setStatus({ kind: "loading" });
    // what the loading screen lists (the steps change once it is known whether the device resumes)
    const lt = loadText.current;
    const name = game?.name ?? "";
    let steps: LoadingStepView[] = [{ label: onFuluOs ? lt.fuluFont : lt.firmware }];
    const show = (current: number) => alive && setPhase({ steps: [...steps], current });
    show(0);
    (async () => {
      const text = textRef.current;
      const fw = { regions: await getFirmware() };
      const original = !onFuluOs;
      if (original && missingRegions(fw).length) return setStatus({ kind: "error", message: text.needFirmware });
      const fonts = original ? null : await loadFontSet("unifont");
      const make = () => (fonts ? new FuluDevice(fonts) : new Device(fw));
      let device = make();
      const os = original ? await osDigest(fw.regions.os!) : FULU_OS;
      // (a device Fulu saved before each OS had its own was kept under the program's own key)
      let restored = !restartNow && ((await restoreDevice(id, os, device)) || (onFuluOs && (await restoreDevice(`gam:${game!.id}`, os, device))));
      // Starting afresh keeps the flash, and with it the program's saves: the
      // flash in play when restarting, that of a program that had ended, or
      // the one kept for this game (from another OS build, or a file).
      let flash = restartNow ? carry.current : null;
      carry.current = null;
      if (restored && device.machine.cpu.stopped) {
        flash = device.machine.flash.data.slice();
        device = make();
        restored = false;
      }
      if (!restored && !flash) flash = await savedFlash(id);
      if (restored && device instanceof FuluDevice) device.resumed();
      if (restored) {
        steps = [steps[0], { label: lt.resume }];
        show(1);
      } else {
        setStatus({ kind: "starting" });
        // The original OS starts up for many seconds of device time: emulated
        // a slice at a time (device.ts), so the screen says how far it is.
        const counted = (label: string, frames: number): LoadingStepView => ({ label, done: 0, total: frames, percent: true });
        const slices = <T,>(run: Generator<void, T>, at: number) =>
          inSlices(run, {
            alive: () => alive,
            // (long slices: the emulation is the slow part, and the loading mark moves by itself)
            budget: 90,
            progress: (n) => {
              steps[at] = { ...steps[at], done: n };
              show(at);
            },
          });
        if (game) {
          const gam = new Uint8Array(game.data);
          if (flash) device.machine.flash.data.set(flash);
          let file = flash ? installedProgram(device.machine.flash.data, gam) : null;
          if (device instanceof Device) {
            const d = device;
            steps = [steps[0], file ? counted(lt.boot, BOOT_FRAMES) : counted(lt.install(name), d.installBoots() * BOOT_FRAMES), { label: lt.open(name) }];
            show(1);
            await nextFrame();
            if (!alive) return;
            if (file) await slices(d.booting(), 1);
            else file = await slices(d.installing(gam), 1);
            if (!file) return setStatus({ kind: "error", message: text.tooBig });
            show(2);
            if (!(await slices(d.launching(file), 2))) setNotice(text.notStarted);
          } else {
            steps = [steps[0], { label: lt.openFulu(name) }];
            show(1);
            await nextFrame();
            if (!alive) return;
            file ??= device.install(gam);
            if (!file) return setStatus({ kind: "error", message: text.tooBig });
            if (!device.launch(file)) setNotice(text.notStarted);
          }
        } else if (device instanceof Device) {
          if (flash) device.machine.flash.data.set(flash);
          steps = [steps[0], counted(lt.boot, BOOT_FRAMES)];
          show(1);
          await nextFrame();
          if (!alive) return;
          await slices(device.booting(), 1);
        }
      }
      void slotTimes(id).then((t) => alive && setSlotTimes(t));
      if (!alive) return;
      deviceRef.current = { device, os };
      const lib = game ? findLib(new Uint8Array(game.data)) : -1;
      const library = game && lib >= 0 ? new Uint8Array(game.data).subarray(lib) : null;
      kitRef.current = library ? new KitCheats(device.machine, readLibrary(library)) : null;
      wideRef.current = library ? new WideView(library) : null;
      if (device instanceof FuluDevice) device.fulu.moreText.library = library;
      setHasMap(!!library);
      slots.current = [null, null, null, null];
      setOnFulu(!original);
      setStatus({ kind: "running" });
    })().catch((e) => alive && setStatus({ kind: "error", message: String((e as Error).message ?? e) }));
    return () => {
      alive = false;
      const d = deviceRef.current;
      deviceRef.current = null;
      // (the player is closing: nowhere left to say it failed but the console)
      if (d) saveDevice(id, d.os, d.device).catch((e) => console.warn("Could not store the device", e));
    };
  }, [id, game, generation]);

  // Put the device away when the page is hidden, and now and then.
  useEffect(() => {
    if (status.kind !== "running") return;
    const save = () => {
      const d = deviceRef.current;
      if (d) saveDevice(id, d.os, d.device).catch(notStored);
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

  // More text: the small fonts, handed to Fulu (applies from the next dialogue)
  useEffect(() => {
    if (status.kind !== "running") return;
    const d = deviceRef.current?.device;
    if (!(d instanceof FuluDevice)) return;
    if (textSize === 16) return void (d.fulu.moreText.font = null);
    let alive = true;
    loadSmallFonts().then(
      (f) => {
        if (alive && deviceRef.current?.device === d) d.fulu.moreText.font = textSize === 12 ? { size: 12, hzk: f.hzk12, asc: f.asc12 } : { size: 10, hzk: f.hzk10, asc: f.asc10 };
      },
      () => alive && setNotice(textRef.current.moreTextFailed),
    );
    return () => void (alive = false);
  }, [textSize, status.kind]);

  // Run in real time (or faster) and draw each new picture.
  useEffect(() => {
    if (status.kind !== "running") return;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const pixels = new Uint8Array(LCD_STRIDE * LCD_HEIGHT);
    // the picture shown: the device's screen, or the wider view around it
    let fw = 0, fh = 0, frame = pixels, stride = LCD_STRIDE;
    let rgba = new Uint8ClampedArray(0), image = new ImageData(1, 1), wide = new Uint8Array(0);
    const hires = new Map<TextStyle | "pixel", HiresText>();
    let raf = 0, last = performance.now(), acc = 0;
    // what was drawn last: the LCD's memory and the settings it was drawn with (a still screen is not drawn again)
    const lcdShown = new Uint8Array(LCD_BYTES);
    let drawnWith = "";
    const loop = (now: number) => {
      const d = deviceRef.current?.device;
      const o = live.current;
      acc = o.paused ? 0 : acc + Math.min(now - last, 250) * o.speed;
      last = now;
      if (d) {
        // Emulate the frames due, within a budget of the frame's time; when a slow phone cannot keep
        // up, the device runs slower than real time rather than falling behind: at most MAX_LAG of
        // its time waits to be emulated, so a key pressed is read soon whatever the backlog was.
        let ran = 0;
        for (const start = performance.now(); acc >= FRAME_MS; acc -= FRAME_MS) {
          d.machine.run(CPU_HZ / FPS);
          kitRef.current?.tick();
          ran++;
          if ((d instanceof FuluDevice && d.stopped) || performance.now() - start > FRAME_BUDGET_MS) {
            acc -= FRAME_MS;
            break;
          }
        }
        acc = Math.min(Math.max(acc, 0), MAX_LAG_MS);
        // on Fulu, Chinese input: the box for the computer's own input method
        const zh = d instanceof FuluDevice && d.chineseInput;
        if (zh !== chineseRef.current) setChinese((chineseRef.current = zh));
        // on Fulu, a program stops when it ends or needs what Fulu does not have yet; past the
        // latter the player can go on (and Fulu does by itself, for one the player went on past before)
        if (d instanceof FuluDevice && d.stopped && d.stopped !== shownStop.current) {
          const why = d.stopped, text = textRef.current;
          if (d.fulu.resumable && goneOnPast.current.has(why)) {
            d.fulu.goOn();
            setNotice(text.wentOn(why));
          } else {
            const canGoOn = d.fulu.resumable;
            if (!canGoOn) d.fulu.stopped = null;
            else shownStop.current = why;
            // keep the device as it stopped (its flash holds the saves made just before; if the
            // page is closed at the stop, the program starts afresh next time, with those saves)
            const kept = deviceRef.current;
            if (kept) saveDevice(id, kept.os, kept.device).catch(notStored);
            setStatus({ kind: "error", message: canGoOn ? text.fuluCannot(why) : text.ended, canGoOn });
          }
        }
        const { mx, my } = o.view, w = wideRef.current;
        const wideNow = !!w && (mx || my) !== 0;
        // nothing new to show: the same screen with the same settings; with the wider view, also no
        // frame run (it moves the map's people besides, and counts the frames it holds a screen
        // caught mid-redraw: a display faster than the device's 60 frames must not count twice)
        const hiresNow = o.effect !== "none" || !!o.hd ? hires.get(o.hd ?? "pixel") : undefined;
        const settings = `${o.paletteId}:${o.effect}:${o.hd}:${o.letters}:${o.scale}:${mx}:${my}`;
        const ram = d.machine.ram;
        if ((!wideNow || ran === 0) && !hiresNow?.stale && settings === drawnWith && sameLcd(ram, lcdShown)) {
          raf = requestAnimationFrame(loop);
          return;
        }
        drawnWith = settings;
        lcdShown.set(ram.subarray(LCD_RAM, LCD_RAM + LCD_BYTES));
        decodeLcd(ram, pixels);
        const [ww, wh] = w && (mx || my) ? WideView.size(mx, my) : [LCD_WIDTH, LCD_HEIGHT];
        if (ww !== fw || wh !== fh) {
          [fw, fh] = [ww, wh];
          rgba = new Uint8ClampedArray(fw * fh * 4);
          image = new ImageData(fw, fh);
          wide = new Uint8Array(fw * fh);
        }
        let at: [number, number] = [0, 0];
        if (w && (mx || my)) {
          at = w.compose(pixels, kitRef.current?.mapView() ?? null, mx, my, wide);
          [frame, stride] = [wide, fw];
        } else [frame, stride] = [pixels, LCD_STRIDE];
        const pal = PALETTES.find((p) => p.id === o.paletteId) ?? PALETTES[0];
        if (o.effect === "none" && !o.hd) {
          if (cv.width !== fw || cv.height !== fh) {
            cv.width = fw;
            cv.height = fh;
          }
          // the palette's two colours straight into the picture (as applyPalette gives them)
          paint(frame, stride, fw, fh, image, pal);
          ctx.putImageData(image, 0, 0);
        } else {
          for (let y = 0, i = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++, i += 4) {
              const v = frame[y * stride + x] ? 0 : 255;
              rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
              rgba[i + 3] = 255;
            }
          }
          const key = o.hd ?? "pixel";
          let h = hires.get(key);
          if (!h) hires.set(key, (h = new HiresText(o.hd)));
          h.setLetters(o.letters);
          // (the text marks are on the device's screen, which the wider view moves)
          const marks = o.hd && d instanceof FuluDevice ? d.fulu.textMarks.marks(pixels).map((m) => ({ ...m, x: m.x + at[0], y: m.y + at[1] })) : [];
          h.draw(cv, rgba, marks, pal, outputScale(o.scale, fw), fw, fh, o.effect);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status.kind]);

  // Keys: a press goes to the device (deviceInput.ts: held arrows repeat;
  // 删除, 修改, 查找, 插入 and 帮助 are Shift and a key, as on the device). On
  // Fulu the system keys would only end the program (they lead to the
  // power-off, the OS's menu and the dictionaries, which Fulu does not have),
  // so a stray press is ignored.
  const input = useRef<DeviceInput | null>(null);
  input.current ??= new DeviceInput(
    () => deviceRef.current?.device,
    (k) => !live.current.paused && !(deviceRef.current?.device instanceof FuluDevice && SYSTEM_KEYS.has(k)),
  );
  const keyDown = useCallback((p: Press) => input.current!.down(p), []);
  const keyUp = useCallback((p: Press) => input.current!.up(p), []);
  const releaseKeys = useCallback(() => input.current!.releaseAll(), []);
  const hold = useLongPress(
    useCallback(() => {
      releaseKeys();
      setDebugOpen(true);
    }, [releaseKeys]),
  );
  const debugRef = useRef(debugOpen);
  debugRef.current = debugOpen;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // (from the empty Chinese box, the device's keys that do not type go to the device)
      if (t?.closest?.("input, select, textarea") && (t !== typingBox.current || typingBox.current.value || e.isComposing || e.keyCode === 229 || !THROUGH_BOX.has(e.code))) return;
      if (debugRef.current) {
        if (e.code === "Escape") setDebugOpen(false);
        return;
      }
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
      releaseKeys();
    };
  }, [keyDown, keyUp, releaseKeys]);

  // The phone layout covers the page; stop the page behind it scrolling.
  useEffect(() => {
    if (!touch) return;
    document.documentElement.classList.add("playing-touch");
    return () => document.documentElement.classList.remove("playing-touch");
  }, [touch]);

  const title = game?.name ?? nm({ label: "Longman 4988", zh: "朗文 4988" });
  // the box takes the keyboard when it shows (on a phone, its keyboard opens)
  useEffect(() => {
    if (chinese) typingBox.current?.focus();
  }, [chinese]);
  /** The box's text to the program, as the OS's input method gives it; an empty box presses the device's Enter. */
  const sendTyped = (e: FormEvent) => {
    e.preventDefault();
    const d = deviceRef.current?.device, box = typingBox.current;
    if (!(d instanceof FuluDevice) || !box) return;
    if (box.value) d.type(box.value);
    else d.press(Key.enter);
    box.value = "";
  };
  /** Go on past a stop on Fulu: what the program called returns as if done, and it plays on. */
  const goOn = () => {
    const d = deviceRef.current?.device;
    if (!(d instanceof FuluDevice) || !d.stopped) return;
    goneOnPast.current.add(d.stopped);
    shownStop.current = null;
    if (d.fulu.goOn()) setStatus({ kind: "running" });
  };
  /** Turn the device off and on again: the program starts afresh on the same flash, its saves kept. */
  const restart = () => {
    setOptionsOpen(false);
    setNotice(null);
    carry.current = deviceRef.current?.device.machine.flash.data.slice() ?? null;
    shownStop.current = null;
    nextStart.current = "restart";
    setGeneration((g) => g + 1);
  };

  // Save states (the whole device, in numbered slots kept in this browser),
  // and the device in a file: its saves and its state, to keep or move.
  const saveState = async (n: number) => {
    const d = deviceRef.current;
    if (!d) return;
    try {
      await saveSlot(id, n, d.os, d.device);
    } catch (e) {
      return notStored(e);
    }
    setSlotTimes(await slotTimes(id));
    flash(dt.saves.saved(n));
  };
  const loadState = async (n: number) => {
    const d = deviceRef.current;
    if (!d) return;
    if (!(await loadSlot(id, n, d.os, d.device))) return setNotice(dt.saves.otherOs);
    if (d.device instanceof FuluDevice) {
      d.device.fulu.stopped = null;
      d.device.fulu.resumable = false;
      shownStop.current = null;
      d.device.fulu.textMarks.clear();
      d.device.resumed();
    }
    if (status.kind !== "running") setStatus({ kind: "running" });
    setOptionsOpen(false);
    flash(dt.saves.loaded(n));
  };
  const exportSaves = async () => {
    const d = deviceRef.current;
    if (!d) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await exportDevice(title, d.os, d.device));
    // (in ASCII: some browsers drop a name in Chinese and call the file "download")
    const name = title.replace(/[^\x20-\x7e]/g, "").trim().replace(/\s+/g, "-") || "4988";
    a.download = `${name}-saves-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const importSaves = async (file: File | undefined) => {
    if (!file) return;
    let device: Awaited<ReturnType<typeof importDevice>>["device"];
    try {
      device = (await importDevice(id, file)).device;
    } catch {
      return setNotice(dt.saves.notAFile);
    }
    try {
      // the device in play is replaced, not saved over the file's
      deviceRef.current = null;
      await storeDevice(device);
      nextStart.current = "resume";
      setOptionsOpen(false);
      setGeneration((g) => g + 1);
      flash(dt.saves.imported);
    } catch (e) {
      notStored(e);
    }
  };
  const screen = (
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
      {hasMap && (
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
      )}
      {onFulu && hasMap && (
        <label className="field" title={dt.moreTextTitle}>
          <span className="lbl">{pt.moreText}</span>
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
      )}
      {onFulu && (
        <label className="field" title={pt.textTitle}>
          <span className="lbl">{pt.text}</span>
          <select
            value={text.look === "hd" ? text.hdChinese : "pixel"}
            onChange={(e) => (e.target.value === "pixel" ? changeText("pixel") : changeText("hd", e.target.value as TextStyle))}
          >
            <option value="pixel">{pt.looks.pixel}</option>
            {HD_CHINESE.map((f) => (
              <option key={f.id} value={f.id}>
                {pt.looks.hd} · {nm(f)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
  const speedField = <SpeedField pt={pt} speed={speed} onSpeed={setSpeed} />;
  const optionsPanel = (
    <div className="extras-grid">
      <table className="keys">
        <tbody>
          {dt.keys.map(([what, keys]) => (
            <tr key={what}>
              {/* (a note without keys spans the table, so it does not widen the first column) */}
              {keys ? (
                <>
                  <th>{what}</th>
                  <td>{keys}</td>
                </>
              ) : (
                <th colSpan={2}>{what}</th>
              )}
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
        <section className="dev-saves">
          <strong>{dt.saves.title}</strong>
          <p className="muted small">{dt.saves.hint}</p>
          {slotTimesNow.map((t, i) => (
            <div key={i} className="row">
              <span className="small">
                {dt.saves.slot(i + 1)}{lang === "zh" ? "：" : ": "}{t ? new Date(t).toLocaleString(lang === "zh" ? "zh-CN" : undefined) : <span className="muted">{dt.saves.empty}</span>}
              </span>
              <div className="spacer" />
              <button className="ghost" onClick={() => void saveState(i + 1)} disabled={status.kind !== "running"}>
                {dt.saves.save}
              </button>
              <button className="ghost" onClick={() => void loadState(i + 1)} disabled={!t}>
                {dt.saves.load}
              </button>
            </div>
          ))}
          <div className="row">
            <button className="ghost" onClick={() => void exportSaves()} title={dt.saves.exportTitle}>
              {dt.saves.export}
            </button>
            <label className="button ghost" title={dt.saves.importTitle}>
              {dt.saves.import}
              <input type="file" accept=".json,application/json" hidden onChange={(e) => (void importSaves(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
          </div>
        </section>
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
              className={effect !== "none" || hd ? "fx" : undefined}
              style={{ width: frameW * scale, height: frameH * scale }}
              aria-label={pt.gameScreen}
              {...hold.bind}
            />
            {hold.ring}
            {status.kind !== "running" && status.kind !== "error" && (
              <LoadingScreen
                compact
                title={game ? pt.loading.starting(game.name) : pt.loading.deviceOn}
                steps={phase.steps}
                current={phase.current}
                of={pt.loading.of}
                progressLabel={pt.loading.progress}
              />
            )}
            {status.kind === "error" && (
              <div className="crash" role="alert">
                <p>{status.message}</p>
                <div className="row">
                  {status.canGoOn && (
                    <button onClick={goOn} title={dt.goOnTitle}>
                      {dt.goOn}
                    </button>
                  )}
                  {status.canGoOn && (
                    <button className="ghost" onClick={restart} title={dt.restartTitle}>
                      {dt.restart}
                    </button>
                  )}
                  <button className="ghost" onClick={onExit}>
                    {pt.backToLibrary}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {chinese && (
          <form className="typing" onSubmit={sendTyped}>
            <label>
              <span>{dt.typing.label}</span>
              <input
              ref={typingBox}
              type="text"
              lang="zh-CN"
              autoComplete="off"
              placeholder={dt.typing.placeholder}
              enterKeyHint="send"
              // (an Enter that picks the input method's choice is not one that sends: Safari ends the choosing first)
              onKeyDown={(e) => e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229) && e.preventDefault()}
            />
            </label>
            <button type="submit">{dt.typing.send}</button>
            <p className="muted small">{dt.typing.hint}</p>
          </form>
        )}
        {showPad && <Keypad onDown={(k) => keyDown(PAD_KEYS.get(k)!)} onUp={(k) => keyUp(PAD_KEYS.get(k)!)} labels={pt.keys} />}
        {/* (the device's other keys some programs need: R, Space, 帮助, 删除, 查找, 插入) */}
        {showPad && <DeviceKeys keys={deviceKeys(lang)} onDown={keyDown} onUp={keyUp} label={pt.keys.more} names={lang === "en"} />}
      </div>

      {notice && (
        <div className="notice" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {debugOpen && deviceRef.current && (
        <DebugMenu
          cheats={kitRef.current}
          onChange={() => {}}
          device={<DeviceTools device={deviceRef.current.device} slots={slots.current} step={() => deviceRef.current?.device.machine.run(CPU_HZ / FPS)} />}
          onClose={() => setDebugOpen(false)}
        />
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
