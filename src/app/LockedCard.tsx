import { useState } from "react";
import { decryptGame, WrongPassword, type LockedGame } from "./lockedGame";

interface Props {
  game: LockedGame;
  /** An older version is already in the library. */
  update?: boolean;
  busy: boolean;
  onImport: (files: File[]) => Promise<void> | void;
}

/** A game the site serves encrypted: type the password to add it. */
export function LockedCard({ game, update, busy, onImport }: Props) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!password) return;
    setError(null);
    setState("working");
    try {
      const res = await fetch(game.url);
      if (!res.ok) throw new Error(`Could not download the game (${res.status}).`);
      const data = await decryptGame(new Uint8Array(await res.arrayBuffer()), password);
      await onImport([new File([data as BlobPart], game.fileName)]);
      setPassword("");
    } catch (e) {
      setError(e instanceof WrongPassword ? "Wrong password." : e instanceof Error ? e.message : String(e));
    } finally {
      setState("idle");
    }
  };

  return (
    <li className="card locked">
      <div className="card-art" aria-hidden="true">
        <span>{game.name.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <strong>{game.name}</strong>
        <span className="muted small">{update ? "New version · needs the password" : "Locked · needs a password"}</span>
        <span className="card-desc">{game.desc}</span>
      </div>
      <form
        className="card-actions lock-form"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <input
          type="password"
          aria-label={`Password for ${game.name}`}
          placeholder="Password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy || state === "working" || !password}>
          {state === "working" ? "Unlocking…" : "Unlock"}
        </button>
        {error && (
          <p className="lock-error small" role="alert">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
