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

## What fills the hero slot instead

*Added 2026-08-11.*

Gating the photos left a 200-220pt photo-shaped hole tinted with the average
colour of the very photos being walked away from — no information in it, and
still coupled to `blurhash`. Licensed per-onsen photography isn't obtainable
(Wikimedia covers towns, not facilities; generic stock on a named business is a
factual misstatement; Google Places Photos forbids caching and breaks
offline-first), so the slot stopped imitating a photo and started carrying
information instead.

[`app/src/components/OnsenHeroMark.tsx`](../app/src/components/OnsenHeroMark.tsx)
draws a deterministic SVG mark from data the catalog already publishes:
`prefecture` picks the ground ink (one per Kyushu prefecture), `springQuality`
picks the traditional pattern tiled over it (青海波 for a chloride spring, 麻の葉 for
the mineral springs, bubbles for a carbonated one, steam otherwise), and the
stable `kyuhachiId` seeds the pattern phase and the composition, so every onsen
looks like itself on every device and after a reinstall. The derivation is
[`app/src/lib/onsen-mark.ts`](../app/src/lib/onsen-mark.ts); see
[`images/onsen-hero-mark.png`](images/onsen-hero-mark.png) for the set at a
glance.

Nothing about it is networked, so it works offline and carries no licensing
surface of its own. It reads unmistakably as a drawn mark, so it never sets an
expectation of photography it can't meet. Nothing on that path reads `blurhash`
any more — the field survives only as the placeholder for the photo branch — so
the data repo is free to stop publishing either field whenever it wants.
`OnsenHeroImage`'s photo branch is untouched, so re-enabling remains the
one-constant flip described above, and shared user visit photos will land in the
same branch when they arrive.

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

## Permission request sent to the rights holder

*Added 2026-08-12.*

The clean fix for all of this is a licence, so one was asked for. The request
went through the 88onsen.com contact form
(<https://www.88onsen.com/inquiry>, category サイトについて) rather than email:
the site publishes no address, and the form is the only public route. The site
is operated by 一般社団法人 九州観光機構; its 事務局 sits with JR九州's sales
department.

The request asks to display the catalog photos in-app and offers per-photo
credit plus a link back, no ads or paid features, and takedown on request. It
discloses that the photos were already rehosted during development and are
currently disabled, commits to deleting them on a refusal, and asks explicitly
whether the photo rights sit with 九州観光機構 or with each individual facility.

**No reply changes anything until it arrives. Until then the flag stays off.**

### What each answer means

| Reply | What to do |
|---|---|
| Yes, unconditional | Flip `SHOW_CATALOG_PHOTOS` to `true`. This is the one-constant path described above, and the only reply for which that claim is actually true. |
| Yes, with attribution conditions | Not a one-constant flip. Nothing on the current hero path renders credit: `OnsenHeroMark` replaced the photo slot outright, and `OnsenHeroImage`'s photo branch has no attribution affordance. Build that first, then flip. |
| Rights belong to each facility | 148 separate approaches is not proportionate to this app. Treat as a refusal unless there is a deliberate decision to pursue it. |
| No, or no reply by 2026-09-12 | Run the token clearing described above. |

### The refusal path has a second half

Clearing the tokens is necessary but does not hold on its own. The token is
`uuid5(_TOKEN_NAMESPACE, kyuhachiId)`, so the next `backfill_images.py --commit`
in the data repo regenerates the identical token and restores the identical
public URL. A refusal therefore means two changes, not one:

1. Clear `firebaseStorageDownloadTokens` on the live `onsen-images/` objects.
2. Stop the data repo publishing `imageUrl`/`blurhash` and stop the rehost
   pipeline writing new objects, so step 1 is not silently undone.

Deleting the Storage objects themselves is the third step, and the one to do
last and deliberately.

## What's explicitly not done here

- No object was deleted, and no bucket-wide ACL or IAM change was made or
  proposed as something to run automatically.
- The separate private data repo (`kyuhachi-data`) is untouched: it keeps
  publishing `imageUrl` and `blurhash`, and keeps its rehost pipeline as-is.
- `shared/src/types/onsen.ts` still types both fields; no Firestore data was
  changed.
