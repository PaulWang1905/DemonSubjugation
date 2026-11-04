import { useEffect, useRef, useState } from "react";
import { decodeImage } from "../format/decode";
import { encodeImage, type Frame } from "../format/encode";
import type { LibEntry } from "../format/lib";
import { FrameCanvas } from "./FrameStrip";
import { DARK, LIGHT, floodFill, frameToImageData, resizeFrame, rgbaToFrame, sliceSheet } from "./pixels";

type Tool = "pen" | "fill" | "pick";
const COLORS: [number, string][] = [
  [1, "Black"],
  [0, "White"],
  [2, "Transparent"],
];

interface Props {
  entry: LibEntry;
  onChange: (data: Uint8Array) => void;
  hint?: string;
}

async function readPng(file: File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

export function PixelEditor({ entry, onChange, hint }: Props) {
  const [frames, setFrames] = useState<Frame[]>(() => decodeImage(entry.data).frames);
  const [cur, setCur] = useState(0);
  const [color, setColor] = useState(1);
  const [tool, setTool] = useState<Tool>("pen");
  const [zoom, setZoom] = useState(12);
  const [threshold, setThreshold] = useState(128);
  const [error, setError] = useState<string | null>(null);
  const undo = useRef<Frame[][]>([]);
  const redo = useRef<Frame[][]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Frame[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"frame" | "sheet">("frame");

  // No reload on entry changes: the view is re-created when another resource
  // is selected, and reloading after our own saves would wipe the undo history.

  const f = frames[Math.min(cur, frames.length - 1)];

  useEffect(() => {
    const c = canvas.current;
    if (!c || !f) return;
    c.width = f.width * zoom;
    c.height = f.height * zoom;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const tmp = document.createElement("canvas");
    tmp.width = f.width;
    tmp.height = f.height;
    tmp.getContext("2d")!.putImageData(frameToImageData(f), 0, 0);
    ctx.drawImage(tmp, 0, 0, c.width, c.height);
    if (zoom >= 6) {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      for (let x = 0; x <= f.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, c.height);
        ctx.stroke();
      }
      for (let y = 0; y <= f.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(c.width, y * zoom + 0.5);
        ctx.stroke();
      }
    }
  }, [f, zoom]);

  const commit = (next: Frame[], record = true) => {
    try {
      const bytes = encodeImage(entry.type, entry.index, next);
      if (record) {
        undo.current.push(frames);
        if (undo.current.length > 100) undo.current.shift();
        redo.current = [];
      }
      setFrames(next);
      setError(null);
      onChange(bytes);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setPixel = (list: Frame[], x: number, y: number, v: number): Frame[] => {
    const fr = list[cur];
    if (x < 0 || y < 0 || x >= fr.width || y >= fr.height || fr.pixels[y * fr.width + x] === v) return list;
    const pixels = fr.pixels.slice();
    pixels[y * fr.width + x] = v;
    return list.map((g, i) => (i === cur ? { ...g, pixels } : g));
  };

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * f.width), Math.floor(((e.clientY - r.top) / r.height) * f.height)];
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = at(e);
    if (x < 0 || y < 0 || x >= f.width || y >= f.height) return;
    const paint = e.button === 2 ? (color === 1 ? 0 : 1) : color;
    if (tool === "pick") {
      setColor(f.pixels[y * f.width + x]);
      setTool("pen");
      return;
    }
    if (tool === "fill") {
      commit(frames.map((g, i) => (i === cur ? floodFill(g, x, y, paint) : g)));
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = frames;
    setFrames(setPixel(frames, x, y, paint));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || tool !== "pen") return;
    const [x, y] = at(e);
    const paint = e.buttons === 2 ? (color === 1 ? 0 : 1) : color;
    setFrames((list) => setPixel(list, x, y, paint));
  };
  const up = () => {
    if (!drawing.current) return;
    const before = drawing.current;
    drawing.current = null;
    undo.current.push(before);
    redo.current = [];
    commit(frames, false);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(frames);
    commit(prev, false);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(frames);
    commit(next, false);
  };

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z while the editor is on screen and no text field has focus.
  const keys = useRef({ doUndo, doRedo });
  keys.current = { doUndo, doRedo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!canvas.current || canvas.current.offsetParent === null) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) keys.current.doUndo();
      else if (k === "y" || (k === "z" && e.shiftKey)) keys.current.doRedo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const importPng = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { data, width, height } = await readPng(file);
      const sheet = rgbaToFrame(data, width, height, threshold);
      if (importMode === "sheet") {
        const parts = sliceSheet(sheet, f.width, f.height);
        if (parts.length === 0) throw new Error(`The image is smaller than one ${f.width}x${f.height} frame`);
        commit(parts.slice(0, 255));
        setCur(0);
      } else {
        const fitted = resizeFrame(sheet, f.width, f.height, 2);
        commit(frames.map((g, i) => (i === cur ? fitted : g)));
      }
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
  };

  const exportPng = () => {
    const c = document.createElement("canvas");
    c.width = f.width;
    c.height = f.height;
    const img = frameToImageData(f);
    for (let i = 0; i < f.pixels.length; i++) if (f.pixels[i] === 2) img.data[i * 4 + 3] = 0;
    c.getContext("2d")!.putImageData(img, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `image-${entry.type}-${entry.index}-frame${cur + 1}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  };

  const resizeAll = (w: number, h: number) => {
    if (!(w >= 1 && w <= 255 && h >= 1 && h <= 255)) return setError("Size must be 1-255 pixels");
    commit(frames.map((g) => resizeFrame(g, w, h, 2)));
  };

  if (!f) return <p className="error">This image has no frames.</p>;

  return (
    <div className="pixel-editor">
      {hint && <p className="muted small">{hint}</p>}
      <div className="map-tools">
        <div className="seg">
          {COLORS.map(([v, l]) => (
            <button key={v} className={`swatch ${color === v ? "sel" : ""}`} onClick={() => setColor(v)} title={l}>
              <span className={`chipc c${v}`} style={v === 2 ? undefined : { background: `rgb(${(v === 1 ? DARK : LIGHT).join(",")})` }} />
              {l}
            </button>
          ))}
        </div>
        <div className="seg">
          {(
            [
              ["pen", "Pen"],
              ["fill", "Fill"],
              ["pick", "Pick"],
            ] as [Tool, string][]
          ).map(([t, l]) => (
            <button key={t} className={tool === t ? "" : "ghost"} onClick={() => setTool(t)}>
              {l}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={doUndo} title="Ctrl+Z">
          Undo
        </button>
        <button className="ghost" onClick={doRedo} title="Ctrl+Shift+Z">
          Redo
        </button>
        <label className="field">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[2, 4, 6, 8, 12, 16, 24].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pixel-body">
        <div className="map-canvas">
          <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={(e) => e.preventDefault()} />
        </div>
        <div className="pixel-side">
          <div className="row">
            <strong>
              Frame {cur + 1} / {frames.length}
            </strong>
            <span className="muted small">
              {f.width}×{f.height}
            </span>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => commit([...frames.slice(0, cur + 1), { ...f, pixels: f.pixels.slice() }, ...frames.slice(cur + 1)])} disabled={frames.length >= 255}>
              Duplicate
            </button>
            <button className="ghost" onClick={() => commit([...frames.slice(0, cur + 1), { ...f, pixels: new Uint8Array(f.pixels.length).fill(2) }, ...frames.slice(cur + 1)])} disabled={frames.length >= 255}>
              + Blank
            </button>
            <button
              className="ghost danger"
              onClick={() => {
                commit(frames.filter((_, i) => i !== cur));
                setCur(Math.max(0, cur - 1));
              }}
              disabled={frames.length <= 1}
            >
              Delete
            </button>
          </div>
          <div className="row">
            <button className="ghost" disabled={cur === 0} onClick={() => { commit(frames.map((g, i) => (i === cur - 1 ? frames[cur] : i === cur ? frames[cur - 1] : g))); setCur(cur - 1); }}>
              ← Move
            </button>
            <button className="ghost" disabled={cur === frames.length - 1} onClick={() => { commit(frames.map((g, i) => (i === cur + 1 ? frames[cur] : i === cur ? frames[cur + 1] : g))); setCur(cur + 1); }}>
              Move →
            </button>
          </div>
          <label className="field">
            Size
            <input type="number" key={`w${f.width}`} defaultValue={f.width} onBlur={(e) => Number(e.target.value) !== f.width && resizeAll(Number(e.target.value), f.height)} />×
            <input type="number" key={`h${f.height}`} defaultValue={f.height} onBlur={(e) => Number(e.target.value) !== f.height && resizeAll(f.width, Number(e.target.value))} />
          </label>
          <fieldset className="import">
            <legend>PNG</legend>
            <label className="field">
              <select value={importMode} onChange={(e) => setImportMode(e.target.value as "frame" | "sheet")}>
                <option value="frame">Import into this frame</option>
                <option value="sheet">Import sheet (slice into frames)</option>
              </select>
            </label>
            <label className="field">
              Dark below
              <input type="range" min={16} max={240} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </label>
            <div className="row">
              <button className="ghost" onClick={() => fileInput.current?.click()}>
                Import PNG…
              </button>
              <button className="ghost" onClick={exportPng}>
                Export frame
              </button>
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void importPng(e.target.files?.[0]); e.target.value = ""; }} />
          </fieldset>
          {error && <p className="error small">{error}</p>}
          <p className="muted small">Left click paints, right click paints the opposite colour.</p>
        </div>
      </div>
      <div className="frames">
        {frames.map((g, i) => (
          <figure key={i} className={i === cur ? "sel" : ""} onClick={() => setCur(i)}>
            <FrameCanvas frame={g} scale={g.width > 64 ? 1 : 2} />
            <figcaption>{i + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
