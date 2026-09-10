# ADR-013: Durable Upload Queue for Visit Photos

**Date:** 2026-09-10
**Status:** Accepted. Amends [ADR-005](005-offline-strategy.md), which listed
photo uploads as simply requiring connectivity and ruled out any app-side queue.

## Context

Visits are recorded at onsens, often with no signal. The visit document already
copes: its write is not awaited and queues in Firestore's persistence. Photos
did not. The editor uploaded them straight after Save, from a detached function
holding the photo list only in memory:

- With no signal the Storage SDK retried for a while, then gave up with a single
  "edit the visit to try again" alert. Every offline visit meant picking its
  photos again later, by hand.
- A photo taken with the in-app camera exists only in the app's caches folder
  (the picker doesn't save it to the library), so a failed upload lost it for good.
- If iOS suspended or killed the app before the upload finished, the list was
  gone with no alert at all.
- One failed upload discarded every new photo in that save, while the ones
  already uploaded were left orphaned in Storage.

The owner is walking the route for weeks from 2026-09-30, logging most visits
offline, so this was the common case, not an edge case.

## Decision

Visit photos go through a small device-local queue
(`app/src/lib/photo-queue.ts`, drained by `PhotoQueueContext`):

- **Save** copies each freshly picked photo into `Documents/visit-photo-queue/`
  (never purged by iOS) and stores one job per visit in AsyncStorage: the
  visit's final ordered photo list (uploaded URLs and queued file names), plus
  the Storage URLs to delete. The visit doc write itself is unchanged.
- **Drain** runs on launch, on sign-in, on every return to the foreground, and
  every minute while jobs wait. It uploads one photo at a time and records each
  URL as soon as it has it, so a crash resumes rather than restarts. Once nothing
  is local it writes `photoUrls` onto the visit, deletes removed photos from
  Storage, then drops the job and its files.
- **Editing** a visit with photos still waiting loads the job's list, not the
  doc's. Saving replaces the job and bumps its revision; the drain re-reads the
  job after every step, so a newer save always wins.
- Deleting a visit, a challenge or the account discards the matching jobs.
- Jobs store file **names**, not URIs: the app container's path changes on update.

## Consequences

- Photos reach the visit, and the public journey site, when the app is next
  open with signal, instead of never. JS doesn't run in the background, so in
  practice that's the next time the app is opened somewhere with a connection.
- The visit card and the photo viewer show waiting photos from disk, with a
  "waiting to upload" line, so the owner sees what the editor saved.
- A job whose uploads keep failing is retried indefinitely, never dropped. Only
  a photo whose file has vanished from disk is removed from its job.
- There is now an app-side offline queue, which ADR-005 said there wouldn't be.
  It is limited to Storage uploads; Firestore persistence still handles every
  document write.
