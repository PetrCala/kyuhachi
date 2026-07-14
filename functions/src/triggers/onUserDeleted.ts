import { user } from 'firebase-functions/v1/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * On account deletion: cascade-remove everything the user owns.
 *
 * The app initiates deletion in-app by deleting the Firebase Auth user (see the
 * "Delete account" flow in app/app/more/delete-account.tsx); this trigger then
 * erases the data that deletion leaves behind. Every user-owned Firestore path
 * and Storage object is gated on ownership, so once the auth user is gone the
 * client can no longer reach this data; the cleanup has to run server-side with
 * admin credentials. Required for App Store Review Guideline 5.1.1(v).
 *
 * Removes, for the deleted uid:
 *  - the whole Firestore tree under users/{uid} (the user doc plus the
 *    challenges, visits, and routes subcollections) via a recursive delete
 *  - every visit photo under the Storage prefix visits/{uid}/
 *
 * recursiveDelete fires the per-visit onVisitDeleted trigger for each visit doc
 * it removes. That is redundant with the prefix delete here (the per-visit photo
 * delete simply 404s, which onVisitDeleted swallows) and its challenge-progress
 * recompute no-ops once the parent challenge is gone, harmless either way.
 */
export const onUserDeleted = user().onDelete(async (userRecord) => {
  const { uid } = userRecord;

  const db = getFirestore();
  await db.recursiveDelete(db.collection('users').doc(uid));

  const prefix = `visits/${uid}/`;
  try {
    await getStorage().bucket().deleteFiles({ prefix });
  } catch (err) {
    // A user with no photos deletes nothing. That is expected and harmless.
    // Anything else (e.g. a transient Storage error) is swallowed so the
    // trigger never throws; an orphaned object can be cleaned up later.
    const code = (err as { code?: number }).code;
    if (code !== 404) {
      console.error(`Failed to delete Storage objects under ${prefix}`, err);
    }
  }
});
