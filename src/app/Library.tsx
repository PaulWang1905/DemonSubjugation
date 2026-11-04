import { useRef, useState } from "react";
import type { StoredGame } from "../storage/db";
import type { Imported } from "./importFiles";

interface Props {
  games: StoredGame[];
  fonts: { HZK16: boolean; ASC16: boolean };
  persistent: boolean;
  busy: boolean;
  messages: string[];
  onImport: (files: File[]) => void;
  onPlay: (g: StoredGame) => void;
  onDelete: (g: StoredGame) => void;
}

function size(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export function Library({ games, fonts, persistent, busy, messages, onImport, onPlay, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div className="library">
      <section className="intro">
        <h1>
          FMJ React <span>BBK RPG engine</span>
        </h1>
        <p>
          A browser port of the engine behind the BBK electronic-dictionary RPGs (伏魔记 and the many community games made
          for it). <strong>No game data is included</strong>: import a game archive you have the right to use (the
          original bitmap fonts are optional). Files stay in this browser and are never uploaded.
        </p>
      </section>

      <section
        className={`drop ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onImport([...e.dataTransfer.files]);
        }}
      >
        <div>
          <strong>Drop files here</strong> or{" "}
          <button onClick={() => input.current?.click()} disabled={busy}>
            choose files
          </button>
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
        </div>
        <ul className="needs">
          <li>
            Game archive: <code>DAT.LIB</code> or any <code>*.lib</code>
          </li>
          <li>
            Optional fonts: <code>HZK16</code> (16×16 GB2312) and <code>ASC16</code> (8×16 ASCII)
          </li>
          <li>
            Also accepted: hex-encoded <code>*.lib.js</code> / <code>rom.js</code> bundles from fmj.kt web builds
          </li>
        </ul>
        {busy && <p className="muted">Reading files…</p>}
        {messages.length > 0 && (
          <ul className="messages">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="status">
        <h2>
          Fonts <span className="muted small">(optional)</span>
        </h2>
        <div className="chips">
          <span className={`chip ${fonts.HZK16 ? "ok" : "soft"}`}>{fonts.HZK16 ? "✓ HZK16" : "HZK16 not added"}</span>
          <span className={`chip ${fonts.ASC16 ? "ok" : "soft"}`}>{fonts.ASC16 ? "✓ ASC16" : "ASC16 not added"}</span>
        </div>
        <p className="muted small">
          {fonts.HZK16 && fonts.ASC16
            ? "Games use the original bitmap fonts."
            : "Games are playable without these files: text is drawn with your device's own fonts. Add HZK16 and ASC16 for the original look."}
        </p>
        {!persistent && <p className="muted">Browser storage is unavailable, so imported files last for this tab only.</p>}
      </section>

      <section className="games">
        <h2>Games</h2>
        {games.length === 0 ? (
          <p className="muted">No games imported yet.</p>
        ) : (
          <ul>
            {games.map((g) => (
              <li key={g.id}>
                <div className="meta">
                  <strong>{g.name}</strong>
                  <span>
                    {g.fileName} · {size(g.size)}
                  </span>
                </div>
                <div className="row">
                  <button onClick={() => onPlay(g)}>Play</button>
                  <button className="ghost danger" onClick={() => onDelete(g)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  );
}

export type { Imported };
