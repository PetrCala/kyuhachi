# Challenge Badge Art Brief

**Last updated:** 2026-06-23
**Status:** Working brief — for producing the illustrated badge assets. Update when the asset set or compositing model changes.

This document is the art-direction spec for the redesigned challenge badges. A badge celebrates a completed challenge and encodes three things: the **Kyushu 88 challenge identity**, the **tier** achieved (bronze/silver/gold), and the **mode of transport** the challenge was done under (the challenge type's `baseMode`).

The companion `ChallengeBadge` component composites these assets at runtime; this brief covers only the source artwork.

---

## How the pieces fit (read first — it constrains the prompts)

A finished badge = **one struck-metal medallion** (tier) with **one small enamel transport pin** overlaid at bottom-center, overlapping ~30%.

- The **3 tier medallions share one identical sculpt** — only the metal differs. Generate **one master**, then derive gold/silver/bronze by color-grading it. Do not generate three from scratch; they will never match.
- The **4 transport pins** are a separate, colored, tier-neutral family, reused across all tiers.
- Net: **5 generations** (1 medallion master + 4 pins) → **7 shipped assets** after grading.

Because the transport emblem follows the challenge type's `baseMode` (fixed per challenge type, not per visit), the transport is constant within a challenge. Within one challenge a user only ever sees the 3 tier variants of a single transport.

---

## Asset set

| File | Source | Notes |
|---|---|---|
| `badge-base-gold.png` | medallion master, gold grade | tier read lives here |
| `badge-base-silver.png` | medallion master, silver grade | identical sculpt |
| `badge-base-bronze.png` | medallion master, bronze grade | identical sculpt |
| `transport-foot.png` | transport pin | reused across all tiers |
| `transport-bicycle.png` | transport pin | |
| `transport-public.png` | transport pin (bus) | |
| `transport-car.png` | transport pin | |

All ship `@1x/@2x/@3x` into `app/assets/badges/`, named exactly as above. Transport keys match the `TransportMode` union (`foot` / `bicycle` / `public` / `car`) and the icon mapping in `app/src/components/VisitCard.tsx`.

---

## Recommended style direction

**Monochrome struck-metal commemorative medal** (Olympic-medal style), not flat-color enamel. A single relief sculpt recolored to three metals guarantees a cohesive set, and the monochrome metal lets the colored transport pin provide the only pop of color. Premium, classic, low-risk.

---

## Shared style preamble

Prepend to **every** prompt:

> A premium collectible struck-metal medal, soft 3D relief sculpture, studio product-render look, photographed straight-on / top-down with no perspective tilt, single centered object, even soft lighting from the upper-left with a gentle specular highlight on the raised edges, smooth polished metal, refined and minimal — not busy or ornate-to-clutter, Japanese onsen / hot-spring theme. Fully transparent background, generous even margin, the entire object inside the frame, no shadow cast onto the background.

---

## Asset 1 — medallion master (generate once, grade into 3)

Append to the preamble:

> A circular medal. In the raised center: **the hot-spring symbol — three rising wavy lines of steam above a shallow oval dish/bowl** — as the hero motif, large and centered. The numerals **"88"** embossed in clean bold relief, integrated into the upper portion of the medal. The **silhouette of Kyushu island** subtly embossed as a low-relief texture in the background field behind the steam symbol, tone-on-tone, not high-contrast. A clean beaded or laurel rim around the edge. Leave the lower-center area calm and uncluttered (a pin will sit there). Neutral silvered metal for now.

Then in post, color-grade three copies. Hues match the `colors.tier*` tokens so the vector placeholder and the final art read the same:

| Tier | Highlight | Shadow |
|---|---|---|
| Gold | `#C9A227` | `#8a6d10` |
| Silver | `#AEB0B4` | `#76787c` |
| Bronze | `#B5784A` | `#7d4f2c` |

---

## Assets 2–5 — transport pins

Shared pin preamble:

> A small round enamel lapel pin, soft 3D, thin polished antique-silver rim, smooth **deep indigo** enamel field, a single clean **white** iconic glyph centered, flat front-on view, transparent background, centered, even margin, no text.

Per-pin glyph:

| File | Glyph instruction |
|---|---|
| `transport-foot.png` | a simple side-on walking-person silhouette |
| `transport-bicycle.png` | a simple side-on bicycle silhouette |
| `transport-public.png` | a simple front-on bus silhouette |
| `transport-car.png` | a simple side-on car silhouette |

Keep one accent color (indigo) for all four so they read as a family — the glyph is the only difference. If you'd rather color-code transport, give each pin its own enamel hue, but a unified accent is recommended.

---

## Negative prompt (all assets)

> perspective tilt, busy background, gradient or colored background, baked drop shadow, photographic hot-spring scene, realistic water photo, human faces, extra text, extra numbers, letters, Japanese characters, watermark, neon, low quality, cluttered

---

## Technical / registration notes

- Generate at **1024×1024**, transparent (or solid, then key out the background).
- Medallion fills **~85%** of frame; pins fill **~70%** — all centered.
- Trim each to content + a **uniform** transparent margin, so all 3 medallions share one bounding box and all 4 pins share another. Uniform bounds let the component place the pin with fixed offsets.
- Export `@1x/@2x/@3x` (medallion ≈ 80/160/240px, pin ≈ 32/64/96px) into `app/assets/badges/`, with the exact filenames above.

---

## Reliability cautions

1. **The "88" is embossed into the metal** (default for this brief — a struck-metal medal reads more authentic, and there is only one master to hand-finish). Image models routinely mangle text, so plan to hand-fix the numerals in post. The fallback, if the embossed numerals prove unworkable, is to drop "88" from the sculpt and have the `ChallengeBadge` component overlay a clean "88" in code — this guarantees legibility at the cost of the embossed look. Pick one and keep the medallion prompt and the component in sync.
2. **Kyushu's exact shape** is unlikely to render accurately — feed the model a Kyushu silhouette reference image, or accept it as an abstract embossed island.
3. **Model notes:** Ideogram/Flux handle the "88" embossing best of the current models; Midjourney gives the nicest metal. Use the same model and a fixed seed family for the pins so they stay consistent.
