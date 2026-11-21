// How wide the tabs may be: each as wide as its name while they all fit;
// past that, the widest shrink to one width (the narrow ones keep theirs),
// down to a smallest width, after which the strip scrolls.

/** The smallest a tab gets (icon, a few letters, the close button). */
export const TAB_MIN = 84;

/**
 * The widest a tab may be so that tabs of these natural widths fill `room`
 * (null: they fit as they are). Never below TAB_MIN.
 */
export function tabCap(natural: readonly number[], room: number): number | null {
  const sum = natural.reduce((s, w) => s + w, 0);
  if (sum <= room) return null;
  const sorted = [...natural].sort((a, b) => a - b);
  let left = room;
  for (let i = 0; i < sorted.length; i++) {
    const rest = sorted.length - i;
    if (sorted[i] * rest > left) return Math.max(TAB_MIN, Math.floor(left / rest));
    left -= sorted[i];
  }
  return null;
}
