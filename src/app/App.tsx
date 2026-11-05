import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteGame, getFont, isPersistent, listGames, putFont, putGame, type StoredGame } from "../storage/db";
import { deleteSavesFor } from "../storage/saves";
import { archiveId, importFiles } from "./importFiles";
import { Library } from "./Library";
import { Player } from "./Player";
import { Editor } from "../editor/ui/Editor";
import { bellGame, demoGame } from "./demoGame";

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
  const [tab, setTab] = useState<"play" | "editor">(() => (location.hash === "#editor" ? "editor" : "play"));
  const [playtestFrom, setPlaytestFrom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [persistent, setPersistent] = useState(true);

  const refresh = useCallback(async () => {
    const [g, h, a] = await Promise.all([listGames(), getFont("HZK16"), getFont("ASC16")]);
    setGames(g);
    setFonts({ hzk16: h, asc16: a });
    setPersistent(isPersistent());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        const { items, errors } = await importFiles(files);
        const notes = [...errors];
        for (const it of items) {
          if (it.kind === "font") {
            await putFont(it.font, copyBuffer(it.data));
            notes.push(`Added font ${it.font}.`);
          } else {
            const id = await archiveId(it.data);
            await putGame({
              id,
              name: it.name,
              fileName: it.fileName,
              size: it.data.length,
              addedAt: Date.now(),
              data: copyBuffer(it.data),
            });
            notes.push(`Added ${it.name}: ${it.info.maps} maps, ${it.info.scripts} scripts.`);
          }
        }
        setMessages(notes);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (g: StoredGame) => {
      if (!confirm(`Remove “${g.name}” and its save slots from this browser?`)) return;
      await deleteGame(g.id);
      deleteSavesFor(g.id);
      await refresh();
    },
    [refresh],
  );

  const onExit = useCallback(() => {
    setPlaying(null);
    setPlaytestFrom(false);
  }, []);

  const switchTab = (t: "play" | "editor") => {
    setTab(t);
    history.replaceState(null, "", t === "editor" ? "#editor" : "#");
  };

  const onPlaytest = useCallback((p: { id: string; name: string; data: ArrayBuffer }) => {
    setPlaytestFrom(true);
    setPlaying({ id: p.id, name: p.name, fileName: "playtest", size: p.data.byteLength, addedAt: Date.now(), data: p.data });
  }, []);

  // Uploaded fonts are optional: the player falls back to the device's fonts.
  const fontPair = useMemo(() => ({ hzk16: fonts.hzk16, asc16: fonts.asc16 }), [fonts]);

  const showPlayer = !!playing;
  return (
    <>
      {!showPlayer && (
        <header className="topbar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              switchTab("play");
            }}
          >
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>FMJ React</span>
          </a>
          <nav className="tabs" aria-label="Sections">
            <button className={tab === "play" ? "" : "ghost"} aria-current={tab === "play" ? "page" : undefined} onClick={() => switchTab("play")}>
              Play
            </button>
            <button className={tab === "editor" ? "" : "ghost"} aria-current={tab === "editor" ? "page" : undefined} onClick={() => switchTab("editor")}>
              Editor
            </button>
          </nav>
        </header>
      )}
      {/* The editor needs room: on a phone, say so instead of showing a cramped editor. */}
      {!showPlayer && tab === "editor" && smallScreen && !editorAnyway && (
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
            <button onClick={() => switchTab("play")}>Back to the games</button>
            <button className="ghost" onClick={() => setEditorAnyway(true)}>
              Continue anyway
            </button>
          </div>
        </section>
      )}
      {/* The editor stays mounted so an open project survives tab switches and playtests. */}
      <div hidden={showPlayer || tab !== "editor" || (smallScreen && !editorAnyway)}>
        <Editor onPlaytest={onPlaytest} />
      </div>
      {showPlayer ? (
        <Player key={playing!.id + (playtestFrom ? playing!.addedAt : "")} game={playing!} fonts={fontPair} onExit={onExit} />
      ) : (
        tab === "play" && (
          <Library
            games={games}
            fonts={{ HZK16: !!fonts.hzk16, ASC16: !!fonts.asc16 }}
            persistent={persistent}
            busy={busy}
            messages={messages}
            onImport={onImport}
            onPlay={setPlaying}
            onPlayDemo={(which) => setPlaying(which === "lantern" ? demoGame() : bellGame())}
            onOpenEditor={() => switchTab("editor")}
            onDelete={onDelete}
          />
        )
      )}
    </>
  );
}
