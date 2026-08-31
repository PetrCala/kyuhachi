# Release notes

The "What's New" text for each App Store release, one directory per marketing
version, one file per App Store Connect locale:

```
release-notes/
  1.1.0/
    en-US.txt
    ja.txt
```

`scripts/asc/submit-version.mjs <version>` reads `release-notes/<version>/` when
it stages a version and writes each file to the matching localization. The file
is uploaded verbatim (trailing whitespace trimmed), so what you read here is
exactly what a user sees in the App Store.

## Why these are files and not a constant in the script

They used to be a `WHATS_NEW` object inside `submit-version.mjs`. Staging
PATCHes that text onto the version, so a release where nobody remembered to edit
the constant published the *previous* release's notes against the new build.
That is a silent failure: the staging run succeeds, the notes are wrong, and
nothing downstream checks. It nearly shipped 1.0.18's notes as 1.1.0's.

As files, the notes cannot be stale by omission. Staging a version with no
directory fails, and staging one whose directory is missing a locale the App
Store actually lists fails too, so a half-translated release stops the run
instead of quietly leaving one locale on last release's text.

## Why not `app/fastlane/metadata/`

`release_notes.txt` was deliberately removed from the fastlane metadata tree so
that a `fastlane metadata` run can never overwrite a live app's What's New. See
`docs/app-store-submission.md`. Keeping release notes here preserves that: this
directory is only ever read by the staging script, for one named version.

## Adding a release

Create `release-notes/<version>/` with one file per locale the App Store lists
(currently `en-US` and `ja`). Locale names must match App Store Connect exactly.
Keep each under 4000 characters, which is Apple's limit and what the script
enforces.

Write for someone who has not read the repo: what changed for them, not which
PR did it. The existing files are the house style, one `- ` bullet per change,
no trailing period.

Past versions are not backfilled. This directory starts at 1.1.0; earlier notes
live only in App Store Connect.
