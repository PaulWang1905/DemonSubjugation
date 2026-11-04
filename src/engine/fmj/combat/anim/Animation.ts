// Port of fmj/combat/anim/Animation.kt
import type { Canvas } from "../../../graphics";

export interface Animation {
  update(delta: number): boolean;
  draw(canvas: Canvas): void;
}
