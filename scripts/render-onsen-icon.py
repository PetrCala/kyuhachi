#!/usr/bin/env python3
"""
Render the Onsens tab icon — the classic Japanese hot-spring symbol (♨).

The mark used on maps and signs all over Japan: three rising steam waves over a
bowl. We render the canonical glyph (U+2668 HOT SPRINGS) from Noto Sans Symbols 2
(SIL OFL, freely redistributable — see scripts/vendor/noto-sans-symbols-2/), as a
white-on-transparent *template* PNG so the tab bar can tint it (active amber /
inactive grey) via <Image tintColor>, the same way Ionicons receive their `color`.

Focus is conveyed by color (the tab bar's active/inactive tint), so a single
glyph is emitted at @1x / @2x / @3x. Run from the repo root:

    python3 scripts/render-onsen-icon.py

Source of truth for the Onsens tab glyph — re-run if the size or padding change.
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "assets")
FONT_PATH = os.path.join(
    ROOT, "scripts", "vendor", "noto-sans-symbols-2", "NotoSansSymbols2-onsen.subset.ttf"
)

GLYPH = "♨"   # ♨ HOT SPRINGS
BASE = 32          # @1x size in px
MARGIN = 0.16      # padding around the glyph, as a fraction of its longer side
SIZES = ((1, ""), (2, "@2x"), (3, "@3x"))


def glyph_alpha(em=1024):
    """Render the glyph as an L-mode coverage image (its alpha channel)."""
    font = ImageFont.truetype(FONT_PATH, em)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), GLYPH, font=font)
    w, h = r - l, b - t
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((-l, -t), GLYPH, font=font, fill=255)
    return img


def main():
    if not os.path.exists(FONT_PATH):
        raise SystemExit(f"Font not found at {FONT_PATH}")
    print("Rendering Onsens tab icon:")
    cov = glyph_alpha()
    side = round(max(cov.size) * (1 + 2 * MARGIN))
    square = Image.new("L", (side, side), 0)
    square.paste(cov, ((side - cov.width) // 2, (side - cov.height) // 2))

    for scale, suffix in SIZES:
        px = BASE * scale
        alpha = square.resize((px, px), Image.LANCZOS)
        tpl = Image.new("RGBA", (px, px), (255, 255, 255, 0))
        tpl.putalpha(alpha)
        tpl.save(os.path.join(OUT, f"onsen-symbol{suffix}.png"))
        print(f"  onsen-symbol{suffix}.png  {px}x{px}")


if __name__ == "__main__":
    main()
