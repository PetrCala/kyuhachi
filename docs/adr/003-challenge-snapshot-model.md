# ADR-003: Challenge Snapshot Model

**Date:** 2026-03-24
**Status:** Accepted

## Context

The 九州八十八湯 challenge requires a user to visit any 88 onsens from the official eligible pool. That pool is maintained by the challenge operator and changes over time: onsens are added when new facilities join, removed when they close or are deregistered.

This creates a consistency problem: if a user starts a challenge when the pool contains 150 onsens, and two years later the pool has changed to 160 different onsens, which pool governs their challenge completion?

Options considered:
1. **Always use the live pool** — completion is always evaluated against the current `eligibleOnsenIds` in Firestore; pool changes affect in-progress challenges
2. **Snapshot at creation** — freeze the eligible pool at challenge creation time; catalog changes never affect existing challenges
3. **Hybrid** — additions extend existing challenges; removals do not; complex to reason about

## Decision

Freeze the eligible pool at challenge creation as `snapshotEligibleOnsenIds` on the challenge document. This field is written once and never mutated.

Completion is evaluated as: count of unique visits where `onsenId ∈ snapshotEligibleOnsenIds` ≥ 88.

If an onsen is later deprecated (`isActive: false`): visits to it still count toward completion (it was eligible when the challenge started). It displays as "archived" in the UI.

If new onsens are added to the official pool: existing challenges are unaffected. New challenges started after the update will include them.

## Consequences

- **Fairness** — users are not disadvantaged by catalog changes after they start their challenge
- **Immutability** — `snapshotEligibleOnsenIds` is a large array (~155 IDs) stored on every challenge document; acceptable at this scale
- **No retroactive corrections** — if the data repo publishes a bad eligible list, existing challenges cannot be corrected without a migration script
- **Completion logic is self-contained** — the `onVisitCreated` Function only needs the challenge document to evaluate completion; no cross-document reads required
- **Route plans are independent** — `activePlanId` on the challenge document is cosmetic; it has no effect on completion logic (see ADR-006 context)
