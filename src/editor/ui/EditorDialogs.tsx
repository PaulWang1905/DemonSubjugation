// The editor's Problems dialog (the project check, shown before a playtest or
// an export when something would break the game) and its Help dialog
// (getting started and the keyboard shortcuts).
import { useEffect, useRef } from "react";
import { problemSummary, type Problem } from "../format/validate";

/** A modal <dialog> that opens when mounted. */
function Modal({ className, onClose, children }: { className: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className={`export-dialog ${className}`} onClose={onClose} onCancel={onClose}>
      {children}
    </dialog>
  );
}

interface ProblemsProps {
  problems: Problem[];
  /** "playtest" / "export": the action waiting for the check; null when just checking. */
  action: "playtest" | "export" | null;
  onGo: (p: Problem) => void;
  onProceed: () => void;
  onClose: () => void;
}

export function ProblemsDialog({ problems, action, onGo, onProceed, onClose }: ProblemsProps) {
  const errors = problems.filter((p) => p.level === "error");
  const sorted = [...errors, ...problems.filter((p) => p.level !== "error")];
  return (
    <Modal className="problems-dialog" onClose={onClose}>
      <form method="dialog" onSubmit={(e) => (e.preventDefault(), onProceed())}>
        <h2>{action ? (errors.length ? "Fix these first?" : "Check") : "Check the project"}</h2>
        <p className="muted small">
          {problemSummary(problems)}.{" "}
          {action && errors.length
            ? `The game is likely to stop at an error. Click one to open it, or ${action} anyway.`
            : problems.length
              ? "Errors are likely to stop the game; warnings show something other than meant. Click one to open it."
              : "Scripts, maps and forms refer only to resources that exist, and dialogue fits its boxes."}
        </p>
        {problems.length > 0 && (
          <ul className="problems">
            {sorted.map((p, i) => (
              <li key={i}>
                <button type="button" className={`problem ${p.level}`} onClick={() => onGo(p)} disabled={!p.key}>
                  <span className="lvl">{p.level === "error" ? "Error" : "Warning"}</span>
                  <span className="where">
                    {p.where}
                    {p.line ? ` · line ${p.line}` : ""}
                  </span>
                  <span className="msg">{p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <div className="spacer" />
          <button type="button" className={action ? "ghost" : undefined} onClick={onClose} autoFocus={!action}>
            {action ? "Cancel" : "Close"}
          </button>
          {action && (
            <button type="submit" className={errors.length ? "ghost danger" : undefined} autoFocus>
              {action === "playtest" ? "Playtest anyway" : "Export anyway"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** The editor's keyboard shortcuts. */
export const SHORTCUTS: [string, string][] = [
  ["Ctrl+S", "Save now (in a script: apply it)"],
  ["Ctrl+Enter", "Playtest"],
  ["Ctrl+K or /", "Filter the resources (Enter opens the first, Esc clears)"],
  ["Ctrl+Z · Ctrl+Y", "Undo · redo (maps, pictures, animations; text boxes have their own)"],
  ["B G W X E I", "Map tools: paint, fill, walkable, blocked, event, pick tile"],
  ["[ ]", "Previous / next tile (map) or frame (pictures)"],
  ["B G I · X", "Pixel tools: pen, fill, pick · swap black and white"],
  ["Tab", "In a script: indent"],
  ["?", "This help"],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal className="help-dialog" onClose={onClose}>
      <form method="dialog">
        <h2>Getting started</h2>
        <GettingStarted />
        <h3>Keyboard shortcuts</h3>
        <ShortcutTable />
        <div className="row">
          <div className="spacer" />
          <button autoFocus>Close</button>
        </div>
      </form>
    </Modal>
  );
}

export function ShortcutTable() {
  return (
    <table className="shortcuts">
      <tbody>
        {SHORTCUTS.map(([k, v]) => (
          <tr key={k}>
            <th>
              <kbd>{k}</kbd>
            </th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** How the parts of a game fit together, in a few steps. */
export function GettingStarted() {
  return (
    <ol className="getting-started">
      <li>
        <strong>Script 1-1 starts the game.</strong> Its first lines <code>loadmap</code> a map (and where the camera is) and{" "}
        <code>createactor</code> the hero. The reference beside the script lists every instruction; <em>Insert…</em> adds a dialogue, a
        choice, a battle, a shop or a chest.
      </li>
      <li>
        <strong>Maps</strong>: paint tiles, mark tiles walkable or blocked, and put <em>map events</em> on tiles. Map event N runs{" "}
        <code>.event N+40</code> of the script that loaded the map. Pointing at a tile shows its position and the lines to start the
        player or put an NPC there.
      </li>
      <li>
        <strong>Characters</strong>: party members, NPCs (placed with <code>createnpc id, …</code>; talking to one runs{" "}
        <code>.event id</code>), monsters (fought with <code>enterfight</code> or <code>initfight</code>) and objects such as chests (
        <code>createbox</code>).
      </li>
      <li>
        <strong>Items, Magic and Tables</strong> are forms. Number fields that point at another resource show it, or “missing”.
      </li>
      <li>
        <strong>Tilesets, Sprites and Pictures</strong> open in the pixel editor; <strong>Animations</strong> are the effects of
        spells and items. <em>+ Add…</em> makes new ones.
      </li>
      <li>
        <strong>Playtest</strong> checks the project first and stops at anything that would break the game; <strong>Check</strong>{" "}
        lists it at any time. <strong>Export…</strong> downloads a .gam or a .lib. Projects are saved in this browser as you work:
        export to keep a copy.
      </li>
    </ol>
  );
}
