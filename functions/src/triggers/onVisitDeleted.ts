import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { updateChallengeProgress } from '../util/tier';

/**
 * On visit deletion: clean up the visit's Storage photo(s) and recompute the
 * parent challenge's earnedTier (removing a visit can lower the tier).
 *
 * Photos live at visits/{userId}/{challengeId}_{onsenId}/photo.jpg (see the
 * upload path in app/app/onsens/edit-visit.tsx). Deleting the visit doc —
 * whether a single-visit delete or as part of deleting a whole challenge —
 * would otherwise leak the photo in Storage forever. Deletes by prefix rather
 * than assuming photo.jpg, so any object under the visit's folder is removed;
 * a visit with no photo is normal (an empty prefix is a no-op and must not
 * throw).
 *
 * When the whole challenge was deleted, its doc is already gone, so the tier
 * recompute is a no-op.
 */
export const onVisitDeleted = onDocumentDeleted(
  'users/{userId}/challenges/{challengeId}/visits/{onsenId}',
  async (event) => {
    const { userId, challengeId, onsenId } = event.params;

    const prefix = `visits/${userId}/${challengeId}_${onsenId}/`;

    try {
      await getStorage().bucket().deleteFiles({ prefix });
    } catch (err) {
      // A visit with no photo deletes nothing — that is expected and harmless.
      // Anything else (e.g. a transient Storage error) is swallowed so the
      // delete trigger never throws; the orphan can be cleaned up later.
      const code = (err as { code?: number }).code;
      if (code !== 404) {
        console.error(`Failed to delete visit photos under ${prefix}`, err);
      }
    }

    const db = getFirestore();
    const challengeRef = db
      .collection('users')
      .doc(userId)
      .collection('challenges')
      .doc(challengeId);
    await updateChallengeProgress(db, challengeRef);
  },
);
