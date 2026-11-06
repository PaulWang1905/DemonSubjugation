// The site's language: Simplified Chinese or English. It follows the
// browser's languages (any Chinese one gives Simplified Chinese) until the
// visitor picks one with the switch in the top bar, which is remembered.
// (Pages are being translated step by step; the game's own menus have their
// own setting in the player.)
import { useSyncExternalStore } from "react";

export type SiteLang = "en" | "zh";

const KEY = "fmj-react:siteLang";

/** The language the browser asks for: Chinese if its first Chinese-or-English choice is Chinese. */
export function browserLang(languages: readonly string[]): SiteLang {
  for (const l of languages) {
    const s = l.toLowerCase();
    if (s.startsWith("zh")) return "zh";
    if (s.startsWith("en")) return "en";
  }
  return "en";
}

function saved(): SiteLang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "zh" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

let lang: SiteLang =
  saved() ?? (typeof navigator !== "undefined" ? browserLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"]) : "en");
const listeners = new Set<() => void>();

const META: Record<SiteLang, string> = {
  en: "Play and make pocket RPGs in your browser: a web port of the BBK electronic-dictionary RPG engine behind 伏魔记, with two free demos and a game editor.",
  zh: "在浏览器里畅玩和制作掌上 RPG：步步高电子词典《伏魔记》RPG 引擎的网页版，附带两款免费演示游戏和游戏编辑器。",
};

/** The page's language attribute and description, for browsers, screen readers and search engines. */
function apply(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelector('meta[name="description"]')?.setAttribute("content", META[lang]);
}
apply();

export function setSiteLang(l: SiteLang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* not remembered */
  }
  apply();
  listeners.forEach((f) => f());
}

export function useSiteLang(): SiteLang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => lang,
  );
}
