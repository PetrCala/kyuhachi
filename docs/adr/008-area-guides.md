# ADR-008: Area Guides (Tourist Info)

**Date:** 2026-07-08
**Status:** Accepted

## Context

Users doing the challenge move through unfamiliar parts of Kyushu and want a
quick, readable "what is this place known for" answer: local food specialties,
regional produce and crafts, landmarks and famous spots, historic relevance, and
local culture. Today they'd look this up on the web, one tab at a time.

Two things this is not:

- **Not onsen catalog data.** The catalog (ADR-007) is scraped, per-onsen, shown
  as-is. This is editorial copy about an area, shared by many onsens.
- **Not the Finder.** The Finder (`finder.ts`) returns live MKLocalSearch POIs
  (convenience stores, lodging, michi-no-eki) at query time, online-only. That
  answers "what is physically around me right now." Area guides answer "what is
  this place known for," and must work offline.

The requirements that shape the design: it should read fully offline, cost
almost nothing to maintain, and be fast to skim.

## Decision

Introduce a new content type, the **area guide**: one guide per coarse tourist
region, published by the data repo and served offline by the app on the same
model as the onsen catalog.

- **Regions are coarse rollups owned by the data repo.** The data repo decides
  how onsen `areaName`s group into tourist regions and assigns each region a
  stable UUID (`areaId`), consistent with the two-repo split (ADR-006) and stable
  ids (ADR-004). Onsen documents gain a nullable `areaId` that joins an onsen to
  its region's guide. The app never groups or ids regions itself.

- **Content is strictly time-agnostic.** Guides carry only what does not go
  stale: specialties, produce, attractions, history, culture. They never carry
  opening hours, prices, dated events, or named shops/restaurants. This invariant
  is what makes the feature publish-once and near-zero-maintenance.

- **Content is bilingual.** Every user-facing string in a guide is
  `LocalizedText` (`{ en, ja }`). This is a deliberate exception to the "don't
  translate Firestore content" convention, which exists for scraped onsen data;
  guides are editorial copy authored for the app's readers, who skew toward
  visitors. Section labels are not stored: the app renders them from fixed
  section `kind`s via `t()`, so only the prose is data.

- **Served offline via a dedicated provider.** A new `AreaGuideContext` mirrors
  `OnsenCatalogContext` (ADR-007): the whole `/area_guides` collection is cached
  as one versioned JSON blob, and a listener on `/area_guides_meta/current`
  re-syncs the collection from the server whenever the published version moves
  past the stored one. No incremental patching.

- **Location resolves offline, with no map service.** "Your area" is the region
  whose `center` is nearest to the user's current location, computed over the
  cached guides. No reverse-geocoding provider and no region polygons in v1;
  polygons can be added later for accuracy.

- **Entry points for v1:** an "About this area" card on the onsen detail screen
  (joined via `onsen.areaId`), plus a "your area" affordance keyed off current
  location. No new tab.

## Consequences

- **Content needs a human review gate.** It is user-facing, so accuracy matters;
  a hallucinated history is worse than an absent one. LLM-assisted drafting in the
  data repo is fine, but a review pass before publish is required.
- **A second publish stream exists.** `/area_guides` and `/area_guides_meta`
  version independently of the catalog. As with the catalog, a guide edit that
  ships without a version bump will not reach devices; the version bump is
  load-bearing.
- **Authoring cost scales with region count, not onsen count.** Regions are
  coarse rollups, so the set is small and bounded. Bilingual authoring doubles
  the copy per region, accepted for the visitor audience.
- **First launch fetches guides once** (network is already needed for sign-in);
  offline thereafter, like the catalog.

## What this does not change

- **Challenges, visits, and completion.** Area guides are display data only and
  fully independent, the same way imported routes are (ADR-003). Frozen challenge
  snapshots are untouched; a challenge's `activeRouteId` analogy holds, guides
  never affect the eligible pool or completion.
- **The onsen catalog.** `areaId` is an additive, nullable field on
  `OnsenDocument` (following the `nameKana` / `adultFee` precedent of "null until
  the data repo publishes it"). Catalog publishing and the catalog cache are
  otherwise unchanged.
- **The Finder.** Live POI search stays exactly as-is; area guides are the
  curated, evergreen complement to it.
