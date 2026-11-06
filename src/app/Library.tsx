import { useRef, useState } from "react";
import type { StoredGame } from "../storage/db";
import type { Imported } from "./importFiles";
import { RemoteAdd } from "./RemoteAdd";
import { LockedCard } from "./LockedCard";
import { LOCKED_GAMES } from "./lockedGame";
import { GAMES_TEXT } from "./gamesText";
import { useSiteLang, type SiteLang } from "./siteLang";

interface Props {
  games: StoredGame[];
  fonts: { HZK16: boolean; ASC16: boolean };
  persistent: boolean;
  busy: boolean;
  messages: string[];
  onImport: (files: File[]) => Promise<unknown> | void;
  onPlay: (g: StoredGame) => void;
  /** Play a built-in demo: The Silent Bell (default) or the short Lantern Path. */
  onPlayDemo: (which?: "bell" | "lantern") => void;
  onDelete: (g: StoredGame) => void;
}

function size(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function added(t: number, lang: SiteLang): string {
  try {
    return new Date(t).toLocaleDateString(lang === "zh" ? "zh-CN" : undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** The Games page: the demos, your games, adding more. */
export function Library({ games, fonts, persistent, busy, messages, onImport, onPlay, onPlayDemo, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const choose = () => input.current?.click();
  const lang = useSiteLang();
  const t = GAMES_TEXT[lang];
  // a locked game is shown until this version of it has been unlocked and added
  const locked = LOCKED_GAMES.filter((l) => !games.some((g) => g.id === l.id));

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
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="lead">
          {t.lead[0]}
          <code>{t.lead[1]}</code>
          {t.lead[2]}
        </p>
      </header>

      {(busy || messages.length > 0) && (
        <section className="notice" role="status">
          {busy && <p>{t.reading}</p>}
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
          <h2>{t.library}</h2>
          <span className="muted small">{t.count(games.length + 2 + locked.length)}</span>
        </div>
        <ul className="cards">
          <li className="card demo">
            <div className="card-art" aria-hidden="true">
              <span>THE SILENT BELL</span>
            </div>
            <div className="card-body">
              <strong>The Silent Bell</strong>
              <span className="muted small">{t.bellMeta}</span>
              <span className="card-desc">{t.bellDesc}</span>
            </div>
            <div className="card-actions">
              <button onClick={() => onPlayDemo("bell")}>{t.play}</button>
            </div>
          </li>
          <li className="card demo">
            <div className="card-art" aria-hidden="true">
              <span>LANTERN PATH</span>
            </div>
            <div className="card-body">
              <strong>Lantern Path</strong>
              <span className="muted small">{t.lanternMeta}</span>
              <span className="card-desc">{t.lanternDesc}</span>
            </div>
            <div className="card-actions">
              <button onClick={() => onPlayDemo("lantern")}>{t.play}</button>
            </div>
          </li>
          {locked.map((l) => (
            <LockedCard key={l.url} game={l} update={games.some((g) => g.name === l.name)} busy={busy} onImport={onImport} />
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
                  {g.addedAt ? ` · ${added(g.addedAt, lang)}` : ""}
                </span>
                {(() => {
                  const src = LOCKED_GAMES.find((l) => l.name === g.name)?.source;
                  return (
                    src && (
                      <span className="card-source small">
                        {t.originalFrom}
                        <a href={src.url} target="_blank" rel="noreferrer">
                          {src.label}
                        </a>
                      </span>
                    )
                  );
                })()}
              </div>
              <div className="card-actions">
                <button onClick={() => onPlay(g)}>{t.play}</button>
                <button className="ghost danger" onClick={() => onDelete(g)}>
                  {t.remove}
                </button>
              </div>
            </li>
          ))}
          <li className="card add">
            <button className="add-btn" onClick={choose} disabled={busy}>
              <span className="plus" aria-hidden="true">
                +
              </span>
              <strong>{t.addGame}</strong>
              <span className="muted small">
                <code>{t.addGameHint[0]}</code>
                {t.addGameHint[1]}
                <code>{t.addGameHint[2]}</code>
              </span>
            </button>
          </li>
        </ul>
        <div className="fonts-line">
          <span className="muted small">{t.fontsLabel}</span>
          <span className={`chip ${fonts.HZK16 ? "ok" : "soft"}`}>{fonts.HZK16 ? "✓ HZK16" : "HZK16"}</span>
          <span className={`chip ${fonts.ASC16 ? "ok" : "soft"}`}>{fonts.ASC16 ? "✓ ASC16" : "ASC16"}</span>
          <span className="muted small">
            {fonts.HZK16 && fonts.ASC16 ? t.fontsHave : t.fontsMissing}
          </span>
        </div>
        {!persistent && <p className="muted small">{t.noStorage}</p>}
      </section>

      <RemoteAdd busy={busy} onImport={onImport} />

      {drag && (
        <div className="drop-overlay" aria-hidden="true">
          <div>{t.dropHere}</div>
        </div>
      )}
    </div>
  );
}

export type { Imported };
