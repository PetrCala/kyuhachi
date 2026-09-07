# Journey Website

The public, unlisted site where friends follow Petr's 九州八十八湯 walk:
[https://kyuhachi-path.web.app](https://kyuhachi-path.web.app). Architecture
decision and data-exposure rationale: [ADR-009](adr/009-public-journey-website.md).

## What it is

- `website/`: a Vite + React + TypeScript SPA. Not part of the npm workspace;
  it has its own `package-lock.json` (same pattern as `firebase/`).
- Reads Firestore directly with the Firebase JS SDK as an **unauthenticated**
  client. What it may read is governed by `firebase/firestore.rules` (public
  catalog and `catalog_index`, public journey uid, public `journey_days`); the
  site holds no credentials of any kind. The web config in
  `website/src/firebase.ts` is public identifiers, not secrets.
- Map: MapLibre GL JS on OpenFreeMap vector tiles (no key, no quota).
- Petr's visit photos come from the tokened Storage download URLs already
  stored on visit documents. Official catalog photos are NEVER shown
  (licence pending, see [storage-image-exposure.md](storage-image-exposure.md)).
- Public and indexable. It was unlisted (`noindex` + a `robots.txt` disallow)
  while its only readers were people Petr had sent the link to. The walk's
  Instagram account (see [instagram.md](instagram.md)) puts the URL in a public
  bio, which made the unlisting a fiction; it was dropped rather than defended
  on 2026-09-07. There is, and never was, an auth wall.
- What that exposes has not changed, only who finds it: the same journey data
  the Firestore rules already serve to anyone with the link (ADR-009). What is
  new is that it becomes searchable and quotable, and search engines are slow
  to forget, so this is not a setting to flip back and forth.
- A small "viewing now" counter runs on Firebase Realtime Database presence
  (`/presence`, one node per open tab, removed server-side via `onDisconnect`).
  That is RTDB's only job in this project: rules
  (`firebase/database.rules.json`) allow exactly the presence pattern and deny
  everything else, covered by `firebase/test/database.rules.test.ts`. There is
  deliberately no total-views counter and no guestbook.

## Data flow

| Layer | Source | Freshness |
|---|---|---|
| Default challenge | `users/{uid}/challenges` where `isDefault == true` | live (`onSnapshot`) |
| Visited onsens | `.../challenges/{id}/visits` | live (`onSnapshot`) |
| Onsen catalog | `catalog_index/current`, one packed document | per page load ([why](#the-catalog-index)) |
| Completion target + eligible pool | `challenge_types/{typeId}` | per page load |
| Walked route | `journey_days`, one line per day; dotted connectors mark unrecorded stretches | per page load ([how days get published](journey-days.md)) |
| Planned route | `users/{uid}/routes/{activeRouteId}` | per page load |
| Planned onsens | computed client-side: eligible, unvisited, within 3 km of the planned route | derived |
| Terrain | GSI (国土地理院) hillshade raster tiles, off by default | tile CDN |

The side panel toggles each layer and doubles as the legend.

### The catalog index

The site reads seven values per onsen: the document id, `name`, `nameRomaji`,
`areaName`, `prefecture`, `lat`, `lng`. It used to get them by reading the whole
`/onsens` collection, which is 161 documents of 23 fields each: 386 KB
uncompressed, 62 KB gzipped, every page load, to render about a hundred bytes of
content per onsen. `businessHours` alone was 130 KB of it and the site has never
read a field of it.

It now reads `/catalog_index/current`, a single document whose `entries` field
is a packed JSON array of seven-element tuples: 24 KB uncompressed, 11 KB
gzipped, one document read instead of 161. `/onsens` is unchanged, because the
app needs every field of it; the index is derived from it and republished with
it. The shape and the reasoning are in
[ADR-012](adr/012-website-catalog-index.md), the contract is
`CatalogIndexDocument` in `shared/src/types/onsen.ts`, and the unpacking is
confined to `website/src/hooks/useOnsens.ts` so nothing downstream sees the
packing. This is the same move as storing walked tracks as encoded polylines
([journey-days.md](journey-days.md), "How a track is stored").

The index is published by the private data repo, not from here: its
`bump_catalog_version` rewrites the document from the same live read that writes
`/catalog_meta` on every publish, so the two cannot drift. The site therefore
treats a missing index as a broken publish, not a state to fall back on: it
raises the failure banner. (It shipped with a temporary fallback to the old
full-catalog read for the window before the first publish, on 2026-09-07; that
is gone.)

The only hardcoded datum is Petr's uid (`website/src/config.ts`, mirrored by
`isJourneyUser()` in the rules). Everything else is derived.

## Local development

```bash
cd website
npm ci
npm run dev
```

The dev server talks to production Firestore (read-only; the rules make sure
of that). `npm run build` typechecks and emits `website/dist/`.

## Deployment

`.github/workflows/deploy-website.yml` builds and releases on every push to
`master` touching `website/`, `firebase.json` or `.firebaserc`, deploying the
`journey` hosting target (`kyuhachi-path` site). The legal-pages site is the
`legal` target and keeps its own flow; `firebase deploy --only hosting` from a
laptop deploys both.

### One-time setup (needs a project owner)

1. Create the Hosting site (once):

   ```bash
   firebase hosting:sites:create kyuhachi-path --project kyuhachi-fddcc
   ```

2. Grant the CI service account (the one behind the `FIREBASE_SERVICE_ACCOUNT`
   Actions secret) the Hosting deploy role, in
   [IAM](https://console.cloud.google.com/iam-admin/iam?project=kyuhachi-fddcc):
   add `roles/firebasehosting.admin` (Firebase Hosting Admin) to that service
   account. The rules-deploy roles it already has do not cover Hosting.

3. Trigger the `Deploy journey website` workflow manually (workflow_dispatch)
   or land any `website/` change on `master`.

4. **Done on 2026-08-17, kept for the record.** The viewer counter needed the
   default Realtime Database instance to exist and the CI service account to be
   able to deploy its rules. Both are in place: the instance is
   `kyuhachi-fddcc-default-rtdb` (us-central1), and
   `firestore-rules-deployer@kyuhachi-fddcc.iam.gserviceaccount.com` holds
   `roles/firebasedatabase.admin`, so the rules workflow deploys
   `database.rules.json` on its own.

   Two notes if this ever has to be redone. The Firebase CLI cannot create a
   project's *first* RTDB instance non-interactively, and `firebase init
   database` rewrites `firebase.json`; creating it through the management API
   avoids both problems:

   ```bash
   TOKEN=$(gcloud auth print-access-token)
   curl -X POST \
     "https://firebasedatabase.googleapis.com/v1beta/projects/kyuhachi-fddcc/locations/us-central1/instances?databaseId=kyuhachi-fddcc-default-rtdb" \
     -H "Authorization: Bearer $TOKEN" \
     -H "x-goog-user-project: kyuhachi-fddcc" \
     -H "Content-Type: application/json" \
     -d '{"type":"DEFAULT_DATABASE"}'
   ```

   The `x-goog-user-project` header is required: without it the call fails with a
   403 about a missing quota project. To deploy the rules by hand instead of
   through CI: `firebase deploy --only database --project kyuhachi-fddcc`.

A custom domain can be attached to the `kyuhachi-path` site later in the
Hosting console without touching any of this.
