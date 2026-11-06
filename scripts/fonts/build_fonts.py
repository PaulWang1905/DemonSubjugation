#!/usr/bin/env python3
"""Build the player's bundled pixel fonts in the device's HZK16 / ASC16 layout.

HZK16: GB2312 characters in code order from 0xA1A1, 32 bytes each (16 rows of
16 pixels). ASC16: 256 characters of 16 bytes (16 rows of 8 pixels). The engine
reads these exactly like the device's own font files.

Sources (SIL Open Font License 1.1 or public domain, see public/fonts/LICENSES.md):
  unifont-*.hex.gz      Unifont, https://unifoundry.com/unifont/
  PressStart2P-*.ttf    Press Start 2P, https://github.com/google/fonts/tree/main/ofl/pressstart2p
  Cubic_11.woff2        Cubic 11 1.451, https://github.com/ACh-K/Cubic-11

For the 12- and 10-pixel cells of the More text option it also writes
small/cjk12.bin, latin12.bin, cjk10.bin and latin10.bin (see small_fonts.py):
the same GB2312 / ASCII order, `size` rows per glyph, 2 bytes a row for
Chinese and 1 for letters.

Usage: build_fonts.py UNIFONT_HEX_GZ PRESS_START_TTF CUBIC11_WOFF2 OUT_DIR [SMALL_SRC_DIR]
SMALL_SRC_DIR holds the small fonts named in small_fonts.py.
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

    # Retro 8-bit: Press Start 2P's letters, Unifont's Chinese
    ps = Raster(press_start, 8)
    build(os.path.join(out, "retro"), uni16, lambda ch: ps.rows(ch, 8) if ps.has(ch) else uni8(ch), cjk=False)

    # Cubic 11, with Unifont for the characters it lacks
    cu = Raster(cubic11, 12)
    build(
        os.path.join(out, "cubic"),
        lambda ch: cu.rows(ch, 16) if cu.has(ch) else uni16(ch),
        lambda ch: cu.rows(ch, 8) if cu.has(ch) else uni8(ch),
    )


if __name__ == "__main__":
    main()
