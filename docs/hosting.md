# Firebase Hosting — legal pages

The Privacy Policy and Terms of Service are served as static HTML from Firebase
Hosting on the **default Firebase domain** (no custom domain):

| Path | URL |
|---|---|
| `/` | https://kyuhachi-fddcc.web.app/ |
| `/privacy` | https://kyuhachi-fddcc.web.app/privacy |
| `/terms` | https://kyuhachi-fddcc.web.app/terms |

The same site is also reachable at `https://kyuhachi-fddcc.firebaseapp.com/...`.
The app's About screen (`app/app/menu/about.tsx`) links the Privacy/Terms rows
to the `/privacy` and `/terms` URLs above.

## Source of truth → published HTML

The Markdown in `docs/legal/` is the single source of truth. It is converted to
self-contained HTML at deploy time:

```
docs/legal/privacy.md ──┐
docs/legal/terms.md ────┤  scripts/build-legal-html.mjs  ┌─ firebase/public/index.html
                        └────────────────────────────────┤─ firebase/public/privacy.html
                                                          └─ firebase/public/terms.html
```

- `firebase/public/` is **git-ignored** and regenerated on every deploy, so the
  HTML can never drift from the Markdown.
- The converter is dependency-free (no `marked`, no install step). It handles the
  Markdown features the legal copy uses: headings, paragraphs, bullet lists,
  bold, links, and `<…>` autolinks. If the copy ever needs richer Markdown,
  swap the converter for `marked` rather than extending it.

Regenerate locally without deploying:

```bash
npm run build:legal      # writes firebase/public/{index,privacy,terms}.html
```

Preview locally:

```bash
firebase serve --only hosting     # serves firebase/public on http://localhost:5000
```

## Deploy

```bash
npm run deploy:hosting            # => firebase deploy --only hosting
```

The `hosting.predeploy` hook in `firebase.json` runs `npm run build:legal`
first, so a deploy always publishes HTML freshly built from the current
Markdown. You cannot publish stale pages.

### This does NOT touch Functions

`firebase deploy --only hosting` deploys **only** Hosting. It does not deploy
Functions, Firestore rules, Storage rules, or anything else, and its predeploy
hook only builds static HTML.

> ⚠️ **Never run a bare `firebase deploy` from a worktree or feature branch.**
> A bare deploy pushes Functions/Firestore/Storage/Hosting all at once, and
> deploying Functions from a stale checkout regresses tier logic. Functions are
> only ever deployed from the main checkout on `master` via
> `npm run deploy:functions` (`--only functions`). Hosting is independent and
> uses `--only hosting`. Keep the two separate.

Because Hosting just uploads static files built from the Markdown, it is safe to
deploy from any checkout — but for a published-text-matches-`master` guarantee,
deploy Hosting from the main checkout on `master` after the change has merged.

## Cost

Negligible — effectively free.

The whole site is ~12 KB of static HTML (three pages, inline CSS, no JS, no
external assets). Firebase Hosting's no-cost allotment (the same on the Spark
free plan and as the free tier on Blaze) is:

| Resource | Free allotment | This site |
|---|---|---|
| Stored data | 10 GB | ~12 KB |
| Data transfer | 360 MB/day | ~12 KB per visit ⇒ ~30,000 visits/day before the cap |

This project is already on **Blaze** (required by Cloud Functions v2), so the
Spark-vs-Blaze question is moot: Hosting stays inside the free allotment and
costs **$0**. The only things that could ever incur a charge are storing >10 GB
or sustaining >360 MB/day of transfer (tens of thousands of daily page views) —
neither is plausible for two legal pages. Above the free tier the rates are
$0.026/GB-month stored and $0.15/GB transferred, i.e. cents even in an
implausible spike.

## Gotchas / notes

- **No effect on existing services.** Adding the `hosting` block to
  `firebase.json` does not change Auth, Firestore, Storage, or Functions. The
  emulator config is unchanged. Only a bare `firebase deploy` now also includes
  Hosting — which is why we always use the `--only` scripts.
- **Clean URLs.** `cleanUrls: true` serves `privacy.html` at `/privacy` and
  301-redirects `/privacy.html` → `/privacy`. `trailingSlash: false` keeps URLs
  without a trailing slash.
- **CI.** Hosting is deployed manually (like Functions); no workflow deploys it.
  If a CI deploy is ever added, it must (a) use `--only hosting`, and (b) have
  Node available so the predeploy `npm run build:legal` step can run.
- **First deploy** must be run by someone authenticated to the `kyuhachi-fddcc`
  project (`firebase login`); it enables the Hosting API on the project the
  first time automatically.
