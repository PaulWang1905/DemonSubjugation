// The original's scrolling text list (_00210D5B in BA4988/fmj-engine): a
// boxed column of fixed-width lines, at most as many rows as fit above the
// bottom of the screen, with up and down arrows when it scrolls. Up and Left
// move up, Down and Right move down, and both ends wrap round.
import { Global } from "../Global";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { Bitmap, Canvas, Paint, type Canvas as CanvasT } from "../../graphics";
import { gbkBytes } from "../../java";
import { EngineSettings } from "../config/EngineSettings";

function arrow(up: boolean): Bitmap {
  const bmp = Bitmap.createBitmap(7, 4);
  const c = new Canvas(bmp);
  const p = new Paint();
  p.color = Global.COLOR_BLACK;
  c.drawColor(Global.COLOR_WHITE);
  for (let i = 0; i < 4; i++) {
    const row = up ? i : 3 - i;
    c.drawLine(3 - i, row, 3 + i, row, p);
  }
  return bmp;
}

let moreMark: Bitmap | null = null;

/**
 * The mark that a description goes on (Page Down shows the rest): a small
 * down arrow on the bottom edge of its box, `r` being the text's rectangle.
 */
export function drawMoreMark(canvas: CanvasT, r: { right: number; bottom: number }): void {
  canvas.drawBitmap((moreMark ??= arrow(false)), r.right - 8, r.bottom - 1);
}

export class ScrollList {
  /** Selected line. */
  sel: number;
  /** First line shown. */
  top = 0;
  readonly visible: number;
  private readonly x: number;
  private readonly y: number;
  private readonly bottom: number;
  private readonly lines: Int8Array[];
  private frame: Bitmap | null = null;
  private readonly frameW: number;
  private static up: Bitmap | null = null;
  private static down: Bitmap | null = null;
  /** Text cell height: 16 as on the device, less with the compact text option. */
  private readonly size: number;

  constructor(
    x: number,
    y: number,
    private readonly lineChars: number,
    items: (string | Int8Array)[],
    startLine = 0,
  ) {
    const count = items.length;
    const size = (this.size = EngineSettings.textSize);
    const w = lineChars * (size >> 1);
    x = Math.max(1, x);
    y = Math.max(1, y);
    if (y > 0x32) y = 0x32;
    if (count > 3 && y > 0x2a) y = 0x2a;
    let visible = Math.trunc((0x5f - y - 4) / size);
    let bottom: number;
    if (count > visible) {
      bottom = visible * size + y + 4;
      if (count - visible > 1) visible--;
      else {
        bottom += 8;
        if (bottom > 0x5e) {
          visible--;
          bottom = visible * size + y + size + 4;
        }
      }
    } else {
      visible = count;
      bottom = visible * size + y + 4;
    }
    this.visible = Math.max(1, visible);
    this.x = x;
    this.y = y;
    this.bottom = bottom;
    this.lines = items.map((s) => {
      const b = typeof s === "string" ? gbkBytes(s) : s;
      const out = new Int8Array(lineChars).fill(0x20);
      out.set(b.subarray(0, lineChars));
      return out;
    });
    this.sel = Math.min(startLine, Math.max(0, count - 1));
    if (count - this.sel > this.visible - 1) this.top = this.sel;
    else if (count > this.visible) this.top = count - (this.visible - 1);
    if (this.top + this.visible > count) this.top = Math.max(0, count - this.visible);
    this.frameW = w + 4 + 3;
  }

  /** Width of the widest item, in half-width characters. */
  static widthOf(items: (string | Int8Array)[]): number {
    return Math.max(1, ...items.map((s) => (typeof s === "string" ? gbkBytes(s) : s).length));
  }

  get count(): number {
    return this.lines.length;
  }

  /** Moves the cursor; returns true when the key was a direction. */
  key(key: number): boolean {
    const n = this.lines.length;
    if (n === 0) return false;
    if (key === Global.KEY_UP || key === Global.KEY_LEFT) {
      if (this.sel >= 1) {
        if (this.sel - 1 < this.top) this.top--;
        this.sel--;
      } else {
        this.sel = n - 1;
        this.top = n > this.visible ? n - this.visible : 0;
      }
      return true;
    }
    if (key === Global.KEY_DOWN || key === Global.KEY_RIGHT) {
      if (this.sel < n - 1) {
        if (this.sel + 1 - this.top + 1 > this.visible) this.top++;
        this.sel++;
      } else {
        this.sel = 0;
        this.top = 0;
      }
      return true;
    }
    return false;
  }

  draw(canvas: CanvasT): void {
    const textX = this.x + 2;
    const y = this.y + 2;
    this.frame ??= Util.getFrameBitmap(this.frameW, this.bottom - this.y + 3);
    canvas.drawBitmap(this.frame, this.x - 1, this.y - 1);
    const textY = this.top >= 1 ? y + 8 : y;
    const size = this.size;
    TextRender.withSize(size, () => {
      for (let i = 0; i < this.visible && this.top + i < this.lines.length; i++) {
        const line = this.lines[this.top + i];
        if (this.top + i === this.sel) TextRender.drawSelText(canvas, line, textX, textY + size * i);
        else TextRender.drawText(canvas, line, textX, textY + size * i);
      }
    });
    const ax = (this.lineChars * (size >> 1)) / 2 - 4 + textX;
    if (this.top >= 1) canvas.drawBitmap((ScrollList.up ??= arrow(true)), ax, y + 2);
    if (this.top + this.visible < this.lines.length) canvas.drawBitmap((ScrollList.down ??= arrow(false)), ax, this.bottom - 2 - 8 + 2);
  }
}

/**
 * In the original's lists Left works as Up and Right as Down. Used by the
 * menus that were drawn like this list before it was ported.
 */
export function listKey(key: number): number {
  if (!EngineSettings.originalDamageFormula) return key;
  if (key === Global.KEY_LEFT) return Global.KEY_UP;
  if (key === Global.KEY_RIGHT) return Global.KEY_DOWN;
  return key;
}
