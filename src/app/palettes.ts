// The engine draws in two shades (plus a debug red). Palettes recolour the
// frame for display only.
export interface Palette {
  id: string;
  label: string;
  /** The name in Simplified Chinese. */
  zh: string;
  light: [number, number, number];
  dark: [number, number, number];
}

export const PALETTES: Palette[] = [
  { id: "classic", label: "Classic", zh: "经典灰", light: [180, 180, 180], dark: [0, 0, 0] },
  { id: "lcd", label: "LCD", zh: "液晶绿", light: [167, 186, 130], dark: [30, 44, 32] },
  { id: "paper", label: "Paper", zh: "纸张", light: [236, 228, 210], dark: [52, 40, 32] },
  { id: "amber", label: "Amber", zh: "琥珀", light: [36, 22, 6], dark: [255, 176, 64] },
];

export function applyPalette(src: Uint8ClampedArray, dst: Uint8ClampedArray, p: Palette): void {
  const [lr, lg, lb] = p.light;
  const [dr, dg, db] = p.dark;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    if (r === 0 && g === 0) {
      dst[i] = dr;
      dst[i + 1] = dg;
      dst[i + 2] = db;
    } else if (r === 255 && g === 0) {
      dst[i] = 255;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
    } else {
      dst[i] = lr;
      dst[i + 1] = lg;
      dst[i + 2] = lb;
    }
    dst[i + 3] = 255;
  }
}
