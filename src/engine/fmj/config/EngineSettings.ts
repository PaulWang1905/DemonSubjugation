// Engine options that are not part of the original fmj.kt port.
export const EngineSettings = {
  /**
   * Use the physical-damage formula recovered from the original BBK engine
   * (as implemented in the erduoniba/baye-fmj-app fork) instead of fmj.kt's
   * simplified one.
   */
  originalDamageFormula: true,
  /**
   * Experimental: the text cell size dialogue, message boxes, script menus
   * and descriptions use. 16 is the device's; 12 and 10 fit more text in.
   */
  textSize: 16 as 16 | 12 | 10,
  // Test switches for the player's debug menu (off in normal play).
  /** No random encounters while walking. */
  noRandomBattles: false,
  /** The player may walk onto blocked tiles (not through characters). */
  walkThroughWalls: false,
  /** Refill the party's HP and MP every tick. */
  alwaysFull: false,
};
