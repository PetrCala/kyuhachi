# ADR-004: Stable kyuhachiId for Onsen Identity

**Date:** 2026-03-24
**Status:** Accepted

## Context

The onsen catalog is sourced from 88onsen.com, which assigns its own `hid` identifiers. These upstream IDs are:
- **Unstable** — the scraper has observed IDs changing between scrape runs
- **Opaque** — they carry no semantic meaning
- **Not ours to control** — 88onsen.com can renumber, merge, or remove onsens at any time

The app needs stable, permanent identifiers for:
- Firestore document paths (`/onsens/{id}`)
- Visit records (`/users/{uid}/challenges/{cid}/visits/{id}`)
- Challenge snapshots (`snapshotEligibleOnsenIds`)
- Route plans (`onsenIds`)

If the primary key changes, existing user data (visits, snapshots, plans) becomes orphaned.

## Decision

Assign a UUID (`kyuhachiId`) to every onsen once, permanently. This assignment lives in the separate data repo at `data/mappings/onsen_id_map.json`, committed to git. The `kyuhachiId` never changes after assignment.

The app never sees `upstreamHid`. The data repo uses `upstreamHid` internally during scraping and catalog publishing, but strips it before writing to Firestore.

Matching logic when new onsens are scraped: exact name match → name + coordinate proximity (≤200m) → manual override. New onsens that cannot be matched to an existing `kyuhachiId` get a new UUID assigned.

Deprecated onsens (closed, deregistered) get `isActive: false` in Firestore but are never deleted. Their `kyuhachiId` is never reused.

## Consequences

- **User data is durable** — visits, snapshots, and plans survive catalog updates, re-scrapes, and upstream renumbering
- **Mapping file is critical** — `onsen_id_map.json` in the data repo is the single source of truth; losing it or corrupting it would require manual reconstruction from Firestore
- **Coordination required** — the data repo must assign IDs before any app code references an onsen; the app repo has no mechanism to assign IDs
- **No onsen documents are deleted** — deprecated onsens remain in Firestore with `isActive: false`; the catalog grows monotonically
