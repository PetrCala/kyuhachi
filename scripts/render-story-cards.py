#!/usr/bin/env python3
"""
Render Instagram story cards for the walk from the copy in story-cards.json.

    python3 scripts/render-story-cards.py                 # -> output/story-cards/
    python3 scripts/render-story-cards.py --out ~/Desktop

Write the words in scripts/story-cards.json and re-run; the layout, palette and
type are fixed here so a card cannot come out off-brand. Cards render in the
order they appear in the file, and the filenames are numbered accordingly, so a
phone's photo picker offers them in the order they should be posted.

Rendering goes through headless Chrome rather than PIL, which is what
render-brand-assets.py uses. The reason is Japanese text: PIL cannot line-break
or justify a mixed CJK/Latin paragraph, and every card here is a bilingual
paragraph. A browser already knows how.
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COPY = os.path.join(ROOT, "scripts", "story-cards.json")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Story canvas. Instagram draws its own UI over roughly the top and bottom
# 250 px, so the padding below is a safe area, not taste: text outside it ends
# up under the account header or the reply box.
WIDTH, HEIGHT = 1080, 1920
PAD_TOP, PAD_BOTTOM, PAD_SIDE = 300, 320, 110

# Brand palette, kept in sync with app/src/theme/colors.ts.
INK = "#262837"
AMBER = "#ffb300"
WHITE = "#ffffff"
BODY = "#c9c8d6"
JA = "#ecebf2"

TEMPLATE = """<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {w}px; height: {h}px; background: {ink}; }}
  body {{
    display: flex; flex-direction: column; justify-content: center;
    padding: {pt}px {ps}px {pb}px;
    font-family: "Zen Kaku Gothic New", "Hiragino Sans", sans-serif;
  }}
  .label {{
    font-family: "Klee One", "Hiragino Mincho ProN", serif;
    font-size: 40px; font-weight: 600; letter-spacing: .18em;
    color: {amber}; margin-bottom: 40px;
  }}
  .rule {{ width: 96px; height: 5px; background: {amber}; margin-bottom: 56px; }}
  .big {{
    font-family: "Klee One", "Hiragino Mincho ProN", serif;
    font-weight: 600; font-size: {bigsize}px; line-height: 1.24;
    color: {white}; margin-bottom: 44px;
  }}
  .en {{ font-size: 46px; line-height: 1.55; color: {body}; margin-bottom: 64px; max-width: 820px; }}
  .ja {{
    font-family: "Klee One", "Hiragino Mincho ProN", serif;
    font-size: 44px; line-height: 1.75; color: {jacolor}; max-width: 820px;
  }}
  .url {{ margin-top: 64px; font-size: 44px; font-weight: 700; color: {amber}; }}
  .mark {{
    position: absolute; left: {ps}px; bottom: 200px;
    font-family: "Klee One", serif; font-size: 46px; color: {amber};
    opacity: .55; letter-spacing: .3em;
  }}
</style>
{label}{rule}{big}{en}{ja}{url}
<div class="mark">九八</div>
"""


def big_size(text):
    """
    Fit the headline by length, so writing a longer line never overflows the
    card. The thresholds come from the widest glyphs Klee One draws at each
    size across the 820 px measure.
    """
    length = max(len(line) for line in text.split("<br>"))
    if length <= 14:
        return 104
    if length <= 20:
        return 96
    if length <= 28:
        return 88
    if length <= 40:
        return 74
    return 62


def render(card, out_dir, index):
    def block(cls, value):
        return f'<div class="{cls}">{value}</div>' if value else ""

    page = TEMPLATE.format(
        w=WIDTH, h=HEIGHT, pt=PAD_TOP, pb=PAD_BOTTOM, ps=PAD_SIDE,
        ink=INK, amber=AMBER, white=WHITE, body=BODY, jacolor=JA,
        bigsize=big_size(card["big"]),
        label=block("label", card.get("label")),
        rule='<div class="rule"></div>' if card.get("label") else "",
        big=block("big", card["big"]),
        en=block("en", card.get("en")),
        ja=block("ja", card.get("ja")),
        url=block("url", card.get("url")),
    )
    src = os.path.join(out_dir, "_page.html")
    with open(src, "w") as handle:
        handle.write(page)

    dest = os.path.join(out_dir, f'story-{index:02d}-{card["name"]}.png')
    result = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=1", f"--window-size={WIDTH},{HEIGHT}",
         # Long enough for the webfonts to arrive; without it Chrome shoots the
         # fallback face and the cards come out in the wrong typeface.
         "--virtual-time-budget=8000", f"--screenshot={dest}", f"file://{src}"],
        capture_output=True,
    )
    os.remove(src)
    if not os.path.exists(dest):
        sys.exit(f"chrome failed to render {card['name']}:\n{result.stderr.decode()}")
    return dest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(ROOT, "output", "story-cards"))
    parser.add_argument("--copy", default=COPY)
    args = parser.parse_args()

    if not os.path.exists(CHROME):
        sys.exit(f"Google Chrome not found at {CHROME}")

    with open(args.copy) as handle:
        cards = json.load(handle)["cards"]

    os.makedirs(args.out, exist_ok=True)
    for index, card in enumerate(cards, start=1):
        print("rendered", os.path.relpath(render(card, args.out, index), ROOT))
    print(f"\n{len(cards)} card(s) in {args.out}")


if __name__ == "__main__":
    main()
