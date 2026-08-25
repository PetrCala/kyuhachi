# Brand voice

How Kyuhachi talks about itself, everywhere a user reads it: the App Store
listing ([app-store-listing.md](app-store-listing.md)), in-app strings
(`app/src/i18n/`), screenshot captions, release notes, and the website. Written
after the first App Store copy rewrite (2026-08); the examples below are the
before/afters from that rewrite.

## Positioning

**Kyuhachi is the app that makes the Kyushu 88 actually doable.**

Taking on the challenge used to mean piecing the trip together from scattered
Japanese-only listings, a paper stamp book, and hope that the opening hours
were still right. Kyuhachi is the whole challenge in one app: every eligible
onsen with its details, a map, tracking to 88, offline, in English and
Japanese.

Every piece of copy earns its place by answering one question: **why does this
make the challenge easier?** Features are never listed for their own sake.

Two audiences, one app:

- **English readers**: the challenge was effectively closed to them before.
  For them the sell is access: the catalog in English, names with readings,
  everything parsed and in one place.
- **Japanese readers**: they can already read the official info. For them the
  sell is consolidation and tooling: 全部このアプリ一つで, the map, the
  tracking, the 御湯印帳, offline.

## Honesty guardrails (hard rules)

- **Never claim fresher data than the source.** The catalog is scraped from
  88onsen.com, so "kept in sync with the official listings" is fine and
  "more up to date than X" is not. The source disclaimer stays at the end of
  both descriptions.
- **Never bash the organisers, 88onsen.com, or any other app**, by name or by
  implication. Pain points are expressed as the traveler's experience ("no
  more tabs and screenshots"), never as someone else's failure.
- **Non-affiliation stays explicit and early**: paragraph two or three of each
  description, 非公式 in the JA subtitle, matching
  [legal/terms.md](legal/terms.md) and [legal/privacy.md](legal/privacy.md).
- **No claimed feature the app does not have.** The feature list comes from the
  routes under `app/app/` and the strings in `app/src/i18n/`.

## Voice

A human who has been on the road, telling you what you need. Direct, concrete,
occasionally funny. Sells with specifics, never with adjectives.

Rules:

- **Concrete over abstract.** Name the thing: hours, fees, stamp 88, a valley
  with no bars. If a sentence would survive in any other app's listing, cut it.
- **Verbs over adjectives.** "Search the catalog, browse by prefecture, heart
  your favorites", not "a powerful and intuitive catalog experience".
- **Plain beats clever when they conflict.** "Heart your favorites" replaced
  "heart the ones you're saving for a good day": the first tells you the
  feature exists, the second makes you decode it.
- **Wit is allowed one seat.** The subtitle carries the joke (the Verne
  reference). The body copy stays warm but straight; two jokes per surface is
  one too many.
- **No marketing filler.** Banned in copy: seamless, comprehensive, robust,
  ultimate, powerful, intuitive, beautiful, effortless, revolutionary,
  best-in-class, all-in-one (show it instead), "the only app" (unverifiable).
- **Benefit-first section headers.** EVERY ONSEN IN ONE PLACE, not FEATURES.
  A BOOK THAT FILLS UP, not SPAPORT.

Before/after, from the 2026-08 rewrite:

| Before | After | Why |
|---|---|---|
| Track your Kyushu onsen tour | Around Kyushu in 88 onsens | Verne reference; the count sells the quest |
| FIND THE NEXT ONE | SEE WHAT'S NEAR YOU | The benefit, from the user's side |
| Tap the heart on the ones you want to come back to. | Search the catalog, browse by prefecture, heart your favorites. | Three parallel verbs, no decoding |

## Japanese copy

Written natively in Japanese, never translated from the English. It uses the
app's own vocabulary and sells the consolidation angle (see Positioning). If
the English changes, rewrite the Japanese as Japanese; a matching structure is
fine, matching sentences are not.

The JA subtitle mirrors the Verne joke natively (八十日間世界一周 →
八十八湯で九州一周) and keeps 非公式アプリ per the positioning rule.

## Vocabulary

Always these words, spelled exactly this way:

| EN | JA | Never |
|---|---|---|
| Spaport | 御湯印帳 | passport, stamp book (as the product name; "a stamp book" as a description is fine) |
| stamp | 湯印 | badge, sticker |
| the Kyushu 88 / 九州八十八湯 | 九州八十八湯 | "the 88 challenge" |
| onsen(s) | 湯 / 温泉 | hot spring is fine in EN prose, but onsen is the house word |
| Finder | スポット検索 | search, POI search |
| tiers: bronze, silver, gold | 銅・銀・金の称号 | levels, medals |
| ranks: 見習い to 泉人 | 見習いから泉人 | translated rank names |

## Canonical strings

The current subtitle and promotional text, so other surfaces can quote them
without re-deriving:

- EN subtitle: `Around Kyushu in 88 onsens`
- JA subtitle: `八十八湯で九州一周する非公式アプリ`
- EN promo: `Everything you need for the Kyushu 88: every onsen's hours, fees and location, a map, and a stamp book that counts to 88. Works offline, in English and Japanese.`
- JA promo: `九州八十八湯めぐりを、このアプリ一つで。対象湯の情報と地図、入った記録、湯印が集まる御湯印帳。データは端末にあるので、圏外の山あいでも使えます。個人開発の非公式アプリです。`

## Process

- Edit the metadata tree, then run `npm run check:metadata` (limits, keyword
  format, secret files).
- Read this doc before writing any user-facing copy; keep the examples here in
  sync when the canonical strings change.
- The character limits and the upload workflow live in
  [app-store-listing.md](app-store-listing.md).
