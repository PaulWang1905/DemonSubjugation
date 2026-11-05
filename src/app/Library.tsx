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
  /** Play a built-in demo: The Silent Bell (default) or the short Lantern Path. */
  onPlayDemo: (which?: "bell" | "lantern") => void;
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

      <section className="hero" id="top">
        <div className="hero-text">
          <p className="eyebrow">BBK electronic-dictionary RPG engine</p>
          <h1>Play and make pocket RPGs in your browser.</h1>
          <p className="lead">
            The engine behind 伏魔记 and the many community games made for it, rebuilt for the web. Start with{" "}
            <em>The Silent Bell</em>, a twenty-minute adventure made for this site, open a game you own, or build your own.
          </p>
          <div className="cta">
            <button className="big" onClick={() => onPlayDemo("bell")}>
              ▶ Play The Silent Bell
            </button>
            <button className="big ghost" onClick={choose} disabled={busy}>
              Open a game file…
            </button>
          </div>
          <p className="fine">
            <button className="link" onClick={onOpenEditor}>
              Or make your own game in the editor →
            </button>
          </p>
          <ul className="highlights" aria-label="Highlights">
            <li>Runs in the browser</li>
            <li>Keyboard and touch</li>
            <li>Saves on your device</li>
            <li>Free, nothing uploaded</li>
          </ul>
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

      <section className="shelf" id="games">
        <div className="shelf-head">
          <h2>Your games</h2>
          <span className="muted small">Drop .lib files anywhere on this page</span>
        </div>
        <ul className="cards">
          <li className="card demo">
            <div className="card-art" aria-hidden="true">
              <span>THE SILENT BELL</span>
            </div>
            <div className="card-body">
              <strong>The Silent Bell</strong>
              <span className="muted small">Built-in demo · about 20 minutes</span>
              <span className="card-desc">Bring back the three shards of Bellhaven's bell before the fog wins.</span>
            </div>
            <div className="card-actions">
              <button onClick={() => onPlayDemo("bell")}>Play</button>
            </div>
          </li>
          <li className="card demo">
            <div className="card-art" aria-hidden="true">
              <span>LANTERN PATH</span>
            </div>
            <div className="card-body">
              <strong>Lantern Path</strong>
              <span className="muted small">Built-in short demo · 3 minutes</span>
              <span className="card-desc">Relight the hamlet's lantern with a stone from the glade.</span>
            </div>
            <div className="card-actions">
              <button onClick={() => onPlayDemo("lantern")}>Play</button>
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

      <RemoteAdd busy={busy} onImport={onImport} />

      <header className="section-head" id="features">
        <h2 className="section-title">What you can do</h2>
        <p className="section-sub">Play the classics you own, try the demos, or make a game of your own.</p>
      </header>
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
            Nothing is uploaded. Games, saves and projects stay in this browser, and the site ships no game content apart from its own demos.
          </p>
        </article>
      </section>

      <section className="how" id="how">
        <header className="section-head">
          <h2 className="section-title">How it works</h2>
        </header>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <h3>Pick a game</h3>
            <p>
              Start with <em>The Silent Bell</em> or <em>Lantern Path</em>, open a <code>.lib</code> archive you own, or add one from a link.
            </p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>Play anywhere</h3>
            <p>Keyboard on a computer, a full-screen keypad on a phone. Save at any time; saves stay in this browser.</p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>Make your own</h3>
            <p>On a computer, open the editor: paint maps, write the story, draw sprites, playtest in one click and export a <code>.lib</code>.</p>
          </li>
        </ol>
      </section>

      <section className="about" id="about">
        <header className="section-head">
          <h2 className="section-title">About the project</h2>
        </header>
        <div className="about-body">
          <p>
            In the 2000s, BBK electronic dictionaries shipped with a small role-playing game engine. <em>伏魔记</em> was its best-known game, and fans went
            on to make many more for it.
          </p>
          <p>
            FMJ React brings that engine to the web. It is a TypeScript port of the open-source fmj.kt re-implementation, checked against a reconstruction
            of the original engine so that battles, scripts and items behave as they did on the device. On top it adds sharp text, a phone layout, more
            text per page and a complete game editor.
          </p>
          <dl className="facts">
            <div>
              <dt>Engine</dt>
              <dd>TypeScript and React, no plugins</dd>
            </div>
            <div>
              <dt>Licence</dt>
              <dd>GPL-2.0, like fmj.kt</dd>
            </div>
            <div>
              <dt>Game data</dt>
              <dd>None included apart from the demos</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <strong>FMJ React</strong>
          <span className="muted">Play and make pocket RPGs in your browser.</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <button className="link" onClick={() => onPlayDemo("bell")}>
            Play the demo
          </button>
          <button className="link" onClick={choose} disabled={busy}>
            Open a game
          </button>
          <button className="link" onClick={onOpenEditor}>
            Editor
          </button>
        </nav>
        <p className="muted small">
          Engine ported from{" "}
          <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
            fmj.kt
          </a>{" "}
          (GPL-2.0) with fixes from the baye-fmj-app fork. Game content belongs to its respective owners.
        </p>
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
