// The game's text box for a dialogue step, drawn as the player will see it:
// the 160×96 screen, the box, the portrait, the text in the player's 16 px
// font laid out as the engine lays it out (format/dialogueBox.ts), one page
// at a time, with words split across lines marked.
import { useEffect, useMemo, useRef, useState } from "react";
import type { OperandValue } from "../format/commands";
import { decodeImage } from "../format/decode";
import type { Frame } from "../format/encode";
import { layoutChoice, layoutMessage, layoutSay, layoutShowgut, type BoxLayout, type SplitWord } from "../format/dialogueBox";
import { findEntry, type LibArchive } from "../format/lib";
import { previewFonts, type PreviewFonts } from "./dialogueFonts";
import { bareAnswers } from "../format/scriptHelp";
import { renderBox, toImageData } from "./dialogueRender";
import { DARK, LIGHT } from "./pixels";

/** The layout of a dialogue instruction with these operand values. */
export function dialogueLayout(name: string, values: readonly OperandValue[]): BoxLayout | null {
  const s = (k: number) => String(values[k] ?? "");
  switch (name) {
    case "say":
      return layoutSay(s(1), values[0] !== 0);
    case "message":
      return layoutMessage(s(0));
    case "timemsg":
      return layoutMessage(s(1));
    case "choice":
      return layoutChoice(s(0), s(1));
    case "showgut":
      return layoutShowgut(s(2));
    default:
      return null;
  }
}

/** A picture's first frame (null when there is none). */
export function pictureFrame(archive: LibArchive, type: number, index: number): Frame | null {
  if (!index) return null;
  const e = findEntry(archive, 11, type, index);
  if (!e) return null;
  try {
    return decodeImage(e.data).frames[0] ?? null;
  } catch {
    return null;
  }
}

/** Problems a box's layout shows: split words, text past the box; for a choice, answers that need the question (`values`). */
export function layoutIssues(l: BoxLayout | null, values: readonly OperandValue[] = []): string[] {
  if (!l) return [];
  const out: string[] = [];
  if (l.kind === "choice" && bareAnswers(String(values[0] ?? ""), String(values[1] ?? ""))) out.push("these answers need the question, which the player no longer sees: say what each does (“Rest (10 gold)” / “Leave”)");
  if ((l.kind === "say" || l.kind === "message") && l.split.length) out.push(`${l.split.map((w) => `“${w.text}”`).join(", ")} split across lines of the box`);
  if (l.kind === "message" && l.cutFrom !== null) out.push("the text is longer than the box: the end is not shown");
  if (l.kind === "choice" && l.overflow) out.push("the answers are too long for the screen");
  return out;
}

interface Props {
  archive: LibArchive;
  name: string;
  values: readonly OperandValue[];
  /** Re-wrap this step's text (null when it cannot be: a choice, raw bytes). */
  onWrap: (() => void) | null;
}

const SCALE = 2;

export function DialoguePreview({ archive, name, values, onWrap }: Props) {
  const [fonts, setFonts] = useState<PreviewFonts | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    previewFonts().then(
      (f) => alive && setFonts(f),
      (e) => alive && setFontError(String((e as Error).message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  const layout = useMemo(() => dialogueLayout(name, values), [name, values]);
  const pages = layout?.kind === "say" ? layout.pages.length : 1;
  const at = Math.min(page, pages - 1);
  const pics = useMemo(
    () => ({
      portrait: name === "say" ? pictureFrame(archive, 1, Number(values[0])) : null,
      top: name === "showgut" ? pictureFrame(archive, 5, Number(values[0])) : null,
      bottom: name === "showgut" ? pictureFrame(archive, 5, Number(values[1])) : null,
    }),
    [archive, name, values],
  );

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !layout) return;
    const bmp = renderBox(layout, { fonts: fonts ?? { hzk: null, asc: null }, page: at, ...pics });
    const img = toImageData(bmp, LIGHT, DARK);
    const off = document.createElement("canvas");
    off.width = 160;
    off.height = 96;
    off.getContext("2d")?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(off, 0, 0, 160 * SCALE, 96 * SCALE);
    // words split across lines: underline them on this page
    const split: SplitWord[] = layout.kind === "say" || layout.kind === "message" ? layout.split : [];
    const glyphs = layout.kind === "say" ? (layout.pages[at]?.glyphs ?? []) : layout.kind === "message" ? layout.page.glyphs : [];
    ctx.fillStyle = "rgba(214, 92, 40, 0.9)";
    for (const w of split) {
      for (const g of glyphs) {
        if (g.at < w.from || g.at >= w.to) continue;
        ctx.fillRect(g.x * SCALE, (g.y + 15) * SCALE, (g.wide ? 16 : 8) * SCALE, SCALE);
        ctx.fillStyle = "rgba(214, 92, 40, 0.22)";
        ctx.fillRect(g.x * SCALE, g.y * SCALE, (g.wide ? 16 : 8) * SCALE, 15 * SCALE);
        ctx.fillStyle = "rgba(214, 92, 40, 0.9)";
      }
    }
  }, [layout, fonts, at, pics]);

  if (!layout) return null;
  const issues = layoutIssues(layout, values);
  const what = name === "say" ? (values[0] ? "with a portrait: 11, then 15 letters a line" : "without a portrait: 15 letters a line") : name === "choice" ? "the first answer selected" : name === "showgut" ? `${layout.kind === "showgut" ? layout.rows.length : 0} lines that scroll up` : "15 letters a line";
  return (
    <figure className="sv-preview" aria-label="How the player sees it">
      <canvas ref={canvas} width={160 * SCALE} height={96 * SCALE} className="sv-screen" role="img" aria-label={`The game's screen showing this ${name === "say" ? "dialogue" : "box"}${pages > 1 ? `, page ${at + 1} of ${pages}` : ""}`} />
      <figcaption>
        {pages > 1 && (
          <div className="sv-pages" role="group" aria-label="Pages">
            <button type="button" className="ghost small" disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="Previous page">
              ‹
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" className={`ghost small${i === at ? " on" : ""}`} aria-pressed={i === at} onClick={() => setPage(i)} title={`Page ${i + 1}`}>
                {i + 1}
              </button>
            ))}
            <button type="button" className="ghost small" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label="Next page">
              ›
            </button>
            <span className="muted small">
              page {at + 1} of {pages}: a key shows the next
            </span>
          </div>
        )}
        {name === "choice" && (
          <p className="small" role="note">
            The player sees only the answers: the dialogue before them has closed (as on the device). Make each answer say what it does, as the original games do (“Return it” / “Keep it”).
          </p>
        )}
        <p className="muted small">
          The box {what}.{" "}
          {fonts ? <span title="The preview uses the player's fonts">Font: {fonts.label}.</span> : fontError ? <span className="warn-text">The font did not load ({fontError}).</span> : <span>Loading the font…</span>}
        </p>
        {issues.map((t) => (
          <p key={t} className="sv-issue small" role="note">
            ⚠ {t}
          </p>
        ))}
        {onWrap && layout.kind !== "choice" && layout.kind !== "showgut" && (
          <button type="button" className="ghost small" onClick={onWrap} disabled={!issues.length} title="Re-wrap the text so no word is split across lines">
            Wrap
          </button>
        )}
      </figcaption>
    </figure>
  );
}
