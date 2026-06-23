import Constants from 'expo-constants';

/**
 * Whether the in-app developer tools (mock-data generators, destructive
 * resets) are reachable.
 *
 * True in any local / dev-client build (`__DEV__`) and in release-mode builds
 * that opt in via the `enableDevTools` Expo extra. `app.config.js` derives that
 * extra from the `EXPO_PUBLIC_ENABLE_DEV_TOOLS` env var, which `eas.json` sets
 * to "true" on the `development` and `preview` profiles and leaves unset (→
 * false) on `production`. The App Store build therefore never exposes them.
 *
 * Gate BOTH the menu entry and the screen itself on this: Expo Router bundles
 * every file under `app/`, so without a redirect the screen stays reachable by
 * URL even when the entry row is hidden.
 */
export const DEV_TOOLS_ENABLED: boolean =
  __DEV__ || Constants.expoConfig?.extra?.enableDevTools === true;
