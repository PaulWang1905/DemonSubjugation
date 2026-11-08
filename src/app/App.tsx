import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteGame, getFont, isPersistent, listFirmware, listGames, putFirmwareFile, putFont, putGame, type StoredGame } from "../storage/db";
import { REQUIRED_REGIONS, type RegionId } from "../bbk/firmware";
import { findLib } from "../bbk/gam";
import { DevicePlayer } from "./DevicePlayer";
import { forgetDevice } from "./deviceStore";
import { deleteSavesFor } from "../storage/saves";
import { archiveId, importFiles } from "./importFiles";
import { Library } from "./Library";
import { Player } from "./Player";
import { Editor } from "../editor/ui/Editor";
import { bellGame, demoGame } from "./demoGame";
import { GitHubMark, REPO_URL } from "./links";
import { AboutPage, GuidePage, HomePage, NotFoundPage, SiteFooter } from "./pages";
import { Link, PAGES, navigate, usePage } from "./router";
import { setSiteLang, useSiteLang } from "./siteLang";
import { SITE_TEXT } from "./siteText";
import { gamesText } from "./gamesText";
import { Analytics } from "@vercel/analytics/react";

function copyBuffer(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer as ArrayBuffer;
}

/** Screens too narrow for the editor (phones). */
const SMALL_SCREEN = "(max-width: 760px)";

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const ch = () => setOn(m.matches);
    ch();
    m.addEventListener("change", ch);
    return () => m.removeEventListener("change", ch);
  }, [query]);
  return on;
}

export function App() {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [fonts, setFonts] = useState<{ hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null }>({ hzk16: null, asc16: null });
  // Phones get a note instead of the editor, unless they ask to continue.
  const smallScreen = useMedia(SMALL_SCREEN);
  const [editorAnyway, setEditorAnyway] = useState(false);
  const [playing, setPlaying] = useState<StoredGame | null>(null);
  // a program on the emulated 4988 (null: the device itself; undefined: none)
  const [device, setDevice] = useState<StoredGame | null | undefined>(undefined);
  const [firmware, setFirmware] = useState<RegionId[]>([]);
  const page = usePage();
  const lang = useSiteLang();
  const t = SITE_TEXT[lang];
  // each page has its own title in the browser tab
  useEffect(() => {
    document.title = SITE_TEXT[lang].titles[page];
  }, [page, lang]);
  const [playtestFrom, setPlaytestFrom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [persistent, setPersistent] = useState(true);

  const refresh = useCallback(async () => {
    const [g, h, a, fw] = await Promise.all([listGames(), getFont("HZK16"), getFont("ASC16"), listFirmware()]);
    setGames(g);
    setFirmware(fw);
    setFonts({ hzk16: h, asc16: a });
    setPersistent(isPersistent());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(
    async (files: File[]): Promise<StoredGame[]> => {
      if (files.length === 0) return [];
      setBusy(true);
      // (the games added, so the front page can start the one dropped there)
      const added: StoredGame[] = [];
      try {
        const { items, errors } = await importFiles(files);
        const notes = [...errors];
        for (const it of items) {
          if (it.kind === "font") {
            await putFont(it.font, copyBuffer(it.data));
            notes.push(gamesText().imported.font(it.font));
          } else if (it.kind === "firmware") {
            await putFirmwareFile(it.region, copyBuffer(it.data));
            notes.push(gamesText().imported.firmware(it.fileName));
          } else {
            const id = await archiveId(it.data);
            const g: StoredGame = {
              id,
              name: it.name,
              fileName: it.fileName,
              size: it.data.length,
              addedAt: Date.now(),
              data: copyBuffer(it.data),
              ...(it.kind === "program" && { format: "gam" as const, libOffset: findLib(it.data) >= 0 ? findLib(it.data) : undefined }),
            };
            await putGame(g);
            added.push(g);
            notes.push(it.kind === "program" ? gamesText().imported.program(it.name) : gamesText().imported.game(it.name, it.info.maps, it.info.scripts));
          }
        }
        setMessages(notes);
        await refresh();
      } finally {
        setBusy(false);
      }
      return added;
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (g: StoredGame) => {
      if (!confirm(gamesText().removeConfirm(g.name))) return;
      await deleteGame(g.id);
      deleteSavesFor(g.id);
      deleteSavesFor(`${g.id}-lib`);
      if (g.format === "gam") await forgetDevice(`gam:${g.id}`);
      await refresh();
    },
    [refresh],
  );

  const onExit = useCallback(() => {
    setPlaying(null);
    setDevice(undefined);
    setPlaytestFrom(false);
  }, []);
  /** A device program runs on the emulated 4988; an archive in this site's engine. */
  const play = useCallback((g: StoredGame) => (g.format === "gam" ? setDevice(g) : setPlaying(g)), []);
  /** A device program built on the fmj engine, in this site's engine instead (its own saves). */
  const playRemastered = useCallback((g: StoredGame) => {
    setPlaying({ ...g, id: `${g.id}-lib`, format: undefined, data: g.data.slice(g.libOffset) });
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const playDemo = (which?: "bell" | "lantern") => setPlaying(which === "lantern" ? demoGame() : bellGame());

  const onPlaytest = useCallback((p: { id: string; name: string; data: ArrayBuffer }) => {
    setPlaytestFrom(true);
    setPlaying({ id: p.id, name: p.name, fileName: "playtest", size: p.data.byteLength, addedAt: Date.now(), data: p.data });
  }, []);

  // Uploaded fonts are optional: the player falls back to the device's fonts.
  const fontPair = useMemo(() => ({ hzk16: fonts.hzk16, asc16: fonts.asc16 }), [fonts]);

  const showPlayer = !!playing || device !== undefined;
  return (
    <>
      {!showPlayer && (
        <header className="topbar">
          <Link to="home" className="brand" onClick={closeMenu}>
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>FMJ React</span>
          </Link>
          <nav className={menuOpen ? "site-nav open" : "site-nav"} id="site-nav" aria-label="Site">
            {PAGES.filter((p) => p.page !== "home").map((p) => (
              <Link key={p.page} to={p.page} onClick={closeMenu}>
                {t.nav[p.page]}
              </Link>
            ))}
            <a className="nav-ext" href={REPO_URL} target="_blank" rel="noreferrer" onClick={closeMenu}>
              <GitHubMark /> GitHub <span aria-hidden="true">↗</span>
            </a>
          </nav>
          <div className="topbar-actions">
            <button className="ghost nav-lang" onClick={() => setSiteLang(lang === "zh" ? "en" : "zh")} title={t.switchTitle} lang={lang === "zh" ? "en" : "zh-CN"}>
              {t.switchTo}
            </button>
            <button className="nav-play" onClick={() => playDemo("bell")}>
              {t.navPlay}
            </button>
            <button
              className="ghost nav-toggle"
              aria-label={t.menu}
              aria-expanded={menuOpen}
              aria-controls="site-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </header>
      )}
      {/* The editor needs room: on a phone, say so instead of showing a cramped editor. */}
      {!showPlayer && page === "editor" && smallScreen && !editorAnyway && (
        <section className="small-screen" role="note">
          <svg className="small-screen-icon" viewBox="0 0 48 40" width="56" height="46" aria-hidden="true">
            <rect x="3" y="3" width="42" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
            <rect x="9" y="9" width="30" height="14" fill="#a7ba82" />
            <path d="M18 37h12M24 30v7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <h2>The editor needs a bigger screen</h2>
          <p>
            Making a game means painting maps, editing scripts and drawing sprites, which needs more room than a phone has. Open this
            site on a computer or a tablet to use the editor.
          </p>
          <p className="muted small">Your phone is great for playing: games, saves and the built-in demos all work here.</p>
          <div className="row">
            <button onClick={() => navigate("games")}>Back to the games</button>
            <button className="ghost" onClick={() => setEditorAnyway(true)}>
              Continue anyway
            </button>
          </div>
        </section>
      )}
      {/* The editor stays mounted so an open project survives tab switches and playtests. */}
      <div hidden={showPlayer || page !== "editor" || (smallScreen && !editorAnyway)}>
        <Editor onPlaytest={onPlaytest} />
      </div>
      {device !== undefined ? (
        <DevicePlayer key={device?.id ?? "4988"} game={device} onExit={onExit} />
      ) : playing ? (
        <Player key={playing.id + (playtestFrom ? playing.addedAt : "")} game={playing} fonts={fontPair} onExit={onExit} />
      ) : (
        <>
          {page === "home" && (
            <HomePage
              onPlayDemo={playDemo}
              busy={busy}
              onOpenGames={async (files) => {
                // one game: play it; otherwise (several, fonts, errors) show them in the library
                const added = await onImport(files);
                if (added.length === 1) play(added[0]);
                else navigate("games");
              }}
            />
          )}
          {page === "games" && (
            <Library
              games={games}
              fonts={{ HZK16: !!fonts.hzk16, ASC16: !!fonts.asc16 }}
              persistent={persistent}
              busy={busy}
              messages={messages}
              onImport={onImport}
              firmware={{ files: firmware.length, ready: REQUIRED_REGIONS.every((r) => firmware.includes(r)) }}
              onPlay={play}
              onPlayRemastered={playRemastered}
              onTurnOn={() => setDevice(null)}
              onPlayDemo={playDemo}
              onDelete={onDelete}
            />
          )}
          {page === "guide" && <GuidePage />}
          {page === "about" && <AboutPage />}
          {page === "notfound" && <NotFoundPage onPlayDemo={playDemo} />}
          {page !== "editor" && <SiteFooter onPlayDemo={playDemo} />}
        </>
      )}
      {/* page views, one per page of the site */}
      <Analytics route={page === "notfound" ? "/404" : PAGES.find((p) => p.page === page)!.path} path={location.pathname} />
    </>
  );
}
