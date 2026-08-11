# Kyuhachi

An iOS app for keeping the record of your 九州八十八湯 (Kyushu 88 Hot Springs)
challenge: visit 88 of Kyushu's historic hot springs, chosen from an official
pool of around 155 eligible onsens.

Log each bath with the date, how you got there, what you paid and a photo,
collect a stamp for it in your Spaport, and watch the progress, the tiers and
the rank ladder fill in. The onsen catalog is stored on the device, so the list,
the detail pages and the map pins work in a valley with no signal, and visits
recorded offline sync later. English and Japanese, following the device
language.

## Not affiliated with 九州八十八湯

This is an independent, fan-made app. It is **not** affiliated with or endorsed
by the 九州八十八湯 organisation or 88onsen.com. Onsen information shown in the
app is sourced from 88onsen.com and is provided as is: confirm opening hours,
prices and access with the onsen before you travel.

See [docs/legal/terms.md](docs/legal/terms.md) and
[docs/legal/privacy.md](docs/legal/privacy.md), served at
<https://kyuhachi-fddcc.web.app/>.

## Stack

iOS only. Expo managed workflow (SDK 55, New Architecture) with Expo Router,
`@react-native-firebase` against Firestore, Auth and Storage, `react-native-maps`
on the Apple Maps provider, and Firebase Functions v2 on Node 20 for triggers
and admin work. Styling is vanilla `StyleSheet.create()` over design tokens, no
component library. Testing is Jest with React Native Testing Library, plus the
Firebase Emulator Suite for the security rules. CI builds through GitHub Actions
and fastlane to TestFlight.

The decisions behind those choices are recorded as ADRs in
[docs/adr/](docs/adr/).

## Layout

```
app/        the Expo app: routes under app/app/, everything else under app/src/
functions/  Firebase Functions (Node 20, TypeScript)
shared/     TypeScript types shared by the app and the functions
firebase/   Firestore rules, indexes, storage rules, emulator config
docs/       ADRs, specs, the implementation plan, guides
scripts/    repo tooling (version bump, legal page build, metadata checks)
_archive/   the original Python trail planner, kept as reference only
```

The scraper, the onsen id map and the catalog publisher live in a separate
private repo. It owns every `kyuhachiId` and publishes the catalog to Firestore;
this repo only reads what has been published.

## Running it

You need macOS with Xcode and CocoaPods, and a `GoogleService-Info.plist` for
the Firebase project dropped at `app/GoogleService-Info.plist`. The app uses
native modules (Firebase, Maps, a small Swift local-search module), so Expo Go
will not run it: you need a development build.

```bash
npm ci
cd app && npx expo prebuild --platform ios --no-install && (cd ios && pod install)
```

Then run it on a simulator or a connected device:

```bash
cd app && npx expo run:ios
```

Once a development build is installed, `npx expo start` from `app/` is enough
for day-to-day work.

Checks:

```bash
cd app && npm run typecheck && npm test
```

Rules tests run against the Firebase Emulator Suite from `firebase/`.

## Docs

- [docs/implementation-plan.md](docs/implementation-plan.md) is the authoritative
  reference for the architecture and the phased plan. Start there.
- [docs/adr/](docs/adr/) for the locked decisions and why.
- [docs/styling-guide.md](docs/styling-guide.md) for the styling rules and the
  token reference.
- [docs/ios-deploy.md](docs/ios-deploy.md) for the build and TestFlight pipeline,
  [docs/versioning.md](docs/versioning.md) for how the version number is chosen,
  [docs/hosting.md](docs/hosting.md) for the legal pages.
- [docs/app-store-listing.md](docs/app-store-listing.md) and
  [docs/app-store-screenshots.md](docs/app-store-screenshots.md) for the store
  listing copy and the screenshot plan.
- [docs/skills.md](docs/skills.md) for the repo's slash commands.

## Licence

© 2026 Petr Cala. Personal project, no licence granted.
