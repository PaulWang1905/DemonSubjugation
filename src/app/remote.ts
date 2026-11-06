// Add games from a link instead of a file on this device. Understands:
// - a GitHub folder (github.com/owner/repo/tree/branch/path, or the repo
//   itself): listed with GitHub's contents API, which allows any website
// - a GitHub file page (…/blob/…), fetched from raw.githubusercontent.com
// - a direct link to a .lib (or font) file on a server that allows it
// - a plain web folder listing (an HTML page linking to .lib files)
// Nothing is bundled: the files are downloaded into this browser only.

import { gamesText } from "./gamesText";

export interface RemoteEntry {
  name: string;
  /** "file" can be added; "dir" can be opened. */
  type: "file" | "dir";
  /** Where to download a file, or the link that opens a folder. */
  url: string;
  size?: number;
}

export interface RemoteFolder {
  /** A readable title for the folder. */
  title: string;
  /** The folder above, if it can be opened. */
  parent?: string;
  entries: RemoteEntry[];
}

/** Files the player can use: game archives and the two font files. */
export function isGameFile(name: string): boolean {
  return /\.lib$/i.test(name) || /^(hzk16|asc16)(\.(bin|dat))?$/i.test(name);
}

interface GitHubPath {
  owner: string;
  repo: string;
  ref?: string;
  path: string;
  blob: boolean;
}

function parseGitHub(u: URL): GitHubPath | null {
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ref, ...rest] = parts;
  if (!kind) return { owner, repo: repo.replace(/\.git$/, ""), path: "", blob: false };
  if (kind !== "tree" && kind !== "blob") return null;
  return { owner, repo, ref, path: rest.join("/"), blob: kind === "blob" };
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function treeUrl(g: GitHubPath, path: string): string {
  return `https://github.com/${g.owner}/${g.repo}/tree/${encodeURIComponent(g.ref ?? "main")}/${encodePath(path)}`.replace(/\/$/, "");
}

/** The address to download for a link to a single file, or null for a folder. */
export function fileLink(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  const g = parseGitHub(u);
  if (g) return g.blob && g.ref ? `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${encodeURIComponent(g.ref)}/${encodePath(g.path)}` : null;
  const last = decodeURIComponent(u.pathname.split("/").pop() ?? "");
  return isGameFile(last) ? u.href : null;
}

async function failure(res: Response, what: string): Promise<Error> {
  if (res.status === 403 || res.status === 429) {
    return new Error(gamesText().remote.rateLimit);
  }
  if (res.status === 404) return new Error(gamesText().remote.notFound(what));
  return new Error(gamesText().remote.unreadable(what, res.status));
}

/** List a folder link. Throws with a readable message when it cannot. */
export async function listFolder(link: string): Promise<RemoteFolder> {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    throw new Error(gamesText().remote.notUrl);
  }
  const g = parseGitHub(u);
  if (g) {
    if (!g.ref) {
      // the repository itself: its default branch
      const info = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!info.ok) throw await failure(info, "The repository");
      g.ref = ((await info.json()) as { default_branch?: string }).default_branch ?? "main";
    }
    const api = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${encodePath(g.path)}${g.ref ? `?ref=${encodeURIComponent(g.ref)}` : ""}`;
    const res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw await failure(res, gamesText().remote.theFolder);
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) throw new Error(gamesText().remote.isFile);
    const entries: RemoteEntry[] = [];
    for (const it of data as { name: string; type: string; path: string; size: number; download_url: string | null }[]) {
      if (it.type === "dir") entries.push({ name: it.name, type: "dir", url: treeUrl(g, it.path) });
      else if (it.type === "file" && it.download_url && isGameFile(it.name)) entries.push({ name: it.name, type: "file", url: it.download_url, size: it.size });
    }
    const up = g.path.includes("/") ? g.path.slice(0, g.path.lastIndexOf("/")) : g.path ? "" : null;
    return {
      title: g.path ? g.path.split("/").pop()! : `${g.owner}/${g.repo}`,
      parent: up === null ? undefined : treeUrl(g, up),
      entries: sortEntries(entries),
    };
  }

  // Any other server: a directory index page that links to the files.
  let res: Response;
  try {
    res = await fetch(u.href);
  } catch {
    throw new Error(gamesText().remote.corsList);
  }
  if (!res.ok) throw await failure(res, gamesText().remote.theFolder);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  const entries: RemoteEntry[] = [];
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href")!;
    let abs: URL;
    try {
      abs = new URL(href, u);
    } catch {
      continue;
    }
    const name = decodeURIComponent(abs.pathname.split("/").filter(Boolean).pop() ?? "");
    if (!name || seen.has(abs.href)) continue;
    if (isGameFile(name)) {
      seen.add(abs.href);
      entries.push({ name, type: "file", url: abs.href });
    } else if (href.endsWith("/") && abs.href.startsWith(u.href) && abs.href !== u.href) {
      seen.add(abs.href);
      entries.push({ name, type: "dir", url: abs.href });
    }
  }
  if (entries.length === 0) throw new Error(gamesText().remote.noGames);
  return { title: decodeURIComponent(u.pathname) || u.host, entries: sortEntries(entries) };
}

function sortEntries(e: RemoteEntry[]): RemoteEntry[] {
  return e.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh") : a.type === "dir" ? -1 : 1));
}

/** Download one file as a File the importer understands. */
export async function downloadFile(url: string, name?: string): Promise<File> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(gamesText().remote.corsDownload);
  }
  if (!res.ok) throw await failure(res, name ?? gamesText().remote.theFile);
  const blob = await res.blob();
  const fileName = name ?? decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "game.lib");
  return new File([blob], fileName);
}
