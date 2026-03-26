<!-- Summary in docs/skills.md. Run /update-skills-docs after modifying this file. -->

Run a pre-PR audit for this branch against the rules in CLAUDE.md.

First, identify what changed: run `git diff main...HEAD --name-only` to see the affected files. Read CLAUDE.md in full.

Then check each of the following. Report PASS, FAIL, or SKIP (if the check is not relevant to the changed files) for each item.

---

### Types
- [ ] Every Firestore collection accessed in new/changed code has a corresponding type in `shared/src/types/`
- [ ] No `as any` casts on Firestore data or Firebase Auth objects
- [ ] No locally defined type shapes that duplicate or should live in `shared/src/types/`

### Styling
- [ ] No color literals outside `app/src/theme/colors.ts`
- [ ] No raw spacing, fontSize, fontWeight, or borderRadius numbers in component files
- [ ] No `style={{ ... }}` with literal values
- [ ] `StyleSheet.create()` is at module level, not inside component function bodies

### Firestore / data
- [ ] No hardcoded `kyuhachiId` values in app code
- [ ] All onsen list queries filter `isActive == true` (deprecated onsens must be excluded from active views)
- [ ] No direct writes to `/onsens`, `/challenge_types`, or `catalog_meta` from the app
- [ ] `waitForPendingWrites()` called before any navigation that depends on a write completing

### Offline
- [ ] Every Firestore-backed screen handles loading, loaded, and empty/error states
- [ ] No code assumes the catalog is loaded on first render
- [ ] No operation that should work offline (catalog browse, viewing visits/challenges) requires network

### Platform
- [ ] No `Platform.OS === 'android'` blocks or Android-specific workarounds
- [ ] No imports from `_archive/`

### Functions (if functions/src/ was changed)
- [ ] No new Function that routes standard user reads/writes (Functions are for triggers and admin ops only)
- [ ] Firestore security rules updated and tested against the emulator if the data model changed

---

For every FAIL: print the file, line, and what needs to change. Fix all FAIL items that are mechanical (style, type, import). Flag structural FAILs without modifying them, and list them clearly as blockers.
