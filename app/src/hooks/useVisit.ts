import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  Timestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { UserDocument, VisitDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';

export interface UseVisitResult {
  /** The user's default challenge id; null while resolving or when none exists. */
  challengeId: string | null;
  /** The visit for this onsen in the default challenge; null if not visited. */
  visit: VisitDocument | null;
  /** True until the visit subscription has reported at least once. */
  loading: boolean;
}

/**
 * Resolves the user's default challenge and subscribes to the visit doc for a
 * single onsen within it. Shared by the onsen detail screen (read-only summary)
 * and the edit-visit modal so both read the same live source.
 *
 * RNFirebase has no `serverTimestamps: 'estimate'` read option, so a
 * just-recorded visit's optimistic (pending-write) snapshot reports its
 * serverTimestamp() fields as null until the server write lands. Fill those
 * nulls with a local now() estimate so consumers never touch null (VisitCard
 * calls `.toDate()`). The real server values replace the estimate on the next
 * snapshot. Mirrors the patch in useActiveChallengeProgress.
 */
export function useVisit(onsenId: string | undefined): UseVisitResult {
  const { user } = useAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [visit, setVisit] = useState<VisitDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No user (auth still restoring) or no onsenId (e.g. the edit-visit modal
    // re-presented by navigation state restoration on reload without its `id`
    // param). Resolve to "nothing to load" instead of leaving loading stuck at
    // its initial true, so consumers can react rather than hang on a spinner.
    if (!user || !onsenId) {
      setChallengeId(null);
      setVisit(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    let unsubVisit: (() => void) | null = null;

    const unsubUser = onSnapshot(
      doc(db, COLLECTIONS.USERS, user.uid),
      (userDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const data = userDoc.data() as UserDocument | undefined;
        const defChallengeId = data?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);

        unsubVisit?.();
        unsubVisit = null;

        if (!defChallengeId) {
          setVisit(null);
          setLoading(false);
          return;
        }

        unsubVisit = onSnapshot(
          doc(
            db,
            COLLECTIONS.USERS,
            user.uid,
            SUBCOLLECTIONS.CHALLENGES,
            defChallengeId,
            SUBCOLLECTIONS.VISITS,
            onsenId
          ),
          (visitDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
            if (visitDoc.exists()) {
              const data = visitDoc.data() as VisitDocument;
              const estimate = Timestamp.now();
              setVisit({
                ...data,
                visitedAt: data.visitedAt ?? estimate,
                createdAt: data.createdAt ?? estimate,
                updatedAt: data.updatedAt ?? estimate,
              });
            } else {
              setVisit(null);
            }
            setLoading(false);
          }
        );
      },
      () => {
        setVisit(null);
        setLoading(false);
      }
    );

    return () => {
      unsubVisit?.();
      unsubUser();
    };
  }, [user, onsenId]);

  return { challengeId, visit, loading };
}
