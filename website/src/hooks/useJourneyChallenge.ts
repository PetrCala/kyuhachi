import type { ChallengeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { JOURNEY_UID } from '../config';
import { db } from '../firebase';
import type { JourneyChallenge } from '../types';

interface State {
  challenge: JourneyChallenge | null;
  loading: boolean;
  error: boolean;
}

/**
 * Petr's default challenge, live. The site follows whichever challenge the
 * app currently marks as default; its id keys the visits subscription and its
 * activeRouteId points at the planned route.
 */
export function useJourneyChallenge(): State {
  const [state, setState] = useState<State>({ challenge: null, loading: true, error: false });

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.USERS, JOURNEY_UID, SUBCOLLECTIONS.CHALLENGES),
      where('isDefault', '==', true),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const first = snap.docs[0];
        // An empty result straight from cache just means the backend has not
        // answered yet; only a server-confirmed empty result is "no journey".
        if (!first && snap.metadata.fromCache) return;
        setState({
          challenge: first ? { id: first.id, ...(first.data() as ChallengeDocument) } : null,
          loading: false,
          error: false,
        });
      },
      (err) => {
        console.error('challenge subscription failed', err);
        setState({ challenge: null, loading: false, error: true });
      }
    );
  }, []);

  return state;
}
