# ADR-009: Public Journey Website (direct Firestore reads, no mirror)

**Date:** 2026-08-14
**Status:** Accepted

## Context

Petr walks the 九州八十八湯 challenge and wants friends to follow along on an
unlisted website: the route walked so far day by day, the planned route, the
challenge onsens, and the onsens he visited with his own photos, ratings and
notes from the app. The data already lives in this project's Firestore under
his user; the site should read it with no accounts and no operational burden.

Three ways to expose it were considered:

1. **Admin credentials in the site's backend or build.** Rejected: it either
   puts a service account near a browser bundle or forces a rebuild pipeline
   for live data.
2. **A public mirror collection kept in sync by a Function.** Rejected: a
   second copy of every visit to keep consistent, for no gain over rules.
3. **Loosen Firestore read rules directly** for exactly the data the site
   shows. Chosen.

## Decision

- `onsens` and `challenge_types` become publicly readable (`allow read: if
  true`). They hold catalog data with nothing private. Writes stay denied.
- One uid, hardcoded in the rules helper `isJourneyUser()`, gets public read
  on its `challenges` (including `visits`) and `routes` subcollections. Petr
  consents to his journey being fully public. Writes stay owner-only.
- The `/users/{uid}` user document itself stays private for everyone: it
  carries the email address. The site never reads it.
- A new top-level collection `journey_days/{date}` (doc id = YYYY-MM-DD, JST)
  holds one privacy-trimmed GPS track per walked day. It is publicly readable
  and writable only with admin credentials (the scheduled Strava sync
  Function, or a manual GPX import); every client write is denied.
- Visit photos are already served through tokened Storage download URLs, so
  they work for the public site as-is; `storage.rules` does not change.
- Official catalog photos are NEVER rendered by the site (licence still
  pending, see docs/storage-image-exposure.md); only Petr's own visit photos.

## Consequences

- The website is a plain unauthenticated Firebase JS SDK client: live data via
  `onSnapshot`, no backend, no sync jobs, no second source of truth.
- Anyone who discovers the project id can read the catalog and Petr's journey
  data even without the site. That is the accepted meaning of "public" here;
  it is deliberately limited to one uid whose owner opted in.
- `journey_days` tracks must be trimmed near each day's start and end before
  publishing (the Strava owner-token API ignores hidden-zone settings), so
  overnight locations never reach Firestore in the first place.
- Any future field on visits or challenges that must not go public would need
  its own guarding before landing, because these subcollections are now
  world-readable for the journey uid. The rules tests pin this exposure
  (positive for the journey uid, negative for every other uid).

## What this does not change

- App behavior: reads and writes from the app are untouched; the journey uid
  keeps normal owner access.
- The two-repo split: the data repo still owns the catalog and its ids.
- `catalog_meta`, `area_guides` and `area_guides_meta` stay
  authenticated-only; the site does not need them.
