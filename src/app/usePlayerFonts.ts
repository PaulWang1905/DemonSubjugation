// The fonts the FMJ React player's engine draws with: the bundled pixel
// fonts chosen for Chinese and for English (loaded when chosen), else the
// uploaded HZK16 / ASC16 files; and the fonts drawn for More text's 12 and
// 10 px cells (loaded the first time they are needed, in bold where the
// chosen font is bold at full size). Fonts chosen while playing are swapped
// into the running engine without restarting it.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Engine, SmallFonts } from "../engine";
import { boldSmallFonts, FONT_SETS, loadPixelFonts, loadSmallFonts, type FontSetId } from "./fonts";
import type { TextChoice } from "./textChoice";

export interface PlayerFonts {
  /** The full-size fonts now (null: the device's own, drawn by the engine). */
  pick: MutableRefObject<{ hzk16: Uint8Array | null; asc16: Uint8Array | null }>;
  /** The More text fonts now (null until loaded, or with More text off). */
  small: MutableRefObject<SmallFonts | null>;
  /**
   * Whether the engine may start: once the chosen fonts are loaded, so the
   * game does not open in another font. Stays true after that; later
   * changes are swapped in.
   */
  canStart: boolean;
  /** Whether the bold small fonts are used (for the note on where they come from). */
  boldSmall: boolean;
}

const isBold = (id: FontSetId | null) => !!id && !!FONT_SETS.find((f) => f.id === id)?.boldSmall;

export function usePlayerFonts(options: {
  text: TextChoice;
  /** Uploaded font files. */
  uploaded: { hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null };
  /** The text size More text asks for: 16 (off), 12 or 10. */
  textSize: 16 | 12 | 10;
  /** The engine, to swap fonts into while it runs. */
  engine: MutableRefObject<Engine | null>;
  onError: (message: string) => void;
}): PlayerFonts {
  const { text, uploaded, textSize, engine, onError } = options;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fail = (e: unknown) => onErrorRef.current(String((e as Error).message ?? e));

  // the bundled pixel fonts chosen ("original" is the uploaded files)
  const cjkSet: FontSetId | null = text.pixelChinese === "original" ? null : text.pixelChinese;
  const latinSet: FontSetId | null = text.pixelEnglish === "original" ? null : text.pixelEnglish;
  const wantKey = `${cjkSet ?? "-"}|${latinSet ?? "-"}`;
  const [bundled, setBundled] = useState<{ key: string; hzk16: Uint8Array; asc16: Uint8Array } | null>(null);
  useEffect(() => {
    if (!cjkSet && !latinSet) return;
    let alive = true;
    loadPixelFonts(cjkSet ?? latinSet!, latinSet ?? cjkSet!).then((f) => alive && setBundled({ key: wantKey, ...f }), (e) => alive && fail(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cjkSet, latinSet, wantKey]);
  const needBundled = !!(cjkSet || latinSet);
  const useBundled = needBundled && bundled?.key === wantKey;
  const pick = useMemo(
    () => ({
      hzk16: cjkSet && useBundled ? bundled!.hzk16 : uploaded.hzk16 ? new Uint8Array(uploaded.hzk16) : null,
      asc16: latinSet && useBundled ? bundled!.asc16 : uploaded.asc16 ? new Uint8Array(uploaded.asc16) : null,
    }),
    [cjkSet, latinSet, useBundled, bundled, uploaded],
  );
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // More text's fonts, in bold for the fonts that are bold at full size (Retro's Chinese, its letters)
  const [small, setSmall] = useState<SmallFonts | null>(null);
  useEffect(() => {
    if (textSize === 16 || small) return;
    let alive = true;
    loadSmallFonts().then((f) => alive && setSmall(f), (e) => alive && fail(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textSize, small]);
  const boldCjk = isBold(cjkSet), boldLatin = isBold(latinSet);
  const smallPick = useMemo(() => {
    if (!small || (!boldCjk && !boldLatin)) return small;
    const b = boldSmallFonts(small);
    return {
      hzk12: boldCjk ? b.hzk12 : small.hzk12,
      hzk10: boldCjk ? b.hzk10 : small.hzk10,
      asc12: boldLatin ? b.asc12 : small.asc12,
      asc10: boldLatin ? b.asc10 : small.asc10,
    };
  }, [small, boldCjk, boldLatin]);
  const smallRef = useRef(smallPick);
  smallRef.current = smallPick;

  // the first start waits for the chosen fonts
  const started = useRef(false);
  if ((!needBundled || useBundled) && (textSize === 16 || small)) started.current = true;

  // swap a new choice (or one just loaded) into the running engine
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setFonts(pick.hzk16, pick.asc16, smallPick);
    e.redraw();
  }, [engine, pick, smallPick]);

  return { pick: pickRef, small: smallRef, canStart: started.current, boldSmall: boldCjk || boldLatin };
}
