// More of the 4988's own keys for touch screens, in a row under the on-screen
// keypad: some programs need R, Space, 帮助 (help), 删除 (delete), 查找
// (search) or 插入 (insert), which a phone has no keyboard for. Each key is
// held while the finger is down, like the keypad's (the player repeats it).
import { useEffect, useRef, useState } from "react";
import { Key, keyCode } from "../bbk/keys";

export interface DeviceKey {
  code: number;
  /** What the key says on the device (or the letter). */
  label: string;
  /** Its name in the site's language, for screen readers and under the label. */
  name: string;
}

/** The keys in the row, in the site's language. */
export function deviceKeys(lang: "en" | "zh"): DeviceKey[] {
  const en = lang === "en";
  return [
    { code: keyCode("R"), label: "R", name: "R" },
    { code: Key.space, label: en ? "Space" : "空格", name: en ? "Space" : "空格" },
    { code: Key.help, label: "帮助", name: en ? "Help" : "帮助" },
    { code: Key.del, label: "删除", name: en ? "Delete" : "删除" },
    { code: Key.search, label: "查找", name: en ? "Search" : "查找" },
    { code: Key.insert, label: "插入", name: en ? "Insert" : "插入" },
  ];
}

const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not allowed */
  }
};

interface Props {
  keys: DeviceKey[];
  onDown: (code: number) => void;
  onUp: (code: number) => void;
  /** The row's name, for screen readers. */
  label: string;
  /** Show each key's name under its label (when the labels are not in the site's language). */
  names?: boolean;
}

export function DeviceKeys({ keys, onDown, onUp, label, names }: Props) {
  const pointers = useRef(new Map<number, number>());
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const cb = useRef({ onDown, onUp });
  cb.current = { onDown, onUp };

  // (no text selection, callout, double-tap zoom or tap flash on the row; React's touch listeners are passive)
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  // let go of every key when unmounted or when the page is hidden
  useEffect(() => {
    const releaseAll = () => {
      for (const k of pointers.current.values()) cb.current.onUp(k);
      pointers.current.clear();
      setHeld(new Set());
    };
    const vis = () => document.hidden && releaseAll();
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", vis);
      releaseAll();
    };
  }, []);

  const release = (id: number) => {
    const k = pointers.current.get(id);
    if (k === undefined) return;
    pointers.current.delete(id);
    setHeld(new Set(pointers.current.values()));
    cb.current.onUp(k);
  };

  return (
    <div className="kp-more" ref={root} role="group" aria-label={label}>
      {keys.map((k) => (
        <button
          key={k.code}
          type="button"
          className="kp-key"
          aria-label={k.name}
          data-held={held.has(k.code) || undefined}
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              /* (no such pointer: the key still goes down) */
            }
            pointers.current.set(e.pointerId, k.code);
            setHeld(new Set(pointers.current.values()));
            buzz();
            cb.current.onDown(k.code);
          }}
          onPointerUp={(e) => release(e.pointerId)}
          onPointerCancel={(e) => release(e.pointerId)}
          onContextMenu={(e) => e.preventDefault()}
          // (keyboard users and screen readers clicking the key)
          onClick={(e) => {
            if (e.detail === 0) {
              cb.current.onDown(k.code);
              cb.current.onUp(k.code);
            }
          }}
        >
          <span>{k.label}</span>
          {names && k.name !== k.label && <small>{k.name}</small>}
        </button>
      ))}
    </div>
  );
}
