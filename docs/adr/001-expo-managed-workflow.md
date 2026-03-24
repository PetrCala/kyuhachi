# ADR-001: Expo Managed Workflow + EAS Build

**Date:** 2026-03-24
**Status:** Accepted

## Context

The app targets iOS only. We need a React Native build pipeline that:
- Requires no Xcode maintenance on developer machines
- Supports config plugins for native modules (`@react-native-firebase`, `react-native-maps`)
- Delivers builds to TestFlight without manual steps
- Has a small maintenance surface for a one-person project

Options considered:
1. **Expo managed workflow + EAS Build** — Expo manages native configuration declaratively via config plugins; EAS Build runs cloud builds on Apple Silicon; EAS Submit delivers to TestFlight
2. **Expo bare workflow** — ejects to full native project; full control but requires Xcode/Android Studio maintenance
3. **React Native CLI** — no Expo; maximum control; maximum maintenance burden

## Decision

Use Expo managed workflow with EAS Build and EAS Submit.

Config plugins handle all native setup (`@react-native-firebase`, Sign in with Apple, App Check). No `ios/` directory is checked into the repo. EAS Build produces the `.ipa`; EAS Submit uploads it to TestFlight via App Store Connect API.

## Consequences

- **No Xcode required** to build or deploy — CI runs on Ubuntu via EAS cloud builders
- **Config plugins must exist** for every native dependency; if a plugin is missing or broken, we cannot use that package in managed workflow
- **EAS Build has a cost** beyond the free tier; acceptable at small scale
- **Native debugging is harder** — no local `ios/` project to inspect; `expo-dev-client` mitigates this for development
- **Upgrades are declarative** — `expo upgrade` handles SDK bumps; no native merges
