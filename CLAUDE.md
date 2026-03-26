# Kyuhachi — Claude Context

## What this project is

An iOS-first mobile app for the 九州八十八湯 (Kyushu 88 hot springs) challenge. Small audience, low maintenance budget, production-quality.

**Current repo state:** Phase 0 complete. Foundation is in place. Starting Phase 1.

Full implementation plan: [docs/implementation-plan.md](docs/implementation-plan.md)

---

## Current phase: Phase 1 — Catalog, Map, Auth

Phase 0 is complete. Phase 1 scope:

- [ ] Sign in with Apple + email/password auth screens
- [ ] `onUserCreated` Function: create `/users/{uid}` document on first sign-in
- [ ] Onsen catalog published to Firestore dev (data repo task: one-time Python publish)
- [ ] Onsen list screen (searchable by name)
- [ ] Onsen detail screen (all metadata fields)
- [ ] Interactive map with onsen markers + tap → detail
- [ ] Offline catalog caching (Firestore persistence, already enabled)
- [ ] Catalog version check on launch

**Phase 1 acceptance criteria:**

- User can sign in on a real device
- Map loads all active onsen markers
- Tap marker → callout → detail screen
- Offline: cached catalog visible with no network

**Blocking before Phase 1 can start (data repo tasks):**

- Assign stable `kyuhachiId` to all 144 onsens → `onsen_id_map.json`
- Run initial Firestore publish (SQLite → Firestore)

See full checklist in the implementation plan.

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
- **Challenge model:** The challenge is "visit any 88 onsens from the official eligible pool (~155)." It is NOT a fixed list of specific onsens. `eligibleOnsenIds` in `challenge_types` defines the pool; `snapshotEligibleOnsenIds` on the user's challenge is frozen at creation. Completion = unique eligible visits ≥ 88.
- **Challenge snapshots:** `snapshotEligibleOnsenIds` is frozen at challenge creation. Catalog changes never mutate existing challenges.
- **Onsen documents are never deleted.** Deprecated onsens get `isActive: false`.
- **No direct write path through Functions for standard user operations** in Phase 1. Firestore rules enforce ownership. Functions are for triggers and admin operations only.
- **Offline-first:** Firestore offline persistence enabled from day one. This is not optional.
- **Route plans:** Independent from challenges. A challenge has an optional `activePlanId` (freely switchable); completion logic ignores it.
- **Tiers:** Bronze/silver/gold. Conditions involve transport restrictions, time frame, and visit count. Exact thresholds TBD — do not hardcode them. Load from `challenge_types` in Firestore. Transport is user-reported per visit (`structuredData.transportUsed: boolean`).

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

## Styling

### Rules (enforceable)

1. **No color literals outside `src/theme/colors.ts`.** Every color in a component file must come from `colors.*`. No hex codes, no `'white'`, no `'black'`.
2. **No raw spacing numbers.** Every `padding`, `margin`, and `gap` must use `spacing[N]` from `src/theme/spacing.ts`.
3. **No raw `fontSize` or `fontWeight` literals.** Use `typography.sizes.*` and `typography.weights.*`.
4. **No raw `borderRadius` literals.** Use `radii.*` from `src/theme/radii.ts`.
5. **Always use `StyleSheet.create()`.** Never pass inline style objects `style={{ ... }}` with literal values. The only exception is values that are genuinely computed at runtime (e.g. dynamic widths from layout events).
6. **`StyleSheet.create()` goes at the bottom of the file**, after the component. Never declare it inside the component function body.
7. **No component library.** Vanilla RN `StyleSheet` + theme tokens only. Do not add `@rneui`, `tamagui`, `gluestack`, `nativewind`, or any other UI or CSS-in-JS library.
8. **Dark mode is deferred.** Do not add `useColorScheme()` or any light/dark branching in Phase 1–2.

### Token location

All tokens live in `app/src/theme/`:

| File | Contents |
|---|---|
| `colors.ts` | Raw palette + semantic color aliases |
| `spacing.ts` | Spacing scale (4pt base grid, keys 1–12) |
| `typography.ts` | Font sizes (`sizes.*`) and weights (`weights.*`) |
| `radii.ts` | Border radii (`sm` / `md` / `lg` / `xl` / `full`) |
| `shadows.ts` | iOS shadow presets (`sm` / `md` / `lg`) |
| `index.ts` | Barrel re-export |

Import from screens and components:

```typescript
import { colors, spacing, typography, radii, shadows } from '../src/theme';
```

(Adjust the relative path depth as needed.)

### Style organization

- Each file owns its own `StyleSheet.create()`. Never share a stylesheet across files.
- Style key names use camelCase, named by role: `container`, `title`, `primaryButton`, `inputField`.
- Shadows are applied via spread: `style={[styles.card, shadows.md]}`.

---

## Key files to read before implementing anything

- `docs/skills.md` — available slash commands for common tasks
- `docs/implementation-plan.md` — full architecture plan
- `docs/specs/firestore-data-model.md` — Firestore schema (write this in Phase 0)
- `shared/src/types/` — all TypeScript types (write these in Phase 0)
- `firebase/firestore.rules` — security rules (write these in Phase 0)
