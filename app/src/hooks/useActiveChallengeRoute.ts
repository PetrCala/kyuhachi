import { useEffect, useState } from 'react';
import {
  doc,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { UserDocument, ChallengeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';

export interface ActiveChallengeRoute {
  /** The default/active challenge id, or null when the user has none. */
  challengeId: string | null;
  /** The route currently attached to that challenge, or null. */
  activeRouteId: string | null;
}

/**
 * Lean subscription to "which route is attached to the active challenge":
 * user doc → `defaultChallengeId` → that challenge's `activeRouteId`.
 *
 * The Routes screen uses this to drive its ⋯-menu attach/remove action without
 * pulling in the full {@link useActiveChallengeProgress} machinery (visits,
 * onsen display, tiers, challenge type) it doesn't need.
 */
export function useActiveChallengeRoute(): ActiveChallengeRoute {
  const { user } = useAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setChallengeId(null);
      setActiveRouteId(null);
      return;
    }

    let unsubChallenge: (() => void) | null = null;
    const clearChallenge = () => {
      unsubChallenge?.();
      unsubChallenge = null;
    };

    const unsubUser = onSnapshot(
      doc(db, COLLECTIONS.USERS, user.uid),
      (userDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const defChallengeId = (userDoc.data() as UserDocument | undefined)?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);
        clearChallenge();
        if (!defChallengeId) {
          setActiveRouteId(null);
          return;
        }
        unsubChallenge = onSnapshot(
          doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, defChallengeId),
          (challengeDoc: FirebaseFirestoreTypes.DocumentSnapshot) =>
            setActiveRouteId((challengeDoc.data() as ChallengeDocument | undefined)?.activeRouteId ?? null),
          () => setActiveRouteId(null)
        );
      },
      () => {
        setChallengeId(null);
        setActiveRouteId(null);
      }
    );

    return () => {
      clearChallenge();
      unsubUser();
    };
  }, [user]);

  return { challengeId, activeRouteId };
}
