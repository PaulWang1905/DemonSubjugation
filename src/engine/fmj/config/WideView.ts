// The wider map view: the device's 160x96 screen with more of the map drawn
// around it. The game itself still runs on 160x96 (same camera, scripts and
// events); the engine adds `mx` tile columns on each side and `my` tile rows
// above and below while the map is what the screen shows.
import type { Canvas } from "../../graphics";

export const WideView = {
  /** The game's screen canvas (set by the engine). */
  screen: null as Canvas | null,
  /** Extra tile columns on each side (0: the device's screen). */
  mx: 0,
  /** Extra tile rows above and below. */
  my: 0,
  /** This frame drew the map onto the game screen... */
  sceneDrawn: false,
  /** ...and something then covered the whole screen (a battle, a picture). */
  covered: false,
};
