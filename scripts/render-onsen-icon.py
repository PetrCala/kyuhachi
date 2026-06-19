#!/usr/bin/env python3
"""
Render the Onsens tab icon — the classic Japanese hot-spring symbol (♨).

Three rising steam waves over a flat oval bowl, the mark used on maps and signs
all over Japan. The shape is authored here as a clean SVG (smooth Catmull-Rom
bezier waves + an exact ellipse bowl), rasterized by the system SVG engine, and
emitted as white-on-transparent *template* PNGs so the tab bar can tint them
(active amber / inactive grey) via <Image tintColor>, the same way Ionicons
receive their `color`. Two variants:

    onsen-symbol.png          focused   — bowl filled solid, waves stroked
    onsen-symbol-outline.png  unfocused — bowl as an open ring, waves stroked

Each variant is emitted at @1x / @2x / @3x. The editable source SVGs are written
alongside (onsen-symbol{,-outline}.svg, currentColor) for future tweaks. Run
from the repo root (macOS — uses `qlmanage` to rasterize):

    python3 scripts/render-onsen-icon.py

Source of truth for the Onsens tab glyph — re-run if the shape changes.
"""

import math
import os
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "assets")

VB = 120          # SVG viewBox (square)
SW = 9.5          # stroke width
Y_B = 64          # wave bottoms, just above the bowl
BOWL = dict(cx=60, cy=87, rx=35, ry=11)   # flat oval basin
SIZES = ((1, ""), (2, "@2x"), (3, "@3x"))
BASE = 32         # @1x base size in px


def _catmull_rom(pts):
    """Smooth C1 spline through pts as an SVG cubic-bezier path."""
    p, n = pts, len(pts)
    clamp = lambda i: p[max(0, min(n - 1, i))]
    d = [f"M {p[0][0]:.2f},{p[0][1]:.2f}"]
    for i in range(n - 1):
        p0, p1, p2, p3 = clamp(i - 1), clamp(i), clamp(i + 1), clamp(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C {c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    return " ".join(d)


def _wave(cx, y_top, amp, samples=24):
    # periods=1 -> a single gentle S; both ends sit on the centerline (upright).
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = cx + amp * math.sin(2 * math.pi * t)
        y = Y_B + (y_top - Y_B) * t
        pts.append((x, y))
    return pts


# Steam: outer waves bow outward (mirrored), middle is tallest.
WAVE_PATHS = [_catmull_rom(_wave(*w)) for w in (
    (45, 22, -4.2),   # left
    (60, 11, 4.6),    # middle
    (75, 22, 4.2),    # right
)]


def build_svg(*, filled, color):
    waves = "\n".join(
        f'  <path d="{d}" fill="none" stroke="{color}" stroke-width="{SW}" '
        f'stroke-linecap="round"/>' for d in WAVE_PATHS
    )
    b = BOWL
    if filled:
        bowl = f'  <ellipse cx="{b["cx"]}" cy="{b["cy"]}" rx="{b["rx"]}" ry="{b["ry"]}" fill="{color}"/>'
    else:
        bowl = (f'  <ellipse cx="{b["cx"]}" cy="{b["cy"]}" rx="{b["rx"]}" ry="{b["ry"]}" '
                f'fill="none" stroke="{color}" stroke-width="{SW}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB} {VB}" '
            f'width="{VB}" height="{VB}">\n{waves}\n{bowl}\n</svg>\n')


def _rasterize_template(px):
    """Render the BLACK glyph and return a white-on-transparent RGBA template.

    qlmanage flattens onto a white background, so we render the shape in black,
    flatten over white, then derive the alpha from luminance (black shape -> 255,
    white ground -> 0). RGB is forced white so <Image tintColor> can recolor it.
    """
    if not shutil.which("qlmanage"):
        raise SystemExit("qlmanage not found — this renderer requires macOS.")
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for variant, filled in (("onsen-symbol", True), ("onsen-symbol-outline", False)):
            src = os.path.join(tmp, f"{variant}.svg")
            with open(src, "w") as f:
                f.write(build_svg(filled=filled, color="#000000"))
            subprocess.run(["qlmanage", "-t", "-s", str(px), "-o", tmp, src],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            img = Image.open(os.path.join(tmp, f"{variant}.svg.png")).convert("RGBA")
            if img.size != (px, px):
                img = img.resize((px, px), Image.LANCZOS)
            ground = Image.new("RGB", img.size, (255, 255, 255))
            ground.paste(img, mask=img.split()[3])           # flatten over white
            alpha = ground.convert("L").point(lambda v: 255 - v)  # black -> opaque
            tpl = Image.new("RGBA", img.size, (255, 255, 255, 0))
            tpl.putalpha(alpha)
            out[variant] = tpl
    return out


def _content_bbox(img, thr=20):
    return img.split()[3].point(lambda v: 255 if v >= thr else 0).getbbox()


def main():
    print("Rendering Onsens tab icon:")
    HI = 1024  # master raster for a shared, aligned crop
    masters = _rasterize_template(HI)
    # One shared square crop box (union of both variants) so focused/unfocused
    # share scale and centering and never jump between states.
    boxes = [_content_bbox(img) for img in masters.values()]
    l = min(b[0] for b in boxes); t = min(b[1] for b in boxes)
    r = max(b[2] for b in boxes); btm = max(b[3] for b in boxes)
    side = max(r - l, btm - t)
    pad = round(side * 0.07)
    box_side = side + 2 * pad
    ox = l - (box_side - (r - l)) // 2
    oy = t - (box_side - (btm - t)) // 2

    for variant, master in masters.items():
        square = Image.new("RGBA", (box_side, box_side), (0, 0, 0, 0))
        square.alpha_composite(master, (-ox, -oy))
        for scale, suffix in SIZES:
            px = BASE * scale
            square.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f"{variant}{suffix}.png"))
            print(f"  {variant}{suffix}.png  {px}x{px}")
        # editable source SVG (currentColor) alongside the rasters
        with open(os.path.join(OUT, f"{variant}.svg"), "w") as f:
            f.write(build_svg(filled=variant == "onsen-symbol", color="currentColor"))


if __name__ == "__main__":
    main()
