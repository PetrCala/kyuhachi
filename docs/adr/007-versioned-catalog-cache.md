# ADR-007: Versioned Device-Local Catalog Cache

**Date:** 2026-07-02
**Status:** Accepted (amends ADR-005)

## Context

ADR-005 relies on Firestore's built-in persistence for offline reads. For the
user's *own* data (challenges, visits, routes) that is exactly right: every
screen subscribes to those documents, so the cache is always warm, and queued
writes sync automatically.

For the onsen catalog it proved too weak a guarantee:

- Firestore caches only what was **queried while online**. A user who never
  opened a given screen has no cached data for it, and a query served from
  cache can be **silently partial** — the SDK returns whatever documents it
  happens to hold, with no signal that others exist on the server.
- The cache is LRU-managed; nothing pins the catalog in it.
- Users mid-challenge are routinely offline for whole days in mountainous
  Kyushu. "The catalog you happened to browse recently" is not the same as
  "the full catalog, guaranteed".

The catalog is small (~161 documents, a few hundred KB as JSON), read-only for
the app, and versioned: the data repo bumps `/catalog_meta/current.version` on
every publish.

## Decision

The app keeps an explicit, versioned snapshot of the full `/onsens` collection
in device storage (AsyncStorage, one JSON blob), managed by a single provider
(`OnsenCatalogContext`) that is the **only source of catalog data** for the UI.
No screen subscribes to `/onsens` directly anymore.

- On launch, the stored snapshot is served immediately — no network involved.
- A listener on `/catalog_meta/current` (with metadata changes included, so it
  re-fires on reconnect) compares the published `version` to the stored one;
  when the published version is newer, the whole collection is re-fetched
  **from the server** (`getDocsFromServer` — a cache read could be partial),
  persisted, and swapped in atomically. There is no incremental patching.
- The cache stores every onsen ever published, active and archived, because
  frozen challenge snapshots may reference since-deprecated onsens.
- After a sync (and once per launch), all catalog photos are prefetched into
  expo-image's disk cache; the published blurhash remains the placeholder for
  any photo that isn't cached.

**What this does not change:**

- Frozen challenge snapshots (ADR-003). The cache is display data only. At
  challenge creation, `snapshotCatalogVersion` still comes from a direct
  `/catalog_meta` read and the eligible pool from `/challenge_types`; the local
  cache is never consulted, so it cannot change which catalog version a
  challenge is pinned to.
- User-data offline behavior. Challenges, visits, and routes still ride on
  Firestore persistence exactly as ADR-005 describes; visit writes queue in
  Firestore's native offline queue (which survives restarts) — there is still
  no custom write queue.

## Consequences

- **First launch still needs network** to fetch the catalog once (sign-in
  requires network anyway); after that the full catalog is guaranteed offline.
- **Catalog updates land whole, or not at all** — the UI can never show a
  half-updated catalog, and a failed sync leaves the previous snapshot serving.
- **Fewer live listeners.** The eligible-onsen display data no longer needs
  batched `in` queries; it resolves from the local map. Catalog edits published
  without a version bump will NOT reach devices — the data pipeline bumps the
  version on every publish, which is now load-bearing.
- **Visit saves no longer await the backend.** The editor issues the write and
  navigates; Firestore's local application updates the UI instantly (online or
  offline) and the write syncs when connectivity returns. Failures surface via
  an async alert instead of blocking the save button.
