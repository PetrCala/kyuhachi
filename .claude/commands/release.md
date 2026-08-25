<!-- Summary in docs/skills.md. Run /update-skills-docs after modifying this file. -->

Audit whether the latest TestFlight build is ready to promote to the App Store, then hand the maintainer the short list of manual steps. This skill never submits, uploads, or changes anything in App Store Connect: the Submit button stays human (see docs/app-store-submission.md).

Run every step from the repo root. Report each check as PASS, WARN, or BLOCKER, then finish with the ordered manual steps.

### 1. Establish the versions

- Live App Store version: `curl -s "https://itunes.apple.com/lookup?id=6761064476&country=jp"`, read `results[0].version` and `currentVersionReleaseDate`.
- Repo version: `git fetch --tags origin` then take the highest `v*` tag. Sanity-check that `app/package.json` at that tag carries the same number.
- If the live version equals the latest tag, report that there is nothing to release and stop.

### 2. Changelog for the release range

`git log v<live>..v<latest> --oneline`, dropping `chore(release)` commits. Summarize the user-facing changes in one or two sentences per version; this is the draft for the "What's New" text. Flag anything in the range that only affects the website, docs, or CI as not worth mentioning in release notes.

### 3. Confirm the build exists

`gh run list --workflow=deploy.yml --branch=master --limit=5`. The run that produced `v<latest>` must be green: that is the TestFlight build the release will attach. A red or missing run is a BLOCKER; stop and report it.

### 4. Backend pairing

Check what the release range touches beyond the app:

- `functions/src/` changed: WARN that Functions must be deployed before the release, and always from the main checkout on `master`, never a worktree (see the deploy notes in docs/).
- `firebase/firestore.rules` or `firebase/firestore.indexes.json` changed: WARN to confirm the rules deploy ran (`gh run list --workflow=deploy-firestore-rules.yml`).

### 5. Drift checks (each only when its files changed in the range)

- Dependencies (`package.json`, `package-lock.json`) or `app/app.config.js` changed: WARN to re-run the privacy-manifest audit in docs/app-store-submission.md before submitting.
- `app/fastlane/metadata/` changed: run `node scripts/check-metadata-lengths.mjs` (BLOCKER on failure) and remind that the listing only updates via a manual `bundle exec fastlane metadata` run.
- `app/assets/icon.png` changed: remind to verify the generated 1024px icon has no alpha (steps in docs/app-store-submission.md).
- Permission-prompt strings or new native modules added: WARN to re-check the App Privacy answers against the collected-data table in docs/app-store-submission.md.
- `shared/src/types/support.ts` changed, or this is the first release carrying the tip jar: BLOCKER unless the three consumable products are at least "Ready to Submit" in App Store Connect and selected in the version's In-App Purchases section (steps in docs/tip-jar.md). Products submitted without a binary never leave "Waiting for Review".

### 6. Demo account

Always remind, never run unprompted: `npm run seed:demo` re-seeds the App Review account (env vars documented in docs/app-store-submission.md). The password rotation and the App Store Connect review-info update are the maintainer's.

### 7. Report

Print the PASS/WARN/BLOCKER table, the draft release notes, and then the manual steps in order:

1. Resolve any BLOCKERs and WARNs above.
2. Re-seed the demo account and rotate its password.
3. In App Store Connect (https://appstoreconnect.apple.com/apps/6761064476), create version `<latest>`, attach the TestFlight build, paste the release notes, confirm App Privacy and App Review Information, and submit.

Do not enable App Check enforcement while the build is in review.
