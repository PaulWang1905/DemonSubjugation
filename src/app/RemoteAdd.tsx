import { useMemo, useState } from "react";
import { downloadFile, fileLink, listFolder, type RemoteFolder } from "./remote";
import { GAMES_TEXT } from "./gamesText";
import { useSiteLang } from "./siteLang";

interface Props {
  busy: boolean;
  onImport: (files: File[]) => Promise<unknown> | void;
}

const LAST = "fmj-react:remoteLink";
/** The visitor's acknowledgement of the disclaimer, for this browser session only (asked again next time). */
const AGREED = "fmj-react:remoteAgreed";

/** Public collections on other people's sites, offered as starting points (FMJ React hosts none of their files). */
export const SOURCES = [
  {
    id: "bbk-games",
    url: "https://github.com/iuxt/bbk-games/tree/main/eebbk/roms",
    title: "bbk-games · eebbk/roms",
    owner: "iuxt",
  },
] as const;

function size(n?: number): string {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function read(store: () => Storage, key: string): string {
  try {
    return store().getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    /* (private windows and blocked storage: nothing is kept) */
  }
}

const session = () => sessionStorage;
const local = () => localStorage;

/**
 * Add games from a link: a public collection to browse, or a GitHub folder or
 * file, a direct .lib or .gam link or a web folder listing; folders can be
 * filtered and games picked one by one. The files come from third parties:
 * nothing loads until the visitor has ticked that they understand this.
 */
export function RemoteAdd({ busy, onImport }: Props) {
  const [link, setLink] = useState(() => read(local, LAST));
  const [agreed, setAgreed] = useState(() => read(session, AGREED) === "1");
  const [rereading, setRereading] = useState(false);
  const [folder, setFolder] = useState<RemoteFolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const t = GAMES_TEXT[useSiteLang()].remote;
  const locked = !agreed || busy || !!loading;

  const agree = (on: boolean) => {
    setAgreed(on);
    setRereading(false);
    write(session, AGREED, on ? "1" : null);
  };

  const open = async (l: string) => {
    const url = l.trim();
    if (!url || !agreed) return;
    setError(null);
    setLink(url);
    write(local, LAST, url);
    const direct = fileLink(url);
    try {
      if (direct) {
        setLoading(t.downloading);
        await onImport([await downloadFile(direct)]);
      } else {
        setLoading(t.opening);
        setFolder(await listFolder(url));
        setPicked(new Set());
        setFilter("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const add = async (urls: string[]) => {
    if (!folder || urls.length === 0 || !agreed) return;
    setError(null);
    const files: File[] = [];
    try {
      for (const [i, u] of urls.entries()) {
        const entry = folder.entries.find((e) => e.url === u)!;
        setLoading(t.downloadingOne(entry.name, i + 1, urls.length));
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
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (folder?.entries ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [folder, filter]);
  const shownFiles = shown.filter((e) => e.type === "file" && !done.has(e.url));

  return (
    <section className="remote" id="add-link" aria-labelledby="remote-h">
      <header className="remote-top">
        <h2 id="remote-h" className="remote-h">
          {t.label}
        </h2>
        <p className="remote-lead">{t.lead}</p>
      </header>

      {agreed && !rereading ? (
        <p className="remote-accepted">
          <span aria-hidden="true">✓</span> {t.accepted}{" "}
          <button type="button" className="remote-linkbtn" onClick={() => setRereading(true)}>
            {t.readAgain}
          </button>
        </p>
      ) : (
        <div className={`remote-notice${agreed ? " agreed" : ""}`}>
          <p className="remote-notice-title">{t.disclaimerTitle}</p>
          <p>{t.disclaimer}</p>
          <label className="remote-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => agree(e.target.checked)} />
            <span>{t.agree}</span>
          </label>
        </div>
      )}

      <div className={`remote-ways${agreed ? "" : " locked"}`}>
        {SOURCES.map((s) => (
          <div key={s.id} className="remote-way">
            <p className="remote-sub">{t.sourcesLabel}</p>
            <strong className="remote-way-title">{s.title}</strong>
            <span className="muted small">{t.sourceBy(s.owner)}</span>
            <p className="remote-way-text">{t.sourceWhat[s.id]}</p>
            <div className="remote-way-actions">
              <button type="button" className="remote-go" onClick={() => void open(s.url)} disabled={locked}>
                {t.browse}
              </button>
              <a className="remote-ext" href={s.url} target="_blank" rel="noopener noreferrer">
                {t.viewSource} ↗
              </a>
            </div>
          </div>
        ))}
        <form
          className="remote-way remote-form"
          onSubmit={(e) => {
            e.preventDefault();
            void open(link);
          }}
        >
          <label htmlFor="remote-link" className="remote-sub">
            {t.ownLink}
          </label>
          <div className="row">
            <input
              id="remote-link"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://github.com/owner/repo/tree/main/folder"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={!agreed}
            />
            <button type="submit" className="remote-go" disabled={locked || !link.trim()}>
              {t.open}
            </button>
          </div>
          <p className="muted small">{t.hint}</p>
        </form>
        {!agreed && <p className="remote-need">{t.needAgree}</p>}
      </div>

      {loading && (
        <p className="remote-status" role="status">
          <span className="remote-spin" aria-hidden="true" />
          {loading}
        </p>
      )}
      {error && (
        <p className="remote-error" role="alert">
          {error}
        </p>
      )}

      {folder && (
        <div className="remote-folder">
          <div className="remote-head">
            {folder.parent && (
              <button className="ghost small" onClick={() => void open(folder.parent!)} disabled={locked} aria-label={t.up}>
                ↑
              </button>
            )}
            <strong className="remote-title" title={folder.title}>
              {folder.title}
            </strong>
            <span className="muted small">{t.files(files.length)}</span>
            <button className="ghost small" onClick={() => setFolder(null)} aria-label={t.close}>
              ✕
            </button>
          </div>
          {folder.entries.length > 8 && (
            <div className="remote-tools">
              <input
                type="search"
                className="remote-filter"
                placeholder={t.filter}
                aria-label={t.filter}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button
                type="button"
                className="ghost small"
                onClick={() => setPicked(new Set(shownFiles.map((e) => e.url)))}
                disabled={locked || shownFiles.length === 0}
              >
                {t.selectAll(shownFiles.length)}
              </button>
              {picked.size > 0 && (
                <button type="button" className="ghost small" onClick={() => setPicked(new Set())}>
                  {t.clear}
                </button>
              )}
            </div>
          )}
          {folder.entries.length === 0 && <p className="muted">{t.empty}</p>}
          {folder.entries.length > 0 && shown.length === 0 && <p className="muted">{t.noMatch}</p>}
          <ul className="remote-list">
            {shown.map((e) =>
              e.type === "dir" ? (
                <li key={e.url}>
                  <button className="remote-dir" onClick={() => void open(e.url)} disabled={locked}>
                    📁 {e.name}
                  </button>
                </li>
              ) : (
                <li key={e.url} className={done.has(e.url) ? "is-added" : undefined}>
                  <label className="remote-file">
                    <input type="checkbox" checked={picked.has(e.url)} onChange={() => toggle(e.url)} disabled={locked || done.has(e.url)} />
                    <span className="remote-file-text">
                      <span className="name">{e.name.replace(/\.(lib|gam)$/i, "")}</span>
                      <span className="remote-meta">
                        {/\.gam$/i.test(e.name) ? t.kindGam : t.kindLib}
                        {e.size ? ` · ${size(e.size)}` : ""}
                      </span>
                    </span>
                  </label>
                  {done.has(e.url) ? (
                    <span className="remote-added small">✓ {t.added}</span>
                  ) : (
                    <button className="remote-add" onClick={() => void add([e.url])} disabled={locked}>
                      {t.add}
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
          {picked.size > 0 && (
            <div className="remote-actions">
              <button className="remote-go" onClick={() => void add([...picked])} disabled={locked}>
                {t.addSelected(picked.size)}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
