// The editor's Problems dialog (the project check, shown before a playtest or
// an export when something would break the game) and its Help dialog
// (getting started and the keyboard shortcuts).
import { useEffect, useRef } from "react";
import { problemSummary, type Problem } from "../format/validate";
import { plainProblem } from "./plainWords";

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
                  <span className="msg">{plainProblem(p.message)}</span>
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
  ["Ctrl+P", "Go to any resource, or run a command (Ctrl+Shift+P: commands only)"],
  ["Ctrl+S", "Save now (in a script: apply it)"],
  ["Ctrl+Enter", "Playtest"],
  ["Ctrl+W or Alt+W", "Close the tab (the browser may keep Ctrl+W for itself)"],
  ["Ctrl+Tab or Alt+] Alt+[", "Next / previous tab"],
  ["Click · double-click", "In the sidebar: preview (the next click replaces it) · keep the tab open"],
  ["Ctrl+K or /", "Filter the sidebar (Enter opens the first, Esc clears)"],
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
        <strong>Start on the project home.</strong> It shows where the game starts and what to do next; <em>Guide me</em> makes a
        first game step by step. The <em>+</em> beside each group of the sidebar, and <em>Ctrl+P</em>, have wizards for a new map, a
        person who talks, a shop, and a monster or a battle.
      </li>
      <li>
        <strong>Maps</strong> open in their <em>World</em> view: paint tiles (painting also sets where the party can walk), and add
        people, chests, exits to other maps and tiles where something happens. Click anything to see what it does, drag it to move
        it; <em>Play from here</em> starts the game on a tile.
      </li>
      <li>
        <strong>What happens</strong> when the game starts, when the party talks to someone or steps on a tile is a list of steps in
        plain words, in the <em>Visual</em> view of the map's script: someone says a line, the player gets an item, if a story flag
        is set…, a battle. The <em>Text</em> view shows the same script as the engine reads it, for those who want it.
      </li>
      <li>
        <strong>Characters, monsters, items and spells</strong> are cards with their pictures and key numbers; <em>Used by</em>{" "}
        shows what refers to each one.
      </li>
      <li>
        <strong>Tables</strong> (spell lists, level tables) and every record's <em>Fields</em> show the numbers as stored; a number that
        points at another resource shows it, or “missing”.
      </li>
      <li>
        <strong>Art</strong>: tilesets, sprites, icons and pictures open in the pixel editor; <strong>animations</strong> are the
        effects of spells and items. The <em>+</em> beside each group of the sidebar makes a new one; <em>Ctrl+P</em> goes to
        anything.
      </li>
      <li>
        <strong>Playtest</strong> checks the project first and stops at anything that would break the game; <strong>Check</strong>{" "}
        lists it at any time. <strong>Export…</strong> downloads a .gam or a .lib. Projects are saved in this browser as you work:
        export to keep a copy.
      </li>
    </ol>
  );
}
