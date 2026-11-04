import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage, decodeSrs, srsDamaged, srsWarnings, type DecodedSrs } from "../format/decode";
import { encodeImage, encodeSrsParts, type Frame, type SrsFrame } from "../format/encode";
import type { LibEntry } from "../format/lib";
import { ResSrs } from "../../engine/fmj/lib/ResSrs";
import { TICK_MS } from "../../engine";
import { FrameCanvas } from "./FrameStrip";
import { PixelEditor } from "./PixelEditor";
import { LIGHT, blitFrame } from "./pixels";
import { useUndoKeys } from "./undoKeys";

const SCREEN_W = 160;
const SCREEN_H = 96;
const HISTORY = 100;
const MAX_TICKS = 3000;

interface Props {
  entry: LibEntry;
  onChange: (data: Uint8Array) => void;
}

/** Which frames the engine shows on each tick, using the engine's own ResSrs. */
function timeline(bytes: Uint8Array | null, iterations: number): number[][] {
  if (!bytes) return [[]];
  const s = new ResSrs();
  s.setData(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), 0);
  s.setIteratorNum(iterations);
  s.start();
  const out = [s.visibleFrames()];
  while (out.length < MAX_TICKS && s.update(TICK_MS)) out.push(s.visibleFrames());
  return out;
}

function tryEncode(d: DecodedSrs): { bytes: Uint8Array | null; error: string | null } {
  try {
    return { bytes: encodeSrsParts(d), error: null };
  } catch (e) {
    return { bytes: null, error: (e as Error).message };
  }
}

const blankImage = (w = 16, h = 16): Uint8Array => encodeImage(1, 1, [{ width: w, height: h, pixels: new Uint8Array(w * h).fill(2) }]);

/** Editor for SRS animations: frame list, timing, positions and images. */
export function AnimationEditor({ entry, onChange }: Props) {
  if (srsDamaged(entry.data)) {
    return (
      <p className="error">
        This animation's data is damaged: its frame table runs past the end of the resource. The engine skips it; it cannot be
        edited here.
      </p>
    );
  }
  return <AnimationForm entry={entry} onChange={onChange} />;
}

function AnimationForm({ entry, onChange }: Props) {
  const [srs, setSrs] = useState<DecodedSrs>(() => decodeSrs(entry.data));
  const [sel, setSel] = useState(0);
  const [imgSel, setImgSel] = useState(0);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  // Combat effects (type 2) are stepped twice per tick by the engine.
  const [combat, setCombat] = useState(entry.type === 2);
  const [zoom, setZoom] = useState(3);
  const [error, setError] = useState<string | null>(null);
  // bumped by undo/redo so the embedded pixel editor reloads its image
  const [version, setVersion] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const undo = useRef<DecodedSrs[]>([]);
  const redo = useRef<DecodedSrs[]>([]);
  const lastTag = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; before: DecodedSrs } | null>(null);

  const { bytes, error: encodeError } = useMemo(() => tryEncode(srs), [srs]);
  const seq = useMemo(() => timeline(bytes, combat ? 2 : 1), [bytes, combat]);
  const images: (Frame | undefined)[] = useMemo(() => srs.images.map((b) => decodeImage(b).frames[0]), [srs.images]);
  const warnings = useMemo(() => srsWarnings(srs), [srs]);
  const t = Math.min(tick, seq.length - 1);
  const visible = seq[t] ?? [];

  // --- history -------------------------------------------------------------

  const save = (next: DecodedSrs) => {
    setSrs(next);
    const r = tryEncode(next);
    if (r.bytes) {
      onChange(r.bytes);
      setError(null);
    } else setError(r.error);
  };

  const commit = (next: DecodedSrs, tag: string | null = null) => {
    if (tag === null || tag !== lastTag.current) {
      undo.current.push(srs);
      if (undo.current.length > HISTORY) undo.current.shift();
    }
    lastTag.current = tag;
    redo.current = [];
    save(next);
  };

  const step = (from: React.MutableRefObject<DecodedSrs[]>, to: React.MutableRefObject<DecodedSrs[]>) => {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(srs);
    lastTag.current = null;
    save(s);
    setVersion((v) => v + 1);
  };
  const doUndo = () => step(undo, redo);
  const doRedo = () => step(redo, undo);
  useUndoKeys(canvas, doUndo, doRedo);

  /** Replace the frame list, keeping the header's last-frame byte in step. */
  const setFrames = (frames: SrsFrame[], tag: string | null = null) => {
    const end = srs.end === srs.frames.length - 1 ? Math.max(0, frames.length - 1) : srs.end;
    commit({ ...srs, frames, end }, tag);
  };
  const setFrame = (i: number, patch: Partial<SrsFrame>, tag: string | null = null) =>
    setFrames(
      srs.frames.map((f, k) => (k === i ? { ...f, ...patch } : f)),
      tag,
    );

  /** Change the image list; drops images the header declared but never stored. */
  const setImages = (images: Uint8Array[], remap?: (i: number) => number) =>
    commit({
      ...srs,
      images,
      frames: remap ? srs.frames.map((f) => ({ ...f, image: remap(f.image) })) : srs.frames,
      missingImages: 0,
      tail: new Uint8Array(0),
    });

  // --- playback ------------------------------------------------------------

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loopFn = (now: number) => {
      acc += Math.min(now - last, 250);
      last = now;
      let n = 0;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        n++;
      }
      if (n) {
        setTick((cur) => {
          const next = cur + n;
          if (next < seq.length) return next;
          if (loop) return next % seq.length;
          setPlaying(false);
          return seq.length - 1;
        });
      }
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, seq.length]);

  // --- drawing -------------------------------------------------------------

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = SCREEN_W * zoom;
    c.height = SCREEN_H * zoom;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = `rgb(${LIGHT.join(",")})`;
    ctx.fillRect(0, 0, c.width, c.height);
    for (const k of visible) {
      const f = srs.frames[k];
      const img = f && images[f.image];
      if (img) blitFrame(ctx, img, f.x * zoom, f.y * zoom, zoom);
    }
    const f = srs.frames[sel];
    const img = f && images[f.image];
    if (f && !playing) {
      ctx.strokeStyle = "rgba(20,60,200,0.85)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(f.x * zoom + 0.5, f.y * zoom + 0.5, (img?.width ?? 8) * zoom - 1, (img?.height ?? 8) * zoom - 1);
      ctx.setLineDash([]);
    }
  }, [srs, images, visible, sel, zoom, playing]);

  const screenPos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SCREEN_W, ((e.clientY - r.top) / r.height) * SCREEN_H];
  };

  const select = (i: number) => {
    setSel(i);
    if (!playing) {
      const at = seq.findIndex((v) => v.includes(i));
      if (at >= 0) setTick(at);
    }
    const im = srs.frames[i]?.image;
    if (im !== undefined && im < srs.images.length) setImgSel(im);
  };

  const used = (im: number) => srs.frames.flatMap((f, i) => (f.image === im ? [i + 1] : []));
  const imgEntry: LibEntry | null = srs.images[imgSel]
    ? { resType: 5, type: srs.images[imgSel][0], index: srs.images[imgSel][1], data: srs.images[imgSel] }
    : null;
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(Number(v)) || 0));

  return (
    <div className="anim-editor">
      <div className="map-tools">
        <button onClick={() => (playing ? setPlaying(false) : (setTick(t >= seq.length - 1 ? 0 : t), setPlaying(true)))}>{playing ? "Pause" : "Play"}</button>
        <button className="ghost" disabled={playing} onClick={() => setTick(Math.max(0, t - 1))} title="Previous tick">
          ◀
        </button>
        <button className="ghost" disabled={playing} onClick={() => setTick(Math.min(seq.length - 1, t + 1))} title="Next tick">
          ▶
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(0, seq.length - 1)}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setTick(Number(e.target.value));
          }}
          aria-label="Tick"
        />
        <span className="muted small">
          tick {t + 1} / {seq.length} · {((seq.length * TICK_MS) / 1000).toFixed(2)} s
        </span>
        <label className="check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
        </label>
        <label className="check" title="Combat steps effects twice per tick">
          <input type="checkbox" checked={combat} onChange={(e) => setCombat(e.target.checked)} /> Combat speed
        </label>
        <label className="field">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[2, 3, 4, 5].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>
        <div className="seg">
          <button className="ghost" onClick={doUndo} disabled={undo.current.length === 0} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="ghost" onClick={doRedo} disabled={redo.current.length === 0} title="Redo (Ctrl+Y)">
            Redo
          </button>
        </div>
      </div>

      <div className="anim-body">
        <div>
          <div className="map-canvas anim-stage">
            <canvas
              ref={canvas}
              aria-label="Animation preview"
              onPointerDown={(e) => {
                const f = srs.frames[sel];
                if (!f) return;
                setPlaying(false);
                const [x, y] = screenPos(e);
                drag.current = { x, y, fx: f.x, fy: f.y, before: srs };
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const [x, y] = screenPos(e);
                const nx = Math.max(0, Math.min(255, Math.round(d.fx + x - d.x)));
                const ny = Math.max(0, Math.min(255, Math.round(d.fy + y - d.y)));
                setSrs((s) => ({ ...s, frames: s.frames.map((f, k) => (k === sel ? { ...f, x: nx, y: ny } : f)) }));
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                if (!d || srs === d.before) return;
                const moved = srs.frames[sel];
                const orig = d.before.frames[sel];
                if (moved.x === orig.x && moved.y === orig.y) return;
                undo.current.push(d.before);
                if (undo.current.length > HISTORY) undo.current.shift();
                redo.current = [];
                lastTag.current = null;
                save(srs);
              }}
            />
          </div>
          <p className="muted small">
            The box is the 160×96 screen. Drag on it to move the selected frame (dashed outline). Effects cast on one target are
            drawn relative to frame 1, which the engine places on that target; the others use these screen positions.
          </p>
        </div>

        <div className="anim-frames">
          {(error || encodeError) && <p className="error small">{error ?? encodeError}</p>}
          {warnings.length > 0 && (
            <ul className="warnings small">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              {srs.missingImages > 0 && (
                <li>
                  <button className="ghost" onClick={() => setImages(srs.images)}>
                    Drop the missing images
                  </button>
                </li>
              )}
            </ul>
          )}
          <div className="table-wrap">
            <table className="levels anim-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Image</th>
                  <th>X</th>
                  <th>Y</th>
                  <th title="Ticks the frame stays on screen">Show</th>
                  <th title="Ticks until the next frame starts (at most Show)">Next</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {srs.frames.map((f, i) => (
                  <tr key={i} className={`${i === sel ? "sel" : ""} ${visible.includes(i) ? "live" : ""}`} onClick={() => select(i)}>
                    <th>{i + 1}</th>
                    <td>
                      <select value={f.image} onChange={(e) => setFrame(i, { image: Number(e.target.value) })}>
                        {srs.images.map((_, k) => (
                          <option key={k} value={k}>
                            {k + 1}
                          </option>
                        ))}
                        {f.image >= srs.images.length && <option value={f.image}>{f.image + 1} (missing)</option>}
                      </select>
                    </td>
                    {(["x", "y", "show", "next"] as const).map((k) => (
                      <td key={k}>
                        <input type="number" min={0} max={255} value={f[k]} onChange={(e) => setFrame(i, { [k]: num(e.target.value, 0, 255) }, `${i}.${k}`)} />
                      </td>
                    ))}
                    <td className="row">
                      <button className="ghost" disabled={i === 0} title="Move up" onClick={(e) => { e.stopPropagation(); setFrames(srs.frames.map((g, k) => (k === i - 1 ? f : k === i ? srs.frames[i - 1] : g))); setSel(i - 1); }}>
                        ↑
                      </button>
                      <button className="ghost" disabled={i === srs.frames.length - 1} title="Move down" onClick={(e) => { e.stopPropagation(); setFrames(srs.frames.map((g, k) => (k === i + 1 ? f : k === i ? srs.frames[i + 1] : g))); setSel(i + 1); }}>
                        ↓
                      </button>
                      <button className="ghost danger" disabled={srs.frames.length <= 1} title="Delete frame" onClick={(e) => { e.stopPropagation(); setFrames(srs.frames.filter((_, k) => k !== i)); setSel(Math.max(0, Math.min(sel, srs.frames.length - 2))); }}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button
              className="ghost"
              disabled={srs.frames.length >= 255}
              onClick={() => {
                const base = srs.frames[sel] ?? { x: 72, y: 40, show: 4, next: 4, image: 0 };
                setFrames([...srs.frames.slice(0, sel + 1), { ...base }, ...srs.frames.slice(sel + 1)]);
                setSel(Math.min(sel + 1, srs.frames.length));
              }}
            >
              + Frame
            </button>
          </div>
          <p className="muted small">
            One tick is {TICK_MS} ms. Show is how long a frame stays up; Next is when the following frame starts, so a Next smaller
            than Show overlaps the frames. Highlighted rows are on screen at the current tick.
          </p>
        </div>
      </div>

      <h3 className="anim-h">Images</h3>
      <div className="frames">
        {images.map((g, i) => (
          <figure key={i} className={i === imgSel ? "sel" : ""} onClick={() => setImgSel(i)} title={used(i).length ? `Used by frame ${used(i).join(", ")}` : "Not used"}>
            {g ? <FrameCanvas frame={g} scale={2} /> : <span className="muted small">empty</span>}
            <figcaption>
              {i + 1}
              {used(i).length === 0 && " ·"}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="row">
        <button className="ghost" disabled={srs.images.length + srs.missingImages >= 255} onClick={() => { setImages([...srs.images, blankImage(images[imgSel]?.width, images[imgSel]?.height)]); setImgSel(srs.images.length); }}>
          + Blank image
        </button>
        <button className="ghost" disabled={!srs.images[imgSel] || srs.images.length + srs.missingImages >= 255} onClick={() => { setImages([...srs.images.slice(0, imgSel + 1), srs.images[imgSel].slice(), ...srs.images.slice(imgSel + 1)], (k) => (k > imgSel ? k + 1 : k)); setImgSel(imgSel + 1); }}>
          Duplicate
        </button>
        <button
          className="ghost danger"
          disabled={!srs.images[imgSel] || srs.images.length <= 1 || used(imgSel).length > 0}
          title={used(imgSel).length ? `Used by frame ${used(imgSel).join(", ")}` : undefined}
          onClick={() => {
            setImages(
              srs.images.filter((_, k) => k !== imgSel),
              (k) => (k > imgSel ? k - 1 : k),
            );
            setImgSel(Math.max(0, imgSel - 1));
          }}
        >
          Delete
        </button>
        {srs.images[imgSel] && used(imgSel).length > 0 && <span className="muted small">Image {imgSel + 1} is used by frame {used(imgSel).join(", ")}.</span>}
      </div>
      {imgEntry && (
        <PixelEditor
          key={`${imgSel}:${version}:${srs.images.length}`}
          entry={imgEntry}
          shortcuts={false}
          hint="Animations draw the first slice of each image."
          onChange={(b) => commit({ ...srs, images: srs.images.map((x, k) => (k === imgSel ? b : x)) })}
        />
      )}
    </div>
  );
}
