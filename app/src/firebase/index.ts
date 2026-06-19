import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getStorage } from '@react-native-firebase/storage';

// React Native Firebase initializes the default app natively (from the
// GoogleService-Info.plist) before any JS runs, so resolving it at module load
// is safe.
const app = getApp();

/**
 * Shared modular Firebase service instances bound to the default app.
 *
 * The app uses the React Native Firebase modular API throughout: import these
 * instances and pass them to the modular functions, e.g. `collection(db, ...)`,
 * `signInWithEmailAndPassword(auth, ...)`, `ref(storage, ...)`.
 */
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
