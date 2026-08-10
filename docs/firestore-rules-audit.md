# Firestore rules audit

A pre-release review of [firebase/firestore.rules](../firebase/firestore.rules)
against the client write paths and the Functions that read the same documents.
Records what was changed, and what was looked at and deliberately left alone, so
the next audit starts from the conclusions rather than from scratch.

Threat model: a signed-in user with a real Auth token who talks to Firestore
directly rather than through the app. That is the realistic attacker here, and
it is what the rules can actually constrain. Kyuhachi is single-player with no
leaderboard, no social feed and no rewards, so "user forges their own progress"
is a very different severity from "user reads or writes someone else's data".

## What the rules got right already

- Every catalog collection (`onsens`, `catalog_meta`, `challenge_types`,
  `area_guides`, `area_guides_meta`) is read-only to clients and readable only
  when authenticated. Publishing goes through the data repo's service account.
- Everything under `/users/{userId}` is gated on `isOwner(userId)`, and
  subcollections are matched explicitly rather than with a recursive wildcard,
  so nothing is reachable by accident.
- Unmatched paths fall through to Firestore's default deny.
- `earnedTier` / `earnedTierAt` are server-only: creatable as null, never
  changeable by the client. `claimTier` (admin credentials) is their sole writer.

## Finding 1: the snapshot freeze was documented but not enforced

[ADR 003](adr/003-challenge-snapshot-model.md) says a challenge's snapshot is
frozen at creation. Nothing enforced that. `allow update` guarded only
`earnedTier` and `earnedTierAt`, so the owner could rewrite `typeId`,
`snapshotEligibleOnsenIds`, `snapshotCatalogVersion`, `startDate`, `createdAt`
and `completedAt` on an existing challenge.

That mattered more than an invariant slipping, because of what reads those
fields. `evaluateChallenge` in
[functions/src/util/tier.ts](../functions/src/util/tier.ts) derives tier
eligibility from `snapshotEligibleOnsenIds`, `typeId` and `startDate`, counting
visit documents whose id is in the snapshot pool. Visit documents are freely
client-writable with any id. So the sequence was:

1. write N visit documents with arbitrary ids,
2. update `snapshotEligibleOnsenIds` to include those ids,
3. call `claimTier`, which counts them and writes gold.

Guarding `earnedTier` bought less than it appeared to: the client could not write
the field, but it fully controlled the inputs the server computed it from.

**Change:** `allow update` now also rejects changes to `typeId`,
`snapshotEligibleOnsenIds`, `snapshotCatalogVersion`, `startDate`, `createdAt`
and `completedAt`. `completedAt` is in the list for the same reason as
`earnedTier`: the visit triggers own it and write with admin credentials.

`diff()` reports only keys whose value actually changed, so a full-document
overwrite that carries the frozen fields through unchanged still passes. Only a
real change is rejected. The app never updates any of them after creation: it
writes `name`, `isDefault`, `activeRouteId` and `updatedAt`
(`challenge/list.tsx`, `routes/index.tsx`, `useActiveChallengeProgress.ts`).

## Accepted: a user can still forge progress within their own pool

Closing the pool does not make tiers unforgeable. The owner can still write visit
documents for onsens in the genuine ~155-onsen pool without going there, and
`structuredData.transportMode` is self-reported by design.

This is accepted, not overlooked. Every transport mode in the app is
self-reported, no rule can tell a real visit from a claimed one, and the only
person affected is the forger: there is no leaderboard, no shared state, and no
reward. Enforcing more would mean a `get()` on the parent challenge for every
visit write, which costs a document read per write and buys nothing against the
one attacker who benefits from it.

What the freeze does buy is that the pool a challenge is scored against is the
one the catalog actually published, so a forged tier requires forging real
onsens rather than inventing ids.

## Accepted: the blanket write on the user document

`/users/{userId}` allows the owner to write any field. Re-checked this release:
the document holds `displayName`, `email`, `defaultChallengeId` and `createdAt`.
None is trusted. `displayName` / `email` are denormalized copies of the Auth
record that nothing reads back (the account screen reads the Auth user),
`defaultChallengeId` only selects which of the owner's own challenges the owner
sees, no rule does a `get()` on this path, and no Function reads a field off it.
There is no role, admin flag, entitlement or denormalized count.

The tripwire is the existing test "owner: no field on the user document is
server-only". A field that a Function, a rule or another user's view has to trust
must be guarded the way `earnedTier` is, which makes that test fail and forces
the decision to be made deliberately.

## Accepted: deleting a challenge orphans nothing that matters

Firestore does not cascade deletes, so `delete` on a challenge leaves its
`visits` subcollection behind. The client deletes visits first in the same batch
(`challenge/list.tsx`), and rules cannot enforce ordering. Orphaned visits are
unreachable by every query the app makes and are owner-scoped, so the failure
mode is wasted storage, not exposure.

## Test coverage

[firebase/test/firestore.rules.test.ts](../firebase/test/firestore.rules.test.ts)
now runs 78 assertions (up from 55). Added this pass:

- each frozen field individually rejected on update
- the pool-widening path rejected end to end
- the legitimate client updates (rename, re-default, attach route) still allowed
- full-document overwrite that preserves frozen fields allowed, and the two
  bypasses that drop a guarded field instead of changing it rejected
- unauthenticated read and write on challenges, visits, favorites and routes
- cross-user delete on visits, favorites and routes
- cross-user `list` on visits and routes (the earlier tests only covered `get`)
- owner delete of a visit and owner reorder of a route, both real client actions

Run them against the emulator (never edit rules without this):

```bash
cd firebase && firebase emulators:exec --only firestore --project kyuhachi-test "npm test"
```

Rules deploy automatically on merge to `master` via
[deploy-firestore-rules.yml](../.github/workflows/deploy-firestore-rules.yml), so
a merged change is a live change.
