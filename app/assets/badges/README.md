# Challenge badges

Vector-designed challenge-badge artwork (an alternative to AI-generated art). A
finished badge is composited **at runtime** from two layers: a circular tier
**medallion** with a small round **transport pin** overlaid at bottom-centre,
overlapping the lower rim. The medallion and pin are therefore separate files —
no transport glyph is baked onto a medallion.

See `contact-sheet.png` for the full set at a glance, including a composited
example.

## Assets (each at `@1x` / `@2x` / `@3x`)

| File | Canvas (@1x) | Notes |
|---|---|---|
| `badge-base-gold.png` | 80px | one struck-metal sculpt, gold colorway |
| `badge-base-silver.png` | 80px | identical sculpt, silver |
| `badge-base-bronze.png` | 80px | identical sculpt, bronze |
| `transport-foot.png` | 32px | enamel pin, walking-person glyph |
| `transport-bicycle.png` | 32px | enamel pin, bicycle glyph |
| `transport-public.png` | 32px | enamel pin, bus glyph |
| `transport-car.png` | 32px | enamel pin, car glyph |

All three medallions share one canvas/margin; all four pins share another, so
they register cleanly when composited.

## Design

- **Medallion** — flat "struck commemorative medal": metal disc + darker rim +
  thin concentric struck ring + a soft upper sheen arc. The ♨ hot-spring mark
  (reused from `app/assets/onsen-symbol.png`, recoloured to the deep metal
  shade) is the centre hero; "88" is embossed tone-on-tone in the upper field.
  The lower-centre is left calm for the transport pin. The optional Kyushu
  silhouette was omitted — at this size it reads as a smudge rather than an
  island.
- **Pin** — deep-indigo enamel field (`#262837`, brand ink), thin light rim,
  single white glyph. One family; only the glyph differs.

Metal colorways (match the app theme tokens):

| Tier | fill | deep (rim + emboss) | sheen |
|---|---|---|---|
| Gold | `#b8893b` | `#7a5a23` | `#d9b066` |
| Silver | `#8a8a8f` | `#5b5b60` | `#b9b9be` |
| Bronze | `#a9663a` | `#7a4527` | `#c98a5c` |

## Regenerating

Sources live in `src/`:

- `badge-base-*.svg` — pure-vector medallion (the rendered PNG composites the
  recoloured ♨ symbol separately).
- `badge-base-*.preview.svg` — self-contained preview with the ♨ embedded and
  recoloured (renders in a browser/Inkscape; `sharp` drops embedded raster
  images, which is why the build composites instead).
- `transport-*.svg` — pure-vector pins.
- `build.mjs` — the generator (geometry source of truth).

```sh
cd app/assets/badges/src
npm i sharp        # only dependency
node build.mjs     # rewrites every PNG + the contact sheet
```
