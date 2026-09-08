# ADR-012: Instagram Journey Publishing (scheduled, delayed, photo-gated)

**Date:** 2026-09-07
**Status:** Accepted, then deferred unbuilt (see the amendment below)

## Context

The walk gets a public Instagram account (`@pecovy.onseny`), primarily a
journey log and only incidentally a channel for the app. Everything a daily
post would say is already in Firestore: the walked track in `/journey_days`,
the visits with Petr's own photos, ratings and notes, and the onsen catalog.
Posting it by hand every evening for 61 days, from the road, after 34 km, is
the kind of commitment that lapses in week two.

Three things constrain how this can work:

1. **Instagram accounts cannot be created through an API**, and automating
   signup breaks Meta's platform terms. The account is a manual, one-time job.
2. **Publishing needs a professional account** and one of two auth paths.
   *Facebook Login* requires a linked Facebook Page, Business Manager and Page
   Publishing Authorization; *Instagram Login* (host `graph.instagram.com`)
   talks to the Instagram account directly and needs none of them.
3. **Every feed post is media.** There is no text-only post, so a day with
   nothing to show cannot be posted about at all.

There is also a privacy problem the project has already solved once. The
~500 m trimming around every start and stop in `/journey_days` exists so a
world-readable collection never says where Petr sleeps (ADR-009,
docs/journey-days.md). A live Instagram post would hand that straight back: a
photo, a caption and a timestamp saying he is *there, now*.

## Decision

- **A scheduled Function, not a webhook or a trigger.** `instagramJourney`
  runs at 09:00 JST and posts about a day that has already ended. Visit
  triggers were rejected: they fire the moment a visit is written, which is
  usually while Petr is still standing in the onsen.
- **Instagram Login, not Facebook Login.** Three fewer Meta objects to keep
  alive for an account that exists to post one walk. The cost is that
  Page-scoped features are unavailable, location tagging in particular; since
  the decision below forbids location tags anyway, the trade costs nothing.
- **No location tags, at all.** Not "sometimes", not "for onsens only": an
  onsen tag on an evening post narrows tonight's lodging to a village.
- **A rolling 5-day window, one post per run, oldest first.** This is the whole
  retry story. A day whose track was published late, or whose run hit a network
  error, is picked up by a later morning; there is no queue, no manual trigger
  and no alert to act on from a mountain road.
- **Only Petr's own visit photos.** Catalog photos from 88onsen.com are never
  posted. The licence granted by 九州観光機構 on 2026-08-31 is conditioned on
  per-photo credit plus a link back to the source page, which an Instagram
  carousel cannot express. Same conclusion as the website reached.
- **A photoless day is skipped, not faked.** No text card, no placeholder.
- **Bilingual captions, English first, Japanese written as Japanese**, per
  docs/brand-voice.md. The caption builder is pure and unit-tested; the
  Firestore assembly is separate from it.
- **The token lives in Firestore, seeded from Secret Manager**, mirroring the
  Strava refresh token: it rotates on refresh, so the secret can only ever be
  the first value.

## Consequences

- The account posts itself for the length of the walk with no laptop involved,
  and stops posting silently if the walk stops, which is the correct behaviour.
- The feed lags reality by a day. Anyone who wants live gets the journey site,
  which is what the bio link is for.
- Days with no photo leave gaps in the feed. Rendering a map or numbers card
  server-side would close that and is deliberately deferred, not designed away:
  it needs an image pipeline the project does not otherwise have.
- Stories and anything reactive stay manual. The API supports stories; the
  judgement of when one is worth posting does not automate.
- A long-lived token that goes 60 days without a refresh is unrecoverable by
  API and needs the OAuth flow run by hand again. The scheduled refresh makes
  that impossible while the schedule runs, and cannot help if it does not.
- One more private, admin-only Firestore surface (`journey_sync/instagram` and
  its `posts` subcollection). No rule matches it, so every client read is
  denied, the same as `journey_sync/strava`.

## Amendment, 2026-09-08: the API path is dropped, posting is manual

The publisher was never turned on, and will not be for this walk. The blocker
was never the code: it was getting an access token at all.

What happened, in order. The account was created and switched to Creator. The
Meta app was created on the Instagram Login path with exactly
`instagram_business_basic` and `instagram_business_content_publish`, no App
Review requirements. Then the App Dashboard's *Add account* popup refused the
authorization with "couldn't connect to Instagram". Two things were working
against it and neither is fixable by trying harder:

- The Instagram account was a day old and its password had been reset minutes
  before. Instagram declines third-party authorization in that state, and
  repeated attempts make it worse rather than better.
- The documented workaround, assigning the Instagram Tester role, has to be
  accepted from the Instagram side, and that screen exists only in the web
  interface. The Instagram mobile app shows Active/Expired/Removed and no
  invitations tab at all. Desktop instagram.com was refusing the login for the
  same reason as the first bullet, so the workaround was unreachable.

Waiting out the block would probably have worked. It was not worth it: the
whole point of the automation was to save effort during 61 days of walking, and
an unreliable dependency that needs a laptop to re-authorize every 60 days is a
poor trade for one post a morning that can be typed in two minutes.

So: **posting is manual for this walk.** The code stays, unexported and inert,
because it is finished and tested and the argument for it may hold again with
an established account. Nothing about the rest of ADR-012 is retracted. The
delayed posting, the ban on location tags, and the own-photos-only rule were
never really about the publisher; they are the reasons the account is safe to
run at all, and they now apply to Petr's thumbs instead of to a cron job.
