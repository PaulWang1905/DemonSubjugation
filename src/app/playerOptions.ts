// The player's speeds and map views: in a module of their own so the site's
// texts (siteText.ts, playerText.ts) can state them without the player's
// React code (playerShell.tsx re-exports them).

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 3, 4];

/** The map view: the device's 9 × 6 tiles, or `mx` more tile columns on each side and `my` rows above and below. */
export type MapView = "normal" | "wide" | "widest";
export const MAP_VIEWS: Record<MapView, { mx: number; my: number }> = {
  normal: { mx: 0, my: 0 },
  wide: { mx: 2, my: 1 },
  widest: { mx: 4, my: 2 },
};
export const mapViewOf = (v: string): MapView => (v === "wide" || v === "widest" ? v : "normal");
/** A map view's size in tiles, as text ("13 × 8"; `sep` between the numbers). */
export const mapTiles = (v: MapView, sep = " × ") => `${9 + 2 * MAP_VIEWS[v].mx}${sep}${6 + 2 * MAP_VIEWS[v].my}`;
