# Journey Website

The public, unlisted site where friends follow Petr's 九州八十八湯 walk:
[https://kyuhachi-path.web.app](https://kyuhachi-path.web.app). Architecture
decision and data-exposure rationale: [ADR-009](adr/009-public-journey-website.md).

## What it is

- `website/`: a Vite + React + TypeScript SPA. Not part of the npm workspace;
  it has its own `package-lock.json` (same pattern as `firebase/`).
- Reads Firestore directly with the Firebase JS SDK as an **unauthenticated**
  client. What it may read is governed by `firebase/firestore.rules` (public
  catalog, public journey uid, public `journey_days`); the site holds no
  credentials of any kind. The web config in `website/src/firebase.ts` is
  public identifiers, not secrets.
- Map: MapLibre GL JS on OpenFreeMap vector tiles (no key, no quota).
- Petr's visit photos come from the tokened Storage download URLs already
  stored on visit documents. Official catalog photos are NEVER shown
  (licence pending, see [storage-image-exposure.md](storage-image-exposure.md)).
- Unlisted: `noindex` meta + `robots.txt` disallow. There is no auth wall;
  anyone with the link can view.

## Data flow

| Layer | Source | Freshness |
|---|---|---|
| Default challenge | `users/{uid}/challenges` where `isDefault == true` | live (`onSnapshot`) |
| Visited onsens | `.../challenges/{id}/visits` | live (`onSnapshot`) |
| Onsen catalog | `onsens` | per page load |
| Completion target | `challenge_types/{typeId}` | per page load |
| Walked route | `journey_days` (slice: walked-days layer) | per page load |
| Planned route | `users/{uid}/routes/{activeRouteId}` | per page load |

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

A custom domain can be attached to the `kyuhachi-path` site later in the
Hosting console without touching any of this.
