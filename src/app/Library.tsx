import { useRef, useState } from "react";
import type { StoredGame } from "../storage/db";
import type { Imported } from "./importFiles";
import { RemoteAdd } from "./RemoteAdd";
import { LockedCard } from "./LockedCard";
import { LOCKED_GAMES } from "./lockedGame";

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

/** The Games page: the demos, your games, adding more. */
export function Library({ games, fonts, persistent, busy, messages, onImport, onPlay, onPlayDemo, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const choose = () => input.current?.click();
  // a locked game is shown until it has been unlocked and added
  const locked = LOCKED_GAMES.filter((l) => !games.some((g) => g.name === l.name));

  return (
    <div
      className="library page"
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

      <header className="page-head">
        <p className="eyebrow">Games</p>
        <h1>Your games</h1>
        <p className="lead">
          The built-in demos and the games you have added. Everything stays in this browser; drop <code>.lib</code> files anywhere on this page to
          add more.
        </p>
      </header>

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
          <h2>Library</h2>
          <span className="muted small">
            {games.length + 2} game{games.length + 2 === 1 ? "" : "s"}
          </span>
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
          {locked.map((l) => (
            <LockedCard key={l.url} game={l} busy={busy} onImport={onImport} />
          ))}
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

      {drag && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop to add games or fonts</div>
        </div>
      )}
    </div>
  );
}

export type { Imported };
