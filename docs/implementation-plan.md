# Kyuhachi — Implementation Plan

*Written: 2026-03-24. This document is the authoritative reference for architectural decisions and the phased delivery plan. Update it when decisions change; do not let it drift.*

---

## 1. Current Repo Assessment

### What this repo currently is

A personal Python-based expedition planning toolkit for a multi-week walking trail through Kyushu's hot springs. Not a product codebase — a sophisticated private planning tool built for one trip.

The core pipeline: scrape 88onsen.com → store in SQLite → classify onsens (mandatory/excluded/eligible) → OR-Tools TSP optimization → daily scheduling (Sept 30–Dec 3, 2026) → generate interactive maps, markdown itineraries, and CSV exports.

Seed data: 144 onsens in `onsens.json` with name, area, address, lat/lng. Upstream IDs are `hid` values from 88onsen.com — currently used as primary keys, which is fragile.

### What is reusable

| Asset | What it is | Where it goes |
|---|---|---|
| `onsens.json` / `onsens.csv` | 144 onsens with name, area, address, lat/lng | Data repo — initial catalog seed |
| `data/db/kyushu.prod.db` | SQLite with full scraped metadata | Data repo — source for first Firestore publish |
| `src/scraper/` | Web scraping for 88onsen.com | Data repo |
| `src/trail/parsers/usage_time.py` | Japanese business hours parser | Data repo (used during catalog publishing) |
| `src/trail/parsers/closed_days.py` | Japanese closure rules parser | Data repo |
| `src/trail/data_prep.py` | Island/exclusion logic, Beppu classification | Data repo — informs catalog flags |
| `src/db/models.py` | Onsen schema (fields list) | Reference only — informs Firestore model |

### What should be archived

Everything else in `src/` (trail optimizer, scheduler, map generator, output, clock icon) belongs in the data repo under `legacy/trail_planner/`. It is personal expedition planning code, not app logic. Archive it carefully — do not delete it.

---

## 2. Architecture Decision

**Chosen: Option A — Expo Managed + Direct Firebase SDK + Minimal Functions**

The app uses `@react-native-firebase` directly against Firestore, Auth, and Storage. Firebase Functions are minimal: catalog versioning triggers, admin-only endpoints, and App Check enforcement. Security is enforced via Firestore rules, not an API layer.

**Why not Option B (BFF via Functions):** Cold starts on every mutation, more code to maintain, overkill for simple write patterns at small scale.

**Why not Option C (Supabase):** Firestore offline persistence is better proven in React Native. Firebase was already chosen. Unfamiliar stack risk isn't justified.

---

## 3. Repository Strategy

### This repo (main app repo)

```
/
├── app/                    # Expo React Native app (Expo Router)
│   ├── (tabs)/             # Tab screens
│   ├── onsen/[id]/         # Onsen detail
│   ├── challenge/          # Challenge screens
│   └── _layout.tsx
├── functions/              # Firebase Functions (Node 20, TypeScript)
│   ├── src/
│   └── package.json
├── shared/                 # Shared TypeScript types (app + functions)
│   └── src/types/
├── firebase/               # Firestore rules, indexes, storage rules, emulator config
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── firebase.json
├── docs/                   # ADRs, specs, this plan
│   ├── adr/
│   └── specs/
├── .github/                # CI/CD workflows
├── .eas/                   # EAS Build profiles
├── _archive/               # Python prototype (read-only reference)
├── app.json                # Expo config
├── package.json
└── tsconfig.json
```

### Separate private data repo

```
/
├── scraper/                # Python: fetch + parse from 88onsen.com
├── parser/                 # Python: Japanese hours/closure parsers
├── importer/               # Python: match scraped data → stable IDs
├── publisher/              # Python: write catalog to Firestore
├── legacy/
│   └── trail_planner/      # Archived trail optimization code
├── data/
│   ├── db/                 # SQLite databases
│   ├── seed/               # onsens.json, onsens.csv
│   ├── mappings/           # upstream_hid → kyuhachiId (committed to git)
│   └── cache/              # OSRM, holidays cache
├── artifacts/              # Scraping artifacts
├── docs/                   # Catalog versioning protocol
└── pyproject.toml
```

The `data/mappings/onsen_id_map.json` file is the most critical piece of the data repo. It is the source of truth for stable ID assignment and must be committed to version control.

---

## 4. Technology Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Expo managed workflow + EAS Build | No native build management; config plugins handle native setup declaratively |
| Navigation | Expo Router v3+ | File-system routing, typed routes, deep linking, wraps React Navigation |
| Firebase SDK | `@react-native-firebase` | Better native offline persistence than JS SDK; native Auth for Sign in with Apple |
| Map | `react-native-maps` (Apple Maps) | Free, no API key on iOS, supports markers + polylines, Expo config plugin |
| Backend | Firebase Functions v2, Node 20, TypeScript | Minimal Functions, not the primary data path |
| CI/CD | GitHub Actions + EAS Build + EAS Submit | TestFlight without macOS runner maintenance |
| Testing | Jest + RNTL + Firebase Emulator Suite | Emulator for rules tests; Detox deferred to Phase 2+ |

---

## 5. Firebase/Backend Design

### Firestore data model

```
/onsens/{kyuhachiId}
  name: string
  areaName: string
  address: string
  prefecture: string
  lat: number
  lng: number
  phone: string | null
  businessHours: ParsedHours | null     # structured, from data repo parser
  admissionFee: string | null
  springQuality: string | null
  websiteUrl: string | null
  imageUrl: string | null
  isActive: boolean                     # false = deprecated, never deleted
  catalogVersion: number
  createdAt: Timestamp
  updatedAt: Timestamp

/catalog_meta/current
  version: number
  publishedAt: Timestamp
  totalCount: number
  activeCount: number

/challenge_types/{typeId}              # admin-managed only
  name: string
  description: string
  eligibleOnsenIds: string[]           # kyuhachiIds — the official pool (~155)
                                       # user visits any `completionCount` from this list
  completionCount: number              # 88
  tiers: [                             # ordered best→worst; conditions are user-reported
    {
      id: string,                      # "gold" | "silver" | "bronze"
      name: string,
      conditionSummary: string,        # human-readable for display
      conditions: [                    # machine-readable for future app verification
        {type: "minVisits", value: number},       # from eligible pool
        {type: "maxTransportUses", value: number},# 0 = no transport
        {type: "maxCalendarDays", value: number}  # from startDate to last visit
        # extend as rules are defined
      ]
    }
  ]
  rules: string[]                      # prose rules for browsable screen
  isActive: boolean

# NOTE: Transport use per visit is user-reported. The app can compute
# total transport uses from visits for tier eligibility display, but
# cannot verify it independently. Tier claims are always self-reported.

/users/{userId}
  displayName: string
  email: string
  defaultChallengeId: string | null
  createdAt: Timestamp

/users/{userId}/challenges/{challengeId}
  typeId: string
  name: string
  startDate: Timestamp
  isDefault: boolean
  snapshotEligibleOnsenIds: string[]   # frozen at creation — the pool the user is working from
  snapshotCatalogVersion: number
  activePlanId: string | null          # optional: which route_plan the user is currently following
                                       # user can change this freely; challenge completion ignores it
  claimedTier: string | null           # set by user at completion (self-reported)
  completedAt: Timestamp | null        # set by Function when visitCount >= completionCount
  createdAt: Timestamp

# visitCount is NOT stored on the challenge document — derive it client-side
# by counting visits with this challengeId that match an onsen in snapshotEligibleOnsenIds.
# Re-evaluate if performance becomes a problem at hundreds of users.

/users/{userId}/challenges/{challengeId}/visits/{onsenId}
  # Document ID IS the kyuhachiId — deduplication is structural, not enforced by rules.
  # Writing a second visit to the same onsen overwrites the first.
  # There is no visitId — onsenId serves as the unique key per challenge.
  visitedAt: Timestamp
  notes: string | null
  photoUrl: string | null              # Firebase Storage URL
  structuredData: {
    rating: number | null              # 1–5
    waterTemp: string | null           # user-entered string e.g. "42°C"
    duration: number | null            # minutes
    transportUsed: boolean | null      # true = used motorized transport to reach this onsen
    # extend at Phase 2 implementation time — do not lock before then
  }
  createdAt: Timestamp
  updatedAt: Timestamp

# To query all visits across challenges for a user: collection group query on "visits"
# filtered by userId (add userId field to the document if needed for group queries).

/users/{userId}/route_plans/{planId}
  name: string
  onsenIds: string[]                   # ordered list of kyuhachiIds
  createdAt: Timestamp
  updatedAt: Timestamp
```

### Authentication model

- Sign in with Apple (primary), email/password (fallback)
- No anonymous mode
- On first sign-in: `onCreate` Auth trigger creates `/users/{userId}` document
- No admin role in the app. Admin operations use a service account in the data repo.

### Storage model

```
/visits/{userId}/{visitId}/photo.jpg
```

One photo per visit. Client-side compression to ≤1MB before upload (`expo-image-manipulator`). No server-side resizing in Phase 1. Access: read/write only if `request.auth.uid == userId`.

### Firebase Functions

| Function | Trigger | Purpose |
|---|---|---|
| `onUserCreated` | Auth `onCreate` | Create `/users/{uid}` document |
| `onVisitCreated` | Firestore `onCreate` on visits | Set `completedAt` on challenge if visit pushes count to ≥ 88 |
| `onCatalogPublished` | Firestore write on `catalog_meta/current` | Future: push notification hook |
| `adminPublishCatalog` | HTTP (admin + App Check) | Entry point for data repo publish script |

Do not route standard user reads/writes through Functions in Phase 1.

`onVisitCreated` does one thing only: check if this visit completes the challenge (unique eligible visits >= completionCount) and if so, set `completedAt`. It does not maintain a running visitCount — that is derived client-side. This keeps the Function simple and idempotent.

### Security model principles

1. Authenticated users can read all onsens (catalog is not sensitive)
2. Users read/write only their own subcollections (`/users/{userId}/**`)
3. `challenge_types` and `catalog_meta` are read-only for users
4. No user can write to `/onsens` or `/challenge_types`
5. Write rules before writing client code. Test with emulator.

### App Check

Enable with DeviceCheck (iOS) from Phase 1. Enforce on Firestore, Storage, and Functions. App Check is defense-in-depth; it does not replace security rules.

### Catalog versioning

1. Data repo publishes onsen documents + atomically updates `catalog_meta/current`
2. App reads `catalog_meta/current` on startup
3. Compares to locally cached version (AsyncStorage/MMKV)
4. If version differs, fetches documents where `updatedAt > lastSyncedAt`
5. Full refresh is not required on every bump — incremental sync only

### Stable ID strategy

The data repo maintains `data/mappings/onsen_id_map.json`:

```json
{
  "abc123uuid": {
    "kyuhachiId": "abc123uuid",
    "upstreamHid": "42",
    "matchedBy": "name+coords",
    "confirmedAt": "2025-11-01"
  }
}
```

Matching logic: exact name → name + coord proximity (≤200m) → manual override. The `kyuhachiId` never changes once assigned. The app never sees `upstreamHid`.

### Challenge snapshot behavior

The challenge is: visit any 88 onsens from the official eligible pool. The pool at the time of challenge creation is frozen as `snapshotEligibleOnsenIds`. This matters because the official list changes over time.

- `snapshotEligibleOnsenIds` written at challenge creation and never mutated
- Completion check: count unique visits where `onsenId` ∈ `snapshotEligibleOnsenIds` and `challengeId` matches; complete when ≥ 88
- If an onsen is later deprecated (`isActive: false`): visits to it still count (already in snapshot), but it displays as "archived"
- If new onsens are added to the official list: existing challenges are unaffected (snapshot is frozen); new challenges will include them
- If onsens are removed from the official list: existing challenges still count visits to them (snapshot is frozen)
- Route plans (`activePlanId`) are a convenience — they do not affect completion logic at all. User can switch plans freely.

---

## 6. Offline/Data Sync Strategy

### Works offline

- Browse full onsen catalog (list + detail)
- View challenges and visits
- View saved route plans
- Create a visit (queued, synced when online)
- Map with cached markers

### Cached locally (automatic via Firestore persistence)

- All onsen documents
- User's challenges and visits
- Route plans
- `catalog_meta/current`
- Onsen images (via `expo-image` disk cache)

### Online-only

- Photo uploads
- Sign in / authentication
- Map tile rendering (Apple Maps tiles)

### Rules

- Enable Firestore offline persistence (`persistentLocalCache`) from day one — not optional
- Never assume the catalog is loaded; always handle loading state
- Never hardcode onsen IDs in app code
- Use `waitForPendingWrites()` before critical navigation dependent on a write

---

## 7. Phased Implementation Plan

### Phase 0: Foundation ✅ Complete

**Scope:** Repo cleanup, Expo init, Firebase setup, EAS, CI/CD, ADRs, types, rules.

**Non-goals:** No screens. No user flows. No real data in Firebase.

**Acceptance criteria:**

- `expo start` runs dev client on iOS simulator without errors
- Firebase Emulator Suite starts; Firestore rules tests pass
- EAS Build produces valid `.ipa` for preview profile
- GitHub Actions CI passes on a trivial PR

---

### Phase 1: Catalog, Map, Auth ✅ Complete

**Scope:**

- Sign in with Apple + email/password auth screens
- `onUserCreated` Function: create `/users/{uid}` document on first sign-in
- Onsen catalog published to Firestore (data repo: one-time Python publish from SQLite)
- Onsen list screen (searchable by name)
- Onsen detail screen (all metadata)
- Interactive map with onsen markers + tap → detail
- Offline catalog caching (Firestore persistence)
- Catalog version check on launch

**Non-goals:** Challenges, visits, route plans, photos, Android.

**Acceptance criteria:**

- User can sign in on a real device
- Map loads all active onsen markers
- Tap marker → callout → detail screen
- Offline: cached catalog visible with no network

---

### Phase 1.5: Localization ✅ Complete

**Scope:**

- `i18next` + `react-i18next` + `expo-localization` setup
- English and Japanese translation files for all existing UI strings
- Retrofit all existing screens to use `t()` from `useTranslation()`
- Device locale detection with English fallback

**Non-goals:** Runtime language picker, per-screen lazy loading, Firestore content translation.

**Acceptance criteria:**

- Simulator set to Japanese: all UI chrome in Japanese
- Simulator set to English: all UI chrome in English
- Simulator set to any unsupported locale: falls back to English
- TypeScript compile error if a key exists in `en.ts` but not `ja.ts` (or vice versa)

---

### Phase 2: Challenges and Visits ✅ Complete

**Scope:**

- Challenge type in Firestore (admin-published: 九州八十八湯, ~155 eligible onsens)
- Challenge creation screen (snapshot of eligible pool frozen at creation)
- Default challenge auto-selected on launch
- Challenge progress screen: show visit count vs 88, list eligible onsens with visited/unvisited state
- Mark an onsen as visited (creates visit document, deduplication enforced: one visit per onsen per challenge)
- Visit detail: notes, rating, water temp, duration, transport used (boolean)
- Visit photo (camera + library, compressed before upload)
- `onVisitCreated` Function: set `completedAt` when visit count reaches 88
- Tier eligibility display: show which tiers the user currently qualifies for based on visit count + reported transport uses
- Tier claim: user can claim a tier at any time (stored as `claimedTier`)

**Non-goals:** Multiple challenges in UI (data model supports it; UI deferred to Phase 3), route plans, stats/graphs, visit editing.

**Acceptance criteria:**

- Visiting creates correct visit document
- Photo stores at correct Storage path; URL saved to visit
- Completion tier updates after each visit
- Offline visit creation queues and syncs correctly

---

### Phase 3: Route Plans and Challenge Rules

**Scope:**

- Challenge rules/tiers screen (driven by Firestore data, not hardcoded)
- Create a named route plan (ordered onsen list)
- Display route plan on map as polyline (straight-line connections)
- Associate a route plan with the active challenge (`activePlanId`): "I am following this route for my challenge"
- Switch which plan is the active plan for a challenge (freely changeable, no effect on completion)
- Route plan list (view/delete)
- Multiple challenges per user (UI for creating a second challenge)

**Non-goals:** Shared route plans, turn-by-turn navigation, stats.

**Key constraint:** Route plan association is cosmetic. A challenge is completed by visiting 88 eligible onsens regardless of whether a plan exists or which one is active.

---

### Phase 4: Stats, Polish, App Store

**Scope:**

- Visit statistics screen (per month, per prefecture, completion %)
- Visit timeline
- Edit/delete a visit
- App icon, splash screen, onboarding
- App Store submission (privacy policy, terms, privacy manifest)
- Accessibility pass (Dynamic Type, VoiceOver)
- Production rules audit + App Check enforced

---

## 8. AI Execution Strategy

### Before implementing any feature

1. Confirm the relevant types exist in `shared/src/types/`
2. Confirm the relevant spec exists in `docs/specs/`
3. Read both before writing a single line

### Prompt template for implementation tasks

```
We are working on Kyuhachi. Read CLAUDE.md first.

Task: [specific feature]
Spec: docs/specs/[relevant-spec].md
Types: shared/src/types/[relevant-type].ts
Pattern to follow: [existing file path]

Implement [thing]. Write tests covering [acceptance criteria].
Do not change unrelated files.
```

### What docs must exist before Phase 1 starts

```
docs/adr/001-expo-managed-workflow.md
docs/adr/002-react-native-firebase-vs-js-sdk.md
docs/adr/003-challenge-snapshot-model.md
docs/adr/004-stable-kyuhachi-ids.md
docs/adr/005-offline-strategy.md
docs/adr/006-two-repo-split.md
docs/specs/firestore-data-model.md
docs/specs/security-rules-principles.md
docs/specs/catalog-versioning-protocol.md
docs/specs/phase0-foundation.md
```

---

## 9. Open Questions

### Resolved (2026-03-24)

1. **Challenge list:** Official, published, ~155 onsens total. Changes over time. User visits any 88 from the list — not a fixed subset. → Model uses `eligibleOnsenIds` + `completionCount: 88`; snapshot frozen at challenge creation.

2. **Completion tiers:** Bronze/silver/gold style. Conditions involve transport restrictions, time frame, and visit count. Exact thresholds TBD. Conditions are user-reported (app tracks what it can verify: visit count, date range; transport is self-reported per visit). → Model uses flexible `conditions` array in `challenge_types`; user claims a tier via `claimedTier`; app shows eligibility based on recorded data.

3. **Route plans vs challenges:** Independent. A challenge can optionally reference an active route plan (`activePlanId`) but completion ignores it. User can switch plans freely. → `activePlanId: string | null` on challenge document.

4. **Ship date:** No deadline. No rush.

5. **Audience:** Members of the public attempting the challenge. Expected: low tens to hundreds of users.

### Resolved (Phase 2)

6. **Visit deduplication:** One visit per onsen per challenge. Visit document ID = `kyuhachiId`, so writing a second visit overwrites the first. Only unique onsens count toward the 88. Implemented via structural deduplication (doc ID).

7. **Structured visit fields:** Confirmed and implemented: `rating` (1–5), `waterTemp` (string), `duration` (minutes), `transportUsed` (boolean). All nullable. Defined in `shared/src/types/challenge.ts` as `VisitStructuredData`.

### Still unresolved

- **Tier thresholds:** Exact conditions for gold/silver/bronze (visit count requirements, transport use limits, time windows). Must be decided before Phase 2 ships; the `challenge_types` document needs real values.

---

## 10. Immediate Next Steps

### Phase 0 checklist — this repo

- [x] Archive Python code: move `src/`, `scripts/`, `pyproject.toml`, `poetry.lock`, `data/`, `artifacts/`, `output/` to `_archive/`
- [x] Remove `onsens.json`, `onsens.csv` from repo root
- [x] `npx create-expo-app@latest app --template blank-typescript`
- [x] Configure `@react-native-firebase` via Expo config plugin
- [x] Configure Expo Router
- [x] Create `shared/` package with initial type stubs from Firestore model
- [x] Write `firebase/firestore.rules` (deny-all except auth reads on onsens)
- [x] Write `firebase/storage.rules`
- [x] Configure Firebase Emulator (`firebase.json`)
- [x] Write initial Firestore rules tests
- [x] Configure EAS (`eas.json`) with development/preview/production profiles
- [x] Write GitHub Actions: PR checks (lint, typecheck, rules tests)
- [x] Write GitHub Actions: merge to master → EAS preview → TestFlight
- [x] Write ADRs 001–006
- [x] Write `docs/specs/firestore-data-model.md`

### First 10 tasks in order

1. ~~Archive Python code to `_archive/` (one commit)~~ ✅
2. ~~Create Firebase project, enable Firestore/Auth/Storage/Functions/App Check, upgrade to Blaze plan~~ ✅
3. ~~Initialize Expo app in `app/` (TypeScript, Expo Router, `@react-native-firebase` config plugin)~~ ✅
4. ~~Write all shared TypeScript types in `shared/src/types/` — this is blocking for everything else~~ ✅
5. ~~Write Firestore security rules + emulator tests — this is blocking for Phase 1 correctness~~ ✅
6. ~~Configure EAS Build dev profile; get working dev client on real iOS device~~ ✅
7. ~~Configure GitHub Actions (PR checks + TestFlight on merge)~~ ✅
8. ~~In data repo: assign stable `kyuhachiId` to all 144 onsens; generate `onsen_id_map.json`~~ ✅
9. ~~In data repo: write and run initial Firestore publish script (SQLite → Firestore dev)~~ ✅
10. ~~Implement Firebase Auth flow (Sign in with Apple + email/password; `onUserCreated` Function; auth gate)~~ ✅
