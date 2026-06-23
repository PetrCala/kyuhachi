# Onsen source-vs-captured field audit

**Status:** Read-only investigation. No app, seed, scraper, or `_archive/` changes.
**Date:** 2026-06-23
**Catalog under review:** Firestore `kyuhachi-fddcc` / `onsens`, catalog version 1, 148 documents.
**Source of truth for "source" claims:** the captured raw HTML snapshot of all 148 detail pages
(`_archive/data/db/kyushu.dev.db`, `raw_html` column, scraped 2026-02-10), **not** a fresh live
fetch — see [Coverage & caveats](#coverage--rate-limit-caveats).

> **Update (2026-06-23, post-audit):** acted on as a clean-slate replace rather than a
> versioned backfill. `scripts/reseed-catalog.py` (PR #49) fully overwrote all 148 onsen
> docs from the archive DB and wiped the throwaway challenge/visit data; the catalog now
> populates `phone`, `businessHours.raw`, `admissionFee`, `springQuality`, `imageUrl`,
> `websiteUrl` (137/148), and an authoritative `prefecture`. So the "what to capture next"
> items below are **done except** `businessHours.schedule` (still `null` — the per-weekday
> adapter) and the optional non-schema fields. The selector/parser notes remain the
> reference for a future fresh canonical scrape in the data repo.

---

## TL;DR (headline findings)

1. **The six "null in Firestore" fields were scraped and are sitting in the archive — they were
   dropped at the publish/seed step, not missing from the source.** `phone`, `businessHours`,
   `admissionFee`, `springQuality`, `websiteUrl`, `imageUrl` all exist, fully populated, in
   `_archive/data/db/kyushu.dev.db` and `_archive/artifacts/scraping/scraped_data.json` for all
   148 onsens. The seed (`scripts/seed-firestore.ts`) hard-codes them to `null`.
2. **The "scraped-but-dropped" hypothesis is CONFIRMED.** Richer captured data exists in two
   places in `_archive` (a 13-field JSON artifact *and* a SQLite DB that additionally stores the
   full raw HTML, avg ~21 KB/page). The published `onsens.json`/`onsens.csv` carry only 6 fields
   because the seed only ever read those 6 keys.
3. **The live source exposes every schema field** (verified against the captured raw HTML of all
   148 pages). Each rich field sits in a predictable place: a `<dl class="tableview">` of `<dt>/<dd>`
   pairs, a breadcrumb, and a figure image. Selectors are already implemented in
   `_archive/src/scraper/parser.py`.
4. **`businessHours.raw` is trivially available; `businessHours.schedule` (per-weekday `WeeklySchedule`)
   is not.** The source has **no separate 定休日 field** — open hours, closed days, parking and
   lockers are all crammed into one `営業時間` string. A flat `WeeklySchedule` can be derived for the
   common single-window case but must fall back to `schedule: null` for irregular closures (which the
   app already handles via the `raw` fallback).

The bottom line for the data repo: this is **not** a re-scrape-from-scratch problem. The data was
already captured once; the publish pipeline needs to carry the fields through (and, for `businessHours`,
add a small string→`WeeklySchedule` adapter).

---

## 1. What we captured vs. what we published

### Published catalog (what the app reads)

The seed published from `_archive/onsens.json`. Both `_archive/onsens.json` (148 records) and
`_archive/onsens.csv` (148 rows) have **exactly six keys** and nothing else:

| Source key | → schema field |
|---|---|
| `id` | (upstream id; mapped to `kyuhachiId` via `scripts/onsen-id-map.json`, never stored) |
| `onsenchi` | `areaName` |
| `shisetsu` | `name` |
| `address` | `address` |
| `lat` | `lat` |
| `lng` | `lng` |

`scripts/seed-firestore.ts` then:

- derives `prefecture` heuristically from the address string (`extractPrefecture`), and
- sets the six rich fields to literal `null`:

```ts
// scripts/seed-firestore.ts
phone: null,
businessHours: null,
admissionFee: null,
springQuality: null,
websiteUrl: null,
imageUrl: null,
```

This matches the sampled Firestore state exactly: only `name, areaName, address, lat, lng`
(+ derived `prefecture`) populated; the six rich fields `null` for every onsen.

### The richer data that already exists in `_archive` (the "scraped-but-dropped" finding)

| Archive artifact | Records | Per-record fields | Notes |
|---|---|---|---|
| `_archive/onsens.json` / `onsens.csv` | 148 | 6 | The map seed. What got published. |
| `_archive/artifacts/scraping/scraped_data.json` | 148 | 13 extracted fields | The dropped scrape output. |
| `_archive/data/db/kyushu.dev.db` (`onsens` table) | 148 | 18 columns **+ full `raw_html`** | Fullest artifact. `raw_html` present for all 148 (avg 21 KB, max 34 KB), so every field can be **re-parsed offline without re-fetching**. |

The 13 fields captured per onsen in `scraped_data.json` / the DB:

```
prefecture, recommendation, image_url, covid_measures, address, phone,
business_hours, admission_fee, spring_quality, senjin_benefits,
access_info, website_url, efficacy
```

**Coverage of the captured data** (non-null / 148):

| Captured field | Non-null | % | Maps to schema field |
|---|---|---|---|
| `prefecture` | 148 | 100% | `prefecture` (authoritative; seed currently re-derives from address instead) |
| `address` | 148 | 100% | `address` (already published) |
| `phone` | 148 | 100% | **`phone`** |
| `business_hours` | 148 | 100% | **`businessHours.raw`** |
| `admission_fee` | 148 | 100% | **`admissionFee`** |
| `spring_quality` | 148 | 100% | **`springQuality`** |
| `image_url` | 148 | 100% | **`imageUrl`** |
| `website_url` | 137 | 93% | **`websiteUrl`** (11 onsens have no website link on source) |
| `access_info` | 148 | 100% | — (no schema field; useful) |
| `recommendation` | 148 | 100% | — (no schema field; useful one-liner) |
| `efficacy` | 88 | 59% | — (no schema field; lives in HTML comments) |
| `senjin_benefits` | 61 | 41% | — (no schema field) |
| `covid_measures` | 146 | 99% | — (no schema field; likely stale, low value) |

The captured id set is an exact 1:1 match with `onsens.json` (148 ids, no extras, none missing).

---

## 2. Source field enumeration (88onsen.com detail pages)

**URL pattern:** `https://www.88onsen.com/spot/detail/hid/{upstreamId}`
(`DETAIL_URL_TEMPLATE` in `_archive/src/scraper/fetcher.py`; `{upstreamId}` is the `id` in
`_archive/onsens.json`). Example: <https://www.88onsen.com/spot/detail/hid/1>.

Scanning the captured raw HTML of **all 148 pages**, every page has the same structure:

- a `<div id="contents_title">` breadcrumb (148/148) — carries the **prefecture**,
- a `<div id="spot_detail">` containing a `<p class="figure"><img>` (148/148) — the **representative photo**,
- a `<dl class="tableview">` of `<dt>/<dd>` pairs (148/148) — the structured field table,
- a `<meta property="og:image">` (148/148) — an alternate image URL,
- a `<div id="spot_recommend">` — the selection-committee one-liner,
- a `<div id="spot_near">` — facility/COVID notes.

**Every `<dt>` label found in `dl.tableview` across all 148 pages**, with frequency:

| `<dt>` label | Pages | Schema mapping |
|---|---|---|
| `住所` (address) | 148 | `address` |
| `電話番号` (phone) | 148 | `phone` |
| `営業時間` (business hours) | 148 | `businessHours` (raw) |
| `料金` (admission fee) | 148 | `admissionFee` |
| `泉質` (spring quality) | 148 | `springQuality` |
| `泉人優待` (member benefit) | 148 | — (61 with a value, rest are `&nbsp;`) |
| `アクセス` (access) | 148 | — (useful) |
| `施設サイト` (official site) | 137 | `websiteUrl` (the `<a href>`, not the link text) |

Two fields are **not** in the visible table:

- **`効能` (efficacy)** — present on 148/148 pages but **inside an HTML comment**
  (`<!--<dt>効能</dt><dd>…</dd>-->`); only ~59% have non-empty content. Hence the
  `_extract_commented_efficacy` regex in the prototype parser.
- **`定休日` (regular closed days)** — **does NOT exist as a separate field on any page.**
  Closed days are embedded in the `営業時間` string (see §4).

---

## 3. Source → target classification

Classification key:
**(a)** already captured & published · **(b)** available on source, never scraped ·
**(c)** present in `_archive` raw artifacts but dropped before publish · **(d)** not on the source.

| `OnsenDocument` field | Class | Source location / evidence | Example |
|---|---|---|---|
| `name` | **(a)** | `onsens.json.shisetsu` (map seed) | "博多湯" |
| `areaName` | **(a)** | `onsens.json.onsenchi` | "二日市温泉" |
| `address` | **(a)** | `onsens.json.address` (= source `住所`) | "筑紫野市湯町1-14-5" |
| `lat` | **(a)** | `onsens.json.lat` (map data, not the detail page) | 33.4914372 |
| `lng` | **(a)** | `onsens.json.lng` | 130.5149407 |
| `prefecture` | **(c)** + derived | Source breadcrumb `#contents_title` (100% captured). Seed currently **re-derives** it from the address instead of using the captured authoritative value. | "福岡県" |
| `phone` | **(c)** | Captured 100% (`電話番号`). Seed sets `null`. | "092-922-2119" |
| `businessHours.raw` | **(c)** | Captured 100% (`営業時間`). Seed sets `null`. | see §4 |
| `businessHours.schedule` | **(d)*** | Not directly on source — must be parsed from the `営業時間` string; no per-weekday data exists. | see §4 |
| `admissionFee` | **(c)** | Captured 100% (`料金`). Seed sets `null`. | "大人 350円（土日祝450円）…" |
| `springQuality` | **(c)** | Captured 100% (`泉質`). Seed sets `null`. | "単純温泉" |
| `websiteUrl` | **(c)** | Captured 93% (137/148; `施設サイト` href). Seed sets `null`. | "http://hakatayu.jp/about/" |
| `imageUrl` | **(c)** | Captured 100% (`p.figure img[src]`; `og:image` is an alternate). Seed sets `null`. | "https://www.88onsen.com/upload/72161-01.e.jpg" |
| `isActive` | n/a | App/publish-managed flag, not source data. | — |
| `catalogVersion` | n/a | Publish-managed. | — |
| `createdAt` / `updatedAt` | n/a | Publish-managed timestamps. | — |

\* `businessHours.schedule` is the only genuine gap, and it is a *parsing* gap, not a *capture*
gap — the underlying `営業時間` text is fully captured.

### Fields available on the source but not in the schema (future consideration)

`access_info` (アクセス, 100%), `recommendation` (おすすめ one-liner, 100%),
`efficacy` (効能, 59%, in HTML comments), `senjin_benefits` (泉人優待, 41%).
`covid_measures` (99%) is captured but almost certainly stale and not worth surfacing.

---

## 4. `businessHours` shape note (app expectation vs. source reality)

The app consumes:

```ts
ParsedHours   = { raw: string; schedule: WeeklySchedule | null }
WeeklySchedule = { monday..sunday: { opens: "HH:MM"; closes: "HH:MM" } | null }
```

The source `営業時間` is a **single multi-line string** that mixes open hours + closed days +
parking + lockers + an "as-of" date. There is **no separate 定休日 field** and **no per-weekday
breakdown** (verified: 0/148 pages have a `定休日` `<dt>`; 148/148 `営業時間` strings contain
closed-day keywords). Real examples:

```
id=1:  "10：00～21：30（最終受付21：00）\n無休\n・駐車場：なし…\n・鍵付きロッカーあり（100円…）"
id=5:  "10：00～22：00\n・水曜休（祝日の場合は営業）\n・駐車場：普通車80台…"
id=9:  "13：00～18：00\n木・日曜休\n・受付で貴重品預かり可\n・駐車場：普通車6台"
id=10: "11:00～15:00（最終受付14:00）\n※温泉利用時間1時間\n不定休\n・駐車場：普通車15台…"
id=29: "普通浴 6：30～22：30\n砂湯 8：00～22:30（最終受付 21:30）\n第3水曜休（祝日の場合は翌日）"
```

**Recommendation that lines up with what the app consumes:**

- **`raw`:** store the `営業時間` string verbatim (optionally trimmed to the hours/closed-day lines,
  dropping the parking/locker tail). 100% available, zero parsing risk — and the app already
  displays `raw` as the fallback.
- **`schedule`:** derive only where it's safe. The common pattern is **one daily window applied to
  all open days** (e.g. `10:00–22:00`) plus a closed-day clause. A converter would: parse the first
  `HH:MM～HH:MM` window → fill `opens`/`closes` for all seven days → null out weekdays named in the
  closed-day clause (`水曜休` → wednesday: null; `無休`/`年中無休` → keep all seven). Leave
  `schedule: null` (relying on the `raw` fallback) for cases that don't fit a flat weekly grid:
  irregular closures (`不定休`), ordinal/monthly closures (`第3水曜休`), date ranges, and
  multi-window/seasonal hours (e.g. id=29's split 普通浴/砂湯 windows).
- **Reuse note:** the prototype already ships Japanese parsers for exactly this text —
  `_archive/src/trail/parsers/usage_time.py` (`parse_usage_time` → `TimeWindow`s, last-admission,
  next-day, holidays) and `closed_days.py` (`parse_closed_days` → weekly/monthly/ordinal/absolute
  closed rules). They produce a **richer rule model than `WeeklySchedule`**, so the data repo would
  add a thin adapter from those rules down to the flat `monday..sunday` grid — it does not need to
  write a Japanese-hours parser from scratch.

---

## 5. Selector hints (for the data repo to extend the scraper)

All implemented in `_archive/src/scraper/parser.py`; reproduced here so the data repo doesn't have
to reverse-engineer them. Example page: <https://www.88onsen.com/spot/detail/hid/1>.

| Target field | Selector / location | Extraction note |
|---|---|---|
| `prefecture` | `div#contents_title li` | last `<li>` with no `<a>` child and no `class` → e.g. "福岡県" |
| `imageUrl` | `div#spot_detail p.figure img[src]` | representative photo; `meta[property="og:image"]` is an alternate (also 100%) |
| `phone` | `dd` after `<dt>電話番号</dt>` in `div#spot_detail dl.tableview` | text |
| `businessHours.raw` | `dd` after `<dt>営業時間</dt>` | convert `<br>` → `\n`; keep raw |
| `admissionFee` | `dd` after `<dt>料金</dt>` | text (multi-line) |
| `springQuality` | `dd` after `<dt>泉質</dt>` | text |
| `websiteUrl` | `dd` after `<dt>施設サイト</dt>` → `a[href]` | take the **href**, not the link text; absent on 11/148 |
| `address` | `dd` after `<dt>住所</dt>` | already published via map seed |
| `recommendation` | `div#spot_recommend p` | optional one-liner |
| `efficacy` | HTML comment `<!--<dt>効能</dt><dd>…</dd>-->` | regex, not DOM; ~59% non-empty |
| `access_info` | `dd` after `<dt>アクセス</dt>` | optional |

The `<dt>`→field map is in `parser.py::_FIELD_MAP`.

---

## Coverage & rate-limit caveats

- **No fresh live fetch was possible from this environment.** Requests to `www.88onsen.com` return
  HTTP 403 from the environment's network egress allowlist (`Host not in allowlist:
  www.88onsen.com`), not from the site. This audit therefore verifies the source structure against
  the **captured raw HTML of all 148 pages** in `_archive/data/db/kyushu.dev.db`
  (`scraped_at` = 2026-02-10). That snapshot is a *stronger* basis than the requested ~12-page live
  sample (it's the full population, every field, in the actual source markup) but it is **~4 months
  old** — selectors or values may have drifted. Before a production re-scrape the data repo should
  spot-check a handful of live pages (allowlist `www.88onsen.com` first) to confirm the DOM is
  unchanged.
- **`businessHours.schedule` coverage will be partial** by design (single-window onsens parse
  cleanly; irregular/seasonal ones fall back to `raw`). That is acceptable — the app already renders
  `raw` when `schedule` is `null`.
- **`websiteUrl` is genuinely absent on 11 onsens** (the source has no `施設サイト` link), so 93%
  is the ceiling, not a scrape miss. `efficacy` (59%) and `senjin_benefits` (41%) are likewise
  source-limited, not capture misses.
- The prototype fetcher was already polite (1 s delay, exponential backoff, browser UA;
  `_archive/src/scraper/fetcher.py`). A re-scrape should keep those manners and sample, not hammer.

---

## What the data repo should capture next

In priority order, to fill the six `null` Firestore fields and the blank `prefecture`:

1. **Carry the already-captured fields through to publish** — `phone`, `businessHours.raw`,
   `admissionFee`, `springQuality`, `websiteUrl`, `imageUrl`. They are sitting in
   `_archive/data/db/kyushu.dev.db` / `scraped_data.json` today; no re-fetch is required to backfill
   v1 if those artifacts are trusted. (A fresh scrape is still the right call for a clean v2, but the
   point stands: the source exposes all of them and the selectors exist.)
2. **Use the authoritative `prefecture`** from the breadcrumb (100% reliable) instead of the seed's
   address heuristic.
3. **Add a `営業時間` → `WeeklySchedule` adapter** on top of the existing
   `usage_time.py`/`closed_days.py` parsers; emit `schedule: null` whenever the text doesn't reduce
   to a flat weekly grid, always keeping `raw`.
4. **Decide on the extra source fields** not in the current schema — `access_info`, `recommendation`
   (both 100%), and optionally `efficacy`. If wanted, add them to `OnsenDocument` in
   `shared/src/types/onsen.ts` first (per project rule: types before data).
5. **Before re-scraping live:** allowlist `www.88onsen.com` in the environment's egress settings and
   spot-check ~10 pages against the selectors above to confirm the 2026-02 snapshot still holds.
