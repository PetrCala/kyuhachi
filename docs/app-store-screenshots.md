# App Store screenshots: plan and captions

The plan for the v1.0 screenshot set: which screens, in what order, and the
caption text for each in English and Japanese. Capturing the images is a
separate job; this file is the brief for it.

## Sizes

`supportsTablet` is `false` in [app.config.js](../app/app.config.js), so no iPad
set is needed. Only one iPhone size is required:

| Size class | Device to capture on | Portrait pixels |
|---|---|---|
| 6.9" iPhone | iPhone 17 Pro Max (or 16 Pro Max) | 1320 x 2868 |

App Store Connect scales the 6.9" set down for every smaller iPhone, so a single
set covers the whole iPhone lineup. Portrait only: the app is
`orientation: "portrait"`.

Ten screenshots are allowed per locale. The plan below uses eight. The first
three are the ones that show in search results, so the distinctive screens go
first.

## Capture setup

- Simulator: iPhone 17 Pro Max, iOS 26, light appearance (dark mode is deferred,
  see [styling-guide.md](styling-guide.md)).
- Sign in as an account with a challenge in progress and enough visits that
  every screen has content. The demo-account seeding used for App Review is the
  same data, so capture from that account and the screenshots stay honest.
- Two passes: device language English for `en-US`, device language Japanese for
  `ja`. The app follows the device language, and Japanese screenshots must show
  Japanese UI. Onsen names are Japanese in both passes: that is correct, the
  catalog is not translated.
- Status bar: full battery, no carrier clutter. `xcrun simctl status_bar`
  overrides it if the simulator default looks messy.

## Files

`deliver` reads screenshots from `app/fastlane/screenshots/<locale>/`, sorted by
filename, so use the numeric prefixes below:

```
app/fastlane/screenshots/
├── en-US/
│   ├── 01_home.png
│   ├── 02_passport.png
│   └── ...
└── ja/
    ├── 01_home.png
    └── ...
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

Screen: `app/(tabs)/map.tsx`, zoomed to a dense area (Beppu or the Kuju range),
visited and unvisited pins both on screen, with an onsen preview sheet open.

- **EN:** Find the onsens around you
- **JA:** 現在地のまわりの温泉を探す

### 4. Onsen detail

Screen: `app/onsens/[id].tsx`, an onsen with a photo, opening hours, admission
fee and spring quality visible, favourited.

- **EN:** Hours, price and spring quality before you go
- **JA:** 営業時間も料金も泉質も、行く前に

### 5. Recording a visit

Screen: `app/onsens/edit-visit.tsx` with the ratings section open, showing
transport, duration, price and a couple of rating sliders.

- **EN:** Log it in seconds, or rate every last detail
- **JA:** 手早く一行でも、とことん細かくでも

### 6. Challenges, tiers and rank

Screen: `app/challenge/rank.tsx` showing the ladder with a few ranks achieved,
or `app/challenge/new.tsx` showing the four challenge types side by side. Prefer
the rank ladder: it is the more distinctive image.

- **EN:** Four ways to take it on, and a ladder to climb
- **JA:** 車・公共交通・自転車・徒歩。見習いから泉人まで

### 7. Stats

Screen: `app/stats/index.tsx` with highlights filled in, or `app/stats/timeline.tsx`
showing the cumulative curve. Prefer the hub: it advertises all six sections at
once.

- **EN:** Pace, prefectures, spending, and what you thought of the water
- **JA:** ペース、制覇した県、使った金額、湯の評価まで

### 8. Offline and routes

Screen: `app/finder/index.tsx` with an active route and places found ahead of
it, or `app/routes/index.tsx` with an imported track. Prefer Finder with the map
expanded.

- **EN:** Your own GPS route, and what is ahead on it
- **JA:** 自分のルートと、その先にあるもの

## Notes on the captions

- No caption claims a feature the app does not have, and none of them imply the
  app is the official 九州八十八湯 app. Do not add "公式" or the organisation's
  name to any caption or frame.
- The Japanese captions are written as Japanese, not translated from the English
  line above them. Keep them that way if they are ever revised.
