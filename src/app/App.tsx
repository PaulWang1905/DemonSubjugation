import { isReactOnly, preferredEngine } from "../bbk/gamBuild";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoryNames } from "./DebugMenu";
import { deleteGame, getFont, isPersistent, listFirmware, listGames, putFirmwareFile, putFont, putGame, type StoredGame } from "../storage/db";
import { REQUIRED_REGIONS, type RegionId } from "../bbk/firmware";
import { findLib } from "../bbk/gam";
import { DevicePlayer } from "./DevicePlayer";
import { forgetDevice, forgetSlots } from "./deviceStore";
import { deleteSavesFor } from "../storage/saves";
import { archiveId, importFiles } from "./importFiles";
import { FuluPage } from "./FuluPage";
import { FuluProgressPage } from "./FuluProgressPage";
import { Library } from "./Library";
import { engineFor, type EngineId } from "./engines";
import { Player } from "./Player";
import { Editor } from "../editor/ui/Editor";
import { bellGame, demoGame } from "./demoGame";
import { GitHubMark, REPO_URL } from "./links";
import { HomePage, NotFoundPage, SiteFooter } from "./pages";
import { AboutPage, GuidePage } from "./InfoPages";
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
  /** The OS the device program runs on. */
  const [deviceOs, setDeviceOs] = useState<"original" | "fulu">("original");
  const [firmware, setFirmware] = useState<RegionId[]>([]);
  const firmwareReady = REQUIRED_REGIONS.every((r) => firmware.includes(r));
  const page = usePage();
  const lang = useSiteLang();
  const t = SITE_TEXT[lang];
  // each page has its own title in the browser tab, and its own description
  useEffect(() => {
    document.title = SITE_TEXT[lang].titles[page];
    document.querySelector('meta[name="description"]')?.setAttribute("content", SITE_TEXT[lang].descriptions[page]);
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
          try {
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
                ...(it.kind === "program" && {
                  format: "gam" as const,
                  libOffset: findLib(it.data) >= 0 ? findLib(it.data) : undefined,
                  engine: preferredEngine(new Uint8Array(it.data)) ?? undefined,
                  reactOnly: isReactOnly(new Uint8Array(it.data)) || undefined,
                }),
              };
              await putGame(g);
              added.push(g);
              notes.push(it.kind === "program" ? gamesText().imported.program(it.name) : gamesText().imported.game(it.name, it.info.maps, it.info.scripts));
            }
          } catch (e) {
            // (the browser's storage refused it: say so, rather than show it added)
            notes.push(gamesText().imported.notStored(it.kind === "font" ? it.font : it.kind === "firmware" ? it.fileName : it.name, String((e as Error).message ?? e)));
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
      try {
        await deleteGame(g.id);
      } catch (e) {
        setMessages([gamesText().imported.notRemoved(g.name, String((e as Error).message ?? e))]);
        return;
      }
      deleteSavesFor(g.id);
      deleteSavesFor(`${g.id}-lib`);
      if (g.format === "gam") {
        for (const id of [`gam:${g.id}`, `gam:${g.id}:fulu`]) {
          await forgetDevice(id);
          await forgetSlots(id);
        }
      }
      await refresh();
    },
    [refresh],
  );

  const onExit = useCallback(() => {
    setPlaying(null);
    setDevice(undefined);
    setPlaytestFrom(false);
  }, []);
  /**
   * Play a game on an engine (by default the one chosen for it, or its
   * default): an archive, or a device program's library, in this site's
   * engine (the library with its own saves); a device program on the
   * emulated 4988, on its firmware or on Fulu.
   */
  const play = useCallback(
    (g: StoredGame, engine: EngineId = engineFor(g, firmwareReady)) => {
      // (remembered for the library's order; playtests and the demos are not stored)
      if (games.some((s) => s.id === g.id)) void putGame({ ...g, playedAt: Date.now() }).then(refresh, (e) => console.warn("Could not note when the game was played", e));
      if (engine === "react") setPlaying(g.format === "gam" ? { ...g, id: `${g.id}-lib`, format: undefined, data: g.data.slice(g.libOffset) } : g);
      else {
        setDeviceOs(engine);
        setDevice(g);
      }
    },
    [firmwareReady, games, refresh],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const playDemo = (which?: "bell" | "lantern") => setPlaying(which === "lantern" ? demoGame() : bellGame());

  const [playtestNames, setPlaytestNames] = useState<StoryNames | undefined>(undefined);
  const onPlaytest = useCallback((p: { id: string; name: string; data: ArrayBuffer; names?: StoryNames }) => {
    setPlaytestFrom(true);
    setPlaytestNames(p.names);
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
          <nav className={menuOpen ? "site-nav open" : "site-nav"} id="site-nav" aria-label={t.navLabel}>
            {PAGES.filter((p) => p.page !== "home" && !p.parent).map((p) => (
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
          <h1>{t.smallScreen.title}</h1>
          <p>{t.smallScreen.text}</p>
          <p className="muted small">{t.smallScreen.note}</p>
          <div className="row">
            <button onClick={() => navigate("games")}>{t.smallScreen.back}</button>
            <button className="ghost" onClick={() => setEditorAnyway(true)}>
              {t.smallScreen.anyway}
            </button>
          </div>
        </section>
      )}
      {/* The editor stays mounted so an open project survives tab switches and playtests. */}
      <div hidden={showPlayer || page !== "editor" || (smallScreen && !editorAnyway)}>
        <Editor onPlaytest={onPlaytest} />
      </div>
      {device !== undefined ? (
        <DevicePlayer key={`${device?.id ?? "4988"}:${deviceOs}`} game={device} os={device ? deviceOs : "original"} onExit={onExit} />
      ) : playing ? (
        <Player key={playing.id + (playtestFrom ? playing.addedAt : "")} game={playing} fonts={fontPair} onExit={onExit} backTo={playtestFrom ? "editor" : "library"} names={playtestFrom ? playtestNames : undefined} />
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
              firmware={{ files: firmware.length, ready: firmwareReady }}
              onPlay={play}
              onTurnOn={() => setDevice(null)}
              onPlayDemo={playDemo}
              onDelete={onDelete}
            />
          )}
          {page === "guide" && <GuidePage onPlayDemo={() => playDemo("bell")} />}
          {page === "fulu" && <FuluPage />}
          {page === "fulu-progress" && <FuluProgressPage />}
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
