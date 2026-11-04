// Engine options that are not part of the original fmj.kt port.
export const EngineSettings = {
  /**
   * Use the physical-damage formula recovered from the original BBK engine
   * (as implemented in the erduoniba/baye-fmj-app fork) instead of fmj.kt's
   * simplified one.
   */
  originalDamageFormula: true,
  // Test switches for the player's debug menu (off in normal play).
  /** No random encounters while walking. */
  noRandomBattles: false,
  /** The player may walk onto blocked tiles (not through characters). */
  walkThroughWalls: false,
  /** Refill the party's HP and MP every tick. */
  alwaysFull: false,
};
