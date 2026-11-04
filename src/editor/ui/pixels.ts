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

/**
 * Convert RGBA pixels to an editor frame: alpha below 128 becomes
 * transparent, otherwise luminance below `threshold` is black.
 */
export function rgbaToFrame(rgba: ArrayLike<number>, width: number, height: number, threshold = 128, allowTransparent = true): Frame {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    if (allowTransparent && a < 128) pixels[i] = 2;
    else pixels[i] = 0.299 * r + 0.587 * g + 0.114 * b < threshold ? 1 : 0;
  }
  return { width, height, pixels };
}

/** Cut a sheet into frames of `fw` x `fh`, left to right, top to bottom. */
export function sliceSheet(sheet: Frame, fw: number, fh: number): Frame[] {
  const out: Frame[] = [];
  for (let y = 0; y + fh <= sheet.height; y += fh)
    for (let x = 0; x + fw <= sheet.width; x += fw) {
      const p = new Uint8Array(fw * fh);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) p[j * fw + i] = sheet.pixels[(y + j) * sheet.width + x + i];
      out.push({ width: fw, height: fh, pixels: p });
    }
  return out;
}

/** Flood fill from (x, y) with value v (4-connected). */
export function floodFill(f: Frame, x: number, y: number, v: number): Frame {
  const target = f.pixels[y * f.width + x];
  if (target === v) return f;
  const pixels = f.pixels.slice();
  const stack = [y * f.width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (pixels[i] !== target) continue;
    pixels[i] = v;
    const px = i % f.width;
    if (px > 0) stack.push(i - 1);
    if (px < f.width - 1) stack.push(i + 1);
    if (i >= f.width) stack.push(i - f.width);
    if (i < pixels.length - f.width) stack.push(i + f.width);
  }
  return { ...f, pixels };
}

/** Resize a frame, keeping the top-left corner; new pixels are `fill`. */
export function resizeFrame(f: Frame, w: number, h: number, fill: number): Frame {
  const pixels = new Uint8Array(w * h).fill(fill);
  for (let y = 0; y < Math.min(h, f.height); y++)
    for (let x = 0; x < Math.min(w, f.width); x++) pixels[y * w + x] = f.pixels[y * f.width + x];
  return { width: w, height: h, pixels };
}
