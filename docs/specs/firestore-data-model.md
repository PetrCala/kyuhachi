# Firestore Data Model

**Last updated:** 2026-03-24
**Status:** Authoritative — update this document when the schema changes.

This document is the reference for all Firestore collections. TypeScript types in `shared/src/types/` must stay in sync with this spec. When they conflict, fix both.

---

## Collections overview

```
/onsens/{kyuhachiId}
/catalog_meta/current
/challenge_types/{typeId}
/users/{userId}
/users/{userId}/challenges/{challengeId}
/users/{userId}/challenges/{challengeId}/visits/{onsenId}
/users/{userId}/route_plans/{planId}
```

---

## /onsens/{kyuhachiId}

The onsen catalog. Written exclusively by the data repo's publish script via service account. Never written by the app or Functions.

**Document ID:** `kyuhachiId` — a UUID assigned once by the data repo and never changed. See ADR-004.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Display name in Japanese |
| `areaName` | `string` | Area/region name (e.g. 別府, 雲仙) |
| `address` | `string` | Full address string |
| `prefecture` | `string` | Prefecture name (e.g. 大分県) |
| `lat` | `number` | Latitude (WGS84) |
| `lng` | `number` | Longitude (WGS84) |
| `phone` | `string \| null` | Phone number; null if unknown |
| `businessHours` | `ParsedHours \| null` | Structured hours from data repo parser; null if unparseable |
| `admissionFee` | `string \| null` | Raw fee string (e.g. "大人500円"); null if unknown |
| `springQuality` | `string \| null` | Onsen spring type (e.g. "単純温泉"); null if unknown |
| `websiteUrl` | `string \| null` | Official website; null if none |
| `imageUrl` | `string \| null` | Representative photo URL; null if none |
| `isActive` | `boolean` | `false` = deprecated (closed/deregistered). Never deleted. |
| `catalogVersion` | `number` | Version of the catalog publish that last wrote this document |
| `createdAt` | `Timestamp` | First publish timestamp |
| `updatedAt` | `Timestamp` | Most recent publish timestamp |

**Invariants:**

- `kyuhachiId` never changes once assigned
- Documents are never deleted; deprecated onsens get `isActive: false`
- `lat` and `lng` are always present (required for map rendering)

**Access:** Authenticated users may read. No user may write. Admin service account may write.

---

## /catalog_meta/current

Single document tracking the current catalog version. The app reads this on launch to decide whether a catalog sync is needed.

**Document ID:** always `current` — this collection has exactly one document.

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `number` | Monotonically increasing integer; incremented on every catalog publish |
| `publishedAt` | `Timestamp` | When this version was published |
| `totalCount` | `number` | Total onsen documents (including inactive) |
| `activeCount` | `number` | Onsens with `isActive: true` |

**Access:** Authenticated users may read. No user may write.

**Catalog sync protocol:** See `docs/specs/catalog-versioning-protocol.md`.

---

## /challenge_types/{typeId}

Admin-managed definitions for challenge types. Currently one type exists: the 九州八十八湯 challenge. New types can be added by the data repo without an app release.

**Document ID:** short slug (e.g. `kyushu-88`).

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Display name (e.g. "九州八十八湯") |
| `description` | `string` | Long description for the challenge info screen |
| `eligibleOnsenIds` | `string[]` | Current official pool of eligible `kyuhachiId` values (~155). Frozen into `snapshotEligibleOnsenIds` when a user starts a challenge. |
| `completionCount` | `number` | Number of unique eligible visits required (88) |
| `tiers` | `Tier[]` | Ordered best→worst; see Tier schema below |
| `rules` | `string[]` | Prose rules for display (one string per rule paragraph) |
| `isActive` | `boolean` | Whether new challenges of this type can be created |

**Tier schema:**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | `"gold"` \| `"silver"` \| `"bronze"` |
| `name` | `string` | Display name |
| `conditionSummary` | `string` | Human-readable summary for UI (e.g. "No motorised transport") |
| `conditions` | `TierCondition[]` | Machine-readable conditions for app eligibility display |

**TierCondition types:**

| `type` | `value` | Meaning |
| --- | --- | --- |
| `"minVisits"` | `number` | Minimum unique eligible visits required |
| `"maxTransportUses"` | `number` | Max visits where `transportUsed: true`; 0 = no transport at all |
| `"maxCalendarDays"` | `number` | Max days from `challenge.startDate` to last qualifying visit |

Tier conditions are user-reported and cannot be independently verified by the app. The app displays tier eligibility based on recorded visit data; the user self-reports the final tier claim via `claimedTier` on their challenge.

Exact tier thresholds are TBD and will be added to the `challenge_types` document before Phase 2 ships. Do not hardcode them in app code.

**Access:** Authenticated users may read. No user may write.

---

## /users/{userId}

One document per authenticated user. Created by the `onUserCreated` Firebase Auth trigger on first sign-in.

**Document ID:** Firebase Auth `uid`.

| Field | Type | Notes |
| --- | --- | --- |
| `displayName` | `string` | From Apple/email auth; editable by user |
| `email` | `string` | From auth provider |
| `defaultChallengeId` | `string \| null` | The challenge shown on app launch; null until first challenge is created |
| `createdAt` | `Timestamp` | Account creation timestamp |

**Access:** Owner (`request.auth.uid == userId`) may read and write. No other user may access.

---

## /users/{userId}/challenges/{challengeId}

A user's in-progress or completed challenge. A user may have multiple challenges (UI for this is deferred to Phase 3, but the data model supports it from Phase 2).

**Document ID:** Auto-generated Firestore ID.

| Field | Type | Notes |
| --- | --- | --- |
| `typeId` | `string` | References `/challenge_types/{typeId}` |
| `name` | `string` | User-defined name (e.g. "My 2026 attempt") |
| `startDate` | `Timestamp` | When the user started — used for tier time-window calculations |
| `isDefault` | `boolean` | Whether this is the challenge shown on app launch |
| `snapshotEligibleOnsenIds` | `string[]` | Frozen copy of `challenge_types/{typeId}.eligibleOnsenIds` at creation time. Never mutated. See ADR-003. |
| `snapshotCatalogVersion` | `number` | Catalog version at challenge creation time |
| `activePlanId` | `string \| null` | Optional: which `route_plans` document the user is currently following. Cosmetic only — ignored for completion. User may change freely. |
| `claimedTier` | `string \| null` | Tier self-reported by user at completion (`"gold"` \| `"silver"` \| `"bronze"` \| `null`) |
| `completedAt` | `Timestamp \| null` | Set by `onVisitCreated` Function when unique eligible visits ≥ 88. Null until then. |
| `createdAt` | `Timestamp` | — |

**Derived (not stored):**

- `visitCount` — derived client-side by counting visits in the subcollection where `onsenId ∈ snapshotEligibleOnsenIds`. Not stored on the challenge document. Re-evaluate if performance becomes a problem at hundreds of users.

**Invariants:**

- `snapshotEligibleOnsenIds` is written at creation and never mutated
- `completedAt` is set by Function only, not by the client
- At most one challenge per user should have `isDefault: true`

**Access:** Owner only.

---

## /users/{userId}/challenges/{challengeId}/visits/{onsenId}

A single visit record within a challenge.

**Document ID:** the `kyuhachiId` of the visited onsen. This is the deduplication mechanism — writing a second visit to the same onsen within the same challenge overwrites the first. There is no separate visit ID. See ADR-003.

| Field | Type | Notes |
| --- | --- | --- |
| `visitedAt` | `Timestamp` | When the user visited (user-reported) |
| `notes` | `string \| null` | Free text notes |
| `photoUrl` | `string \| null` | Firebase Storage URL; see Storage model below |
| `structuredData` | `VisitStructuredData` | See below |
| `createdAt` | `Timestamp` | When the visit document was first created |
| `updatedAt` | `Timestamp` | When the visit document was last written |

**VisitStructuredData schema:**

| Field | Type | Notes |
| --- | --- | --- |
| `rating` | `number \| null` | 1–5 |
| `waterTemp` | `string \| null` | User-entered string (e.g. "42°C") |
| `duration` | `number \| null` | Minutes spent at the onsen |
| `transportUsed` | `boolean \| null` | `true` = user used motorised transport to reach this onsen. Used for tier eligibility. |

`structuredData` fields beyond these four are not defined until Phase 2 implementation. Do not add fields speculatively.

**Invariants:**

- Document ID equals the `kyuhachiId` of the visited onsen — structural deduplication, no rules required
- A visit document can be overwritten (user edits their visit); `createdAt` reflects first creation, `updatedAt` reflects last write
- Visits to onsens not in `snapshotEligibleOnsenIds` are allowed (user may log any visit) but do not count toward challenge completion

**Access:** Owner only.

**Collection group queries:** To query all visits across all challenges for a user, use a collection group query on `"visits"`. If this query pattern is needed, add a `userId` field to the visit document to support the filter.

---

## /users/{userId}/route_plans/{planId}

A named ordered list of onsens representing a walking route. Independent from challenges — see ADR-003.

**Document ID:** Auto-generated Firestore ID.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | User-defined name (e.g. "Northern route") |
| `onsenIds` | `string[]` | Ordered list of `kyuhachiId` values |
| `createdAt` | `Timestamp` | — |
| `updatedAt` | `Timestamp` | — |

**Invariants:**

- Route plans do not affect challenge completion in any way
- A challenge's `activePlanId` references a route plan but the relationship is cosmetic; changing or deleting a plan does not affect the challenge

**Access:** Owner only.

---

## Storage model

```
/visits/{userId}/{visitId}/photo.jpg
```

One photo per visit. `visitId` here is the `kyuhachiId` (matching the Firestore visit document ID).

- Max size: 1MB (enforced client-side via `expo-image-manipulator` before upload)
- Access: read and write only if `request.auth.uid == userId`
- No server-side processing in Phase 1

The `photoUrl` field on the visit document stores the full download URL after upload completes.

---

## Indexes

One composite index exists for the onsen catalog query:

| Collection | Fields                                      | Query scope |
|------------|---------------------------------------------|-------------|
| `onsens`   | `isActive` ASC, `areaName` ASC, `name` ASC | COLLECTION  |

Defined in `firebase/firestore.indexes.json`. Add new indexes there when composite queries are introduced.

---

## What does NOT live in Firestore

- **`upstreamHid`** (88onsen.com's internal ID) — data repo only; never published to Firestore
- **`visitCount`** — derived client-side from the visits subcollection
- **Tier eligibility** — computed client-side from visit records; never stored
- **Onsen images** — stored in Firebase Storage, referenced by URL in the onsen document
