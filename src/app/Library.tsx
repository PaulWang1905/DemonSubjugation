import { useCallback, useRef, useState } from "react";
import type { StoredGame } from "../storage/db";
import { AttractScreen } from "./AttractScreen";
import type { Imported } from "./importFiles";
import { RemoteAdd } from "./RemoteAdd";

interface Props {
  games: StoredGame[];
  fonts: { HZK16: boolean; ASC16: boolean };
  persistent: boolean;
  busy: boolean;
  messages: string[];
  onImport: (files: File[]) => Promise<void> | void;
  onPlay: (g: StoredGame) => void;
  onPlayDemo: () => void;
  onOpenEditor: () => void;
  onDelete: (g: StoredGame) => void;
}

function size(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function added(t: number): string {
  try {
    return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function Library({ games, fonts, persistent, busy, messages, onImport, onPlay, onPlayDemo, onOpenEditor, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(true);
  const hidePreview = useCallback(() => setPreview(false), []);
  const choose = () => input.current?.click();

  return (
    <div
      className="library"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onImport([...e.dataTransfer.files]);
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onImport([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">BBK electronic-dictionary RPG engine</p>
          <h1>Play and make pocket RPGs in your browser.</h1>
          <p className="lead">
            The engine behind 伏魔记 and the many community games made for it, rebuilt for the web. Open a game archive you
            own, or build your own with the editor.
          </p>
          <div className="cta">
            <button className="big" onClick={onPlayDemo}>
              ▶ Play the demo
            </button>
            <button className="big ghost" onClick={choose} disabled={busy}>
              Open a game file…
            </button>
            <button className="big ghost" onClick={onOpenEditor}>
              Make a game →
            </button>
          </div>
          <p className="fine">No game data included · your files never leave this browser</p>
        </div>
        {preview && (
          <figure className="hero-screen">
            <div className="device">
              <div className="device-screen">
                <AttractScreen onError={hidePreview} />
              </div>
              <div className="device-keys" aria-hidden="true">
                <span className="dpad" />
                <span className="ab">
                  <i />
                  <i />
                </span>
              </div>
            </div>
            <figcaption>
              <em>Lantern Path</em>, the built-in demo, playing itself.
            </figcaption>
          </figure>
        )}
      </section>

      {(busy || messages.length > 0) && (
        <section className="notice" role="status">
          {busy && <p>Reading files…</p>}
          {messages.length > 0 && (
            <ul>
              {messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <RemoteAdd busy={busy} onImport={onImport} />

      <section className="shelf">
        <div className="shelf-head">
          <h2>Your games</h2>
          <span className="muted small">Drop .lib files anywhere on this page</span>
        </div>
        <ul className="cards">
          <li className="card demo">
            <div className="card-art" aria-hidden="true">
              <span>LANTERN PATH</span>
            </div>
            <div className="card-body">
              <strong>Lantern Path</strong>
              <span className="muted small">Built-in demo</span>
            </div>
            <div className="card-actions">
              <button onClick={onPlayDemo}>Play</button>
            </div>
          </li>
          {games.map((g) => (
            <li key={g.id} className="card">
              <div className="card-art" aria-hidden="true">
                <span>{g.name}</span>
              </div>
              <div className="card-body">
                <strong title={g.name}>{g.name}</strong>
                <span className="muted small" title={g.fileName}>
                  {g.fileName} · {size(g.size)}
                  {g.addedAt ? ` · ${added(g.addedAt)}` : ""}
                </span>
              </div>
              <div className="card-actions">
                <button onClick={() => onPlay(g)}>Play</button>
                <button className="ghost danger" onClick={() => onDelete(g)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
          <li className="card add">
            <button className="add-btn" onClick={choose} disabled={busy}>
              <span className="plus" aria-hidden="true">
                +
              </span>
              <strong>Add a game</strong>
              <span className="muted small">
                <code>DAT.LIB</code> or any <code>*.lib</code>
              </span>
            </button>
          </li>
        </ul>
        <div className="fonts-line">
          <span className="muted small">Original bitmap fonts (optional):</span>
          <span className={`chip ${fonts.HZK16 ? "ok" : "soft"}`}>{fonts.HZK16 ? "✓ HZK16" : "HZK16"}</span>
          <span className={`chip ${fonts.ASC16 ? "ok" : "soft"}`}>{fonts.ASC16 ? "✓ ASC16" : "ASC16"}</span>
          <span className="muted small">
            {fonts.HZK16 && fonts.ASC16 ? "Games use the original fonts." : "Without them, text uses your device's fonts. Drop the files here to add them."}
          </span>
        </div>
        {!persistent && <p className="muted small">Browser storage is unavailable, so imported files last for this tab only.</p>}
      </section>

      <section className="features">
        <article>
          <span className="feat-icon" aria-hidden="true">
            ▶
          </span>
          <h3>Play</h3>
          <p>
            Keyboard or on-screen keypad, three save slots per game, LCD colour palettes, 2× and 4× speed, and English or
            Chinese menus.
          </p>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ✎
          </span>
          <h3>Make</h3>
          <p>
            Paint maps, write story scripts, design characters, items and spells, draw sprites and time spell effects.
            Playtest in one click and export a <code>.lib</code>.
          </p>
          <button className="ghost" onClick={onOpenEditor}>
            Open the editor
          </button>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ◆
          </span>
          <h3>Private</h3>
          <p>
            Nothing is uploaded. Games, saves and projects stay in this browser, and the site ships no game content apart
            from its own demo.
          </p>
        </article>
      </section>

      <footer>
        Engine ported from{" "}
        <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
          fmj.kt
        </a>{" "}
        (GPL-2.0) with fixes from{" "}
        <a href="https://github.com/erduoniba/baye-fmj-app" target="_blank" rel="noreferrer">
          baye-fmj-app
        </a>
        . Game content belongs to its respective owners.
      </footer>

      {drag && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop to add games or fonts</div>
        </div>
      )}
    </div>
  );
}

export type { Imported };
