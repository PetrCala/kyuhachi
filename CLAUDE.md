# Kyuhachi — Claude Context

## What this project is

An iOS-first mobile app for the 九州八十八湯 (Kyushu 88 hot springs) challenge. Small audience, low maintenance budget, production-quality.

**Current repo state:** Python prototype being repurposed into the main app/backend repo. Python code is being archived; new structure is being established.

Full implementation plan: [docs/implementation-plan.md](docs/implementation-plan.md)

---

## Current phase: Phase 0 — Foundation

Nothing has been implemented yet. Phase 0 tasks:

- [ ] Archive Python code to `_archive/`
- [ ] Create Firebase project (dev + prod), enable Firestore/Auth/Storage/Functions/App Check
- [ ] Initialize Expo app in `app/` with Expo Router + `@react-native-firebase`
- [ ] Write shared TypeScript types in `shared/src/types/`
- [ ] Write Firestore security rules + emulator tests in `firebase/`
- [ ] Configure EAS Build (dev profile, real iOS device)
- [ ] Configure GitHub Actions (PR checks + TestFlight deploy on merge to main)
- [ ] Write ADRs 001–006 in `docs/adr/`
- [ ] Write `docs/specs/firestore-data-model.md`

See Phase 0 full checklist and first 10 tasks in the implementation plan.

---

## Locked stack decisions

Do not challenge these without explicit instruction.

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
| Platform | iOS only for now. Do not optimize for Android. |

---

## Locked architectural decisions

- **Stable IDs:** Every onsen has a `kyuhachiId` (UUID) that never changes. Upstream IDs from 88onsen.com are unstable and live only in the separate data repo. The app never sees upstream IDs.
- **Challenge snapshots:** When a user creates a challenge, `snapshotOnsenIds` is frozen at creation. Catalog changes never mutate existing challenges.
- **Onsen documents are never deleted.** Deprecated onsens get `isActive: false`.
- **No direct write path through Functions for standard user operations** in Phase 1. Firestore rules enforce ownership. Functions are for triggers and admin operations only.
- **Offline-first:** Firestore offline persistence enabled from day one. This is not optional.

---

## Repo structure (target)

```
/
├── app/          # Expo React Native app
├── functions/    # Firebase Functions (Node 20, TypeScript)
├── shared/       # Shared TypeScript types (app + functions)
├── firebase/     # Firestore rules, indexes, storage rules, emulator config
├── docs/         # ADRs, specs, implementation plan
├── .github/      # CI/CD workflows
├── _archive/     # Old Python prototype (do not touch, do not delete)
└── CLAUDE.md     # This file
```

---

## What NOT to do

- Do not write any code before the relevant types in `shared/src/types/` exist.
- Do not write Firestore rules without running them against the emulator test suite.
- Do not import from `_archive/`. It is reference material only.
- Do not suggest Android-specific workarounds or enterprise-scale infrastructure.
- Do not add error handling for scenarios that cannot happen.
- Do not scaffold broad parallel systems — implement complete vertical slices.
- Do not move trail optimization/scheduling logic into the app. It belongs in the separate data repo.

---

## Two-repo split

**This repo:** app + functions + shared types + firebase config + CI/CD.

**Separate private data repo (not this repo):** Python scraper, onsen ID mapping, catalog publisher to Firestore. The data repo is responsible for assigning and maintaining `kyuhachiId` values and publishing the onsen catalog to Firebase.

---

## Key files to read before implementing anything

- `docs/implementation-plan.md` — full architecture plan
- `docs/specs/firestore-data-model.md` — Firestore schema (write this in Phase 0)
- `shared/src/types/` — all TypeScript types (write these in Phase 0)
- `firebase/firestore.rules` — security rules (write these in Phase 0)
