// The Smooth screen effect: the game's two-colour pixel art drawn with smooth,
// crisp edges at any size, without blur.
//
// 1. Edges: xBR 4x (Hyllian's rules, as in his 4xBR and in xBRjs by Josep del
//    Rio, both MIT licence), reduced to two colours and without blending: per
//    game pixel, a 4 x 4 block of ink or paper where each corner on an edge
//    takes the other colour along it (one cell, or four along a shallow or
//    steep slope). Checkerboard dithering, stripes and lone pixels have no
//    edge to follow and keep their pattern; glyph strokes and outlines are
//    straightened. One change from xBR: where two strokes meet at a right
//    angle and both go on, only the corner cell is filled (xBR rounds such
//    inside corners like slopes, which turns the boxes of Chinese glyphs
//    into ovals).
// 2. A small blur of that 4x mask ([1 4 6 4 1] each way): enough to round
//    off the 4x steps, too little to merge dots or strokes a pixel apart.
// 3. At the output resolution: the blurred mask sampled bilinearly and cut at
//    one half, with a ramp of about one output pixel: the edge, as a smooth
//    contour, anti-aliased once at whatever size the screen is shown.
//
// SmoothGL does 1-3 on the GPU (WebGL: three passes; the CPU only uploads
// the frame). Without a GPU, SmoothCpu does them at 4x (with a ramp of one 4x
// pixel) for the browser to enlarge smoothly. smoothField / smoothContour are
// the steps exactly as the GPU does them, on the CPU (tests, comparisons).

/** Cells of the 4 x 4 block (bit y * 4 + x) a corner's edge turns: [corner, either slope, shallow, steep]. */
const CELLS = {
  // (each corner: the cell at the corner; the two beside it for either slope;
  // one more along the shallow (left2) or the steep (up2) slope)
  br: [1 << 15, (1 << 14) | (1 << 11), 1 << 13, 1 << 7],
  tr: [1 << 3, (1 << 7) | (1 << 2), 1 << 11, 1 << 1],
  tl: [1 << 0, (1 << 1) | (1 << 4), 1 << 2, 1 << 8],
  bl: [1 << 12, (1 << 8) | (1 << 13), 1 << 4, 1 << 14],
};

/**
 * One corner of the centre pixel e (xBR's kernel, two colours, no blending),
 * named as for the bottom-right corner:
 *
 *        b
 *     d  e  f  f4
 *     g  h  i  i4
 *          h5  i5      (and c above f)
 *
 * Returns the cells of the 4 x 4 block that take the other colour.
 */
function corner(cells: number[], e: number, i: number, h: number, f: number, g: number, c: number, d: number, b: number, f4: number, i4: number, h5: number, i5: number): number {
  // an edge only where both neighbours along it are the other colour
  if (e === h || e === f) return 0;
  // (weighted differences across each diagonal: the edge runs along the one that changes less)
  const across = (e !== c ? 1 : 0) + (e !== g ? 1 : 0) + (i !== h5 ? 1 : 0) + (i !== f4 ? 1 : 0);
  const along = (h !== d ? 1 : 0) + (h !== i5 ? 1 : 0) + (f !== i4 ? 1 : 0) + (f !== b ? 1 : 0) + (e !== i ? 4 : 0);
  if (!(across < along && ((f !== b && h !== d) || (e === i && f !== i4 && h !== i5) || e === g || e === c))) return 0;
  const shallow = f === g && e !== g && d !== g;
  const steep = h === c && e !== c && b !== c;
  // (both: the inside corner of two strokes that go on, as where the strokes of
  // a glyph meet: xBR would fill it like a slope and round the glyph's counters
  // into ovals; only its corner cell is filled)
  if (shallow && steep) return cells[0];
  return cells[0] | (shallow || steep ? cells[1] : 0) | (shallow ? cells[2] : 0) | (steep ? cells[3] : 0);
}

/** Each corner's cells for each of its 4096 neighbourhoods (12 pixels, as corner() takes them, e first). */
let LUT: Uint16Array | null = null;
function lut(): Uint16Array {
  if (LUT) return LUT;
  LUT = new Uint16Array(4 * 4096);
  const cells = [CELLS.br, CELLS.tr, CELLS.tl, CELLS.bl];
  for (let r = 0; r < 4; r++) {
    for (let n = 0; n < 4096; n++) {
      const v = (k: number) => (n >> k) & 1;
      LUT[r * 4096 + n] = corner(cells[r], v(0), v(1), v(2), v(3), v(4), v(5), v(6), v(7), v(8), v(9), v(10), v(11));
    }
  }
  return LUT;
}

/**
 * Step 1, per pixel: which of its 4 x 4 cells take the other colour (bit
 * y * 4 + x), for `src` (1 = ink, w x h; pixels beyond the edge repeat the
 * edge's).
 */
export function xbrCells(src: Uint8Array, w: number, h: number, out: Uint16Array = new Uint16Array(w * h)): Uint16Array {
  const L = lut();
  // (the picture with a border of two pixels repeating its edge)
  const P = w + 4;
  const pad = new Uint8Array(P * (h + 4));
  for (let y = 0; y < h + 4; y++) {
    const row = Math.min(h - 1, Math.max(0, y - 2)) * w;
    for (let x = 0; x < P; x++) pad[y * P + x] = src[row + Math.min(w - 1, Math.max(0, x - 2))];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y + 2) * P + x + 2;
      const pe = pad[o];
      const pa = pad[o - P - 1], pb = pad[o - P], pc = pad[o - P + 1];
      const pd = pad[o - 1], pf = pad[o + 1];
      const pg = pad[o + P - 1], ph = pad[o + P], pi = pad[o + P + 1];
      // (a quick way out: no neighbour differs)
      if ((pa & pb & pc & pd & pf & pg & ph & pi) === (pa | pb | pc | pd | pf | pg | ph | pi) && pa === pe) {
        out[y * w + x] = 0;
        continue;
      }
      const a1 = pad[o - 2 * P - 1], b1 = pad[o - 2 * P], c1 = pad[o - 2 * P + 1];
      const a0 = pad[o - P - 2], c4 = pad[o - P + 2], d0 = pad[o - 2], f4 = pad[o + 2];
      const g0 = pad[o + P - 2], i4 = pad[o + P + 2], g5 = pad[o + 2 * P - 1], h5 = pad[o + 2 * P], i5 = pad[o + 2 * P + 1];
      // (each corner's e, i, h, f, g, c, d, b, f4, i4, h5, i5, as corner() takes them, in bits 0-11)
      out[y * w + x] =
        L[pe | (pi << 1) | (ph << 2) | (pf << 3) | (pg << 4) | (pc << 5) | (pd << 6) | (pb << 7) | (f4 << 8) | (i4 << 9) | (h5 << 10) | (i5 << 11)] |
        L[4096 | pe | (pc << 1) | (pf << 2) | (pb << 3) | (pi << 4) | (pa << 5) | (ph << 6) | (pd << 7) | (b1 << 8) | (c1 << 9) | (f4 << 10) | (c4 << 11)] |
        L[8192 | pe | (pa << 1) | (pb << 2) | (pd << 3) | (pc << 4) | (pg << 5) | (pf << 6) | (ph << 7) | (d0 << 8) | (a0 << 9) | (b1 << 10) | (a1 << 11)] |
        L[12288 | pe | (pg << 1) | (pd << 2) | (ph << 3) | (pa << 4) | (pi << 5) | (pb << 6) | (pf << 7) | (h5 << 8) | (g5 << 9) | (d0 << 10) | (g0 << 11)];
    }
  }
  return out;
}

/** Step 1: the 4x mask of `src` (1 = ink, w x h) into `out` (4w x 4h, 1 = ink). */
export function xbr4(src: Uint8Array, w: number, h: number, out: Uint8Array = new Uint8Array(w * h * 16)): Uint8Array {
  const cells = xbrCells(src, w, h);
  const W = w * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = cells[y * w + x];
      const pe = src[y * w + x];
      const o = y * 4 * W + x * 4;
      for (let k = 0; k < 16; k++) out[o + (k >> 2) * W + (k & 3)] = m & (1 << k) ? 1 - pe : pe;
    }
  }
  return out;
}

/** Steps 1 and 2: the blurred 4x mask (ink 0..1, 4w x 4h). */
export function smoothField(src: Uint8Array, w: number, h: number): Float32Array {
  const m = xbr4(src, w, h);
  const W = w * 4, H = h * 4;
  const a = new Float32Array(W * H);
  const b = new Float32Array(W * H);
  const K = [1, 4, 6, 4, 1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -2; k <= 2; k++) v += K[k + 2] * m[y * W + Math.min(W - 1, Math.max(0, x + k))];
      a[y * W + x] = v / 16;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -2; k <= 2; k++) v += K[k + 2] * a[Math.min(H - 1, Math.max(0, y + k)) * W + x];
      b[y * W + x] = v / 16;
    }
  }
  return b;
}

/**
 * How far either side of one half the ramp reaches, for `s` output pixels per
 * game pixel: the blurred edge rises by 6/16 per 4x pixel where it crosses
 * one half, so this makes the ramp about one output pixel wide (at most the
 * whole range, when shown smaller than 4x).
 */
export const rampHalf = (s: number) => Math.min(0.5, 0.75 / s);

/** Step 3 on the CPU: ink coverage (0..1) of each output pixel, round(w * s) x round(h * s). */
export function smoothContour(field: Float32Array, w: number, h: number, s: number): Float32Array {
  const W = Math.round(w * s), H = Math.round(h * s), FW = w * 4, FH = h * 4;
  const out = new Float32Array(W * H);
  const half = rampHalf(s);
  for (let Y = 0; Y < H; Y++) {
    const fy = Math.min(FH - 1, Math.max(0, ((Y + 0.5) * h * 4) / H - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(FH - 1, y0 + 1), ty = fy - y0;
    for (let X = 0; X < W; X++) {
      const fx = Math.min(FW - 1, Math.max(0, ((X + 0.5) * w * 4) / W - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(FW - 1, x0 + 1), tx = fx - x0;
      const v =
        (field[y0 * FW + x0] * (1 - tx) + field[y0 * FW + x1] * tx) * (1 - ty) + (field[y1 * FW + x0] * (1 - tx) + field[y1 * FW + x1] * tx) * ty;
      const t = Math.min(1, Math.max(0, (v - 0.5 + half) / (2 * half)));
      out[Y * W + X] = t * t * (3 - 2 * t);
    }
  }
  return out;
}

/** The whole effect on the CPU, as coverage at `s` output pixels per game pixel. */
export function smoothCpu(src: Uint8Array, w: number, h: number, s: number): Float32Array {
  return smoothContour(smoothField(src, w, h), w, h, s);
}

/** The four cells of a mask row as bytes 0 / 1 (little-endian), for each 4-bit pattern. */
const NIBBLES = Uint32Array.from({ length: 16 }, (_, n) => (n & 1) | ((n & 2) << 7) | ((n & 4) << 14) | ((n & 8) << 21));

/**
 * Steps 1-3 at 4x, for drawing without WebGL: the contour cut with a ramp of
 * one 4x pixel, in the two colours (ink and paper as RGBA words), into `out`
 * (4w x 4h), for the browser to enlarge smoothly to the output size. Integer
 * work only: the blur's weights sum to 256, and a table gives each sum's colour.
 */
export class SmoothCpu {
  private cells = new Uint16Array(0);
  private mask = new Uint32Array(0);
  private rows = new Uint32Array(0);
  private colors = new Uint32Array(257);
  private key = "";

  draw(src: Uint8Array, w: number, h: number, ink: number, paper: number, out: Uint32Array): void {
    const W = w * 4, H = h * 4;
    if (this.cells.length !== w * h) {
      this.cells = new Uint16Array(w * h);
      this.mask = new Uint32Array(W * H / 4);
      this.rows = new Uint32Array((W * H) / 4);
    }
    if (this.key !== `${ink}:${paper}`) {
      this.key = `${ink}:${paper}`;
      const half = rampHalf(4);
      for (let v = 0; v <= 256; v++) {
        const t = Math.min(1, Math.max(0, (v / 256 - 0.5 + half) / (2 * half)));
        const k = t * t * (3 - 2 * t);
        let c = 0;
        for (let b = 0; b < 32; b += 8) c |= Math.round(((paper >>> b) & 255) * (1 - k) + ((ink >>> b) & 255) * k) << b;
        this.colors[v] = c >>> 0;
      }
    }
    const cells = xbrCells(src, w, h, this.cells);
    // the 4x mask, a row of four cells (bytes) at a time
    const mask = this.mask;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = cells[y * w + x];
        const flip = src[y * w + x] ? 0x01010101 : 0;
        const o = y * 4 * w + x;
        mask[o] = NIBBLES[m & 15] ^ flip;
        mask[o + w] = NIBBLES[(m >> 4) & 15] ^ flip;
        mask[o + 2 * w] = NIBBLES[(m >> 8) & 15] ^ flip;
        mask[o + 3 * w] = NIBBLES[m >> 12] ^ flip;
      }
    }
    // (four cells to a word from here on: the sums stay within their bytes)
    // blurred across ([1 4 6 4 1], 0..16), the edges repeated
    const rows = this.rows;
    const n = w; // words in a row
    for (let y = 0; y < H; y++) {
      const r = y * n;
      for (let j = 0; j < n; j++) {
        const w1 = mask[r + j];
        const w0 = j > 0 ? mask[r + j - 1] : Math.imul(w1 & 255, 0x01010101);
        const w2 = j < n - 1 ? mask[r + j + 1] : Math.imul(w1 >>> 24, 0x01010101);
        const l2 = (w1 << 16) | (w0 >>> 16), l1 = (w1 << 8) | (w0 >>> 24);
        const r1 = (w1 >>> 8) | (w2 << 24), r2 = (w1 >>> 16) | (w2 << 16);
        rows[r + j] = l2 + 4 * (l1 + r1) + 6 * w1 + r2;
      }
    }
    // and down (0..256, in two 16-bit halves), to colours
    const colors = this.colors;
    const LO = 0x00ff00ff;
    for (let y = 0; y < H; y++) {
      const c = y * n;
      const u2 = (y > 1 ? y - 2 : 0) * n, u1 = (y > 0 ? y - 1 : 0) * n;
      const d1 = (y < H - 1 ? y + 1 : H - 1) * n, d2 = (y < H - 2 ? y + 2 : H - 1) * n;
      for (let j = 0; j < n; j++) {
        const a = rows[u2 + j], b = rows[u1 + j], m = rows[c + j], d = rows[d1 + j], e = rows[d2 + j];
        const even = (a & LO) + 4 * ((b & LO) + (d & LO)) + 6 * (m & LO) + (e & LO);
        const odd = ((a >>> 8) & LO) + 4 * (((b >>> 8) & LO) + ((d >>> 8) & LO)) + 6 * ((m >>> 8) & LO) + ((e >>> 8) & LO);
        const o = (c + j) * 4;
        out[o] = colors[even & 0xffff];
        out[o + 1] = colors[odd & 0xffff];
        out[o + 2] = colors[even >>> 16];
        out[o + 3] = colors[odd >>> 16];
      }
    }
  }
}

// ---------------------------------------------------------------- on the GPU

const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const VERTEX = `attribute vec2 at;
void main() { gl_Position = vec4(at, 0.0, 1.0); }`;

/** The frame's colours: ink is black; red (r 255, g 0) and anything else are not (as applyPalette). */
const INK = `float ink(vec4 c) { return c.r < 0.5 && c.g < 0.5 ? 1.0 : 0.0; }`;

/** Step 1 (as xbr4): one fragment per cell of the 4x mask; the framebuffer's rows are the frame's. */
const XBR = `${HEAD}
uniform sampler2D src;
uniform vec2 size;
${INK}
float px(vec2 p, float dx, float dy) { return ink(texture2D(src, (p + vec2(dx, dy) + 0.5) / size)); }
float ne(float a, float b) { return a == b ? 0.0 : 1.0; }
vec4 corner(float e, float i, float h, float f, float g, float c, float d, float b, float f4, float i4, float h5, float i5) {
  if (e == h || e == f) return vec4(0.0);
  float across = ne(e, c) + ne(e, g) + ne(i, h5) + ne(i, f4);
  float along = ne(h, d) + ne(h, i5) + ne(f, i4) + ne(f, b) + 4.0 * ne(e, i);
  if (!(across < along && ((f != b && h != d) || (e == i && f != i4 && h != i5) || e == g || e == c))) return vec4(0.0);
  bool shallow = f == g && e != g && d != g;
  bool steep = h == c && e != c && b != c;
  if (shallow && steep) return vec4(1.0, 0.0, 0.0, 0.0);
  return vec4(1.0, shallow || steep ? 1.0 : 0.0, shallow ? 1.0 : 0.0, steep ? 1.0 : 0.0);
}
float is(vec2 cell, float x, float y) { return cell.x == x && cell.y == y ? 1.0 : 0.0; }
void main() {
  vec2 q = floor(gl_FragCoord.xy);
  vec2 p = floor(q / 4.0);
  vec2 cell = q - p * 4.0;
  float pe = px(p, 0.0, 0.0);
  float pa = px(p, -1.0, -1.0), pb = px(p, 0.0, -1.0), pc = px(p, 1.0, -1.0);
  float pd = px(p, -1.0, 0.0), pf = px(p, 1.0, 0.0);
  float pg = px(p, -1.0, 1.0), ph = px(p, 0.0, 1.0), pi = px(p, 1.0, 1.0);
  float a1 = px(p, -1.0, -2.0), b1 = px(p, 0.0, -2.0), c1 = px(p, 1.0, -2.0);
  float a0 = px(p, -2.0, -1.0), c4 = px(p, 2.0, -1.0), d0 = px(p, -2.0, 0.0), f4 = px(p, 2.0, 0.0);
  float g0 = px(p, -2.0, 1.0), i4 = px(p, 2.0, 1.0), g5 = px(p, -1.0, 2.0), h5 = px(p, 0.0, 2.0), i5 = px(p, 1.0, 2.0);
  vec4 br = corner(pe, pi, ph, pf, pg, pc, pd, pb, f4, i4, h5, i5);
  vec4 tr = corner(pe, pc, pf, pb, pi, pa, ph, pd, b1, c1, f4, c4);
  vec4 tl = corner(pe, pa, pb, pd, pc, pg, pf, ph, d0, a0, b1, a1);
  vec4 bl = corner(pe, pg, pd, ph, pa, pi, pb, pf, h5, g5, d0, g0);
  float flip =
    br.x * is(cell, 3.0, 3.0) + br.y * (is(cell, 2.0, 3.0) + is(cell, 3.0, 2.0)) + br.z * is(cell, 1.0, 3.0) + br.w * is(cell, 3.0, 1.0) +
    tr.x * is(cell, 3.0, 0.0) + tr.y * (is(cell, 3.0, 1.0) + is(cell, 2.0, 0.0)) + tr.z * is(cell, 3.0, 2.0) + tr.w * is(cell, 1.0, 0.0) +
    tl.x * is(cell, 0.0, 0.0) + tl.y * (is(cell, 1.0, 0.0) + is(cell, 0.0, 1.0)) + tl.z * is(cell, 2.0, 0.0) + tl.w * is(cell, 0.0, 2.0) +
    bl.x * is(cell, 0.0, 3.0) + bl.y * (is(cell, 0.0, 2.0) + is(cell, 1.0, 3.0)) + bl.z * is(cell, 0.0, 1.0) + bl.w * is(cell, 2.0, 3.0);
  float v = flip > 0.0 ? 1.0 - pe : pe;
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

/** Step 2: [1 4 6 4 1] each way, as nine bilinear taps (weights 5, 6, 5 at -1.2, 0, 1.2 cells). */
const BLUR = `${HEAD}
uniform sampler2D mask;
uniform vec2 size;
void main() {
  float v = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      float w = (i == 0 ? 6.0 : 5.0) * (j == 0 ? 6.0 : 5.0);
      v += w * texture2D(mask, (gl_FragCoord.xy + vec2(float(i), float(j)) * 1.2) / size).r;
    }
  }
  v /= 256.0;
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

/** Step 3: the contour at the output size, in the palette's colours (red stays red). */
const CONTOUR = `${HEAD}
uniform sampler2D field;
uniform sampler2D src;
uniform vec2 outSize;
uniform float ramp;
uniform vec3 light;
uniform vec3 dark;
void main() {
  // (the canvas's rows run from the bottom; the frame's from the top)
  vec2 uv = vec2(gl_FragCoord.x, outSize.y - gl_FragCoord.y) / outSize;
  vec4 c = texture2D(src, uv);
  if (c.r > 0.5 && c.g < 0.5) {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    return;
  }
  float k = smoothstep(0.5 - ramp, 0.5 + ramp, texture2D(field, uv).r);
  gl_FragColor = vec4(mix(light, dark, k), 1.0);
}`;

type GL = WebGLRenderingContext;

function program(gl: GL, fragment: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, text] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, text);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, "at");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

function texture(gl: GL, filter: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * The effect on the GPU. draw() renders a frame (engine colours, w x h) at
 * W x H onto its own canvas, for the caller to copy onto the screen's canvas
 * at once (the picture is not kept past the current task).
 */
export class SmoothGL {
  private readonly xbr: WebGLProgram;
  private readonly blur: WebGLProgram;
  private readonly contour: WebGLProgram;
  private readonly src: WebGLTexture;
  private readonly mask: WebGLTexture;
  private readonly field: WebGLTexture;
  private readonly fbMask: WebGLFramebuffer;
  private readonly fbField: WebGLFramebuffer;
  private w = 0;
  private h = 0;

  /**
   * null where WebGL is not to be had, or only drawn by the CPU (a software
   * GPU is slower than drawing on the CPU at 4x): the caller draws without it.
   */
  static create(): SmoothGL | null {
    try {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        failIfMajorPerformanceCaveat: true,
      });
      if (!gl) return null;
      // (not every browser counts a software GPU as a caveat: one that names itself is not used either)
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) return null;
      return new SmoothGL(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly gl: GL,
  ) {
    this.xbr = program(gl, XBR);
    this.blur = program(gl, BLUR);
    this.contour = program(gl, CONTOUR);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.src = texture(gl, gl.NEAREST);
    this.mask = texture(gl, gl.LINEAR);
    this.field = texture(gl, gl.LINEAR);
    this.fbMask = gl.createFramebuffer()!;
    this.fbField = gl.createFramebuffer()!;
  }

  /** Whether the GPU took the context away (the caller then draws without it). */
  get lost(): boolean {
    return this.gl.isContextLost();
  }

  draw(frame: Uint8ClampedArray, w: number, h: number, W: number, H: number, light: readonly number[], dark: readonly number[]): HTMLCanvasElement {
    const gl = this.gl;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      for (const [t, fb] of [
        [this.mask, this.fbMask],
        [this.field, this.fbField],
      ] as const) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w * 4, h * 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      }
    }
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(frame.buffer, frame.byteOffset, w * h * 4));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.field);

    // 1. the 4x mask
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbMask);
    gl.viewport(0, 0, w * 4, h * 4);
    gl.useProgram(this.xbr);
    gl.uniform1i(gl.getUniformLocation(this.xbr, "src"), 0);
    gl.uniform2f(gl.getUniformLocation(this.xbr, "size"), w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. blurred
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbField);
    gl.useProgram(this.blur);
    gl.uniform1i(gl.getUniformLocation(this.blur, "mask"), 1);
    gl.uniform2f(gl.getUniformLocation(this.blur, "size"), w * 4, h * 4);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3. the contour, onto the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.contour);
    const u = (n: string) => gl.getUniformLocation(this.contour, n);
    gl.uniform1i(u("field"), 2);
    gl.uniform1i(u("src"), 0);
    gl.uniform2f(u("outSize"), W, H);
    gl.uniform1f(u("ramp"), rampHalf(W / w));
    gl.uniform3f(u("light"), light[0] / 255, light[1] / 255, light[2] / 255);
    gl.uniform3f(u("dark"), dark[0] / 255, dark[1] / 255, dark[2] / 255);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
