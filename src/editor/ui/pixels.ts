// Draw editor frames (0 white, 1 black, 2 transparent) onto canvases.
import type { Frame } from "../format/encode";

export const LIGHT: [number, number, number] = [167, 186, 130];
export const DARK: [number, number, number] = [30, 44, 32];

export function frameToImageData(f: Frame, light = LIGHT, dark = DARK): ImageData {
  const img = new ImageData(f.width, f.height);
  for (let i = 0; i < f.pixels.length; i++) {
    const v = f.pixels[i];
    const o = i * 4;
    if (v === 2) {
      const x = i % f.width;
      const y = Math.floor(i / f.width);
      const c = (x >> 1) % 2 === (y >> 1) % 2 ? 200 : 230; // checkerboard for transparency
      img.data.set([c, c, c, 255], o);
    } else {
      img.data.set([...(v === 1 ? dark : light), 255], o);
    }
  }
  return img;
}

/** Paint a frame at (x, y) on `ctx`, scaled by an integer. Transparent stays untouched. */
export function blitFrame(ctx: CanvasRenderingContext2D, f: Frame, x: number, y: number, scale: number, opaque = false): void {
  for (let j = 0; j < f.height; j++)
    for (let i = 0; i < f.width; i++) {
      const v = f.pixels[j * f.width + i];
      if (v === 2 && !opaque) continue;
      const c = v === 1 ? DARK : LIGHT;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
    }
}
