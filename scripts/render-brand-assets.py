#!/usr/bin/env python3
"""
Render Kyuhachi brand assets from the Klee One SemiBold typeface.

The mark is the app name written vertically: 九 (kyu / 9) stacked over 八 (hachi / 8).
Off-white glyphs on a dark #262837 ground. Run from the repo root:

    python3 scripts/render-brand-assets.py

Regenerates app/assets/{icon,splash-icon,favicon,android-icon-*}.png.
Source of truth for the brand mark — re-run if the palette or glyphs change.
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = os.path.join(
    ROOT, "node_modules", "@expo-google-fonts", "klee-one",
    "600SemiBold", "KleeOne_600SemiBold.ttf",
)
OUT = os.path.join(ROOT, "app", "assets")

# Brand palette (kept in sync with app/src/theme/colors.ts brand tokens)
INK_DARK = (38, 40, 55, 255)       # #262837  — icon / splash ground
OFF_WHITE = (245, 241, 232, 255)   # #F5F1E8  — warm off-white glyph
GLYPHS = ["九", "八"]              # top → bottom (kyu over hachi)
GAP_RATIO = 0.04                   # vertical gap between glyphs, as fraction of glyph height


def glyph_image(char, color, px=900):
    """Render a single glyph cropped tight to its ink bounds."""
    font = ImageFont.truetype(FONT_PATH, px)
    pad = px // 2
    canvas = Image.new("RGBA", (px * 2, px * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.text((pad, pad), char, font=font, fill=color, anchor="lt")
    return canvas.crop(canvas.getbbox())


def make_mark(color):
    """Vertical 九/八 mark cropped tight, as an RGBA image."""
    imgs = [glyph_image(c, color) for c in GLYPHS]
    width = max(i.width for i in imgs)
    gap = int(max(i.height for i in imgs) * GAP_RATIO)
    height = sum(i.height for i in imgs) + gap * (len(imgs) - 1)
    mark = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    y = 0
    for i in imgs:
        mark.alpha_composite(i, ((width - i.width) // 2, y))
        y += i.height + gap
    return mark


def scaled_to_height(mark, target_h):
    ratio = target_h / mark.height
    return mark.resize((max(1, round(mark.width * ratio)), target_h), Image.LANCZOS)


def compose(size, *, bg, glyph_color, height_ratio):
    """Square canvas, optional solid bg, vertical mark centered at height_ratio."""
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    mark = scaled_to_height(make_mark(glyph_color), round(size * height_ratio))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print(f"  {name:34s} {img.width}x{img.height}")


def main():
    if not os.path.exists(FONT_PATH):
        raise SystemExit(f"Klee One not found at {FONT_PATH} — run `npx expo install @expo-google-fonts/klee-one` first.")
    print("Rendering brand assets:")

    # iOS app icon — full bleed, no transparency (iOS applies its own mask).
    save(compose(1024, bg=INK_DARK, glyph_color=OFF_WHITE, height_ratio=0.60), "icon.png")

    # Splash mark — transparent; Expo composites it over splash.backgroundColor (#262837).
    save(compose(1242, bg=None, glyph_color=OFF_WHITE, height_ratio=0.40), "splash-icon.png")

    # Web favicon — full bleed, larger mark for legibility at tiny sizes.
    save(compose(48, bg=INK_DARK, glyph_color=OFF_WHITE, height_ratio=0.66), "favicon.png")

    # Android adaptive icon (unused on iOS-only builds, kept consistent, not default).
    # Background is a solid layer; the mark lives only on the foreground layer.
    save(Image.new("RGBA", (512, 512), INK_DARK), "android-icon-background.png")
    save(compose(512, bg=None, glyph_color=OFF_WHITE, height_ratio=0.42), "android-icon-foreground.png")
    save(compose(432, bg=None, glyph_color=(255, 255, 255, 255), height_ratio=0.42), "android-icon-monochrome.png")


if __name__ == "__main__":
    main()
