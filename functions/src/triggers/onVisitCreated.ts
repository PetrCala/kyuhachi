import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Checks for challenge completion whenever a visit is created or overwritten.
 *
 * Reads the parent challenge's snapshotEligibleOnsenIds, counts how many
 * visit doc IDs fall in that set, and sets completedAt when the count
 * reaches the challenge type's completionCount.
 *
 * Idempotent: if two visits trigger simultaneously, both may set
 * completedAt — writing a server timestamp twice is harmless.
 */
export const onVisitCreated = onDocumentCreated(
  'users/{userId}/challenges/{challengeId}/visits/{onsenId}',
  async (event) => {
    if (!event.data) return;

    const { userId, challengeId } = event.params;
    const db = getFirestore();

    // 1. Read the parent challenge document
    const challengeRef = db
      .collection('users')
      .doc(userId)
      .collection('challenges')
      .doc(challengeId);

    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) return;

    const challenge = challengeSnap.data()!;

    // 2. Already completed — nothing to do
    if (challenge.completedAt != null) return;

    const eligible: string[] = challenge.snapshotEligibleOnsenIds ?? [];
    if (eligible.length === 0) return;

    // 3. Count visit docs whose ID is in the eligible set
    const visitsSnap = await challengeRef.collection('visits').get();
    const eligibleSet = new Set(eligible);
    const eligibleVisitCount = visitsSnap.docs.filter((doc) =>
      eligibleSet.has(doc.id),
    ).length;

    // 4. Read challenge type to get completionCount
    const typeSnap = await db
      .collection('challenge_types')
      .doc(challenge.typeId)
      .get();

    if (!typeSnap.exists) return;

    const completionCount: number = typeSnap.data()!.completionCount ?? 88;

    // 5. Mark complete if threshold reached
    if (eligibleVisitCount >= completionCount) {
      await challengeRef.update({
        completedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
