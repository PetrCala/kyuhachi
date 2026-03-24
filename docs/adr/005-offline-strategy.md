# ADR-005: Offline-First via Firestore Persistence

**Date:** 2026-03-24
**Status:** Accepted

## Context

Users of the 九州八十八湯 challenge visit onsens across rural Kyushu, where mobile connectivity is unreliable. Core app flows must work without a network connection:
- Browsing the onsen catalog (list + detail)
- Viewing challenge progress and visit history
- Recording a new visit at a remote onsen

Options considered:
1. **Online-only** — simple; app fails gracefully with an error screen when offline
2. **Offline-first via Firestore persistence** — Firestore SDK caches all reads locally; writes are queued and synced when connectivity resumes
3. **Custom sync with local SQLite** — full control; significant complexity

## Decision

Enable Firestore offline persistence (`persistentLocalCache`) from day one. This is not optional and will not be removed later.

`@react-native-firebase` Firestore uses the native iOS persistence layer, which survives app restarts. Queued writes are preserved across restarts and synced when connectivity is restored.

What works offline:
- Full onsen catalog (list + detail) after first load
- User's challenges, visits, and route plans
- Creating a new visit (queued write)

What requires connectivity:
- Photo uploads to Firebase Storage
- Authentication (sign in / token refresh)
- Map tile rendering (Apple Maps)

## Consequences

- **Persistence must be initialized before any Firestore access** — the SDK initialization order matters; persistence configuration cannot be deferred
- **Never assume catalog is loaded** — on first launch with no cache, the catalog requires a network fetch; all screens must handle loading and empty states
- **Visit creation is resilient** — a visit written offline will sync automatically; no explicit retry logic needed in app code
- **`waitForPendingWrites()` before critical navigation** — if the app navigates away after a write and the user force-quits, the write may not have synced; use `waitForPendingWrites()` before screens that depend on a write being confirmed
- **Onsen images are not pre-fetched** — `expo-image` disk cache handles image caching lazily on first view; images are not available offline until they have been viewed at least once
- **No custom sync layer** — Firestore handles all sync; the app does not maintain a separate offline queue or local database
