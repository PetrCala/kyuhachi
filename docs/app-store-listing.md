# App Store listing copy

Every piece of text App Store Connect asks for, in English and Japanese, kept in
the repo as a `fastlane deliver` metadata tree. Two jobs at once: it is the copy
to paste into App Store Connect by hand today, and it is the input for an
automated `deliver` upload later without rewriting anything.

## Where it lives

```
app/fastlane/metadata/
├── copyright.txt                  non-localized
├── en-US/
│   ├── name.txt
│   ├── subtitle.txt
│   ├── keywords.txt
│   ├── description.txt
│   ├── promotional_text.txt
│   ├── support_url.txt
│   ├── marketing_url.txt
│   └── privacy_url.txt
├── ja/                            same eight files
└── review_information/
    ├── notes.txt                  what App Review needs to know
    ├── first_name.txt
    ├── last_name.txt
    └── email_address.txt
```

The demo account's email and password and the review contact number are **not**
in the tree. They reach App Store Connect through the environment instead, see
[Uploading](#uploading). `npm run check:metadata` fails if any of the three
files reappears, because `deliver` would upload whatever they contained.

One field per file, exactly as `deliver` expects. The file names are the
contract: `deliver` maps them to App Store Connect fields by name, so do not
rename them.

Screenshots are not in this tree. They live in
`app/fastlane/screenshots/<locale>/` and are not committed. The plan and the
captions for them are in [app-store-screenshots.md](app-store-screenshots.md).

Note that `ja` is the App Store locale code for Japanese (not `ja-JP`).

## Character limits

Apple enforces these. The copy in the tree is inside all of them.

| File | Limit | Notes |
|---|---|---|
| `name.txt` | 30 | "Kyuhachi", both locales |
| `subtitle.txt` | 30 | Japanese characters count as one each |
| `promotional_text.txt` | 170 | Editable without a new build, so it is the place for anything seasonal |
| `keywords.txt` | 100 | Total length of the whole list. Comma-separated, no space after the commas: a space costs a character |
| `description.txt` | 4000 | |

`release_notes.txt` ("What's New") is not in this table because it is not in
the tree; Apple's limit for it is still 4000 characters. See
[What's New](#whats-new-release-notes) below.

Check every field after an edit:

```bash
npm run check:metadata
```

The script reads the tree and prints each field's length against its limit,
exiting non-zero if anything is over.

## What's New (release notes)

`release_notes.txt` is deliberately not in this tree, for either locale.
"What's New" only makes sense once a build has shipped and you know exactly
what changed in it, so it is written directly in App Store Connect at
submission time instead. The `/release` skill (see [skills.md](skills.md))
drafts it from the commit range between the live version and the latest tag;
a human then pastes that draft into the new version's "What's New" field in
App Store Connect and adjusts it there.

Apple's 4000-character limit still applies. Check it by hand, or in the App
Store Connect field itself, since `npm run check:metadata` only checks fields
that live in the tree.

The file used to live here as the v1.0 feature summary. Once real releases
started writing their own "What's New" text in App Store Connect instead
(first at 1.0.15), the file went stale, and running `fastlane metadata` would
have silently overwritten a real release's notes with it. `npm run
check:metadata` now fails if `release_notes.txt` reappears in either locale
folder, so that can't happen again.

## Positioning: the one rule that matters

The full voice and positioning guide is [brand-voice.md](brand-voice.md); read
it before rewriting any of the copy. The non-negotiable core:

Kyuhachi tracks the 九州八十八湯 challenge and is **not** affiliated with the
organisers or with 88onsen.com. That constraint shaped the copy:

- The organisation's name is not the app name and does not headline the
  subtitle in either locale. The Japanese subtitle says 非公式アプリ outright.
- Both descriptions state the non-affiliation in the second paragraph and again
  in the closing note, matching the wording already in
  [legal/terms.md](legal/terms.md) and [legal/privacy.md](legal/privacy.md).
- The Japanese copy is written as Japanese for Japanese onsen enthusiasts, not
  translated from the English. It uses the app's own vocabulary (御湯印帳, 湯印,
  称号, スポット検索) rather than glossing the English terms. If it is ever
  revised, revise it in Japanese.
- Nothing in the copy claims a feature the app does not have. The feature list
  comes from the routes under `app/app/` and the strings in
  `app/src/i18n/en.ts` and `ja.ts`.

Keep all of that if the copy is rewritten.

## Before the first submission

The demo account (a seeded user with a challenge in progress and enough visits
that every screen has content) is created by
[scripts/seed-demo-account.ts](../scripts/seed-demo-account.ts). `notes.txt`
already tells the reviewer where the credentials are and explains why the app
has no anonymous mode.

Confirm before submitting:

- The app name is still free on the App Store in both storefronts. Last checked
  and free:

  ```bash
  curl "https://itunes.apple.com/search?term=kyuhachi&entity=software&country=jp"
  ```

- The privacy URL resolves. It is served from Firebase Hosting and built from
  `docs/legal/privacy.md`, see [hosting.md](hosting.md). Deploy Hosting before
  submitting if the legal copy has changed.
- The App Privacy questionnaire in App Store Connect matches
  `docs/legal/privacy.md`. That questionnaire is not part of this tree; it is
  filled in by hand in the web UI.

## Uploading

The `metadata` lane in [app/fastlane/Fastfile](../app/fastlane/Fastfile) uploads
the text and the screenshots together. Run it from `app/`:

```bash
cd app && ASC_API_KEY_PATH=/path/to/asc_api_key.json DEMO_USER=... DEMO_PASSWORD=... REVIEW_PHONE=... bundle exec fastlane metadata
```

`ASC_API_KEY_PATH` is the same App Store Connect API key JSON the `beta` lane
uses (`{ key_id, issuer_id, key, in_house }`), so a key that can already ship to
TestFlight can do this too. The other three are the fields deliberately kept out
of the tree.

What the lane does and does not do:

- Uploads every locale's text plus `fastlane/screenshots/<locale>/`.
- `skip_binary_upload: true`, so it never touches the build. Upload that through
  the `beta` lane as usual.
- `overwrite_screenshots: true`, so re-running after a re-capture replaces the
  set instead of appending to it.
- Leaves "What's New" alone. `release_notes.txt` isn't in the tree (see
  [What's New](#whats-new-release-notes) above), so `deliver` never touches
  that field.
- **`submit_for_review: false`.** It fills the version in App Store Connect and
  stops. Pressing Submit stays a human decision.

Run `npm run check:metadata` first: it catches an over-length field before
Apple does, and fails if a demo credential has been written into the tree.

Keep this lane out of the deploy workflow. `beta` and `preview` upload builds to
TestFlight and never touch the public listing; that separation is the reason a
bad merge cannot rewrite your store page.

Pasting by hand into App Store Connect also works and needs no key. The tree
stays the source of truth either way, so paste from it rather than editing in
the browser and letting the two drift. The one exception is "What's New":
App Store Connect is the source of truth for that field, not the tree.
