// How wide the tabs may be: each as wide as its name while they all fit;
// past that, the widest shrink to one width (the narrow ones keep theirs),
// down to a smallest width that still shows a readable part of the name,
// after which the strip scrolls and "⌄ N more" lists every open tab
// (TabStrip.tsx). Also the pure parts of that menu: which tabs are out of
// sight, moving through it with the keys, and jumping by first letter.

/** The smallest a tab gets: its icon, about ten letters of its name, the close button. */
export const TAB_MIN = 140;

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

/** A tab's span along the strip, or the strip's visible part (pixels, either frame). */
export interface Span {
  left: number;
  right: number;
}

/**
 * The tabs (by index) not wholly in view: scrolled past, or cut at either
 * end. A tab cut by less than `slack` pixels counts as in view.
 */
export function hiddenTabs(tabs: readonly Span[], view: Span, slack = 2): number[] {
  const out: number[] = [];
  tabs.forEach((t, i) => {
    if (t.left < view.left - slack || t.right > view.right + slack) out.push(i);
  });
  return out;
}

/** The overflow button's words: "⌄ 7 more". */
export function moreLabel(hidden: number): string {
  return `${hidden} more`;
}

/** Where a key moves the highlight in a menu of `count` items (null: the key does not move it). */
export function menuMove(at: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return at < 0 ? 0 : (at + 1) % count;
    case "ArrowUp":
      return at < 0 ? count - 1 : (at - 1 + count) % count;
    case "Home":
    case "PageUp":
      return 0;
    case "End":
    case "PageDown":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Type to jump: the next item after `at` whose name starts with `typed`
 * (letters typed in quick succession; case and spaces at the start ignored),
 * wrapping round; when a single letter is typed again, the next one with
 * that letter. -1 when none matches.
 */
export function typeAhead(names: readonly string[], at: number, typed: string): number {
  const q = typed.toLowerCase();
  if (!q || !names.length) return -1;
  const same = q.length > 1 && [...q].every((c) => c === q[0]);
  const want = same ? q[0] : q;
  // (a longer prefix may still match the current item; a single letter moves on)
  const start = want.length > 1 ? Math.max(0, at) : at + 1;
  for (let k = 0; k < names.length; k++) {
    const i = (start + k + names.length) % names.length;
    if (names[i].trim().toLowerCase().startsWith(want)) return i;
  }
  return -1;
}
