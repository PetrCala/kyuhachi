# Kyuhachi — Project Skills

Slash commands available in this repo. All skills live in `.claude/commands/` and are available to any agent working here.

## Summary

| Skill | Arguments | When to use |
|---|---|---|
| `/new-screen` | file path | Before writing any new screen |
| `/check-styles` | — | After writing UI code, before committing |
| `/check-types` | — | Whenever you touch Firestore reads/writes |
| `/check-offline` | — | When implementing any Firestore-backed screen |
| `/pr-checklist` | — | Final pass before opening a PR |
| `/update-skills-docs` | — | After adding or modifying a skill file |

---

### `/new-screen <path>`

Scaffolds a new Expo Router screen with the correct structure: `SafeAreaView` root, theme tokens imported, `StyleSheet.create()` at module level, strict TypeScript, no placeholder comments. Handles dynamic route segments by reading params from `shared/src/types/`.

```
/new-screen app/app/onsen/[id].tsx
```

---

### `/check-styles`

Audits every `.ts` and `.tsx` file in `app/` for styling violations — color literals, raw spacing/font/radius numbers, inline style objects, `StyleSheet` declared inside a component body — and fixes them.

```
/check-styles
```

---

### `/check-types`

Audits `app/` and `functions/src/` for untyped Firestore data, inline type shapes that belong in `shared/src/types/`, missing type coverage for accessed collections, and `as any` casts. Fixes what it can; flags missing types as blockers without inventing them.

```
/check-types
```

---

### `/check-offline`

Audits Firestore-backed screens for offline-first compliance: missing loading/error states, assumptions that the catalog is loaded, hardcoded onsen IDs, missing `waitForPendingWrites()` before critical navigation, and online-only assumptions on operations that must work offline.

```
/check-offline
```

---

### `/pr-checklist`

Runs a full pre-PR gate across the changed files: types, styling, Firestore data rules, offline compliance, platform restrictions (no Android code), and Functions constraints. Reports PASS/FAIL/SKIP per item, fixes mechanical failures, flags structural blockers.

```
/pr-checklist
```

---

### `/update-skills-docs`

Regenerates this file from the current state of `.claude/commands/`. Run after adding or modifying any skill.

```
/update-skills-docs
```
