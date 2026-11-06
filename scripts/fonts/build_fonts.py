#!/usr/bin/env python3
"""Build the player's bundled pixel fonts in the device's HZK16 / ASC16 layout.

HZK16: GB2312 characters in code order from 0xA1A1, 32 bytes each (16 rows of
16 pixels). ASC16: 256 characters of 16 bytes (16 rows of 8 pixels). The engine
reads these exactly like the device's own font files.

Sources (SIL Open Font License 1.1 or public domain, see public/fonts/LICENSES.md):
  unifont-*.hex.gz      Unifont, https://unifoundry.com/unifont/
  PressStart2P-*.ttf    Press Start 2P, https://github.com/google/fonts/tree/main/ofl/pressstart2p
  Cubic_11.woff2        Cubic 11 1.451, https://github.com/ACh-K/Cubic-11 (Chinese
                        characters Ark Pixel lacks; it had a set of its own until
                        it proved to look the same as Ark Pixel at this size)

For the 12- and 10-pixel cells of the More text option it also writes
small/cjk12.bin, latin12.bin, cjk10.bin and latin10.bin (see small_fonts.py):
the same GB2312 / ASCII order, `size` rows per glyph, 2 bytes a row for
Chinese and 1 for letters.

Usage: build_fonts.py UNIFONT_HEX_GZ PRESS_START_TTF CUBIC11_WOFF2 OUT_DIR [SMALL_SRC_DIR [ARK12_DIR]]
SMALL_SRC_DIR holds the small fonts named in small_fonts.py. ARK12_DIR holds
Ark Pixel's 12 px glyph images (assets/glyphs/12 of
https://github.com/TakWolf/ark-pixel-font), one per character, named by code
point (4E2D.png), Simplified Chinese forms where there are variants.
Needs Pillow, fontTools and brotli (for the woff2).
"""
import gzip
import os
import sys

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HZK_GLYPHS = 267616 // 32  # the size of the device's HZK16 file


def load_unifont(path):
    glyphs = {}
    with gzip.open(path, "rt") as f:
        for line in f:
            cp, bits = line.strip().split(":")
            glyphs[int(cp, 16)] = bits
    return glyphs


def unifont_rows(uni, ch, width):
    """16 rows of `width` pixels from Unifont (centred if Unifont's glyph is narrower)."""
    bits = uni.get(ord(ch))
    if bits is None:
        return None
    w = 8 if len(bits) == 32 else 16
    rows = [int(bits[i : i + w // 4], 16) for i in range(0, len(bits), w // 4)]
    shift = (width - w) // 2
    return [[(r >> (w - 1 - (x - shift))) & 1 if 0 <= x - shift < w else 0 for x in range(width)] for r in rows]


class Raster:
    """A pixel font drawn at its native size, without smoothing."""

    def __init__(self, path, size):
        self.font = ImageFont.truetype(path, size)
        self.cmap = TTFont(path).getBestCmap()

    def has(self, ch):
        return ord(ch) in self.cmap

    def rows(self, ch, width, baseline=12):
        im = Image.new("L", (width, 16), 0)
        dr = ImageDraw.Draw(im)
        if width == 16:
            dr.text((8, 8), ch, fill=255, font=self.font, anchor="mm")
        else:
            dr.text((4, baseline), ch, fill=255, font=self.font, anchor="ms")
        return [[1 if im.getpixel((x, y)) > 127 else 0 for x in range(width)] for y in range(16)]


def pack(rows, width):
    out = bytearray()
    for r in rows:
        for b in range(width // 8):
            v = 0
            for x in range(8):
                if r[b * 8 + x]:
                    v |= 0x80 >> x
            out.append(v)
    return out


def gb2312_char(index):
    hi, lo = 0xA1 + index // 94, 0xA1 + index % 94
    try:
        ch = bytes([hi, lo]).decode("gb2312")
    except UnicodeDecodeError:
        return None
    return ch if len(ch) == 1 else None


def build(out_dir, wide, narrow, cjk=True):
    """`wide(ch)` / `narrow(ch)` give rows or None (left blank). cjk=False: letters only."""
    os.makedirs(out_dir, exist_ok=True)
    hzk = bytearray(HZK_GLYPHS * 32)
    missing = 0
    for i in range(HZK_GLYPHS):
        ch = gb2312_char(i)
        if ch is None:
            continue
        rows = wide(ch)
        if rows is None:
            missing += 1
            continue
        hzk[i * 32 : i * 32 + 32] = pack(rows, 16)
    asc = bytearray(256 * 16)
    for c in range(0x21, 0x7F):
        rows = narrow(chr(c))
        if rows is not None:
            asc[c * 16 : c * 16 + 16] = pack(rows, 8)
    if cjk:
        open(os.path.join(out_dir, "cjk16.bin"), "wb").write(hzk)
    open(os.path.join(out_dir, "latin16.bin"), "wb").write(asc)
    print(out_dir, "missing", missing)


def ark_glyph(ark_dir, ch):
    """An Ark Pixel 12 px glyph image as rows of 0/1 (12 x 12, or 6 x 12 for letters), or None."""
    path = os.path.join(ark_dir, "%04X.png" % ord(ch))
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA")
    return [[1 if im.getpixel((x, y))[3] > 127 and sum(im.getpixel((x, y))[:3]) < 384 else 0 for x in range(im.width)] for y in range(im.height)]


def place(rows, w, h, x0, y0):
    """`rows` placed at (x0, y0) in a w x h cell."""
    out = [[0] * w for _ in range(h)]
    for y, r in enumerate(rows):
        for x, v in enumerate(r):
            if v and 0 <= x + x0 < w and 0 <= y + y0 < h:
                out[y + y0][x + x0] = 1
    return out


def bold(rows):
    """A pixel-font bold: strokes one pixel wider to the right, except where
    that would close the one-pixel gap to the next stroke (so dense
    characters and dotted marks such as …… stay readable)."""
    if rows is None:
        return None
    w = len(rows[0])
    return [[1 if r[x] or (x > 0 and r[x - 1] and not (x + 1 < w and r[x + 1])) else 0 for x in range(w)] for r in rows]


def build_small(out_dir, size, wide, narrow):
    os.makedirs(out_dir, exist_ok=True)
    cjk = bytearray(HZK_GLYPHS * size * 2)
    missing = 0
    for i in range(HZK_GLYPHS):
        ch = gb2312_char(i)
        if ch is None:
            continue
        rows = wide(ch)
        if rows is None:
            missing += 1
            continue
        cjk[i * size * 2 : (i + 1) * size * 2] = pack([r + [0] * (16 - size) for r in rows], 16)
    latin = bytearray(256 * size)
    for c in range(0x21, 0x7F):
        rows = narrow(chr(c))
        if rows is not None:
            latin[c * size : (c + 1) * size] = pack([r + [0] * (8 - len(r)) for r in rows], 8)
    open(os.path.join(out_dir, f"cjk{size}.bin"), "wb").write(cjk)
    open(os.path.join(out_dir, f"latin{size}.bin"), "wb").write(latin)
    print(out_dir, size, "missing", missing)


def main():
    hex_gz, press_start, cubic11, out = sys.argv[1:5]
    if len(sys.argv) > 5:
        from small_fonts import small_set

        for size in (12, 10):
            build_small(os.path.join(out, "small"), size, *small_set(size, sys.argv[5].rstrip("/") + "/"))
    uni = load_unifont(hex_gz)
    uni16 = lambda ch: unifont_rows(uni, ch, 16)
    uni8 = lambda ch: unifont_rows(uni, ch, 8)

    # Unifont: Chinese and Latin
    build(os.path.join(out, "unifont"), uni16, uni8)

    ps = Raster(press_start, 8)
    cu = Raster(cubic11, 12)
    if len(sys.argv) > 6:
        from small_fonts import Ttf

        ark_dir = sys.argv[6]
        b7 = Ttf(sys.argv[5].rstrip("/") + "/boutique-bitmap-7x7_BoutiqueBitmap7x7.ttf", 8)
        # Ark Pixel's 12 px Chinese centred in the 16 px cell; Cubic 11 (the same
        # size and kind) and then Boutique Bitmap 7x7 for what it lacks
        def ark16(ch):
            g = ark_glyph(ark_dir, ch)
            if g is not None:
                return place(g, 16, 16, (16 - len(g[0])) // 2, 2)  # centred (some marks are half width)
            return cu.rows(ch, 16) if cu.has(ch) else b7.cell(ch, 16)

        # Ark Pixel (黑体): its Chinese and letters
        build(os.path.join(out, "ark"), ark16, lambda ch: place(ark_glyph(ark_dir, ch) or [], 8, 16, 1, 2) if ark_glyph(ark_dir, ch) else uni8(ch))
        # Retro 8-bit: Press Start 2P's letters, Ark Pixel's Chinese in bold (粗体)
        build(os.path.join(out, "retro"), lambda ch: bold(ark16(ch)), lambda ch: ps.rows(ch, 8) if ps.has(ch) else uni8(ch))
    else:
        # Retro 8-bit letters only (its Chinese needs ARK12_DIR)
        build(os.path.join(out, "retro"), uni16, lambda ch: ps.rows(ch, 8) if ps.has(ch) else uni8(ch), cjk=False)



if __name__ == "__main__":
    main()
