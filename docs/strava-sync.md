# Strava Journey Sync

How Petr's walked route gets from his Strava account into the public
`/journey_days` Firestore collection that the journey website renders. See
[ADR-009](adr/009-public-journey-website.md) for why the collection exists and
[journey-website.md](journey-website.md) for the site itself.

## How it works

- `functions/src/scheduled/stravaSync.ts`: a scheduled Function (v2) running
  every morning at 07:00 JST. No Strava webhook, deliberately: publishing is
  delayed a day anyway, and the rolling window keeps things simple.
- Each run refreshes an access token from Petr's OAuth refresh token, fetches
  the last 7 days of activities, keeps the on-foot ones (Walk, Hike, Run,
  TrailRun), groups them by JST day, pulls each activity's GPS stream, and
  upserts one `journey_days/{YYYY-MM-DD}` document per day. Re-running is
  idempotent; late edits to a recent activity are picked up on the next run.
- **Privacy trimming.** Strava's hidden start/end zones only affect what other
  Strava users see; the owner-token API returns the full track. The sync
  therefore drops all points within ~500 m of each recording's start and end
  before writing anything (`functions/src/util/track.ts`), so overnight
  locations never reach the public collection. There is no untrimmed fallback:
  a track that trims to nothing is skipped, not published.
- Tracks are simplified the same way the app simplifies imported routes
  (Douglas-Peucker, capped at 1500 points, 6-decimal coordinates).
- The refresh token starts in Secret Manager; if Strava rotates it, the newest
  one is persisted in the private `/journey_sync/strava` document (no Firestore
  rule matches that path, so no client can ever read it).

## One-time setup (Petr)

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

### 3. Store the three secrets

From the repo root, on your machine:

```bash
firebase functions:secrets:set STRAVA_CLIENT_ID --project kyuhachi-fddcc
firebase functions:secrets:set STRAVA_CLIENT_SECRET --project kyuhachi-fddcc
firebase functions:secrets:set STRAVA_REFRESH_TOKEN --project kyuhachi-fddcc
```

Each command prompts for the value; paste it. Nothing goes into the repo.

### 4. Deploy

**From the main checkout on `master`, never a worktree** (deploying Functions
from a worktree is a known regression trap):

```bash
git checkout master && git pull
npm run deploy:functions
```

The deploy binds the secrets to the function automatically. The first
scheduled run happens the next morning at 07:00 JST; to test immediately,
open [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler?project=kyuhachi-fddcc)
and press **Force run** on the `stravaSync` job, then check the
`journey_days` collection in the Firestore console and the function's logs.

## Manual GPX fallback

For a day whose Strava recording is corrupt or missing, import a GPX file
instead; it produces the same document, marked `source: "gpx"`, and the daily
sync will never overwrite it afterwards:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
npm run journey:import-gpx -- /path/to/day.gpx
```

The day is derived from the file's timestamps (JST); pass `--date YYYY-MM-DD`
to override, e.g. for a file exported without time data. The same ~500 m
start/end privacy trimming applies. To redo a day with Strava data after all,
delete the `journey_days` document in the console and let the next morning's
sync rewrite it (only days inside the 7-day window are re-synced).
