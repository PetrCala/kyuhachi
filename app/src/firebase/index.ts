import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getStorage } from '@react-native-firebase/storage';
import { initializeAppCheckOnce } from './app-check';

// React Native Firebase initializes the default app natively (from the
// GoogleService-Info.plist) before any JS runs, so resolving it at module load
// is safe.
const app = getApp();

// Kick App Check off here rather than from a screen or provider: every Firebase
// consumer in the app imports this module, so this is the earliest point that is
// guaranteed to run before the first Firestore/Storage/Functions call. Not
// awaited, so it never sits on the boot path or delays first paint, and it
// swallows its own errors. Attestation is measured, not enforced (see
// app-check.ts and docs/app-check.md), so a call that goes out before the first
// token lands is simply counted as unverified.
void initializeAppCheckOnce();

/**
 * Shared modular Firebase service instances bound to the default app.
 *
 * The app uses the React Native Firebase modular API throughout: import these
 * instances and pass them to the modular functions, e.g. `collection(db, ...)`,
 * `signInWithEmailAndPassword(auth, ...)`, `ref(storage, ...)`.
 */
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
