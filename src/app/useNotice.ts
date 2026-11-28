// A player's notice (a toast over the page, styles.css .notice): one at a
// time. A confirmation ("Saved to state 1.") closes by itself after a few
// seconds; a problem stays until it is clicked or the next notice replaces it.
import { useCallback, useEffect, useRef, useState } from "react";

/** How long a confirmation stays, in milliseconds. */
export const NOTICE_MS = 2500;

export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Show a notice that stays (null closes it). */
  const show = useCallback((msg: string | null) => {
    window.clearTimeout(timer.current);
    setNotice(msg);
  }, []);
  /** Show a notice that closes by itself. */
  const flash = useCallback((msg: string) => {
    window.clearTimeout(timer.current);
    setNotice(msg);
    timer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { notice, show, flash };
}
