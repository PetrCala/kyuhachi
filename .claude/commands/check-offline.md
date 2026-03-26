<!-- Summary in docs/skills.md. Run /update-skills-docs after modifying this file. -->

Audit app/ for compliance with the offline-first requirement from CLAUDE.md.

Read CLAUDE.md (the offline strategy section) and docs/implementation-plan.md (section 6: Offline/Data Sync Strategy) first.

Then scan every screen and component in app/ that touches Firestore data and check for:

1. **Missing loading state** — any screen that renders Firestore data without handling the case where data has not loaded yet (no loading indicator, no empty/skeleton state). Every Firestore-backed screen must handle: loading, loaded, and error states.

2. **Assuming catalog is loaded** — any code that accesses onsen documents without checking that the data exists first. Per CLAUDE.md: "Never assume the catalog is loaded; always handle loading state."

3. **Hardcoded onsen IDs** — any string literal that looks like a kyuhachiId used directly in app code. Per CLAUDE.md: "Never hardcode onsen IDs in app code."

4. **Missing `waitForPendingWrites()`** — any place where the app navigates or shows a success state immediately after a Firestore write without calling `waitForPendingWrites()`. This is required before any critical navigation that depends on the write completing.

5. **Online-only assumptions** — any code that assumes network connectivity for operations that should work offline (catalog browsing, viewing challenges and visits, viewing route plans, creating visits). Photo uploads and sign-in are correctly online-only.

For each issue: print the file path, line number, what the problem is, and what the fix should be.

Then fix what can be fixed directly. Flag anything that requires a larger structural change without modifying it.
