import { getApp } from '@react-native-firebase/app';
import { initializeAppCheck } from '@react-native-firebase/app-check';

/**
 * Optional pinned debug token for local development. Leave it unset and the
 * native debug provider prints a freshly generated token to the Xcode / Metro
 * console on first launch; register that token in the Firebase console to make
 * the simulator or dev client attest. Set it (via `.env` or the EAS profile) to
 * reuse one token across reinstalls. Release builds ignore it entirely.
 *
 * See docs/app-check.md.
 */
const DEBUG_TOKEN = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

let initialization: Promise<void> | null = null;

/**
 * Start App Check for the default Firebase app, once per process.
 *
 * MONITORING ONLY. Nothing is enforced anywhere: Firestore, Storage and
 * Functions all still accept unattested requests. All this does is make real
 * builds request an attestation token and attach it to their Firebase calls, so
 * the App Check metrics in the Firebase console start reporting what share of
 * traffic is verified. Enforcement is a separate, deliberate step taken only
 * after those metrics look healthy; flipping it early would lock out every
 * already-installed build. Rollout order: docs/app-check.md.
 *
 * Provider choice is gated on `__DEV__`, not DEV_TOOLS_ENABLED (app/src/lib/dev/flags.ts):
 * DeviceCheck attests the real, App-Store-signed binary and cannot work under
 * Metro, while the debug provider needs a token registered by hand in the
 * console. DEV_TOOLS_ENABLED is also true for preview builds, and those
 * TestFlight builds are exactly the real-device traffic we want measured, so
 * they take the DeviceCheck path along with production.
 *
 * Idempotent, and never rejects: a failed attestation must not affect the app
 * while nothing is enforced.
 */
export function initializeAppCheckOnce(): Promise<void> {
  if (!initialization) {
    initialization = start().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[app-check] initialization failed (not enforced, ignoring)', error);
      }
    });
  }
  return initialization;
}

async function start(): Promise<void> {
  await initializeAppCheck(getApp(), {
    // The provider is passed as a plain `providerOptions` config rather than a
    // ReactNativeFirebaseAppCheckProvider instance: the package's own typings
    // export that class name as a type only, so `new`-ing it does not compile.
    // Both forms take the same path natively (see the module's configure()).
    // iOS only (CLAUDE.md), so only the `apple` slot is filled in.
    provider: {
      providerOptions: {
        apple: __DEV__
          ? { provider: 'debug', debugToken: DEBUG_TOKEN }
          : { provider: 'deviceCheck' },
      },
    },
    // Keep the token fresh in the background so a long session doesn't start
    // sending unattested requests once the first token lapses.
    isTokenAutoRefreshEnabled: true,
  });
}
