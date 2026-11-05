import { useState } from "react";
import { downloadFile, fileLink, listFolder, type RemoteFolder } from "./remote";

interface Props {
  busy: boolean;
  onImport: (files: File[]) => Promise<void> | void;
}

const LAST = "fmj-react:remoteLink";

function size(n?: number): string {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function lastLink(): string {
  try {
    return localStorage.getItem(LAST) ?? "";
  } catch {
    return "";
  }
}

/**
 * Add games from a link: a GitHub folder or file, a direct .lib link or a web
 * folder listing. Folders can be browsed and games picked one by one.
 */
export function RemoteAdd({ busy, onImport }: Props) {
  const [link, setLink] = useState(lastLink);
  const [folder, setFolder] = useState<RemoteFolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());

  const remember = (l: string) => {
    try {
      localStorage.setItem(LAST, l);
    } catch {
      /* ignore */
    }
  };

  const open = async (l: string) => {
    const url = l.trim();
    if (!url) return;
    setError(null);
    setLink(url);
    remember(url);
    const direct = fileLink(url);
    try {
      if (direct) {
        setLoading("Downloading…");
        await onImport([await downloadFile(direct)]);
      } else {
        setLoading("Opening the folder…");
        setFolder(await listFolder(url));
        setPicked(new Set());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const add = async (urls: string[]) => {
    if (!folder || urls.length === 0) return;
    setError(null);
    const files: File[] = [];
    try {
      for (const [i, u] of urls.entries()) {
        const entry = folder.entries.find((e) => e.url === u)!;
        setLoading(`Downloading ${entry.name}${urls.length > 1 ? ` (${i + 1} of ${urls.length})` : ""}…`);
        files.push(await downloadFile(u, entry.name));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
    if (files.length) {
      await onImport(files);
      setDone((d) => new Set([...d, ...urls.slice(0, files.length)]));
      setPicked(new Set());
    }
  };

  const toggle = (u: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(u)) n.delete(u);
      else n.add(u);
      return n;
    });

  const files = folder?.entries.filter((e) => e.type === "file") ?? [];

  return (
    <section className="remote">
      <form
        className="remote-form"
        onSubmit={(e) => {
          e.preventDefault();
          void open(link);
        }}
      >
        <label htmlFor="remote-link">Add from a link</label>
        <div className="row">
          <input
            id="remote-link"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repo/tree/main/folder"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button type="submit" disabled={busy || !!loading || !link.trim()}>
            Open
          </button>
        </div>
        <p className="muted small">
          A GitHub folder or file, a direct link to a .lib file, or a web folder that lists them. The games are downloaded into this
          browser only.
        </p>
      </form>

      {loading && <p className="muted">{loading}</p>}
      {error && (
        <p className="remote-error" role="alert">
          {error}
        </p>
      )}

      {folder && (
        <div className="remote-folder">
          <div className="remote-head">
            {folder.parent && (
              <button className="ghost small" onClick={() => void open(folder.parent!)} disabled={!!loading} aria-label="Up one folder">
                ↑
              </button>
            )}
            <strong className="remote-title" title={folder.title}>
              {folder.title}
            </strong>
            <span className="muted small">
              {files.length} game file{files.length === 1 ? "" : "s"}
            </span>
            <button className="ghost small" onClick={() => setFolder(null)} aria-label="Close the folder">
              ✕
            </button>
          </div>
          {folder.entries.length === 0 && <p className="muted">No .lib files in this folder.</p>}
          <ul className="remote-list">
            {folder.entries.map((e) =>
              e.type === "dir" ? (
                <li key={e.url}>
                  <button className="remote-dir" onClick={() => void open(e.url)} disabled={!!loading}>
                    📁 {e.name}
                  </button>
                </li>
              ) : (
                <li key={e.url}>
                  <label className="remote-file">
                    <input type="checkbox" checked={picked.has(e.url)} onChange={() => toggle(e.url)} disabled={!!loading} />
                    <span className="name">{e.name.replace(/\.lib$/i, "")}</span>
                    <span className="muted small">{size(e.size)}</span>
                  </label>
                  {done.has(e.url) ? (
                    <span className="muted small">Added</span>
                  ) : (
                    <button className="ghost small" onClick={() => void add([e.url])} disabled={!!loading || busy}>
                      Add
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
          {picked.size > 0 && (
            <div className="remote-actions">
              <button onClick={() => void add([...picked])} disabled={!!loading || busy}>
                Add {picked.size} selected
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
