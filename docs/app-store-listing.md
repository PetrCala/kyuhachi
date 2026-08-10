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
│   ├── release_notes.txt
│   ├── support_url.txt
│   ├── marketing_url.txt
│   └── privacy_url.txt
├── ja/                            same nine files
└── review_information/
    ├── notes.txt                  what App Review needs to know
    ├── demo_user.txt              placeholder, see below
    ├── demo_password.txt          placeholder, see below
    ├── first_name.txt
    ├── last_name.txt
    ├── email_address.txt
    └── phone_number.txt           placeholder
```

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
| `release_notes.txt` | 4000 | "What's New". Required from the second version onward; v1.0 uses it as a feature summary |

Check every field after an edit:

```bash
npm run check:metadata
```

The script reads the tree and prints each field's length against its limit,
exiting non-zero if anything is over.

## Positioning: the one rule that matters

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

Three placeholders have to be replaced. They are deliberately loud so a
`deliver` run cannot quietly upload them:

| File | Replace with |
|---|---|
| `review_information/demo_user.txt` | the demo account's email address |
| `review_information/demo_password.txt` | the demo account's password |
| `review_information/phone_number.txt` | a contact number for App Review |

The demo account itself (a seeded user with a challenge in progress and enough
visits that every screen has content) is set up separately. `notes.txt` already
tells the reviewer that the credentials are in these fields and explains why the
app has no anonymous mode.

Also confirm before submitting:

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

Today: open App Store Connect and paste each file into the matching field. The
tree is the source of truth, so paste from it rather than editing in the browser
and letting the two drift.

Later, when the metadata upload is automated, add a `deliver` lane to
[app/fastlane/Fastfile](../app/fastlane/Fastfile):

```ruby
desc "Upload App Store metadata and screenshots (no binary)"
lane :metadata do
  deliver(
    api_key_path: ENV.fetch("ASC_API_KEY_PATH"),
    skip_binary_upload: true,
    skip_app_version_update: false,
    force: true,              # no HTML preview prompt on CI
    precheck_include_in_app_purchases: false,
  )
end
```

`deliver` picks up `fastlane/metadata/` and `fastlane/screenshots/` relative to
the `fastlane/` directory automatically, so the lane needs no paths. Run it from
`app/`. Add `skip_screenshots: true` while the screenshot set is still empty.

Do not wire this into the deploy workflow without thinking it through: the
existing `beta` and `preview` lanes upload builds to TestFlight only and never
touch App Store metadata, and that separation is worth keeping.
