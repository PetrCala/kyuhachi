# ADR-010: The Eligible Pool Is a Floor

**Date:** 2026-08-21
**Status:** Accepted (amends ADR-003)

## Context

ADR-003 froze the eligible pool on each challenge (`snapshotEligibleOnsenIds`)
so catalog changes could never invalidate a running challenge. In August 2026
the cost of that choice surfaced in production: the catalog had grown to 160
active onsens while every `challenge_types` pool still published 147, and all
13 missing onsens postdated the walk challenge's creation. Two recorded visits
were to onsens in the catalog but outside the frozen snapshot, so they could
never count, and no publish could fix that without violating the freeze.

ADR-003 considered a hybrid ("additions extend existing challenges; removals
do not") and rejected it as complex to reason about. That judgment was written
with document *mutation* in mind: patching every challenge on every publish,
with write fan-out and offline races. Computed at read time instead, the
hybrid is one line.

## Decision

Eligibility is judged against the union, computed at read time:

```
effectivePool = challenge.snapshotEligibleOnsenIds ∪ challengeType.eligibleOnsenIds
```

`effectiveEligibleIds()` in `shared/src/types/challenge.ts` is the one
implementation; app, Functions, and the website (via a mirrored copy, same
arrangement as `JOURNEY_UID`) all judge visits against it.

The snapshot stays exactly as ADR-003 specified: written once at creation,
never mutated. What changes is its meaning. It stops being the pool and
becomes the **floor**: the guarantee that nothing the user signed up with is
ever taken away.

The two directions of catalog change are not symmetric, and the union encodes
that:

- **Removals cannot reach a running challenge.** Anything in the snapshot
  stays eligible for that challenge even after leaving the live pool.
- **Additions flow through immediately.** An onsen joining the live pool can
  only give the user more ways to reach 88; no recorded visit becomes invalid
  and no progress goes backwards.

For a given challenge the union only ever grows, so "a data update broke my
challenge" is impossible by construction, not by policy.

Two boundaries hold the shape:

- `completionCount` (the 88) stays read live from `challenge_types`, as
  before. Growing the pool is not the same decision as moving the target.
- The data repo's publisher asserts each published `eligibleOnsenIds` is a
  superset of what Firestore currently holds; a shrink aborts the publish.
  Deliberate retirement keeps its pool-preserving path (`isActive: false`).

When the live pool has not loaded (offline first boot, failed read), the union
degrades to the snapshot alone: exactly the pre-ADR-010 behaviour.

## Alternatives rejected

- **Re-snapshotting challenges on publish** (one-off or trigger-driven):
  mutates documents ADR-003 promises never change, fans out writes, races
  offline clients, and reopens the removal hole the freeze exists to close.
- **Always use the live pool** (ADR-003's option 1): a shrunken publish would
  strand recorded visits.

## Consequences

- The production 147-vs-160 gap heals with a single catalog-sync publish; no
  challenge document is touched.
- ADR-003's "completion logic is self-contained" consequence is superseded:
  evaluation reads the challenge type document too. In practice it already
  did, since tier thresholds live there.
- An onsen that must ever leave every pool *including* floors (a legal
  removal, say) cannot be expressed by the union. That would be a new
  mechanism with its own ADR, not a quiet exception to this one.
