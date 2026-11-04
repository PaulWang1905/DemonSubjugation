import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteGame, getFont, isPersistent, listGames, putFont, putGame, type StoredGame } from "../storage/db";
import { deleteSavesFor } from "../storage/saves";
import { archiveId, importFiles } from "./importFiles";
import { Library } from "./Library";
import { Player } from "./Player";

function copyBuffer(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer as ArrayBuffer;
}

export function App() {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [fonts, setFonts] = useState<{ hzk16: ArrayBuffer | null; asc16: ArrayBuffer | null }>({ hzk16: null, asc16: null });
  const [playing, setPlaying] = useState<StoredGame | null>(null);
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

  const onExit = useCallback(() => setPlaying(null), []);

  const fontPair = useMemo(
    () => (fonts.hzk16 && fonts.asc16 ? { hzk16: fonts.hzk16, asc16: fonts.asc16 } : null),
    [fonts],
  );

  if (playing && fontPair) {
    return <Player key={playing.id} game={playing} fonts={fontPair} onExit={onExit} />;
  }

  return (
    <Library
      games={games}
      fonts={{ HZK16: !!fonts.hzk16, ASC16: !!fonts.asc16 }}
      persistent={persistent}
      busy={busy}
      messages={messages}
      onImport={onImport}
      onPlay={setPlaying}
      onDelete={onDelete}
    />
  );
}
