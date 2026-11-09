import { useRef, useState } from "react";
import type { StoredGame } from "../storage/db";
import { chooseEngine, engineFor, enginesFor, type EngineId } from "./engines";
import type { Imported } from "./importFiles";
import { RemoteAdd } from "./RemoteAdd";
import { LockedCard } from "./LockedCard";
import { LOCKED_GAMES } from "./lockedGame";
import { GAMES_TEXT, type GamesText } from "./gamesText";
import { useSiteLang, type SiteLang } from "./siteLang";
import { Arrow, Tile } from "./Tile";

interface Props {
  games: StoredGame[];
  fonts: { HZK16: boolean; ASC16: boolean };
  persistent: boolean;
  busy: boolean;
  messages: string[];
  /** The 4988 firmware: how many of its files were added; ready when it can boot. */
  firmware: { files: number; ready: boolean };
  onImport: (files: File[]) => Promise<unknown> | void;
  /** Play a game on an engine. */
  onPlay: (g: StoredGame, engine: EngineId) => void;
  /** Turn on the emulated 4988 itself. */
  onTurnOn: () => void;
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

/** The Games page: the demos, your games and the engine each plays on, adding more, and the engines. */
export function Library({ games, fonts, persistent, busy, messages, firmware, onImport, onPlay, onTurnOn, onPlayDemo, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  // (re-render when a game's engine is chosen; the choice itself is kept in engines.ts)
  const [, setVersion] = useState(0);
  const choose = () => input.current?.click();
  const lang = useSiteLang();
  const t = GAMES_TEXT[lang];
  // a locked game is shown until this version of it has been unlocked and added
  const locked = LOCKED_GAMES.filter((l) => !games.some((g) => g.id === l.id));
  const news = messages.filter((m) => !seen.includes(m));
  let no = 0;

  return (
    <div
      className="g-page library page"
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

      <header className="g-head">
        <div>
          <p className="h-kicker">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="g-lead">{t.lead}</p>
        </div>
        <div className="g-head-add">
          <button className="h-btn h-btn-dark" onClick={choose} disabled={busy}>
            {t.addGame}
            <span aria-hidden="true">+</span>
          </button>
          <p className="h-meta">{t.dropHint}</p>
        </div>
      </header>

      {(busy || news.length > 0) && (
        <div className="g-status" role="status">
          <span className="g-dot" aria-hidden="true" />
          <div>{busy ? <p>{t.reading}</p> : news.map((m, i) => <p key={i}>{m}</p>)}</div>
          {!busy && (
            <button className="g-close" onClick={() => setSeen(messages)} aria-label="✕">
              ✕
            </button>
          )}
        </div>
      )}

      <section className="g-shelf" id="games">
        <div className="g-shelf-head">
          <h2 className="h-kicker">{t.library}</h2>
          <span className="h-meta">{t.count(games.length + 2 + locked.length + (firmware.ready ? 1 : 0))}</span>
        </div>
        <ul className="g-grid">
          <Tile no={++no} art="THE SILENT BELL" meta={t.bellMeta} title="The Silent Bell">
            <p className="g-desc">{t.bellDesc}</p>
            <Play t={t} onClick={() => onPlayDemo("bell")} />
          </Tile>
          <Tile no={++no} art="LANTERN PATH" meta={t.lanternMeta} title="Lantern Path">
            <p className="g-desc">{t.lanternDesc}</p>
            <Play t={t} onClick={() => onPlayDemo("lantern")} />
          </Tile>
          {firmware.ready && (
            <Tile no={++no} art="LONGMAN 4988" meta={t.device.meta} title={t.device.name}>
              <p className="g-desc">{t.device.desc}</p>
              <Play t={t} label={t.device.turnOn} onClick={onTurnOn} />
            </Tile>
          )}
          {locked.map((l) => (
            <LockedCard key={l.url} no={++no} game={l} update={games.some((g) => g.name === l.name)} busy={busy} onImport={onImport} />
          ))}
          {games.map((g) => {
            const options = enginesFor(g, firmware.ready), engine = engineFor(g, firmware.ready);
            const src = LOCKED_GAMES.find((l) => l.name === g.name)?.source;
            return (
              <Tile
                key={g.id}
                no={++no}
                art={g.name}
                title={g.name}
                meta={[g.format === "gam" ? t.kind.gam : t.kind.lib, size(g.size), g.addedAt ? added(g.addedAt, lang) : ""].filter(Boolean).join(" · ")}
              >
                {options.length > 1 ? (
                  <div className="g-engine" role="radiogroup" aria-label={t.engines.label}>
                    {options.map((o) => (
                      <button
                        key={o.id}
                        role="radio"
                        aria-checked={o.id === engine}
                        disabled={!o.ready}
                        title={o.ready ? t.engines[o.id].short : t.engines.original.needs}
                        onClick={() => {
                          chooseEngine(g, o.id);
                          setVersion((v) => v + 1);
                        }}
                      >
                        {t.engines[o.id].name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="h-meta g-engine-one">{t.engines.react.name}</p>
                )}
                <p className="g-desc">{t.engines[engine].short}</p>
                {src && (
                  <p className="g-source">
                    {t.originalFrom}
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.label}
                    </a>
                  </p>
                )}
                <Play t={t} onClick={() => onPlay(g, engine)} />
                <button className="g-remove" onClick={() => onDelete(g)}>
                  {t.remove}
                </button>
              </Tile>
            );
          })}
          <li className="g-tile g-add">
            <button onClick={choose} disabled={busy}>
              <span className="g-plus" aria-hidden="true">
                +
              </span>
              <strong>{t.addGame}</strong>
              <span className="h-meta">{t.addGameHint}</span>
            </button>
          </li>
        </ul>
        {!persistent && <p className="muted small">{t.noStorage}</p>}
      </section>

      <section className="h-section g-engines-sec">
        <header className="h-sec-head">
          <h2>{t.engines.title}</h2>
          <p>{t.engines.sub}</p>
        </header>
        <div className="g-rows">
          {(
            [
              [t.engines.react.name, t.engines.react.what, t.engines.builtIn, true],
              [t.engines.fulu.name, t.engines.fulu.what, t.engines.fulu.state, true],
              [t.engines.original.name, t.engines.original.what, firmware.ready ? t.engines.original.ready(firmware.files) : t.engines.original.missing, firmware.ready],
              [
                t.engines.fonts.name,
                t.engines.fonts.what,
                fonts.HZK16 && fonts.ASC16 ? t.engines.fonts.have : t.engines.fonts.missing((["HZK16", "ASC16"] as const).filter((f) => fonts[f])),
                fonts.HZK16 && fonts.ASC16,
              ],
            ] as [string, string, string, boolean][]
          ).map(([name, what, state, ok], i) => (
            <div key={name} className="g-row">
              <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="g-row-title">{name}</span>
              <span className="g-row-text">{what}</span>
              <span className={`g-state${ok ? " ok" : ""}`}>{state}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="h-section g-link-sec">
        <RemoteAdd busy={busy} onImport={onImport} />
      </section>

      {drag && (
        <div className="drop-overlay" aria-hidden="true">
          <div>{t.dropHere}</div>
        </div>
      )}
    </div>
  );
}

function Play({ t, label, onClick }: { t: GamesText; label?: string; onClick: () => void }) {
  return (
    <button className="h-btn h-btn-dark g-play" onClick={onClick}>
      {label ?? t.play}
      <Arrow />
    </button>
  );
}

export type { Imported };
