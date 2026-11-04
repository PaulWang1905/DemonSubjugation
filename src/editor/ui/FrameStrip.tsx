import { useEffect, useRef } from "react";
import type { Frame } from "../format/encode";
import { frameToImageData } from "./pixels";

/** All frames of an image, scaled up, with their numbers. */
export function FrameStrip({ frames, scale = 3 }: { frames: Frame[]; scale?: number }) {
  return (
    <div className="frames">
      {frames.map((f, i) => (
        <figure key={i}>
          <FrameCanvas frame={f} scale={scale} />
          <figcaption>{i + 1}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function FrameCanvas({ frame, scale }: { frame: Frame; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.putImageData(frameToImageData(frame), 0, 0);
  }, [frame]);
  return (
    <canvas
      ref={ref}
      width={frame.width}
      height={frame.height}
      style={{ width: frame.width * scale, height: frame.height * scale, imageRendering: "pixelated" }}
    />
  );
}
