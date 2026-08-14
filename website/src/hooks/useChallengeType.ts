import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

/**
 * The challenge type behind Petr's challenge: source of the completion count
 * (88) and, later, the full eligible pool for the all-onsens layer. Never
 * hardcode thresholds; they live here.
 */
export function useChallengeType(typeId: string | null): ChallengeTypeDocument | null {
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);

  useEffect(() => {
    if (!typeId) {
      setChallengeType(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, COLLECTIONS.CHALLENGE_TYPES, typeId))
      .then((snap) => {
        if (cancelled) return;
        setChallengeType(snap.exists() ? (snap.data() as ChallengeTypeDocument) : null);
      })
      .catch((err) => {
        console.error('challenge type fetch failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  return challengeType;
}
