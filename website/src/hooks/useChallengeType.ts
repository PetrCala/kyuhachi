import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

interface State {
  challengeType: ChallengeTypeDocument | null;
  failed: boolean;
}

/**
 * The challenge type behind Petr's challenge: source of the completion count
 * (88) and, later, the full eligible pool for the all-onsens layer. Never
 * hardcode thresholds; they live here.
 *
 * `failed` matters because the completion count is the denominator of the
 * header's headline figure. Without it the chip does not read "36 / ?", it
 * disappears, taking the site's one number with it and saying nothing.
 */
export function useChallengeType(typeId: string | null): State {
  const [state, setState] = useState<State>({ challengeType: null, failed: false });

  useEffect(() => {
    if (!typeId) {
      setState({ challengeType: null, failed: false });
      return;
    }
    let cancelled = false;
    getDoc(doc(db, COLLECTIONS.CHALLENGE_TYPES, typeId))
      .then((snap) => {
        if (cancelled) return;
        setState({
          challengeType: snap.exists() ? (snap.data() as ChallengeTypeDocument) : null,
          failed: false,
        });
      })
      .catch((err) => {
        console.error('challenge type fetch failed', err);
        if (!cancelled) setState((prev) => ({ ...prev, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  return state;
}
