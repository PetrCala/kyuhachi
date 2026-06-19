#!/usr/bin/env python3
"""
Render the Onsens tab icon — the classic Japanese hot-spring symbol (♨).

Three rising steam waves over a shallow bowl, the mark used on maps and signs
all over Japan. Rendered as white-on-transparent *template* PNGs so the tab bar
can tint them (active amber / inactive grey) via <Image tintColor>, the same way
Ionicons receive their `color`. Two variants, mirroring the filled/outline pair
the sibling tabs get from Ionicons:

    onsen-symbol.png          focused  — bowl filled solid, waves stroked
    onsen-symbol-outline.png  unfocused — bowl stroked, waves stroked

Each variant is emitted at @1x / @2x / @3x. Run from the repo root:

    python3 scripts/render-onsen-icon.py

Source of truth for the Onsens tab glyph — re-run if the shape changes.
"""

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "assets")

WHITE = (255, 255, 255, 255)
SS = 8  # supersample factor; downscaled with LANCZOS for clean antialiasing

# Geometry in a normalized [0,1] square, y pointing down.
STROKE = 0.072            # stroke width as a fraction of the canvas
BOWL = dict(cx=0.5, cy=0.655, rx=0.30, ry=0.185, a0=10, a1=170)  # dish arc
WAVE_BOTTOM = 0.565
WAVES = [                 # (x center, top y, amplitude, periods)
    (0.315, 0.265, 0.040, 1.25),
    (0.500, 0.150, 0.045, 1.25),
    (0.685, 0.265, 0.040, 1.25),
]


def _bowl_points(s):
    cx, cy, rx, ry = (BOWL[k] * s for k in ("cx", "cy", "rx", "ry"))
    pts = []
    n = 96
    for i in range(n + 1):
        ang = math.radians(BOWL["a0"] + (BOWL["a1"] - BOWL["a0"]) * i / n)
        pts.append((cx + rx * math.cos(ang), cy + ry * math.sin(ang)))
    return pts


def _wave_points(s, wx, y_top, amp, periods):
    pts = []
    m = 72
    for i in range(m + 1):
        t = i / m
        x = wx + amp * math.sin(2 * math.pi * periods * t)
        y = WAVE_BOTTOM + (y_top - WAVE_BOTTOM) * t
        pts.append((x * s, y * s))
    return pts


def _stroke(d, pts, width):
    d.line(pts, fill=WHITE, width=width, joint="curve")
    r = width / 2  # round caps
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)


def render(px, *, filled):
    s = px * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    width = max(1, round(STROKE * s))

    bowl = _bowl_points(s)
    if filled:
        d.polygon(bowl, fill=WHITE)  # closes along the rim chord -> solid basin
    else:
        _stroke(d, bowl, width)

    for wx, y_top, amp, periods in WAVES:
        _stroke(d, _wave_points(s, wx, y_top, amp, periods), width)

    return img.resize((px, px), Image.LANCZOS)


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print(f"  {name:30s} {img.width}x{img.height}")


def main():
    print("Rendering Onsens tab icon:")
    # @1x base 32pt; RN picks @2x/@3x by device scale, scaled to the tab size.
    for variant, filled in (("onsen-symbol", True), ("onsen-symbol-outline", False)):
        for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
            save(render(32 * scale, filled=filled), f"{variant}{suffix}.png")


if __name__ == "__main__":
    main()
