import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { updateChallengeProgress } from '../util/tier';

/**
 * Maintains the parent challenge's derived progress whenever a visit is created
 * or overwritten: recomputes earnedTier (the highest tier the visits currently
 * satisfy) and sets completedAt when the eligible visit count first reaches the
 * type's completionCount.
 *
 * Idempotent: it writes only when something changed, and writing to the
 * challenge doc does not re-trigger this visit function.
 */
export const onVisitCreated = onDocumentCreated(
  'users/{userId}/challenges/{challengeId}/visits/{onsenId}',
  async (event) => {
    if (!event.data) return;

    const { userId, challengeId } = event.params;
    const db = getFirestore();
    const challengeRef = db
      .collection('users')
      .doc(userId)
      .collection('challenges')
      .doc(challengeId);

    await updateChallengeProgress(db, challengeRef);
  },
);
