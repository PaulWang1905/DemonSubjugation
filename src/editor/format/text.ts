// Layout helpers for text shown in the engine's fixed-width boxes.
// One Chinese character takes the space of two ASCII characters.
import { gbkBytes } from "../../engine/java";

/** Display width in half-width cells (ASCII = 1, CJK = 2). */
export function cells(s: string): number {
  return gbkBytes(s).length;
}

/**
 * Word-wrap `text` so that no word is split across the box's lines, by
 * padding each line with spaces. `widths` is the capacity of successive
 * lines (it repeats).
 */
export function wrapForBox(text: string, widths: number[]): string {
  const words = text.split(/(\s+)/).filter((w) => w.length && !/^\s+$/.test(w));
  const lines: string[] = [];
  let cur = "";
  const cap = () => widths[lines.length % widths.length];
  for (const w of words) {
    const candidate = cur ? cur + " " + w : w;
    if (cells(candidate) <= cap()) {
      cur = candidate;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
    }
    // a word longer than a line: hard-split it
    let word = w;
    while (cells(word) > cap()) {
      let cut = 0;
      while (cut < word.length && cells(word.slice(0, cut + 1)) <= cap()) cut++;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines
    .map((l, i) => (i === lines.length - 1 ? l : l + " ".repeat(widths[i % widths.length] - cells(l))))
    .join("");
}

/** SAY with a portrait: 11 then 15 half-width cells per page. */
export const SAY_WITH_PORTRAIT = [11, 15];
/** SAY without a portrait, or MESSAGE boxes. */
export const SAY_PLAIN = [15, 15];
export const MESSAGE_BOX = [16];
