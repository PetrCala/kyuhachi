import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { evaluateChallenge } from '../util/tier';

/**
 * Claim the highest tier a challenge currently qualifies for.
 *
 * Tiers are claimable, not auto-earned: `earnedTier` on the challenge doc is
 * server-only (Firestore rules forbid the client writing it), and this callable
 * is its sole writer. It re-derives eligibility from the challenge's own visits
 * (never trusting a client-supplied tier) and writes the result only when it
 * strictly outranks what's already claimed. Once written, a tier is permanent.
 * The visit triggers never change it.
 */
export const claimTier = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to claim a tier.');
  }

  const { challengeId } = (request.data ?? {}) as { challengeId?: string };
  if (!challengeId) {
    throw new HttpsError('invalid-argument', 'A challengeId is required.');
  }

  const db = getFirestore();
  const challengeRef = db
    .collection('users')
    .doc(uid)
    .collection('challenges')
    .doc(challengeId);

  const evaluation = await evaluateChallenge(db, challengeRef);
  if (!evaluation) {
    throw new HttpsError('not-found', 'Challenge not found.');
  }

  const { eligibleTier, tiers, challenge } = evaluation;

  // Tiers are ordered best → worst, so a lower index is a better tier. A null
  // current tier ranks below the worst, so the first claim always outranks it.
  const order = tiers.map((tier) => tier.id);
  const eligibleIndex = eligibleTier ? order.indexOf(eligibleTier) : -1;
  const currentTier = (challenge.earnedTier ?? null) as string | null;
  const currentIndex = currentTier ? order.indexOf(currentTier) : order.length;

  if (eligibleIndex === -1 || eligibleIndex >= currentIndex) {
    throw new HttpsError(
      'failed-precondition',
      'No higher tier is available to claim.',
    );
  }

  await challengeRef.update({
    earnedTier: eligibleTier,
    earnedTierAt: FieldValue.serverTimestamp(),
  });

  return { claimedTier: eligibleTier };
});
