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
 *
 * Every line but the last keeps at least one space at its end, so the words
 * either side of a break are always apart: the player lays text out again
 * for other boxes (no portrait, the wider map views, More text, HD text), and
 * a line filled to the last cell would run into the next word there.
 */
export function wrapForBox(text: string, widths: number[], padLast = false): string {
  const widest = Math.max(...widths);
  // a hyphenated word too long for any line may break after its hyphens
  // ("great-" / "grandfather"); `glued` parts follow the previous without a space
  const words: { w: string; glued: boolean }[] = [];
  for (const w of text.split(/\s+/).filter((x) => x.length)) {
    if (cells(w) < widest || !w.includes("-")) words.push({ w, glued: false });
    else w.split(/(?<=-)/).forEach((part, i) => words.push({ w: part, glued: i > 0 }));
  }
  const lines: string[] = [];
  let cur = "";
  const cap = () => widths[lines.length % widths.length];
  for (const { w, glued } of words) {
    const candidate = cur ? cur + (glued ? "" : " ") + w : w;
    if (cells(candidate) < cap()) {
      cur = candidate;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
    }
    // a word that would fill this line to the last cell goes to a wider line
    // (this one is left blank), so a space can follow it
    let word = w;
    let guard = widths.length;
    while (cells(word) >= cap() && cells(word) < widest && guard-- > 0) lines.push("");
    // a word longer than any line: hard-split it
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
    .map((l, i) => (i === lines.length - 1 && !padLast ? l : l + " ".repeat(Math.max(0, widths[i % widths.length] - cells(l)))))
    .join("");
}

/** SAY with a portrait: 11 then 15 half-width cells per page. */
export const SAY_WITH_PORTRAIT = [11, 15];
/** SAY without a portrait, or MESSAGE boxes. */
export const SAY_PLAIN = [15, 15];
/**
 * MESSAGE boxes: 15 letters a line (the device fits 8 Chinese characters,
 * 16 bytes, but only 15 letters). The box's height is worked out from the
 * text's length in 16-byte lines, so English messages pad their last line
 * too (see wrapMessage) to always get a line for every line of text.
 */
export const MESSAGE_BOX = [15];

/** A MESSAGE box's text: wrapped at 15 letters, the last line padded. */
export function wrapMessage(text: string): string {
  return wrapForBox(text, MESSAGE_BOX, true);
}
