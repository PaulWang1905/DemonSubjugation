// Long work done a slice at a time, with the browser painting in between,
// so a loading screen shows at once and keeps moving.

/** Wait until the browser has painted (or 100 ms, in a hidden tab, where frames do not come). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => afterPaint(resolve));
}

/** Run `run` once the browser has painted (or after 100 ms); returns a function that cancels it. */
export function afterPaint(run: () => void): () => void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    run();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frames = typeof requestAnimationFrame === "function";
  if (frames) requestAnimationFrame(() => (timer = setTimeout(go, 0)));
  // (no frames at all outside a browser: go on at once)
  const fallback = setTimeout(go, frames ? 100 : 0);
  return () => {
    done = true;
    clearTimeout(timer);
    clearTimeout(fallback);
  };
}

/** Thrown when what the work was for has gone (a newer start, the page left). */
export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * Run a generator to its end, about `budget` ms at a time with a painted
 * frame between slices; `progress` gets how many steps it has made after
 * each slice. Throws Cancelled once `alive` is false.
 */
export async function inSlices<T>(
  steps: Generator<void, T>,
  { alive, progress, budget = 14 }: { alive: () => boolean; progress?: (steps: number) => void; budget?: number },
): Promise<T> {
  let n = 0;
  for (;;) {
    const start = performance.now();
    do {
      const r = steps.next();
      if (r.done) {
        progress?.(n);
        return r.value;
      }
      n++;
    } while (performance.now() - start < budget);
    progress?.(n);
    await nextFrame();
    if (!alive()) throw new Cancelled();
  }
}
