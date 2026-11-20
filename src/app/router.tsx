// A small client-side router: each page of the site has its own address
// (/, /games, /guide, /fulu, /fulu/progress, /about, /editor), links change it without reloading,
// and the browser's back and forward buttons work. Vercel serves index.html
// at each page's address (vercel.json), so a page can be opened or reloaded
// directly; any other address gets 404.html (the same app, with a 404
// status), which shows the "page not found" page.
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

export type Page = "home" | "games" | "guide" | "fulu" | "fulu-progress" | "about" | "editor" | "notfound";

/** The site's pages; one with a parent is a tab of that page, not in the site's menu. */
export const PAGES: { page: Page; path: string; label: string; title: string; parent?: Page }[] = [
  { page: "home", path: "/", label: "Home", title: "FMJ React: play and make pocket RPGs in your browser" },
  { page: "games", path: "/games", label: "Games", title: "Games · FMJ React" },
  { page: "guide", path: "/guide", label: "Guide", title: "Guide · FMJ React" },
  { page: "fulu", path: "/fulu", label: "Fulu", title: "Fulu · FMJ React" },
  { page: "fulu-progress", path: "/fulu/progress", label: "Progress", title: "Fulu progress report · FMJ React", parent: "fulu" },
  { page: "about", path: "/about", label: "About", title: "About · FMJ React" },
  { page: "editor", path: "/editor", label: "Editor", title: "Editor · FMJ React" },
];

export const pathOf = (p: Page) => PAGES.find((x) => x.page === p)?.path ?? "/";

/** The browser tab title for a page. */
export const titleOf = (p: Page) => PAGES.find((x) => x.page === p)?.title ?? "Page not found · FMJ React";

function current(): Page {
  if (location.hash === "#editor") return "editor"; // the old address of the editor
  const path = location.pathname.replace(/\/+$/, "").replace(/\/index\.html$/, "") || "/";
  return PAGES.find((x) => x.path === path)?.page ?? "notfound";
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
  // move the old #editor address to /editor
  if (location.hash === "#editor") history.replaceState(null, "", "/editor");
}

/** Go to a page of the site (adds a history entry, starts at the top). */
export function navigate(p: Page): void {
  const path = pathOf(p);
  if (location.pathname !== path || location.hash) history.pushState(null, "", path);
  notify();
  window.scrollTo({ top: 0 });
}

/** The page the address shows, kept up to date. */
export function usePage(): Page {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    current,
  );
}

/** The page a tab belongs to (itself for a page that is not a tab). */
export const parentOf = (p: Page) => PAGES.find((x) => x.page === p)?.parent ?? p;

/**
 * A link to a page of the site: a real link (it can open in a new tab),
 * followed in place. It is marked current on its page and, unless exact, on
 * that page's tabs (the site menu's Fulu on Fulu's progress tab).
 */
export function Link({ to, className, children, onClick, exact }: { to: Page; className?: string; children: ReactNode; onClick?: () => void; exact?: boolean }) {
  const page = usePage();
  return (
    <a
      href={pathOf(to)}
      className={className}
      aria-current={page === to || (!exact && parentOf(page) === to) ? "page" : undefined}
      onClick={(e: MouseEvent) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
