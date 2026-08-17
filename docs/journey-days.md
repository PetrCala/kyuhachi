# Journey Days

How Petr's walked route gets into the public `/journey_days` Firestore collection
that the journey website renders. See
[ADR-009](adr/009-public-journey-website.md) for why the collection exists and
[journey-website.md](journey-website.md) for the site itself.

## The short version

Publish from the phone: export the day from the watch app, open Kyuhachi →
**Menu → Journey site → Publish a walked day**, pick the file. That is the
day-to-day path, and it needs no laptop and no Strava API.

## Why not Strava

The scheduled Strava sync (below) still works, but it needs Strava API access,
and since June 2026 the Standard tier (up to 10 athletes, which is us) requires
an active Strava subscription: $11.99/month, enforced from June 1 for new
developers and June 30 for existing ones. There is no personal-use exemption.
More API changes land June 1, 2027 (new base URL, tokens in headers), so paying
would buy a sync that needs rewriting anyway.

What Strava did keep free is data export, explicitly: *"every Strava athlete can
still access and download their data for free, at any time."* Everything below
is built on that guarantee rather than on API access.

It is moot in practice, because the recording device is a COROS watch, which sits
upstream of Strava and exports on its own:

- **COROS phone app:** activity → ⋯ → **Export Data** → GPX (also TCX, FIT, KML).
  On the phone, no web login. This is what feeds the in-app publish screen.
- **COROS Training Hub (desktop):** Activity List → Export Data, emailed as FIT
  or TCX. The batch path; the import script reads TCX directly, so FIT never
  needs touching.
- **COROS → Apple Health does not carry the route**, only distance, time, heart
  rate and the workout itself. Reading routes out of HealthKit is therefore not
  an option with this watch.

Two automatic options remain open and unbuilt: COROS runs an API onboarding
process with no fee mentioned (api@coros.com), and COROS syncs completed
activities to Ride with GPS, whose API issues keys self-service with trip
webhooks. Neither is wired up; see the open questions at the end.

## The three writers

All three assemble the document through `buildJourneyDay()` in
[../functions/src/util/track.ts](../functions/src/util/track.ts), so none of them
can drift from the privacy rules. Its behavior is pinned by
`functions/src/util/__tests__/track.test.ts`.

| Writer | When | `source` |
|---|---|---|
| `publishJourneyDay` callable (in-app screen) | Whenever Petr publishes a day | `gpx` |
| `scripts/import-journey-gpx.ts` | Batch catch-up from a laptop | `gpx` |
| `stravaSync` scheduled function | 07:00 JST daily, only if Strava API access exists | `strava` |

A day written as `gpx` is never overwritten by the Strava sync, so a manual
publish always wins.

### Privacy trimming

The one invariant: points within `TRIM_RADIUS_METERS` (~500 m) of **each
recording's** start and end are dropped before anything is written, so overnight
and lodging locations never reach a world-readable collection. Every start/stop
is treated as a potential lodging, not just the day's first and last, so a day
walked in two sittings has all four ends trimmed.

There is no untrimmed fallback: a track that trims to nothing is skipped, never
published raw. Strava's own hidden-zone setting does not help here, because it
only redacts what *other* Strava users see; the owner-token API returns the full
track.

Tracks are then simplified (Douglas-Peucker, capped at 1500 points, 6-decimal
coordinates), matching how the app simplifies imported routes.

## Publishing from the phone

The in-app screen ([../app/app/journey/publish.tsx](../app/app/journey/publish.tsx))
is visible only to the journey uid, and the callable refuses anyone else. It
accepts `.gpx`, `.tcx` and `.kml`, several files at once, and groups them into
JST days by their own timestamps: two files from one day become one document with
both recordings in walk order, and seven files from seven days become seven
documents.

The app parses the file and simplifies it before upload, purely so a day is tens
of kilobytes instead of over a megabyte on cellular. **It never trims.** The
trimming happens in the callable, where a stale app build or a modified client
cannot skip it.

Firestore rules deny every client write to `journey_days`, including Petr's own
(see `firebase/firestore.rules`), so this callable is the only client-reachable
writer. It runs with admin credentials, which is why the uid check inside it is
the whole gate.

A file exported without timestamps is reported and skipped, because there is no
way to tell which day it belongs to. Use the script's `--date` for those.

## Batch import from a laptop

For catching up a backlog, or ingesting a COROS Training Hub bulk export:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
npm run journey:import-gpx -- ~/Downloads/coros-export --dry-run
```

Takes any number of files and directories (searched recursively), reads `.gpx`,
`.tcx` and `.kml`, and groups them into JST days the same way the app does.
`--dry-run` reports what each day would become and writes nothing, so it needs no
credentials; drop it to publish. `--date YYYY-MM-DD` files everything given under
one day, for files exported without time data.

The service account key is the same one the seed scripts use:
[console](https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk).
Store it outside the repository.

## The Strava sync (dormant)

`functions/src/scheduled/stravaSync.ts` runs at 07:00 JST, refreshes an access
token, fetches the last 7 days of activities, keeps the on-foot ones, groups them
by JST day, pulls each activity's GPS stream and upserts one document per day.
Re-running is idempotent and the rolling window picks up late edits. It skips any
day already marked `source: "gpx"`.

It does nothing useful without Strava API access. Keep it: it costs nothing
dormant, and it works the moment API access exists again.

<details>
<summary>One-time setup, if Strava access is ever restored</summary>

### 1. Create the Strava API application

1. Open [strava.com/settings/api](https://www.strava.com/settings/api) while
   signed into your Strava account.
2. Fill in the form: any name (e.g. `kyuhachi journey`), category whatever
   fits, website can be `https://kyuhachi-path.web.app`, and set
   **Authorization Callback Domain** to `localhost`.
3. Note the **Client ID** and **Client Secret** it shows.

### 2. Authorize your own account (one browser round-trip)

1. Open this URL in a browser, with `YOUR_CLIENT_ID` substituted:

   ```
   https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=activity:read_all
   ```

2. Click **Authorize**. The browser will land on an unreachable
   `http://localhost/exchange_token?...&code=SOMECODE&...` page; that is
   expected. Copy the `code` value out of the address bar.

3. Exchange the code for tokens (the code is single-use and short-lived, so do
   this promptly):

   ```bash
   curl -X POST https://www.strava.com/api/v3/oauth/token \
     -d client_id=YOUR_CLIENT_ID \
     -d client_secret=YOUR_CLIENT_SECRET \
     -d code=SOMECODE \
     -d grant_type=authorization_code
   ```

   The JSON response contains `"refresh_token": "..."`. That string is what
   the sync needs. (The `access_token` in the same response expires in six
   hours; ignore it.)

   This same call, with a refresh token already in hand, is how to test whether
   API access still works at all.

### 3. Store the three secrets

From the repo root, on your machine:

```bash
firebase functions:secrets:set STRAVA_CLIENT_ID --project kyuhachi-fddcc
firebase functions:secrets:set STRAVA_CLIENT_SECRET --project kyuhachi-fddcc
firebase functions:secrets:set STRAVA_REFRESH_TOKEN --project kyuhachi-fddcc
```

Each command prompts for the value; paste it. Nothing goes into the repo.

The refresh token starts in Secret Manager; if Strava rotates it, the newest one
is persisted in the private `/journey_sync/strava` document (no Firestore rule
matches that path, so no client can ever read it).

### 4. Deploy

**From the main checkout on `master`, never a worktree** (deploying Functions
from a worktree is a known regression trap):

```bash
git checkout master && git pull
npm run deploy:functions
```

The deploy binds the secrets to the function automatically. To test immediately,
open [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler?project=kyuhachi-fddcc)
and press **Force run** on the `stravaSync` job, then check the `journey_days`
collection and the function's logs.

</details>

## Deploying the callable

`publishJourneyDay` ships with the rest of Functions, from the main checkout on
`master`:

```bash
npm run deploy:functions
```

The app screen needs no new native module (document picker and file system were
already linked), so an existing build picks it up with a JS update.

## Open questions

Two paths back to a fully automatic daily sync, neither investigated to the end:

- **Ride with GPS.** COROS pushes completed activities to it, and its API issues
  keys self-service with `trip` created/updated webhooks and per-trip track
  points. Unverified: whether the COROS push works on a free RWGPS account, and
  whether a walking trip's points come back at full resolution. Both are a
  15-minute check with a free account.
- **COROS API.** Onboarding at api@coros.com, no fee documented, but it wants
  company details and a security review, so a personal project may not qualify.

If either pans out, it becomes a fourth writer alongside the three above, reusing
`buildJourneyDay()` exactly as `stravaSync` does.
