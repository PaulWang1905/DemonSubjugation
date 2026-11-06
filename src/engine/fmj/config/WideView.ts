// The wider map view: the device's 160x96 screen with more of the map drawn
// around it. The game itself still runs on 160x96 (same camera, scripts and
// events); the engine adds `mx` tile columns on each side and `my` tile rows
// above and below while the map is what the screen shows.
import type { Canvas } from "../../graphics";

/** Something drawn at (x, y) whose opaque pixels belong to the dialogue (the portrait). */
export interface DialogPart {
  /** The same for the same picture (to reuse its mask). */
  key: unknown;
  draw(canvas: Canvas, x: number, y: number): void;
  width: number;
  height: number;
  x: number;
  y: number;
}

export const WideView = {
  /** The game's screen canvas (set by the engine). */
  screen: null as Canvas | null,
  /** Extra tile columns on each side (0: the device's screen). */
  mx: 0,
  /** Extra tile rows above and below. */
  my: 0,
  /**
   * What last filled the game screen this frame: the map ("scene"), something
   * covering the whole screen ("cover": a battle, a picture), or nothing new
   * (null: the screen still shows what it did, so the view stays as it was).
   */
  last: null as "scene" | "cover" | null,
  /** A dialogue box (SAY) is on the map: it goes to the bottom of the wider view. */
  dialog: false,
  /** The top of the dialogue box (it runs from x 9 to 151 and down to the bottom). */
  dialogTop: 50,
  /** The speaker's portrait, which sticks out above the box. */
  dialogHead: null as DialogPart | null,
};
