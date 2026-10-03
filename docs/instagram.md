# Instagram

The public Instagram account for the walk. Architecture decision and the
privacy reasoning: [ADR-012](adr/012-instagram-journey-publishing.md).

> **Posting is manual.** The recap Function in this repo is written, tested and
> deliberately switched off; the API path it needs was abandoned on 2026-09-08
> (ADR-012 amendment). Everything about the account below still applies, and
> the rules under [Posting by hand](#posting-by-hand) are the ones that matter
> day to day. The publisher is documented from "The publisher" onward as a
> record of what exists and what it would take to turn on.

## The account

| | |
|---|---|
| Handle | `@pecovy.onseny` |
| Type | Instagram **Professional → Creator** (Business also works; Creator is the closer fit and keeps the same API) |
| Purpose | The walk. The app is in the bio and turns up occasionally; it is never the point. |
| Languages | English and Japanese in every caption, English first |
| Bio link | <https://kyuhachi-path.web.app> |

The account is created by hand, on the phone, once. There is no API for
creating an Instagram account and automating signup breaks Meta's terms, so
nothing in this repo does it. As it turned out, everything after that is by
hand too.

### Creating it (one-time, ~10 minutes)

1. Instagram app → profile → ☰ → **Add account → Create new account**. Use a
   mail address that is not tied to the App Store account, so a support issue
   on one never locks the other.
2. Set the handle, name, bio and profile photo from the design in this doc.
3. **Settings → Account type and tools → Switch to professional account →
   Creator**, category *Travel*. Content publishing via the API needs a
   professional account; a personal one cannot be posted to at all.
4. Settings → **Privacy: public**. A private account cannot be published to via
   the API either, and an unlisted-but-public site behind a private feed makes
   no sense.

### Profile

**Name:** `Pecovy Onseny · 九州八十八湯`

Instagram indexes the name field; the handle is barely searchable on its own.
So the name carries both jobs: `Pecovy Onseny` says whose account this is, and
`九州八十八湯` is the term a Japanese reader actually types. There is no English
search term in it by choice, which means English discovery runs through the
captions and hashtags instead. That is the accepted cost of a name that reads
as a person's rather than a project's.

**Bio (EN + JA, inside the 150-character limit):**

```
I'm walking 1,205 km across Kyushu to 88 onsens.
Oct 2 to Dec 2 2026. 61 days, on foot.
歩いて九州八十八湯へ。1,205km・88湯・61日。
Live map ↓
```

Bio rules follow [brand-voice.md](brand-voice.md): the numbers do the selling,
no adjectives, and the joke stays in the app's subtitle rather than being
retold here. First person is deliberate: the account is a person walking, not a
route with a website, and a bio written about the walk rather than by the walker
reads as the second one.

**Profile photo:** the app's mark, the vertical 九八 in Klee One, amber
`#ffb300` on ink `#262837` (`app/assets/icon.png`). It reads at 32 px, which
almost nothing else in the project does.

**Story highlights**, four covers on the ink ground, one amber glyph each:

| Highlight | Holds |
|---|---|
| はじめに / Start | What the Kyushu 88 is, the route, the rules of the walk |
| ルート / Route | Weekly map screenshots from the journey site |
| 湯 / Onsen | The best baths, one story per onsen worth stopping at |
| アプリ / App | Kyuhachi: what it does, TestFlight or App Store link |

## The publisher

**Not in use.** Kept because it is finished and because the caption rules below
are the ones to follow when writing a post by hand. To understand why it is off
rather than deleted, read the ADR-012 amendment.

`functions/src/scheduled/instagramJourney.ts`, a scheduled Function that turns
the data behind the journey website into one post a morning.

```
09:00 JST daily
  └─ refresh the access token if it is older than 7 days
  └─ for each of the last 5 JST days, oldest first:
       ├─ already logged under journey_sync/instagram/posts/{date}?  skip
       ├─ no /journey_days/{date} yet, or no publishable photo?      skip
       └─ build caption → publish photo or carousel → log the outcome
  └─ at most one post per run
```

Split across three modules so each is testable on its own:

| File | Does |
|---|---|
| `instagram/client.ts` | The Graph API: containers, publish, token refresh |
| `instagram/caption.ts` | Bilingual caption text. Pure, unit-tested |
| `instagram/recap.ts` | Assembles a day from Firestore; filters photos |
| `scheduled/instagramJourney.ts` | Scheduling, token state, the outcome log |

### What a post looks like

```
Day 12 · 41.2 km · 487.6 km so far
Onsen 18 and 19 of 88: 竹瓦温泉 (Takegawara Onsen) and ひょうたん温泉 (Hyotan Onsen). 別府, Ōita.
Rain from Yufuin on.

12日目・41.2km・通算487.6km
88湯のうち18・19湯目：竹瓦温泉、ひょうたん温泉。大分県別府。

kyuhachi-path.web.app

#九州八十八湯 #温泉 #温泉巡り #湯めぐり #九州温泉 #onsen #kyushu #japantravel #hotsprings #walkingjapan #大分 #別府
```

The photos are Petr's own visit photos for that day, in visit order, as a
carousel when there is more than one.

### Rules the code enforces

- **Yesterday, never today.** A live post is a location broadcast, and it would
  hand back exactly what the ~500 m trimming in `/journey_days` removes. The
  delay is the feature, not a scheduling convenience.
- **No location tags, ever.** Nothing sends `location_id`, and the Instagram
  Login auth path could not send one anyway.
- **Petr's own photos only.** Catalog photos from 88onsen.com are never posted:
  the licence from 九州観光機構 is granted on per-photo credit plus a link back,
  which a carousel cannot honour. Same rule as the website
  ([storage-image-exposure.md](storage-image-exposure.md)).
- **JPEG only.** Instagram fetches each image itself and accepts nothing else,
  so every photo is HEAD-checked first and anything else is skipped.
- **One post per run.** A backlog drains a day at a time, oldest first, rather
  than arriving as five posts at once.

### Known gaps

- **A day with no photo gets no post.** Instagram has no text-only post, so
  there is nothing to publish. Rendering a map or numbers card server-side
  would close this and is the obvious next piece of work.
- **Stories are not automated.** The API supports them (`media_type=STORIES`),
  but a story is worth posting when something happens, which is a judgement a
  cron job does not have. Post those by hand.

## What enabling it would take

Recorded for the day it looks worth doing again, not as a plan. Step 3 is where
this stopped in September 2026: Instagram declined the authorization for a
days-old account, and the tester-invite workaround needs an instagram.com web
session, which was also being refused. None of it is a code problem.

The Function is **not exported** from `functions/src/index.ts`, the same as
`stravaSync`: `defineSecret()` on a secret that does not exist in Secret
Manager makes firebase-tools prompt, and that prompt blocks every functions
deploy, targeted ones included. That is what keeps it inert and harmless.

1. Create the account and switch it to Creator (above).
2. Create a Meta app at <https://developers.facebook.com/apps>, product
   **Instagram → API setup with Instagram business login**, and add the
   `instagram_business_basic` and `instagram_business_content_publish` scopes.
3. In the same panel, under **Generate access tokens**, click *Add an
   Instagram account*, log in as the account in the popup and allow access.
   Copy the token it gives you. This is the whole reason to use the Instagram
   Login path: no redirect URI, no OAuth implementation, no Facebook Page.
   The dashboard's token is short-lived (about an hour), so it has to be
   exchanged before it is worth storing, which is what the next step does.
4. Verify it and turn it into a 60-day token. The secret to use is the
   **Instagram app secret**, shown next to the Instagram app ID at the top of
   that same API setup panel, NOT the Facebook app secret under App settings →
   Basic. The two are different values and the exchange fails with the wrong
   one:

   ```bash
   IG_TOKEN=... IG_APP_SECRET=... ./scripts/verify-instagram-token.sh
   ```

   It confirms the account is BUSINESS or CREATOR, prints the Instagram user
   id, exchanges the token for a long-lived one, and checks that the publish
   scope is actually granted by reading the publishing quota. The token is
   read from the environment and never written to a file. Store the token it
   prints at the end, not the one from the dashboard.

5. Put both into Secret Manager:

   ```bash
   firebase functions:secrets:set INSTAGRAM_USER_ID
   firebase functions:secrets:set INSTAGRAM_ACCESS_TOKEN
   ```

6. Uncomment the `instagramJourney` export in `functions/src/index.ts`.
7. `npm run deploy:functions`.

The seeded token is only ever the first one. It rotates on refresh, and the
live value lives in the private `journey_sync/instagram` document from then on:
the same pattern as the Strava refresh token, and for the same reason.

### If the token ever expires

A long-lived token lasts 60 days and can only be refreshed while it is still
alive. If the Function has not run for two months, no API call can recover it:
redo step 3 and re-set the secret. The weekly-ish refresh in `currentAccessToken`
exists to make that impossible while the schedule is running, and it logs an
error rather than failing the run when a single refresh fails.

## Story cards

`scripts/render-story-cards.py` renders 1080x1920 story cards in the app's ink
and amber from the copy in `scripts/story-cards.json`:

```bash
python3 scripts/render-story-cards.py          # -> output/story-cards/
```

Write the words in the JSON and re-run. The layout, palette, type and the
Instagram safe area live in the script, so a card cannot come out off-brand or
with its text under the story UI, and the headline auto-sizes so a longer line
never overflows. Cards render in file order and are numbered accordingly, so
the phone's photo picker offers them in posting order.

Rendering goes through headless Chrome rather than PIL (which
`render-brand-assets.py` uses) because every card is a bilingual paragraph, and
PIL cannot line-break mixed CJK and Latin text.

## Posting by hand

This is the whole workflow now, not the leftovers. Two guardrails carry over
from the publisher's design, and with nothing enforcing them in code they are
entirely on Petr:

- Nothing that shows tonight's lodging, and nothing posted from it while he is
  still there. The next morning is fine.
- No catalog photos, for the licence reason above. His own camera roll only.
