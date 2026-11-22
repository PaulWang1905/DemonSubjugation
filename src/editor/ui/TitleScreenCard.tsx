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

/**
 * The title animation's clearest moment on a 160×96 screen (0 light, 1 dark,
 * 2 nothing drawn): it is played as the engine plays it (each frame stays
 * `show` ticks, the next starts after `next`), and kept at the tick where its
 * largest picture (the logo itself) is on screen and least covered. A game's
 * title often starts empty and wipes in and out (伏魔记's), so its first
 * frame alone can be blank, and the moment with the most ink can be a curtain.
 */
export function logoStill(data: Uint8Array, maxTicks = 600): Uint8Array | null {
  const srs = decodeSrs(data);
  if (!srs.frames.length) return null;
  const imgs = srs.images.map((b) => {
    try {
      return decodeImage(b).frames[0];
    } catch {
      return undefined;
    }
  });
  const area = (i: number) => {
    const im = imgs[srs.frames[i].image];
    return im ? im.width * im.height : 0;
  };
  let big = 0;
  for (let i = 1; i < srs.frames.length; i++) if (area(i) > area(big)) big = i;
  const bf = srs.frames[big];
  const bim = imgs[bf.image];
  let keys = [{ i: 0, show: srs.frames[0].show, next: srs.frames[0].next }];
  let best: Uint8Array | null = null;
  let bestScore = -1;
  for (let t = 0; t < maxTicks && keys.length; t++) {
    const px = new Uint8Array(160 * 96).fill(2);
    for (const k of keys) {
      const f = srs.frames[k.i];
      const im = imgs[f.image];
      if (!im) continue;
      for (let y = 0; y < im.height; y++)
        for (let x = 0; x < im.width; x++) {
          const v = im.pixels[y * im.width + x];
          const X = f.x + x;
          const Y = f.y + y;
          if (v === 2 || X < 0 || Y < 0 || X >= 160 || Y >= 96) continue;
          px[Y * 160 + X] = v;
        }
    }
    // (how much of the largest picture shows as itself; the first such moment)
    let score = 0;
    if (bim && keys.some((k) => k.i === big))
      for (let y = 0; y < bim.height; y++)
        for (let x = 0; x < bim.width; x++) {
          const X = bf.x + x;
          const Y = bf.y + y;
          if (X >= 0 && Y >= 0 && X < 160 && Y < 96 && bim.pixels[y * bim.width + x] !== 2 && px[Y * 160 + X] === bim.pixels[y * bim.width + x]) score++;
        }
    if (!bim) for (let i = 0; i < px.length; i++) if (px[i] === 1) score++;
    if (score > bestScore) (bestScore = score), (best = px);
    const after: typeof keys = [];
    for (const k of keys) {
      k.show--;
      k.next--;
      after.push(k);
      if (k.next === 0 && k.i + 1 < srs.frames.length) {
        const f = srs.frames[k.i + 1];
        after.push({ i: k.i + 1, show: f.show, next: f.next });
      }
    }
    keys = after.filter((k) => k.show > 0);
  }
  return best;
}

/** The title animation on a 160×96 screen, at its fullest moment. */
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
      const px = logoStill(data);
      if (px) blitFrame(ctx, { width: 160, height: 96, pixels: px } as Parameters<typeof blitFrame>[1], 0, 0, 1);
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
