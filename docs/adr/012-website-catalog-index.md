# ADR-012: A Packed Catalog Index for the Journey Website

**Date:** 2026-09-07
**Status:** Accepted

## Context

The public journey website ([ADR-009](009-public-journey-website.md)) renders
onsens onto a map. It reads exactly seven values per onsen: the document id,
`name`, `nameRomaji`, `areaName`, `prefecture`, `lat`, `lng`. About a hundred
bytes of content.

To get them it read the whole `/onsens` collection on every page load. Measured
against production (`kyuhachi-fddcc`, 2026-09-07, Firestore REST with
`prettyPrint=false`): 161 documents, **386 KB** uncompressed and **62 KB**
gzipped over the wire. `businessHours` alone accounted for 130 KB, a third of it,
and nothing on the site has ever read a single field of it.

The weight is structural, not textual. Firestore wraps every field of every
document in protobuf-JSON, so the per-document and per-field envelopes dominate
once the payload is many small records. This is the same finding as the walked
tracks in [journey-days.md](../journey-days.md): a day's ~1000 GPS points cost
~95 KB as an array of `{lat, lng}` maps and ~2.6 KB as an encoded polyline. The
data did not shrink; the envelope went away.

The catalog cannot shrink to fit the website. The app reads the same collection
and genuinely uses nearly every field (`app/src/context/OnsenCatalogContext.tsx`):
hours, fees, spring quality, phone, website, photo and blurhash all appear on
screen. `/onsens` stays as it is.

## Decision

The data repo publishes a second, **derived** document alongside the catalog:

```
/catalog_index/current
{
  schemaVersion: 1,
  version: number,       // mirrors /catalog_meta/current.version
  publishedAt: Timestamp,
  count: number,
  entries: string,       // JSON.stringify of [id, name, nameRomaji, areaName,
                         // prefecture, lat, lng][]
}
```

The website reads this one document instead of the collection. The type and the
full contract live in `CatalogIndexDocument` in
[../../shared/src/types/onsen.ts](../../shared/src/types/onsen.ts).

Measured on the same 161 onsens: **24 KB** uncompressed, **11 KB** gzipped. So
16x smaller uncompressed, 5.7x over a gzipped wire, and 161 document reads
collapse to 1 (Firestore bills per document read, and each is a round trip the
map waits on).

Three properties are the point of it:

- **`entries` is a string, not a Firestore array.** A native array of maps
  measured 54 KB against this shape's 24 KB, because it re-incurs the per-value
  envelope the document exists to remove. Same trade as the encoded polyline.
- **The tuples are positional.** Repeating seven keys 161 times costs more than
  the values do. The order is therefore the contract, which is what
  `schemaVersion` is for: a reader that does not recognise it must refuse the
  document rather than guess.
- **One document makes the pool atomic.** A collection read can observe a
  half-finished publish; a single document cannot.

Onsens are **not** filtered to `isActive`. The site has to place a visit to an
onsen that was later deprecated, and a frozen challenge snapshot
([ADR-003](003-challenge-snapshot-model.md), [ADR-010](010-eligible-pool-floor.md))
may still name one.

The index is derived and disposable. `/onsens` remains the single source of
truth for onsen identity: the index is republished wholesale from it, holds no
field the catalog does not, and can be deleted and rebuilt at any time.

## Alternatives rejected

- **A REST query with a field mask** returning the six fields: 74 KB
  uncompressed, 15 KB gzipped, so 3x the index uncompressed and worse than it
  gzipped, still over 161 document reads. It also needs hand-parsing of
  Firestore's value format and hand-rolled pagination outside the SDK, and
  every line of it would be deleted the day the index existed.
- **Lookup tables for `areaName` and `prefecture`**, indexed by position from
  each tuple. Measured, and it does not pay: there are 129 distinct areas
  across 161 onsens, so deduplicating them saves almost nothing, while a
  native lookup array costs ~18 bytes of envelope per element. Uncompressed it
  saved 2 KB of 24 KB; gzipped it came out **larger** (11.2 KB against
  11.1 KB), because gzip already collapses the repeated names better than an
  index does. Complexity for the data repo and the reader, for nothing.
- **A tab-delimited `entries` string** instead of JSON: 21.8 KB, 10% better
  uncompressed but 2% gzipped, in exchange for a custom parser and a delimiter
  that a name could in principle contain.
- **Trimming `/onsens` itself.** The app needs those fields.

## Consequences

- Onsen identity now has two published representations. They can drift, so the
  index is republished in the same operation as the catalog, and `version`
  ties it to the `/catalog_meta` version it was derived from.
- Publishing is the data repo's job, so the two repos had to land in order:
  rules first, then the publisher, then the site switching over. The website
  shipped with a temporary fallback to the full-catalog read for that window,
  exactly as the polyline change kept and then removed its legacy `points`
  path. The index was first published on 2026-09-07 and the fallback was
  removed the same day; a missing index is now a failure, not a fallback.
- One thing that window taught: Firestore denies a read on a path no rule
  matches, so before the rules deploy the read fails with `permission-denied`
  rather than returning an absent document. A "read the new thing, fall back if
  absent" rollout has to treat both as the same state, because rules and site
  deploy from one push on two separate workflows.
- The document is 24 KB against Firestore's 1 MiB limit, room for roughly 40x
  the current catalog. If it ever approached that, this decision would need
  revisiting rather than paging.
- Adding a field to the tuple is backwards-compatible (readers index by
  position and ignore extras). Reordering or removing one is not, and bumps
  `schemaVersion`.
