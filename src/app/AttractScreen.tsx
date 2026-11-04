import { useEffect, useRef } from "react";
import { createEngine, Keys, SCREEN_HEIGHT, SCREEN_WIDTH, TICK_MS, type Engine, type EngineKey } from "../engine";
import type { SaveStorage } from "../engine/java";
import { createDeviceFont } from "./deviceFont";
import { demoArchive } from "./demoGame";
import { applyPalette, PALETTES } from "./palettes";

/** Ticks after boot at which the attract loop presses OK, then starts walking. */
const OK_PRESSES = [120, 150, 190, 235, 280, 325, 370, 415, 460, 505, 550];
const WALK_FROM = 600;
const WALK: [EngineKey, number][] = [
  [Keys.RIGHT, 28],
  [Keys.DOWN, 18],
  [Keys.LEFT, 40],
  [Keys.UP, 18],
  [Keys.RIGHT, 12],
];
const REBOOT_AT = 1500; // one minute

function memorySaves(): SaveStorage {
  const m = new Map<string, string>();
  return { get: (p) => m.get(p) ?? null, set: (p, v) => (v == null ? m.delete(p) : m.set(p, v)), has: (p) => m.has(p) };
}

/**
 * The built-in demo playing itself, for the launch page. It pauses while
 * off screen or in a background tab, and shows a still title screen for
 * people who prefer reduced motion.
 */
export function AttractScreen({ onError }: { onError?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const palette = PALETTES.find((p) => p.id === "lcd") ?? PALETTES[0];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let engine: Engine | null = null;
    let t = 0;
    let held: EngineKey | null = null;
    let visible = true;
    let raf = 0;
    let stopped = false;

    const boot = () => {
      engine = createEngine({ resources: { datLib: demoArchive() }, saves: memorySaves(), fontFallback: createDeviceFont(), uiLanguage: "en" });
      t = 0;
      held = null;
    };
    const paint = () => {
      applyPalette(engine!.render(), image.data, palette);
      ctx.putImageData(image, 0, 0);
    };
    const step = () => {
      const e = engine!;
      if (OK_PRESSES.includes(t)) e.keyDown(Keys.ENTER);
      if (OK_PRESSES.includes(t - 1)) e.keyUp(Keys.ENTER);
      if (t >= WALK_FROM) {
        const cycle = WALK.reduce((a, [, n]) => a + n, 0);
        let at = (t - WALK_FROM) % cycle;
        let key = WALK[0][0];
        for (const [k, n] of WALK) {
          if (at < n) {
            key = k;
            break;
          }
          at -= n;
        }
        if (key !== held) {
          if (held !== null) e.keyUp(held);
          e.keyDown(key);
          held = key;
        }
      }
      e.update(TICK_MS);
      if (++t >= REBOOT_AT) boot();
    };

    try {
      boot();
      if (still) {
        // stop on the title screen
        for (let i = 0; i < 100; i++) step();
        paint();
        return;
      }
    } catch {
      onError?.();
      return;
    }

    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      if (stopped) return;
      if (visible && !document.hidden) {
        acc += Math.min(now - last, 200);
        try {
          while (acc >= TICK_MS) {
            step();
            acc -= TICK_MS;
          }
          paint();
        } catch {
          stopped = true;
          onError?.();
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(c);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [onError]);

  return <canvas ref={canvas} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} aria-label="The Lantern Path demo playing itself" />;
}
