// Key presses for the emulated 4988, from the computer's keyboard and the
// on-screen keys alike: what each press sends to the device, how a held key
// repeats, and what letting it go takes back.
//
// A key printed beside another (删除, 修改, 查找, 插入, 帮助, Caps) is that key
// after Shift, as a person presses it on the device: Shift, then the key. The
// OS's GUI keeps Shift as a latch (its keyboard state at $2B27, bit 5), so if
// the latch is already set (and nothing is still to be read before the key),
// the key alone gives its second meaning: a second Shift would clear it.
import { Key, type Press } from "../bbk/keys";
import { REPEAT_DELAY, REPEAT_RATE } from "./keyRepeat";

/** Held keys repeat after REPEAT_DELAY ms, then every REPEAT_RATE ms, as in FMJ React's player (keyRepeat.ts). */
export { REPEAT_DELAY, REPEAT_RATE };
/** The keys that repeat while held: the arrows and the page keys. */
const REPEATS = new Set<number>([Key.up, Key.down, Key.left, Key.right, Key.pageUp, Key.pageDown]);
/** The GUI's keyboard state, and its Shift latch. */
const KEYBOARD_STATE = 0x2b27, LATCH = 0x20;

/** Whether the GUI keeps its Shift latch (the next key gives its second meaning), on the firmware and on Fulu alike. */
export const shiftLatched = (ram: Uint8Array): boolean => (ram[KEYBOARD_STATE] & LATCH) !== 0;

/** What DeviceInput needs of a device (the firmware's or Fulu's). */
export interface InputDevice {
  press(key: number): void;
  readonly machine: { readonly ram: Uint8Array; keysWaiting(): boolean; dropKey(code: number): void };
}

export interface Timers {
  set(f: () => void, ms: number): number;
  clear(t: number): void;
}

const browserTimers: Timers = { set: (f, ms) => window.setTimeout(f, ms), clear: (t) => window.clearTimeout(t) };

/** A press's identity while held: the key's code, or its second meaning's (above 255). */
const idOf = (p: Press): number => (typeof p === "number" ? p : 0x100 | p.second);

export class DeviceInput {
  /** The keys held, with their repeat timers (0: none). */
  private readonly held = new Map<number, { press: Press; timer: number }>();
  /** Held keys that have repeated. */
  private readonly repeated = new Set<number>();

  /**
   * @param device the device the keys go to (none: they are ignored)
   * @param accepts whether a key may be pressed now (the player ignores keys while paused, and the system keys on Fulu)
   */
  constructor(
    private readonly device: () => InputDevice | null | undefined,
    private readonly accepts: (key: number) => boolean = () => true,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** Whether a key (or a second meaning) is held. */
  isHeld(p: Press): boolean {
    return this.held.has(idOf(p));
  }

  /** A key goes down: it is pressed at once (a tap's press is always kept), and an arrow or page key repeats while held. */
  down(p: Press): void {
    const id = idOf(p);
    const d = this.device();
    if (this.held.has(id) || !d) return;
    if (typeof p === "number") {
      if (!this.accepts(p)) return;
      d.press(p);
      this.held.set(id, { press: p, timer: REPEATS.has(p) ? this.timers.set(() => this.repeat(p), REPEAT_DELAY) : 0 });
      return;
    }
    if (!this.accepts(Key.shift) || !this.accepts(p.second)) return;
    const m = d.machine;
    if (!(m.ram[KEYBOARD_STATE] & LATCH) || m.keysWaiting()) d.press(Key.shift);
    d.press(p.second);
    this.held.set(id, { press: p, timer: 0 });
  }

  /**
   * A held key repeats only once the program has read the last press, so
   * that repeats do not pile up while it is busy (a walk would go on after
   * the key is let go).
   */
  private repeat(k: number): void {
    const h = this.held.get(k);
    if (!h) return;
    const d = this.device();
    if (d && !d.machine.keysWaiting()) {
      d.press(k);
      this.repeated.add(k);
    }
    h.timer = this.timers.set(() => this.repeat(k), REPEAT_RATE);
  }

  /** A key goes up: a held key's repeats not read yet are taken back, so a walk stops when it is let go (a tap's one press stays). */
  up(p: Press): void {
    const id = idOf(p);
    const h = this.held.get(id);
    if (!h) return;
    if (h.timer) this.timers.clear(h.timer);
    this.held.delete(id);
    if (typeof p === "number" && this.repeated.delete(p)) this.device()?.machine.dropKey(p);
  }

  /** Let go of every key (the page is hidden, the debug menu opens, the player closes). */
  releaseAll(): void {
    for (const { press } of [...this.held.values()]) this.up(press);
  }
}
