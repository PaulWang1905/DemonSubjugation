"""Pixel fonts for the 12- and 10-pixel ("More text") cells.

12 px: Chinese from Cubic 11 (12 px), letters from X11 misc-fixed 6x12.
10 px: Chinese from Boutique Bitmap 9x9 (10 px), letters from misc-fixed 5x8
       (with the plainer . , : ; of misc-fixed 5x7).
Chinese characters a font lacks come from Boutique Bitmap 7x7, which has all
of GB2312. Each glyph function returns rows of 0/1 pixels, or None.
"""
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont


class Bdf:
    """A BDF bitmap font (glyphs by code point)."""

    def __init__(self, path):
        self.ascent = self.descent = 0
        self.glyphs = {}
        enc = bbx = None
        rows = None
        for line in open(path, encoding="latin-1"):
            p = line.split()
            if not p:
                continue
            if p[0] == "FONT_ASCENT":
                self.ascent = int(p[1])
            elif p[0] == "FONT_DESCENT":
                self.descent = int(p[1])
            elif p[0] == "ENCODING":
                enc = int(p[1])
            elif p[0] == "BBX":
                bbx = tuple(int(v) for v in p[1:5])
            elif p[0] == "BITMAP":
                rows = []
            elif p[0] == "ENDCHAR":
                self.glyphs[enc] = (bbx, rows)
                rows = None
            elif rows is not None:
                rows.append(int(p[0], 16) << (32 - len(p[0]) * 4))

    def cell(self, ch, w, h, top):
        """The glyph in a w x h cell, its font box starting `top` rows down."""
        g = self.glyphs.get(ord(ch))
        if g is None:
            return None
        (bw, bh, bx, by), rows = g
        out = [[0] * w for _ in range(h)]
        base = top + self.ascent  # baseline row
        for r, bits in enumerate(rows):
            y = base - by - bh + r
            for c in range(bw):
                x = bx + c
                if 0 <= x < w and 0 <= y < h and (bits >> (31 - c)) & 1:
                    out[y][x] = 1
        return out


class Ttf:
    """A pixel TTF drawn at its native size, centred in a square cell."""

    def __init__(self, path, size):
        self.font = ImageFont.truetype(path, size)
        self.cmap = TTFont(path).getBestCmap()

    def cell(self, ch, n):
        if ord(ch) not in self.cmap:
            return None
        im = Image.new("L", (n, n), 0)
        ImageDraw.Draw(im).text((n / 2, n / 2), ch, fill=255, font=self.font, anchor="mm")
        rows = [[1 if im.getpixel((x, y)) > 127 else 0 for x in range(n)] for y in range(n)]
        return rows


def small_set(size, src):
    """(wide, narrow) glyph functions for `size`-pixel cells, fonts from directory `src`."""
    b7 = Ttf(src + "boutique-bitmap-7x7_BoutiqueBitmap7x7.ttf", 8)
    if size == 12:
        main = Ttf(src + "cubic-11_Cubic_11.woff2", 12)
        latin, top = Bdf(src + "font-misc-misc-1.1.3/6x12.bdf"), 0
        narrow = lambda ch: latin.cell(ch, 6, 12, top)
    else:
        main = Ttf(src + "boutique-bitmap-9x9_BoutiqueBitmap9x9.ttf", 10)
        latin, top = Bdf(src + "font-misc-misc-1.1.3/5x8.bdf"), 1
        dots = Bdf(src + "font-misc-misc-1.1.3/5x7.bdf")  # baseline one row lower
        narrow = lambda ch: dots.cell(ch, 5, 10, 2) if ch in ".,:;" else latin.cell(ch, 5, 10, top)
    wide = lambda ch: main.cell(ch, size) or b7.cell(ch, size)
    return wide, narrow
