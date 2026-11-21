// The title screen's picture on the project home: what it shows (the title,
// the project name, or the author's own picture), kept in step with renames
// by the editor (template/titleLogo.ts), with a way to switch it or to
// replace an author's picture (asked first).
import { useEffect, useMemo, useRef } from "react";
import { decodeImage, decodeSrs } from "../format/decode";
import { findEntry, type LibArchive } from "../format/lib";
import { LOGO, LOGO_KEY, logoSource } from "../template/titleLogo";
import { blitFrame } from "./pixels";
import "./titleScreen.css";

interface Props {
  archive: LibArchive;
  /** The project name and the title in the game file. */
  name: string;
  title: string;
  /** Make the logo show this text (the editor's picture). */
  onLogo: (text: string) => void;
  onOpen: (key: string) => void;
}

/** The logo's first frame on a 160×96 screen. */
function LogoPreview({ data }: { data: Uint8Array | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = 160;
    c.height = 96;
    ctx.fillStyle = "rgb(167,186,130)";
    ctx.fillRect(0, 0, 160, 96);
    if (!data) return;
    try {
      const srs = decodeSrs(data);
      const f = srs.frames[0];
      const img = f ? srs.images[f.image] : undefined;
      const frame = img ? decodeImage(img).frames[0] : undefined;
      if (f && frame) blitFrame(ctx, frame, f.x, f.y, 1);
    } catch {
      /* a damaged picture: the empty screen */
    }
  }, [data]);
  return <canvas ref={canvas} className="ts-screen" role="img" aria-label="The title screen's picture" />;
}

export function TitleScreenCard({ archive, name, title, onLogo, onOpen }: Props) {
  const logo = findEntry(archive, LOGO.resType, LOGO.type, LOGO.index);
  const src = useMemo(() => logoSource(archive, title, name), [logo?.data, title, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const differ = title.trim().toUpperCase() !== name.trim().toUpperCase();
  const replace = (text: string) => {
    if (src === "drawn" && !confirm(`Replace your title-screen picture with one that shows “${text.toUpperCase()}”? The picture you drew is lost (Ctrl+Z does not bring it back).`)) return;
    onLogo(text);
  };
  return (
    <div className="ts-card" aria-label="Title screen">
      <span className="ts-label">Title screen</span>
      <div className="ts-row">
        <LogoPreview data={logo?.data ?? null} />
        <div className="ts-text small">
          {src === "title" && <p>Shows the title in the game file, and changes with it.</p>}
          {src === "name" && <p>Shows the project name in full, and changes with it.</p>}
          {src === "drawn" && <p>Your own picture: kept when you rename the game.</p>}
          {src === "none" && <p className="warn">The game has no title-screen picture.</p>}
          <div className="ts-actions">
            {src === "name" && differ && title.trim() && (
              <button type="button" className="link" onClick={() => replace(title)}>
                Show the title ({title.trim().toUpperCase()}) instead
              </button>
            )}
            {(src === "title" || src === "none") && differ && name.trim() && (
              <button type="button" className="link" onClick={() => replace(name)}>
                Show the project name instead
              </button>
            )}
            {(src === "drawn" || src === "none") && title.trim() && (
              <button type="button" className="link" onClick={() => replace(title)}>
                {src === "none" ? "Make one with the title" : `Replace it with “${title.trim().toUpperCase()}”…`}
              </button>
            )}
            {logo && (
              <button type="button" className="link" onClick={() => onOpen(LOGO_KEY)}>
                {src === "drawn" ? "Edit the picture" : "Draw your own"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
