# Kyuhachi — Agent Context

## Project purpose

An iOS-first mobile app for the 九州八十八湯 (Kyushu 88 hot springs) challenge. Users visit any 88 onsens from an official eligible pool (~155) and record their progress. Small audience, low maintenance budget, production-quality.

---

## Before implementing anything

Read these files first — every time, for every task:

1. `docs/implementation-plan.md` — authoritative architecture and phased plan
2. `docs/specs/firestore-data-model.md` — Firestore schema
3. `shared/src/types/` — all TypeScript types
4. `firebase/firestore.rules` — security rules

Do not write code for a feature until the relevant types in `shared/src/types/` and spec in `docs/specs/` exist. If they don't exist, write them first.

---

## Current phase: Phase 1 — Catalog, Map, Auth

Phase 0 (foundation) is complete. Phase 1 scope:

- Sign in with Apple + email/password auth screens
- `onUserCreated` Firebase Auth trigger: create `/users/{uid}` document on first sign-in
- Onsen list screen (searchable by name)
- Onsen detail screen (all metadata fields)
- Interactive map with onsen markers — tap marker → detail screen
- Offline catalog caching (Firestore persistence, already enabled)
- Catalog version check on launch

**Phase 1 acceptance criteria:**
- User can sign in on a real device
- Map loads all active onsen markers
- Tap marker → callout → detail screen
- Offline: cached catalog visible with no network

**Out of scope for Phase 1:** challenges, visits, route plans, photos, Android.

---

## Locked stack — do not challenge these

| Concern | Choice |
|---|---|
| Framework | Expo managed workflow (EAS Build, not bare) |
| Navigation | Expo Router v3+ |
| Firebase SDK | `@react-native-firebase` (not the JS SDK) |
| Map | `react-native-maps` with Apple Maps provider |
| Backend | Firebase Functions v2, Node 20, TypeScript |
| Auth | Sign in with Apple + email/password. No anonymous mode. |
| CI/CD | GitHub Actions + EAS Build + EAS Submit → TestFlight |
| Testing | Jest + React Native Testing Library + Firebase Emulator Suite |
| Platform | iOS only. Do not add Android-specific code. |

---

## Locked architectural decisions

**Stable IDs.** Every onsen has a `kyuhachiId` (UUID) assigned by the data repo and never changed. The app only ever sees `kyuhachiId`. Upstream IDs from 88onsen.com (`upstreamHid`) live only in the separate data repo and are never published to Firestore or used in the app.

**Onsen documents are never deleted.** Deprecated onsens get `isActive: false`.

**Challenge model.** The challenge is "visit any 88 onsens from the official eligible pool (~155)." It is not a fixed list of specific onsens. `eligibleOnsenIds` in `challenge_types` defines the current pool. When a user starts a challenge, this list is frozen as `snapshotEligibleOnsenIds` on their challenge document. Completion = unique eligible visits ≥ 88. Do not hardcode the count — read `completionCount` from the `challenge_types` document.

**Challenge snapshots are immutable.** `snapshotEligibleOnsenIds` is written at challenge creation and never mutated afterward. Catalog changes never affect existing challenges.

**No Functions for standard user operations.** In Phase 1, Firestore rules enforce ownership. Functions are for triggers (`onUserCreated`, `onVisitCreated`) and admin operations only. Do not route user reads/writes through Functions.

**Offline-first.** Firestore offline persistence (`persistentLocalCache`) is enabled from day one. Always handle loading state — never assume the catalog is loaded. Never hardcode onsen IDs in app code.

**Route plans are independent from challenges.** A challenge has an optional `activePlanId` (freely switchable); challenge completion logic ignores it entirely.

**Tiers.** Bronze/silver/gold. Conditions involve transport restrictions, time frame, and visit count. Exact thresholds are TBD and stored in Firestore `challenge_types`. Never hardcode tier thresholds. Transport is user-reported per visit (`structuredData.transportUsed: boolean`). Tier eligibility is computed client-side and displayed; users self-report their final tier claim via `claimedTier`.

**visitCount is not stored.** Derive it client-side by counting visits where `onsenId ∈ snapshotEligibleOnsenIds`.

---

## Repo structure

```
/
├── app/          # Expo React Native app (Expo Router)
├── functions/    # Firebase Functions (Node 20, TypeScript)
├── shared/       # Shared TypeScript types (used by app + functions)
│   └── src/types/
├── firebase/     # Firestore rules, indexes, storage rules, emulator config
├── docs/         # ADRs, specs, implementation plan
├── .github/      # CI/CD workflows
├── _archive/     # Old Python prototype — read-only reference, do not touch
└── AGENTS.md     # This file
```

### Two-repo split

**This repo:** app + functions + shared types + Firebase config + CI/CD.

**Separate private data repo (not this repo):** Python scraper, onsen ID mapping (`onsen_id_map.json`), Firestore catalog publisher. The data repo assigns and maintains `kyuhachiId` values. The app never runs or imports from the data repo.

---

## Firestore collections

```
/onsens/{kyuhachiId}                                    # catalog; written by data repo only
/catalog_meta/current                                   # single doc; version + counts
/challenge_types/{typeId}                               # admin-managed; read-only for users
/users/{userId}                                         # created by onUserCreated trigger
/users/{userId}/challenges/{challengeId}
/users/{userId}/challenges/{challengeId}/visits/{onsenId}  # doc ID = kyuhachiId
/users/{userId}/route_plans/{planId}
```

Storage: `/visits/{userId}/{visitId}/photo.jpg` — one photo per visit, ≤1MB.

---

## Security model

1. Authenticated users can read all onsens and `catalog_meta`
2. Users read/write only their own `/users/{userId}/**` subcollections
3. `challenge_types` and `catalog_meta` are read-only for users
4. No user may write to `/onsens` or `/challenge_types`
5. Write Firestore rules before writing client code. Test with the Firebase Emulator.

---

## What NOT to do

- Do not write code for a feature before the relevant types in `shared/src/types/` exist.
- Do not write Firestore rules without running them against the emulator test suite.
- Do not import from `_archive/`. It is reference material only.
- Do not add Android-specific code or workarounds.
- Do not hardcode onsen IDs, tier thresholds, or completion counts in app code — read them from Firestore.
- Do not route standard user reads/writes through Firebase Functions.
- Do not add error handling for scenarios that cannot happen.
- Do not scaffold broad parallel systems — implement complete vertical slices.
- Do not move trail optimization or scheduling logic into the app. It belongs in the separate data repo.
- Do not add features, refactor unrelated code, or make improvements beyond what was requested.
- Do not suggest enterprise-scale infrastructure. Audience: low tens to hundreds of users.
