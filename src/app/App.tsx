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

export function App() {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [fonts, setFonts] = useState<{ hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null }>({ hzk16: null, asc16: null });
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
      {/* The editor stays mounted so an open project survives tab switches and playtests. */}
      <div hidden={showPlayer || tab !== "editor"}>
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
