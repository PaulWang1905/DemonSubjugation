// More of the 4988's keys for touch screens, in a row under the on-screen
// keypad: some programs need R, Space, or the keys printed beside the arrows
// and 中英符 (删除 delete, 修改 modify, 查找 search, 插入 insert, 帮助 help),
// which a phone has no keyboard for. Those are pressed as on the device:
// Shift, then the key they are printed beside (DeviceInput). A key is held
// while the finger is down, like the keypad's.
import { useEffect, useRef, useState } from "react";
import { Key, keyCode, SECOND, type Press } from "../bbk/keys";

export interface DeviceKey {
  press: Press;
  /** What the key says on the device (or the letter). */
  label: string;
  /** Its name in the site's language, for screen readers and under the label. */
  name: string;
}

/** The keys in the row, in the site's language. */
export function deviceKeys(lang: "en" | "zh"): DeviceKey[] {
  const en = lang === "en";
  return [
    { press: keyCode("R"), label: "R", name: "R" },
    { press: Key.space, label: en ? "Space" : "空格", name: en ? "Space" : "空格" },
    { press: SECOND.help, label: "帮助", name: en ? "Help" : "帮助" },
    { press: SECOND.del, label: "删除", name: en ? "Delete" : "删除" },
    { press: SECOND.modify, label: "修改", name: en ? "Modify" : "修改" },
    { press: SECOND.search, label: "查找", name: en ? "Search" : "查找" },
    { press: SECOND.insert, label: "插入", name: en ? "Insert" : "插入" },
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
  onDown: (p: Press) => void;
  onUp: (p: Press) => void;
  /** The row's name, for screen readers. */
  label: string;
  /** Show each key's name under its label (when the labels are not in the site's language). */
  names?: boolean;
}

export function DeviceKeys({ keys, onDown, onUp, label, names }: Props) {
  /** The key (its place in the row) each finger holds. */
  const pointers = useRef(new Map<number, number>());
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const cb = useRef({ onDown, onUp, keys });
  cb.current = { onDown, onUp, keys };

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
      for (const i of pointers.current.values()) cb.current.onUp(cb.current.keys[i].press);
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
    const i = pointers.current.get(id);
    if (i === undefined) return;
    pointers.current.delete(id);
    setHeld(new Set(pointers.current.values()));
    cb.current.onUp(cb.current.keys[i].press);
  };

  return (
    <div className="kp-more" ref={root} role="group" aria-label={label}>
      {keys.map((k, i) => (
        <button
          key={k.label}
          type="button"
          className="kp-key"
          aria-label={k.name}
          data-held={held.has(i) || undefined}
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              /* (no such pointer: the key still goes down) */
            }
            pointers.current.set(e.pointerId, i);
            setHeld(new Set(pointers.current.values()));
            buzz();
            cb.current.onDown(k.press);
          }}
          onPointerUp={(e) => release(e.pointerId)}
          onPointerCancel={(e) => release(e.pointerId)}
          onContextMenu={(e) => e.preventDefault()}
          // (keyboard users and screen readers clicking the key)
          onClick={(e) => {
            if (e.detail === 0) {
              cb.current.onDown(k.press);
              cb.current.onUp(k.press);
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
