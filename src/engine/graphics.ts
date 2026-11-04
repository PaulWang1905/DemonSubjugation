// Port of src/graphics/graphics.kt — a tiny software raster used by the engine.
// Colours are packed 32-bit RGBA values laid out for little-endian ImageData
// (0xAABBGGRR), so a Bitmap buffer can be blitted to a <canvas> directly.

import { idiv } from "./java";

export type Color = number;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function alphaOf(c: Color): number {
  return c >>> 24;
}

export const Colors = {
  WHITE: rgba(180, 180, 180, 255),
  BLACK: rgba(0, 0, 0, 255),
  TRANSP: rgba(0, 0, 0, 0),
  RED: rgba(0xff, 0, 0),
};

export enum PaintStyle {
  FILL,
  STROKE,
  FILL_AND_STROKE,
}

export class Paint {
  style = PaintStyle.FILL;
  color: Color = Colors.BLACK;
  strokeWidth = 1;
}

export class Bitmap {
  readonly buffer: Uint32Array;
  color: Color = Colors.WHITE;

  constructor(
    readonly width: number,
    readonly height: number,
    buffer?: Uint32Array,
  ) {
    if (buffer) {
      this.buffer = buffer;
    } else {
      this.buffer = new Uint32Array(width * height);
      this.buffer.fill(Colors.WHITE);
    }
  }

  drawImage(src: Bitmap, x: number, y: number): void {
    this.setPixels(src.buffer, 0, x, y, src.width, src.height);
  }

  private setPixel(col: number, row: number, color: Color): void {
    this.buffer[this.width * row + col] = color;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    for (let col = x; col < x + w; col++) {
      for (let row = y; row < y + h; row++) {
        this.setPixel(col, row, this.color);
      }
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    let dx = x2 - x1;
    let dy = y2 - y1;
    const ux = dx > 0 ? 1 : -1;
    const uy = dy > 0 ? 1 : -1;
    let x = x1;
    let y = y1;
    let eps = 0;
    dx = Math.abs(dx);
    dy = Math.abs(dy);
    if (dx > dy) {
      for (;;) {
        this.setPixel(x, y, this.color);
        if (x === x2) break;
        eps += dy;
        if (eps << 1 >= dx) {
          y += uy;
          eps -= dx;
        }
        x += ux;
      }
    } else {
      for (;;) {
        this.setPixel(x, y, this.color);
        if (y === y2) break;
        eps += dx;
        if (eps << 1 >= dy) {
          x += ux;
          eps -= dy;
        }
        y += uy;
      }
    }
  }

  drawRect(x: number, y: number, w: number, h: number): void {
    this.drawLine(x, y, x + w, y);
    this.drawLine(x + w, y, x + w, y + h);
    this.drawLine(x, y + h, x + w, y + h);
    this.drawLine(x, y, x, y + h);
  }

  setPixels(pixels: Uint32Array, offset: number, x: number, y: number, w: number, h: number): void {
    const xWidth = Math.min(this.width - x, w);
    const xHeight = Math.min(this.height - y, h);
    const buf = this.buffer;
    for (let col = 0; col < xWidth; col++) {
      for (let row = 0; row < xHeight; row++) {
        const dOff = this.width * (y + row) + x + col;
        const p = pixels[offset + w * row + col];
        if (p >>> 24 > 0 && dOff >= 0 && dOff < buf.length) {
          buf[dOff] = p;
        }
      }
    }
  }

  copy(): Bitmap {
    return new Bitmap(this.width, this.height, this.buffer.slice());
  }

  static createBitmap(w: number, h: number, pixels?: Uint32Array): Bitmap {
    return new Bitmap(w, h, pixels);
  }
}

export class Rect {
  constructor(
    public left: number,
    public top: number,
    public right: number,
    public bottom: number,
  ) {}
  width(): number {
    return this.right - this.left + 1;
  }
  height(): number {
    return this.bottom - this.top + 1;
  }
}

export class RectF {
  constructor(
    public left: number,
    public top: number,
    public right: number,
    public bottom: number,
  ) {}
}

export class Point {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
}

export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 96;

export class Canvas {
  private bg: Bitmap;

  constructor(b?: Bitmap) {
    this.bg = b ?? Bitmap.createBitmap(SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  static ofSize(width: number, height: number): Canvas {
    return new Canvas(Bitmap.createBitmap(width, height));
  }

  get width(): number {
    return this.bg.width;
  }
  get height(): number {
    return this.bg.height;
  }
  get buffer(): Uint32Array {
    return this.bg.buffer;
  }

  drawBitmap(bitmap: Bitmap, left: number, top: number): void {
    this.bg.drawImage(bitmap, Math.trunc(left), Math.trunc(top));
  }

  drawColor(color: Color): void {
    this.bg.color = color;
    this.bg.fillRect(0, 0, this.bg.width, this.bg.height);
  }

  drawLine(startX: number, startY: number, stopX: number, stopY: number, paint: Paint): void {
    this.bg.color = paint.color;
    this.bg.drawLine(Math.trunc(startX), Math.trunc(startY), Math.trunc(stopX), Math.trunc(stopY));
  }

  private drawR(x: number, y: number, i: number, j: number, paint: Paint, color: Color): void {
    this.bg.color = color;
    if (paint.style === PaintStyle.STROKE) {
      this.bg.drawRect(x, y, i, j);
    } else {
      this.bg.fillRect(x, y, i, j);
    }
  }

  drawRect(x: number, y: number, i: number, j: number, paint: Paint): void {
    this.drawR(x, y, i - x, j - y, paint, paint.color);
  }

  drawRectR(rect: Rect | RectF, paint: Paint): void {
    this.drawR(
      Math.trunc(rect.left),
      Math.trunc(rect.top),
      Math.trunc(rect.right - rect.left),
      Math.trunc(rect.bottom - rect.top),
      paint,
      paint.color,
    );
  }

  drawLines(dots: ArrayLike<number>, paint: Paint): void {
    this.bg.color = paint.color;
    const size = idiv(dots.length, 4);
    for (let i = 0; i < size; i++) {
      this.bg.drawLine(
        Math.trunc(dots[i * 4]),
        Math.trunc(dots[i * 4 + 1]),
        Math.trunc(dots[i * 4 + 2]),
        Math.trunc(dots[i * 4 + 3]),
      );
    }
  }

  setBitmap(bmp: Bitmap): void {
    this.bg = bmp;
  }
}
