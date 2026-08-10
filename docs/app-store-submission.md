# App Store submission checklist

Kyuhachi ships to TestFlight on every push to `master`
(see [ios-deploy.md](ios-deploy.md)). Releasing to the **App Store** adds a
review step on top of that. This file records what review needs, where each
piece lives in the repo, and how to re-verify it for the next release.

v1.0 is free, with no in-app purchases and no third-party ad or analytics SDKs.

## Before every submission

| Item | Where it lives | How to verify |
|---|---|---|
| Privacy manifest | `ios.privacyManifests` in [app/app.config.js](../app/app.config.js) | see [Privacy manifest](#privacy-manifest) |
| App icon without alpha | [app/assets/icon.png](../app/assets/icon.png) | see [App icon](#app-icon) |
| Demo account for App Review | [scripts/seed-demo-account.ts](../scripts/seed-demo-account.ts) | see [Demo account](#demo-account-for-app-review) |
| Marketing version | `version` in [app/package.json](../app/package.json) | `npm run version:bump -- minor` |
| Encryption declaration | `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` | already set in app.config.js |
| Permission prompt strings | `expo-image-picker` / `expo-location` plugin options + `app/locales/{en,ja}.json` | shown in the iOS system prompts |

Tracked separately, not covered here: the accessibility pass, the Firestore
production rules audit, and App Check enforcement.

## Privacy manifest

Expo generates `ios/Kyuhachi/PrivacyInfo.xcprivacy` from
`ios.privacyManifests` and adds it to the app target's Copy Bundle Resources
phase, so it ships inside `Kyuhachi.app`. Each CocoaPod ships its own manifest
in a resource bundle and Apple aggregates all of them, so the app-level file
only needs to cover what the pods leave out.

### Verifying it lands in the build

`app/ios` is gitignored and regenerated, so check the generated project, not the
config:

```bash
cd app && npx expo prebuild --platform ios --no-install && plutil -p ios/Kyuhachi/PrivacyInfo.xcprivacy
```

Then confirm it is a bundled resource rather than a loose file:

```bash
grep -c "PrivacyInfo.xcprivacy in Resources" app/ios/Kyuhachi.xcodeproj/project.pbxproj
```

### Required-reason APIs: the audit behind the declarations

Only APIs reached by code whose own manifest is **not** shipped need to be
declared here. Three gaps exist as of this release:

- **`NSPrivacyAccessedAPICategoryFileTimestamp` / `C617.1`**: `react-native-maps`
  reads the modification date of its tile cache inside the app container
  (`ios/AirMaps/AIRMapUrlTileCachedOverlay.m`). Its `ios/PrivacyInfo.xcprivacy`
  is only registered as a `resource_bundles` entry on the **Google Maps**
  subspec, and we use the Apple Maps provider, so the manifest never reaches the
  app bundle.
- **`NSPrivacyAccessedAPICategoryFileTimestamp` / `3B52.1`**: `expo-document-picker`
  reads `contentModificationDateKey` on the `.gpx`/`.kml`/`.tcx` file the user
  picks for a route import. It ships no manifest at all. `3B52.1` (rather than
  `C617.1`) is the reason for a file the user explicitly granted access to.
- **`NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`**: `@react-native-firebase/app`
  (`RNFBPreferences.m`) and `@react-native-firebase/auth` (`RNFBAuthModule.m`)
  both use `NSUserDefaults`; neither package ships a manifest.

The custom `MKLocalSearch` wrapper in
[app/modules/local-search/ios/LocalSearchModule.swift](../app/modules/local-search/ios/LocalSearchModule.swift)
uses **no** required-reason API (`MKLocalSearch`, `MKCoordinateRegion` and
`CLLocationCoordinate2D` are not on Apple's list), so it needs no declaration.
`AppDelegate.swift` likewise touches none.

Everything else is already covered by a shipped pod manifest: React Native core,
AsyncStorage, SDWebImage (via expo-image), leveldb, all Firebase pods, and the
`expo-application` / `expo-constants` / `expo-file-system` / `expo-localization` /
`expo-system-ui` modules.

Re-run the audit when dependencies change:

```bash
grep -oE "[A-Za-z0-9_.-]+\.bundle" "app/ios/Pods/Target Support Files/Pods-Kyuhachi/Pods-Kyuhachi-resources.sh" | sort -u
```

Anything whose native source touches `NSUserDefaults`, file timestamps, disk
space, system boot time, or active keyboards **and** has no privacy bundle in
that list has to be declared in `app.config.js`.

### Collected data

The `NSPrivacyCollectedDataTypes` entries must match the App Privacy answers in
App Store Connect. Currently declared, all with purpose "App Functionality",
none used for tracking:

| Type | Linked to identity | Source |
|---|---|---|
| Email address | yes | Firebase Auth account |
| Name | yes | `displayName` on `/users/{uid}`, from Sign in with Apple's `FULL_NAME` scope or the local part of the email |
| Photos or videos | yes | visit photos uploaded to Firebase Storage |
| Precise location | no | sent to Apple for the Finder's `MKLocalSearch` lookups; not stored on our backend |
| Coarse location | no | same |
| User ID | yes | Firebase Auth uid, the key every challenge, visit and route hangs off |
| Device ID | no | App Check device attestation token |

`NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains` is empty: the app
has no ad or cross-app analytics SDK.

## App icon

The 1024x1024 App Store icon must have **no alpha channel**. The source asset
`app/assets/icon.png` does have one, but `expo prebuild` flattens it when
generating the asset catalog, so no fix is needed. Verify against the generated
icon, not the source:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha app/ios/Kyuhachi/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png
```

Expected: `1024`, `1024`, `hasAlpha: no`. If a future Expo version stops
flattening, strip the alpha from the source asset instead of patching `ios/`
(which is regenerated on every build).

## Demo account for App Review

The app has no anonymous mode (Sign in with Apple + email/password only), so a
reviewer hits the sign-in screen on first launch. Without working credentials
the submission is rejected. Sign in with Apple alone is not enough: reviewers
use a shared Apple ID and generally need the email/password path.

[scripts/seed-demo-account.ts](../scripts/seed-demo-account.ts) creates the
account and seeds it so the app is not empty: one active challenge with a dozen
visits spread across prefectures (so the map, progress ring and rank all show
something) plus a few favorites. It is idempotent, so re-running it before the
next submission resets the account to the same state.

```bash
DEMO_EMAIL='review@kyuhachi.app' DEMO_PASSWORD='<generated>' GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json npm run seed:demo
```

Optional env: `DEMO_DISPLAY_NAME` (default "App Review"), `DEMO_VISITS`
(default 12), `DEMO_CHALLENGE_TYPE` (default `kyushu-88`).

The service account key is the same one the other seed scripts use
([Firebase console](https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk));
keep it outside the repository.

### Where the credentials live

**Never in the repo.** Generate a password with a password manager, then:

1. Store it in the maintainer's password manager.
2. Enter it in App Store Connect under **App Review Information** ->
   **Sign-In Required** -> user name / password.
3. Add a note in the same section explaining that the account is pre-seeded, and
   that the Finder feature needs a network connection because it queries Apple
   Maps.

Rotate the password whenever the account is re-seeded, and update App Store
Connect in the same pass.

## Release steps

1. `npm run version:bump -- minor` (or `patch`/`major`), commit, push to `master`.
2. Wait for the TestFlight build from [deploy.yml](../.github/workflows/deploy.yml).
3. Re-run `npm run seed:demo` so the demo account matches the build.
4. In App Store Connect: attach the build, fill in App Privacy to match
   [Collected data](#collected-data), fill in App Review Information with the
   demo credentials, then submit.
