# ADR-002: @react-native-firebase over Firebase JS SDK

**Date:** 2026-03-24
**Status:** Accepted

## Context

Firebase offers two SDK families for React Native:
1. **`@react-native-firebase`** — native modules wrapping the iOS/Android Firebase SDKs
2. **Firebase JS SDK (`firebase`)** — pure JavaScript, works on any JS runtime including React Native

The choice affects offline persistence, authentication, and long-term reliability.

Key requirements:
- Offline-first Firestore persistence (non-negotiable; see ADR-005)
- Sign in with Apple (native iOS authentication)
- App Check with DeviceCheck (iOS-only hardware attestation)

## Decision

Use `@react-native-firebase` exclusively. Do not install the Firebase JS SDK.

## Consequences

- **Offline persistence** uses the native iOS Firestore SDK's `PersistentLocalCache`, which is more battle-tested on mobile than the JS SDK's IndexedDB-based implementation
- **Sign in with Apple** uses the native `ASAuthorizationAppleIDProvider`; the JS SDK would require a custom OAuth flow
- **App Check + DeviceCheck** requires native integration; not available in the JS SDK on iOS
- **Bundle size** is smaller — native code is not in the JS bundle
- **Web target is impossible** — `@react-native-firebase` has no web support; this is acceptable since the app is iOS-only
- **Expo config plugin required** — `@react-native-firebase/app` provides one; managed workflow compatible
- **More complex local setup** — dev builds require `expo-dev-client`; Expo Go is not compatible with native Firebase modules
