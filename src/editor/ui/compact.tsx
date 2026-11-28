// BBK Maker on a small screen (a phone held either way, a tablet upright):
// the sidebar becomes a drawer that slides over the work area, and the bar
// above the tabs gets short: ☰ (the resources), the project's name, ▶ to
// playtest and ⋯ for the rest (Go to, Check, Export, Help, Projects).
// Larger screens keep the bar and the sidebar as they are (Editor.tsx).
// The layout itself is in layout.css (`.editor.compact`).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { itemKeys, usePopupMenu } from "./popupMenu";

/** When the editor uses its small-screen layout. */
export const COMPACT = "(max-width: 800px), (max-height: 500px) and (pointer: coarse)";

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(query);
    const ch = () => setOn(m.matches);
    ch();
    m.addEventListener("change", ch);
    return () => m.removeEventListener("change", ch);
  }, [query]);
  return on;
}

interface DrawerProps {
  compact: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The sidebar: in place on a larger screen; on a small one a drawer over the
 * work area (Escape, ✕ or a tap beside it closes it, and the focus goes back
 * to ☰). While it is open the rest of the editor is inert.
 */
export function SideDrawer({ compact, open, onClose, children }: DrawerProps) {
  const box = useRef<HTMLDivElement>(null);
  const shown = compact && open;
  useEffect(() => {
    if (!shown) return;
    // (the filter takes the focus unless something inside already has it)
    requestAnimationFrame(() => {
      if (!box.current?.contains(document.activeElement)) box.current?.querySelector<HTMLElement>(".e-side .item.sel, #res-filter")?.focus({ preventScroll: false });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // (an open "+" menu closes first)
      if (document.querySelector(".add-menu[role=menu]")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onClose]);
  if (!compact) return <>{children}</>;
  return (
    <>
      <div
        ref={box}
        className={`e-drawer${open ? " open" : ""}`}
        id="e-drawer"
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Resources"
        inert={!open}
      >
        <div className="e-drawer-head">
          <span className="e-drawer-title">Resources</span>
          <button type="button" className="ghost icon e-drawer-close" aria-label="Close the resources" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
      {open && <div className="e-scrim" aria-hidden="true" onClick={onClose} />}
    </>
  );
}

interface BarProps {
  name: string;
  onName: (name: string) => void;
  status: { text: string; kind: string } | null;
  problems: number;
  errors: number;
  drawer: boolean;
  onDrawer: () => void;
  onPlaytest: () => void;
  onGoto: () => void;
  onCheck: () => void;
  onExport: () => void;
  onHelp: () => void;
  onProjects: () => void;
  /** The ☰ button, to give the focus back to when the drawer closes. */
  drawerButton: React.RefObject<HTMLButtonElement | null>;
}

/** The bar above the tabs on a small screen. */
export function CompactBar(p: BarProps) {
  const m = usePopupMenu();
  const run = (f: () => void) => () => {
    m.close(false);
    f();
  };
  const item = (label: ReactNode, name: string, f: () => void, detail?: string, cls = "") => (
    <div role="menuitem" tabIndex={-1} data-name={name} className={`e-more-item ${cls}`} onClick={run(f)} onKeyDown={itemKeys(run(f))}>
      <span className="e-more-label">{label}</span>
      {detail && <span className="e-more-detail">{detail}</span>}
    </div>
  );
  return (
    <div className="editor-bar e-cbar">
      <button
        ref={p.drawerButton}
        type="button"
        className="ghost icon e-cbar-side"
        aria-label="Resources"
        aria-expanded={p.drawer}
        aria-controls="e-drawer"
        title="The project's resources (Ctrl+K)"
        onClick={p.onDrawer}
      >
        <svg viewBox="0 0 18 14" width="18" height="14" aria-hidden="true">
          <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input className="proj-name" value={p.name} aria-label="Project name" onChange={(e) => p.onName(e.target.value)} />
      <button type="button" className="e-cbar-play" onClick={p.onPlaytest} aria-label="Playtest" title="Check and run this project">
        <span aria-hidden="true">▶</span>
        <span className="e-cbar-play-text">Playtest</span>
      </button>
      <button
        ref={m.button}
        type="button"
        className={`ghost icon e-cbar-more ${p.errors ? "has-errors" : p.problems ? "has-warnings" : ""}`}
        aria-haspopup="menu"
        aria-expanded={m.open}
        aria-controls={m.open ? "e-more-menu" : undefined}
        aria-label={`More${p.problems ? ` (${p.problems} problem${p.problems === 1 ? "" : "s"})` : ""}`}
        onClick={m.toggle}
      >
        ⋯{p.problems > 0 && <span className="e-cbar-dot" aria-hidden="true" />}
      </button>
      {m.open && (
        <div ref={m.menu} id="e-more-menu" className="e-tabs-menu e-more-menu" role="menu" aria-label="More" style={m.style} onKeyDown={m.onKeyDown}>
          {p.status && (
            <p className={`e-more-status small ${p.status.kind}`} role="status">
              {p.status.text}
            </p>
          )}
          {item("Go to…", "Go to", p.onGoto, "a resource or a command")}
          {item(
            <>
              {p.problems ? "⚠" : "✓"} Check
            </>,
            "Check",
            p.onCheck,
            p.problems ? `${p.problems} problem${p.problems === 1 ? "" : "s"}` : "no problems",
            p.errors ? "has-errors" : p.problems ? "has-warnings" : "",
          )}
          {item("Export…", "Export", p.onExport, "download a .gam or a .lib")}
          {item("Help", "Help", p.onHelp, "getting started, shortcuts")}
          {item("← Projects", "Projects", p.onProjects, "all your projects")}
        </div>
      )}
    </div>
  );
}
