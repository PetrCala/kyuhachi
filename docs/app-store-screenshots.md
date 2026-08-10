# App Store screenshots: plan and captions

The v1.0 screenshot set: which screens, in what order, and the caption text for
each in English and Japanese. The set below has been captured; this file doubles
as the brief and as the record of how to reproduce it.

## Sizes

`supportsTablet` is `false` in [app.config.js](../app/app.config.js), so no iPad
set is needed. Only one iPhone size is required:

| Size class | Device to capture on | Portrait pixels |
|---|---|---|
| 6.9" iPhone | iPhone 17 Pro Max (or 16 Pro Max) | 1320 x 2868 |

App Store Connect scales the 6.9" set down for every smaller iPhone, so a single
set covers the whole iPhone lineup. Portrait only: the app is
`orientation: "portrait"`.

Ten screenshots are allowed per locale. The set below uses nine. The first three
are the ones that show in search results, so the distinctive screens go first.

## Capture setup

- Simulator: iPhone 17 Pro Max, iOS 26, light appearance (dark mode is deferred,
  see [styling-guide.md](styling-guide.md)).
- Sign in as an account with a challenge in progress and enough visits that
  every screen has content. The demo-account seeding used for App Review is the
  same data, so capture from that account and the screenshots stay honest.
- Simulated location: Beppu, so "nearest unvisited" and the area guide's "near
  you" row have something to show.

  ```bash
  xcrun simctl location <udid> set 33.2846,131.4914
  ```

- Status bar, so the frames do not carry a real clock and a half-empty battery:

  ```bash
  xcrun simctl status_bar <udid> override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  ```

- Turn **Show name readings** on in Preferences before both passes. It is off by
  default, but it puts romaji under each onsen name in English and kana in
  Japanese, which makes the list and detail screens legible to a reader who
  cannot parse the kanji.
- Capture with `xcrun simctl io <udid> screenshot --type=png <path>`, which
  writes exactly 1320x2868. Do not screenshot the simulator window: that gives
  you the chrome and the wrong dimensions.

### The two passes

The Japanese pass needs a Japanese **device** locale, not just the app's own
language toggle. Apple Maps labels come from the process locale, so with an
English device the JA map renders "Yatsushiro" and "Kumamoto" in romaji and the
attribution reads "Maps". Relaunch the app with the locale forced instead:

```bash
xcrun simctl launch <udid> com.kyuhachi.app -AppleLanguages "(ja)" -AppleLocale ja_JP
```

That gives 八代市 / 熊本県 and a マップ attribution. For `en-US`, launch normally.

Onsen names stay Japanese in both passes: that is correct, the catalog is not
translated.

### Two things that will bite

The seeded challenge's stored name is the challenge type's Japanese name
(`車チャレンジ`), and the Home header renders that stored string verbatim rather
than a translated key, so the English Home shot shows Japanese unless the
challenge is renamed first. Rename it to "Car Challenge" for the `en-US` pass and
back afterwards.

Renaming back is the awkward half: the simulator cannot type non-ASCII, and
`xcrun simctl pbcopy` mangles UTF-8 into mojibake, so neither typing nor pasting
`車チャレンジ` works. Set the field server-side instead, with a few lines of
`firebase-admin` against `users/<uid>/challenges/<id>`.

## Files

`deliver` reads screenshots from `app/fastlane/screenshots/<locale>/`, sorted by
filename, so use the numeric prefixes below:

```
app/fastlane/screenshots/
├── en-US/
│   ├── 01_home.png
│   ├── 02_spaport.png
│   ├── 03_map.png
│   ├── 04_onsen_detail.png
│   ├── 05_record_visit.png
│   ├── 06_tiers_rules.png
│   ├── 07_rank.png
│   ├── 08_stats.png
│   └── 09_area_guide.png
└── ja/
    └── the same nine names
```

That directory is not committed. See
[app-store-listing.md](app-store-listing.md) for how the metadata tree and the
screenshots fit together at upload time.

## The set

Captions are the text to burn into the frame above each screenshot (or to leave
off, if the set ships unframed). Keep them to one line at this width.

### 1. Home

Screen: `app/(tabs)/index.tsx`, an active challenge partway through, with the
progress ring, the rank badge, recent visits and the nearest unvisited onsen.

- **EN:** Every bath you have taken, counted
- **JA:** 入った湯が、そのまま進み具合に

### 2. Spaport

Screen: `app/passport.tsx`, a page with a good mix of pressed and empty stamps.

- **EN:** A stamp for every onsen, in the order you bathe
- **JA:** 入った順に湯印が押される御湯印帳

### 3. Map

Screen: `app/(tabs)/map.tsx`, zoomed so Kyushu fills the frame. Pink visited pins
and blue unvisited ones read as one spread, which sells the scale of the
challenge better than a single dense town does. No preview sheet: the sheet
covers the pins it is meant to advertise.

- **EN:** Every eligible onsen, visited and still to come
- **JA:** 入った湯と、まだの湯が、ひと目で

### 4. Onsen detail

Screen: `app/onsens/[id].tsx`, an onsen with address, phone, admission fee,
spring quality and today's hours visible. The hero is the place-tinted mark from
`OnsenHeroImage`, not a photo: catalog photos are off, see
[storage-image-exposure.md](storage-image-exposure.md).

- **EN:** Hours, price and spring quality before you go
- **JA:** 営業時間も料金も泉質も、行く前に

### 5. Recording a visit

Screen: `app/onsens/edit-visit.tsx` with the ratings section open, showing
transport, duration, price and a couple of rating sliders.

- **EN:** Log it in seconds, or rate every last detail
- **JA:** 手早く一行でも、とことん細かくでも

### 6. Tiers and challenge rules

Screen: the rules sheet reached from "How tiers work" on Home, showing the medal
for the active challenge type and the conditions under it.

- **EN:** Bronze, silver, gold, and the rules for each
- **JA:** 銅・銀・金。条件はチャレンジごとに

### 7. Rank ladder

Screen: `app/challenge/rank.tsx`, the full ladder with the achieved ranks ticked
and the current one marked. Originally folded into the tiers screenshot; split
out because it is the most distinctive image in the set and the two do not fit
in one frame.

- **EN:** From apprentice to master, one bath at a time
- **JA:** 見習いから泉人まで、一湯ずつ

### 8. Stats

Screen: `app/stats/index.tsx`, the hub rather than a single chart: it advertises
all six sections at once and the highlight cards carry real numbers.

- **EN:** Pace, prefectures, spending, and what you thought of the water
- **JA:** ペース、制覇した県、使った金額、湯の評価まで

### 9. Area guide

Screen: an area guide detail (Beppu reads best), showing food, local produce,
sights, history and culture.

This slot was planned as Finder or an imported route. Both need a `.gpx` on the
device, and the demo account has none, so a route screenshot would mean seeding
data no reviewer will see. The area guides are already written, already
translated and already in the description, so they earn the slot honestly. If a
route is ever imported into the demo account, revisit this.

- **EN:** What to eat and see where the water is
- **JA:** 湯のまわりの、食と見どころ

## Notes on the captions

- No caption claims a feature the app does not have, and none of them imply the
  app is the official 九州八十八湯 app. Do not add "公式" or the organisation's
  name to any caption or frame.
- The Japanese captions are written as Japanese, not translated from the English
  line above them. Keep them that way if they are ever revised.
