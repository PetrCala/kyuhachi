# Kyuhachi — Claude Context

## What this project is

An **iOS-first Expo app** for the 九州八十八湯 (Kyushu 88 onsen) challenge. Small
audience, low maintenance budget, production-quality. The architecture plan and
current phase/status live in [docs/implementation-plan.md](docs/implementation-plan.md)
— read it for where things stand, not this file.

## Two-repo split

- **This repo:** the app + Firebase Functions + shared TypeScript types + firebase
  config + CI/CD.
- **Separate private data repo (`kyuhachi-data`):** the scraper, onsen id map, and
  catalog publisher. It owns and assigns every `kyuhachiId` and publishes the onsen
  catalog to Firestore. The app never sees upstream ids — it reads only the published
  catalog. Don't move catalog/id or trail-optimization/scheduling logic into this repo.

## Locked stack decisions (do not challenge without instruction)

| Concern | Choice |
|---|---|
| Framework | Expo managed workflow (EAS Build, not bare) |
| Navigation | Expo Router |
| Firebase SDK | `@react-native-firebase` (not the JS SDK) |
| Map | `react-native-maps`, Apple Maps provider |
| Backend | Firebase Functions v2, Node 20, TypeScript |
| Auth | Sign in with Apple + email/password. No anonymous mode. |
| CI/CD | GitHub Actions → EAS Build + EAS Submit → TestFlight |
| Testing | Jest + React Native Testing Library + Firebase Emulator Suite |
| Platform | iOS only. Don't optimize for Android. |

## Locked architectural decisions (do not challenge without instruction)

Each is backed by an ADR in [docs/adr/](docs/adr/).

- **Stable ids.** Every onsen has a `kyuhachiId` (UUID) that never changes; upstream
  88onsen ids live only in the data repo and the app never sees them.
- **Challenge model.** "Visit any 88 onsens from the official eligible pool" — not a
  fixed list. The pool is defined in `challenge_types`; completion = unique eligible
  visits ≥ 88.
- **Challenge snapshots are frozen at creation.** Catalog changes never mutate
  existing challenges.
- **Onsen documents are never deleted** — deprecated onsens get `isActive: false`.
- **Offline-first.** Firestore offline persistence is on from day one; not optional.
- **Firestore rules enforce ownership.** Standard user operations write Firestore
  directly; Functions are for triggers and admin only, never a write proxy.
- **Routes are imported, not authored.** Users import external GPS tracks
  (`.gpx`/`.kml`/`.tcx`) → a simplified track in Firestore. Independent of challenges;
  a challenge's optional `activeRouteId` never affects completion.
- **Tiers (bronze/silver/gold)** load their thresholds from `challenge_types` — never
  hardcode them. Transport is user-reported per visit.

## Conventions (enforced)

- **Styling.** Vanilla RN `StyleSheet.create()` + design tokens from `app/src/theme/`
  only — no color/spacing/font/radius literals, no inline style objects, no component
  library, no CSS-in-JS. Dark mode is deferred. Full rules + token reference:
  [docs/styling-guide.md](docs/styling-guide.md).
- **i18n.** No hardcoded user-facing strings — use `t()`. Every key exists in both
  `app/src/i18n/en.ts` and `ja.ts` (`ja` is typed against `en`, so drift is a compile
  error). Don't translate Firestore content — Japanese onsen data is shown as-is.
- **Types first.** No feature code before its types exist in `shared/src/types/`;
  Firestore reads/writes are always typed there, never `as any`.

## Structure

```
app/        Expo app (screens, components, theme, i18n)
functions/  Firebase Functions (Node 20, TypeScript)
shared/     Shared TypeScript types (app + functions)
firebase/   Firestore rules, indexes, emulator config
docs/       ADRs, specs, implementation plan, guides
_archive/   Old Python prototype — reference only; never import, never delete
```

## Skills

Common tasks have slash commands (e.g. `/new-screen`, `/check-styles`,
`/check-types`, `/check-offline`, `/pr-checklist`) — the operational entry points,
documented in [docs/skills.md](docs/skills.md). Prefer them over ad-hoc work.

## What NOT to do

- Don't write code before the relevant `shared/src/types/` exist.
- Don't change Firestore rules without running them against the emulator suite.
- Don't import from `_archive/` — it is reference material only.
- Don't add Android workarounds, dark-mode branching, or a UI component library.
- Don't add error handling for impossible states, or scaffold broad parallel systems —
  ship complete vertical slices.

## Delivering changes

Deliver code changes as an open PR against `master` (branch, commit, push,
`gh pr create`), never a direct push to `master`. Skip for read-only sessions.
