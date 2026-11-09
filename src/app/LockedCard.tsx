import { useState } from "react";
import { decryptGame, WrongPassword, type LockedGame } from "./lockedGame";
import { GAMES_TEXT } from "./gamesText";
import { useSiteLang } from "./siteLang";
import { Tile } from "./Tile";

interface Props {
  /** Its number in the library. */
  no: number;
  game: LockedGame;
  /** An older version is already in the library. */
  update?: boolean;
  busy: boolean;
  onImport: (files: File[]) => Promise<unknown> | void;
}

/** A game the site serves encrypted: type the password to add it. */
export function LockedCard({ no, game, update, busy, onImport }: Props) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const lang = useSiteLang();
  const t = GAMES_TEXT[lang];

  const unlock = async () => {
    if (!password) return;
    setError(null);
    setState("working");
    try {
      const res = await fetch(game.url);
      if (!res.ok) throw new Error(t.locked.download(res.status));
      const data = await decryptGame(new Uint8Array(await res.arrayBuffer()), password);
      await onImport([new File([data as BlobPart], game.fileName)]);
      setPassword("");
    } catch (e) {
      setError(e instanceof WrongPassword ? t.locked.wrong : e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  };

  return (
    <Tile no={no} art={game.name.toUpperCase()} meta={update ? t.locked.update : t.locked.status} title={game.name} className="g-locked">
      <p className="g-desc">{lang === "zh" && game.descZh ? game.descZh : game.desc}</p>
      {game.source && (
        <p className="g-source">
          {t.originalFrom}
          <a href={game.source.url} target="_blank" rel="noreferrer">
            {game.source.label}
          </a>
        </p>
      )}
      <form
        className="g-lock"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <input
          type="password"
          aria-label={t.locked.passwordFor(game.name)}
          placeholder={t.locked.password}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="h-btn h-btn-dark" type="submit" disabled={busy || state === "working" || !password}>
          {state === "working" ? t.locked.unlocking : t.locked.unlock}
        </button>
      </form>
      {error && (
        <p className="g-error" role="alert">
          {error}
        </p>
      )}
    </Tile>
  );
}
