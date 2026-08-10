# Onsen catalog photos: exposure and what to do about it

*Written: 2026-08-10.*

## Background

The onsen catalog's `imageUrl` and `blurhash` fields (`shared/src/types/onsen.ts`)
are populated by the data repo's rehost pipeline (`kyuhachi-data/publisher/image_processor.py`,
`backfill_images.py`): each onsen's photo is scraped from 88onsen.com, resized,
re-encoded to WebP, and uploaded to Firebase Storage at
`onsen-images/{kyuhachiId}.webp` in the `kyuhachi-fddcc.firebasestorage.app`
bucket.

There is no cleared copyright provenance for these source photos. Shipping the
app to the App Store with them on screen would be a live exposure with no
good defence. The factual onsen data (name, address, hours, fees) has no such
problem and is unaffected by any of this.

## What this PR changes

- The app no longer renders or prefetches catalog photos. Gated by a single
  constant, `SHOW_CATALOG_PHOTOS` in
  [`app/src/lib/catalog-photos.ts`](../app/src/lib/catalog-photos.ts): flipping
  it back to `true` is the entire re-enable path.
- Nothing upstream changes. `imageUrl` and `blurhash` stay on `OnsenDocument`,
  the data repo keeps publishing both, and the objects stay in Storage. If
  provenance is later cleared, re-enabling is cheap.
- [`firebase/storage.rules`](../firebase/storage.rules) now has an explicit
  `allow read, write: if false;` block for `onsen-images/{fileName}`. Read on
  for why this rule is necessary but not sufficient.

## Why the photos are still publicly reachable, and the rules change alone can't fix that

`firebase/storage.rules` had no match block at all for `onsen-images/`, so
under Firebase Storage's default-deny model, ordinary SDK/REST reads of that
path were already denied before this PR. That is not how the photos are
actually being served.

`image_processor.py`'s `upload()` writes each object with a
`firebaseStorageDownloadTokens` custom metadata value (a UUID derived
deterministically from the `kyuhachiId`), and `download_url()` builds URLs of
the form:

```
https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
```

This is Firebase's "download URL" mechanism: a request bearing a valid token
is served by the `firebasestorage.googleapis.com` endpoint independently of
Storage Security Rules. Rules govern the Storage SDK/REST surface; a
tokenized download URL is a separate authorization path that rules cannot see
or revoke. The comment already in `image_processor.py` says this outright:
"Tokenised download URLs are served publicly without a Storage-rules change
(the token gates access)." Nothing found in the rehost pipeline touches
bucket or object IAM (no `allUsers`/`objectViewer` grants); the exposure is
entirely the token mechanism, not a public ACL.

So: the new `storage.rules` block is real defence in depth (it stops any
future rules-based path from ever being opened for this prefix, and it
documents intent), but every `imageUrl` currently published to Firestore
still works as a public link after this PR merges, until the tokens
themselves are invalidated.

## What has to happen outside this repo

Invalidating the existing download tokens is the actual fix. This is a
one-time operation on live Storage objects, so it belongs to a human running
it deliberately, not to an automated PR. Two ways to do it, in order of
preference:

**1. Google Cloud Console (no scripting, easiest to get right the first time)**

Cloud Console → Storage → `kyuhachi-fddcc.firebasestorage.app` bucket →
`onsen-images/` → for each object, Edit metadata → delete the
`firebaseStorageDownloadTokens` custom metadata entry → Save. Any URL built
from the old token then 404s.

**2. A script against the Storage JSON API**

The data repo's own uploader already authenticates this way (gcloud
Application Default Credentials, `cloud-platform` scope), so the same
approach can list and patch every object in one pass. Sketch, for review, not
for unattended execution:

```python
import requests
from google.auth import default
from google.auth.transport.requests import Request

creds, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
creds.refresh(Request())
bucket = "kyuhachi-fddcc.firebasestorage.app"
headers = {"Authorization": f"Bearer {creds.token}"}

objects = requests.get(
    f"https://storage.googleapis.com/storage/v1/b/{bucket}/o",
    params={"prefix": "onsen-images/"},
    headers=headers,
).json().get("items", [])

for obj in objects:
    name = obj["name"]
    resp = requests.patch(
        f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{requests.utils.quote(name, safe='')}",
        headers={**headers, "Content-Type": "application/json"},
        json={"metadata": {"firebaseStorageDownloadTokens": None}},
    )
    print(name, resp.status_code)
```

Setting a custom metadata key to `null` in a JSON API PATCH removes that key,
which is what invalidates the token. Verify against a single object first
(`--limit`-style manual testing) before running it over the whole prefix.

This does not delete any object and does not touch bucket or object ACLs, so
it is outside the destructive operations this task was told to avoid, but it
is still a live production change: a human should run it, not this PR.

**Reversal.** The token is derived deterministically
(`uuid.uuid5(_TOKEN_NAMESPACE, kyuhachiId)` in `image_processor.py`), so
re-running the data repo's `backfill_images.py --commit` after tokens are
cleared regenerates the exact same token and restores the exact same public
URL. Clearing tokens now does not require any change to how the data repo
computes them later.

## What's explicitly not done here

- No object was deleted, and no bucket-wide ACL or IAM change was made or
  proposed as something to run automatically.
- The separate private data repo (`kyuhachi-data`) is untouched: it keeps
  publishing `imageUrl` and `blurhash`, and keeps its rehost pipeline as-is.
- `shared/src/types/onsen.ts` still types both fields; no Firestore data was
  changed.
