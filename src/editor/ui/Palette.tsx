// The command palette (Ctrl+P): go to any resource by number, name or kind,
// or run a command; recently used first. Arrow keys move, Enter runs, Esc
// closes. A query starting with ">" lists commands only.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rankPalette, type PaletteItem } from "./workspace";
import { useShowModal } from "./useShowModal";

export interface PaletteCommand {
  id: string;
  label: string;
  /** A shortcut or a hint shown beside it. */
  detail?: string;
  keywords?: string;
  run: () => void;
}

interface Props {
  resources: PaletteItem[];
  commands: PaletteCommand[];
  recents: readonly string[];
  /** The text to start with (">" for commands). */
  initial?: string;
  onOpenResource: (key: string) => void;
  /** Called with the item's id after it ran. */
  onUsed: (id: string) => void;
  onClose: () => void;
}

const MAX = 60;

export function Palette({ resources, commands, recents, initial = "", onOpenResource, onUsed, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState(initial);
  const [sel, setSel] = useState(0);
  const uid = useId();
  useShowModal(dialog);

  const cmdItems = useMemo<PaletteItem[]>(
    () => commands.map((c) => ({ id: `cmd:${c.id}`, label: c.label, detail: c.detail ?? "command", keywords: `command ${c.keywords ?? ""}`, kind: "command" })),
    [commands],
  );
  const onlyCommands = q.trimStart().startsWith(">");
  const query = onlyCommands ? q.trimStart().slice(1) : q;
  const ranked = useMemo(() => rankPalette(onlyCommands ? cmdItems : [...cmdItems, ...resources], query, recents), [cmdItems, resources, query, onlyCommands, recents]);
  const shown = ranked.slice(0, MAX);
  const current = Math.min(sel, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, q]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    dialog.current?.close();
    onClose();
    onUsed(item.id);
    if (item.kind === "resource") onOpenResource(item.id.slice(4));
    else commands.find((c) => `cmd:${c.id}` === item.id)?.run();
  };

  const optId = (i: number) => `${uid}-opt-${i}`;
  const recentSet = new Set(recents);
  return (
    <dialog ref={dialog} className="palette-dialog" onClose={onClose} onCancel={onClose} aria-label="Go to a resource or run a command" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <div className="palette">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          aria-activedescendant={shown.length ? optId(current) : undefined}
          aria-label="Go to a resource or run a command"
          placeholder="Go to a map, script, character… (type > for commands)"
          value={q}
          spellCheck={false}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((current + 1) % Math.max(1, shown.length));
            else if (e.key === "ArrowUp") setSel((current - 1 + shown.length) % Math.max(1, shown.length));
            else if (e.key === "PageDown") setSel(Math.min(shown.length - 1, current + 8));
            else if (e.key === "PageUp") setSel(Math.max(0, current - 8));
            else if (e.key === "Enter") run(shown[current]);
            else return;
            e.preventDefault();
          }}
        />
        <ul id={`${uid}-list`} role="listbox" aria-label="Results" ref={listRef}>
          {shown.map((item, i) => (
            <li
              key={item.id}
              id={optId(i)}
              role="option"
              aria-selected={i === current}
              className={`${i === current ? "on" : ""} ${item.kind}`}
              onMouseMove={() => i !== current && setSel(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item)}
            >
              <span className="p-label">{item.label}</span>
              {!q && recentSet.has(item.id) && <span className="p-recent">recent</span>}
              <span className="p-detail">{item.detail}</span>
            </li>
          ))}
          {!shown.length && (
            <li className="p-none" role="presentation">
              Nothing matches “{query.trim()}”.
            </li>
          )}
        </ul>
        <p className="palette-foot small muted" aria-hidden="true">
          <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close · <kbd>&gt;</kbd> commands only
          {ranked.length > MAX ? ` · ${ranked.length - MAX} more: type to narrow` : ""}
        </p>
      </div>
    </dialog>
  );
}
