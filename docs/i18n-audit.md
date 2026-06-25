# i18n Coverage Audit — Kyuhachi app

**Date:** 2026-06-19
**Scope:** every `.ts`/`.tsx` file under `app/app/` and `app/src/`, plus the `en.ts`/`ja.ts` catalogs and `app.config.js` native strings.
**Goal:** when the user picks English the app shows English everywhere; when they pick Japanese it shows Japanese everywhere. The only acceptable untranslated content is genuine Firestore data (onsen names, addresses, Japanese place names).

This is an **audit only** — no component code or translation files were changed. Only this report was created.

---

## Summary

| Metric | Count |
|---|---|
| Hardcoded user-facing string literals in component/hook files (within `t()` scope) | **6** |
| Component/hook files affected by those literals | **2** (`app/onsens/[id].tsx`, `app/sign-in.tsx`) |
| Systemic gap: raw Firebase `error.message` shown as alert body (untranslated English) | **~13 call sites across 6 files** |
| Native iOS permission-prompt strings hardcoded in English (`app.config.js`) | **2** |
| `ja.ts` values that are accidentally English | **0** (3 are intentionally identical — brand / numeric / debug fallback) |
| `en.ts` values that are accidentally Japanese | **0** |
| Machine-untranslated / wrong translation entries | **0** |
| Genuinely-ambiguous cases for a human to decide | **2 categories** (Firestore `challenge_types` content; the systemic `error.message` body) |

**Headline:** the app is in very good i18n shape. Navigation (tab labels, header titles), screen titles, buttons, placeholders, empty-states, and confirmation dialogs are all routed through `t()`. The catalog is symmetric and the Japanese reads naturally. The only true hardcoded literals are **6 strings in two error paths** (alert titles/fallbacks). Beyond that, the most user-visible localization gap is **not a hardcoded literal at all** — it's that error alerts show the raw Firebase SDK message (always English) as their body, and that the iOS camera/photo permission prompts are English-only.

---

## Findings by file

### `app/app/onsens/[id].tsx` — 3 hardcoded alert titles

The three write paths (mark visited, save visit, upload photo) all use a hardcoded `'Error'` as the alert title.

| Line | Hardcoded string | Context | Suggested key | Exists? |
|---|---|---|---|---|
| [164](app/app/onsens/[id].tsx:164) | `'Error'` | `Alert.alert('Error', …)` in `handleMarkVisited` | `common.errorTitle` | ❌ no |
| [197](app/app/onsens/[id].tsx:197) | `'Error'` | `Alert.alert('Error', …)` in `handleSaveVisit` | `common.errorTitle` | ❌ no |
| [226](app/app/onsens/[id].tsx:226) | `'Error'` | `Alert.alert('Error', …)` in `uploadPhoto` | `common.errorTitle` | ❌ no |

Note: the alert **body** in all three is `error.message` (raw Firebase string) — see the systemic finding below.
A new `common.errorTitle` key (`'Error'` / `'エラー'`) would cover all three. `common.*` is justified here because this is a cross-cutting concern, not screen-specific. (None of the existing `onsenDetail.*` keys fit — there is no generic error title yet.)

---

### `app/app/sign-in.tsx` — 2 fallback strings + 1 thrown error message

| Line | Hardcoded string | Context | Suggested key | Exists? |
|---|---|---|---|---|
| [45](app/app/sign-in.tsx:45) | `'No identity token from Apple'` | `throw new Error(…)` — caught at line 52 and shown as the alert body via `error.message` | `signIn.errorNoAppleToken` | ❌ no |
| [52](app/app/sign-in.tsx:52) | `'Unknown error'` | Apple sign-in catch: `error … ? error.message : 'Unknown error'` (alert body fallback) | `common.unknownError` | ❌ no |
| [69](app/app/sign-in.tsx:69) | `'Unknown error'` | Email auth catch: same fallback | `common.unknownError` | ❌ no |

The `'No identity token from Apple'` string is genuinely user-facing: the thrown `Error` is an `Error` instance, so the catch block at line 52 surfaces `error.message` ("No identity token from Apple") as the alert body. It will appear in English regardless of locale in the (rare) case Apple returns no token.

A shared `common.unknownError` key (`'Unknown error'` / `'不明なエラーが発生しました'`) covers both fallbacks. The alert *titles* on this screen are already localized (`signIn.alertFailedSignIn`, `signIn.alertFailedCreate`).

---

## Systemic gap (not a literal, but user-visible): raw `error.message` as alert body

Across the app, the standard catch pattern is:

```ts
Alert.alert(t('someScreen.errorTitle'), error instanceof Error ? error.message : '');
```

The **title is localized**, but the **body is the raw Firebase SDK message**, which is always English (e.g. *"The password is invalid or the user does not have a password."*, *"A network error … has occurred."*). A Japanese-locale user gets a Japanese title and an English body. Per the CLAUDE.md rule ("every … error message must use `t('key')`"), this is a coverage gap, though it's a common and partly-defensible pattern (the message is a technical detail).

Call sites (title is localized; body is raw English):

| File | Lines |
|---|---|
| [app/sign-in.tsx](app/app/sign-in.tsx) | 52, 69 |
| [app/onsens/[id].tsx](app/app/onsens/[id].tsx) | 164, 197, 226 (title also hardcoded — see above) |
| [app/challenge/preview.tsx](app/app/challenge/preview.tsx) | 107 |
| [app/challenge/list.tsx](app/app/challenge/list.tsx) | 151, 177 |
| [app/routes/index.tsx](app/app/routes/index.tsx) | 94, 156, 184 |
| [src/hooks/useActiveChallengeProgress.ts](app/src/hooks/useActiveChallengeProgress.ts) | 332, 345 |

**Recommendation (human decision):** either (a) drop the raw body and rely on the localized title alone, (b) map the handful of common Firebase Auth error codes (`auth/invalid-credential`, `auth/email-already-in-use`, `auth/network-request-failed`, `auth/weak-password`, …) to localized `t()` messages, or (c) accept it as a deliberate technical detail. This is flagged as **ambiguous** because it's a design call, not a clear bug.

---

## Native iOS strings (`app/app.config.js`) — out of strict scope, but user-facing

These are shown in the iOS system permission dialogs when the user taps **Add Photo → Take Photo / Choose from Library** on the onsen detail screen. They are hardcoded English and are **not** localized (they live outside the `react-i18next` system; iOS localizes `InfoPlist` strings via `InfoPlist.strings` / `CFBundleLocalizations`, not `t()`).

| Line | Hardcoded string |
|---|---|
| [53](app/app.config.js:53) | `"Allow Kyuhachi to access your camera to take visit photos."` (`cameraPermission`) |
| [54](app/app.config.js:54) | `"Allow Kyuhachi to access your photos to add visit photos."` (`photosPermission`) |

**Recommendation:** to give Japanese users a Japanese permission prompt, supply localized `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` via an `InfoPlist.strings` localization (or the `expo-localization` config plugin). Listed here for completeness since it directly affects "as much Japanese as possible," but it falls outside the `app/app` + `app/src` scope and cannot be fixed in the `t()` catalog.

---

## Catalog audit — `en.ts` / `ja.ts`

### (a) `ja.ts` values that are actually English
**None that are bugs.** Three values are *intentionally* identical to English and are correct:

| Key | Value (both locales) | Why it's fine |
|---|---|---|
| `home.title` | `'Kyuhachi'` | Brand/product name (romaji wordmark), deliberately identical in every locale. |
| `home.progress` | `'{{visited}}/{{total}}'` | Pure numeric format, no words to translate. |
| `challengeRules.conditionUnknown` | `'{{type}}: {{value}}'` | Defensive fallback for an unknown tier-condition type that should never occur in practice; effectively a debug format. Low priority, but note it would render a raw `type: value` string if ever hit. |

### (b) `en.ts` values that are accidentally Japanese
**None.** Every English value is English. (`home.title: 'Kyuhachi'` is the romaji brand name, not stray Japanese.)

### (c) Machine-untranslated / wrong entries
**None found.** The Japanese is natural and idiomatic. A few things that look suspect but are actually correct:

- **Plural duplicates are correct.** `minVisits_one` ≡ `minVisits_other`, `maxFasterVisits.limit_one` ≡ `limit_other`, and `maxCalendarDays_one` ≡ `maxCalendarDays_other` are identical in `ja.ts`. Japanese has no grammatical plural, so i18next correctly resolves both forms to the same string. (In `en.ts` the singular/plural forms differ, as they should.)
- **Terminology is consistent.** `称号` is used throughout for the bronze/silver/gold "tier" concept (`tiers`, `howTiers`, `claimTier`, etc.) — a sensible, consistent rendering.
- The `Record<keyof typeof en, string>` typing on `ja.ts` guarantees no missing/extra keys (a divergence is a compile error), so the two files are structurally in sync.

---

## Navigation / header audit (task item 4)

All navigation chrome is localized — no hardcoded titles or labels:

| File | Element | Status |
|---|---|---|
| [app/(tabs)/_layout.tsx](app/app/(tabs)/_layout.tsx) | `tabBarLabel` + `headerTitle` for all 4 tabs | ✅ `t('tabs.*')`, `t('map.title')`, `t('onsenList.title')`, `t('menu.title')` |
| [app/(tabs)/map.tsx](app/app/(tabs)/map.tsx) | dynamic `headerTitle` | ✅ route name (Firestore data) with `t('map.title')` fallback |
| [app/_layout.tsx](app/app/_layout.tsx) | root `Stack` | ✅ `headerShown: false`, no titles |
| [app/onsens/[id].tsx](app/app/onsens/[id].tsx) | `Stack.Screen` title | ✅ `onsen.name` (Firestore) / `''` during load |
| [app/challenge/new.tsx](app/app/challenge/new.tsx) | `Stack.Screen` title | ✅ `t('challengeNew.title')` |
| [app/challenge/preview.tsx](app/app/challenge/preview.tsx) | `Stack.Screen` title | ✅ `challengeType.name` (Firestore) / `''` |
| [app/challenge/list.tsx](app/app/challenge/list.tsx) | `Stack.Screen` title | ✅ `t('challengeList.title')` |
| [app/challenge/rules.tsx](app/app/challenge/rules.tsx) | `Stack.Screen` title | ✅ `t('challengeRules.title')` |
| [app/routes/index.tsx](app/app/routes/index.tsx) | `Stack.Screen` title | ✅ `t('routes.selectTitle')` / `t('routes.title')` |

---

## Genuinely-ambiguous cases (human decision needed)

1. **`challenge_types` Firestore content will not switch with the app's language toggle.** The following are rendered verbatim from Firestore and are correctly treated as data (not `t()` keys): `challengeType.name`, `challengeType.description`, `challengeType.rules[]` ([ChallengeRulesView.tsx:27-48](app/src/components/ChallengeRulesView.tsx:27)), `tier.name`, `tier.conditionSummary` ([TierCarousel.tsx:74-75](app/src/components/TierCarousel.tsx:74)). These are *app-domain content* authored in the separate data repo, not onsen catalog data. **If the data repo stores them only in Japanese, an English-locale user sees Japanese tier names, summaries, descriptions, and rules** — even though the surrounding chrome is English. This may be intended (the challenge is a Japanese cultural artifact), but it's the biggest "English user still sees Japanese" surface in the app. Decide whether `challenge_types` should carry localized fields (e.g. `name_en`/`name_ja`) or stay Japanese-only by design. *(Note: the tier **condition bullets** — `minVisits`/`maxFasterVisits`/`maxCalendarDays` — are already localized via `t()` in [TierCarousel.renderCondition](app/src/components/TierCarousel.tsx:33); only the free-text `conditionSummary`, `name`, `description`, and `rules` come straight from Firestore.)*

2. **The `error.message` alert body** (systemic finding above) — design call on whether to localize, map, or drop it.

---

## Confirmed non-issues (correctly handled)

For the record, the following were checked and are **correct** — do not "fix" them:

- **Firestore data shown as-is (the allowed exception):** onsen `name`/`areaName`/`prefecture`/`address`/`phone`/`admissionFee`/`springQuality`/`businessHours.raw`/`websiteUrl` ([onsens/[id].tsx](app/app/onsens/[id].tsx)), map marker `title`/`description` ([map.tsx:149-150](app/app/(tabs)/map.tsx:149)), route `name` ([routes/index.tsx](app/app/routes/index.tsx)), challenge `name`/type `name` ([challenge/list.tsx](app/app/challenge/list.tsx)).
- **Brand wordmarks (documented as non-translatable):** `九八` ([(tabs)/index.tsx:19](app/app/(tabs)/index.tsx:19)) and `九\n八` ([sign-in.tsx:27](app/app/sign-in.tsx:27)). Both carry explicit comments that they are the visual identity and render identically in every locale.
- **Decorative glyphs / typographic symbols (not translatable text):** `›` chevrons ([onsens.tsx:94](app/app/(tabs)/onsens.tsx:94), [index.tsx:152](app/app/(tabs)/index.tsx:152)), `○` unvisited mark ([challenge/onsens.tsx:66](app/app/challenge/onsens.tsx:66)), `★` rating stars ([onsens/[id].tsx:357](app/app/onsens/[id].tsx:357)), `✓` visited check ([VisitedBadge.tsx:13](app/src/components/VisitedBadge.tsx:13)), `・` bullet markers ([ChallengeRulesView.tsx:47](app/src/components/ChallengeRulesView.tsx:47), [TierCarousel.tsx:83](app/src/components/TierCarousel.tsx:83)).
- **Developer-facing log (not user-facing):** `console.error('Failed to subscribe to user profile', …)` ([useActiveChallengeProgress.ts:151](app/src/hooks/useActiveChallengeProgress.ts:151)).
- **`route-import.ts`** throws `RouteImportError` with a machine `code` (`'parse'`/`'noTrack'`) that the screen maps to localized keys (`routes.importErrorParse` / `routes.importErrorNoTrack`) — correct separation of concerns; no user-facing literal in the lib.
- **`OnsenIcon`, `TierBadge`, `ProgressBar`, `AuthContext`** contain no user-facing text.

---

## Suggested catalog additions (to fix the 6 literals)

If acted on, two new shared keys close every true hardcoded-literal finding (plus one screen-specific key):

```ts
// common (cross-cutting error chrome)
'common.errorTitle': 'Error'        // ja: 'エラー'
'common.unknownError': 'Unknown error'   // ja: '不明なエラーが発生しました'

// sign-in
'signIn.errorNoAppleToken': 'Could not get an identity token from Apple.'
// ja: 'Appleからの認証トークンを取得できませんでした。'
```

Then: `app/onsens/[id].tsx` lines 164/197/226 → `t('common.errorTitle')`; `app/sign-in.tsx` lines 52/69 → `t('common.unknownError')`; line 45 thrown message → `t('signIn.errorNoAppleToken')`. (Catalog edits are out of scope for this audit; listed only as the remediation path.)
