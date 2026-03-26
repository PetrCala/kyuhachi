import { user } from 'firebase-functions/v1/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Creates /users/{uid} document on first sign-in.
 * displayName falls back to the portion before @ if not provided by the auth provider.
 */
export const onUserCreated = user().onCreate(async (userRecord) => {
  const db = getFirestore();
  await db
    .collection('users')
    .doc(userRecord.uid)
    .set({
      displayName: userRecord.displayName ?? userRecord.email?.split('@')[0] ?? '',
      email: userRecord.email ?? '',
      defaultChallengeId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
});
