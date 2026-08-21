import type { VisitDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { JOURNEY_UID } from '../config';
import { db } from '../firebase';
import type { VisitWithOnsenId } from '../types';

interface State {
  visits: Map<string, VisitWithOnsenId>;
  failed: boolean;
  /**
   * True once a snapshot has actually arrived. An empty map means "no visits
   * recorded" only after that; before it, the same empty map just means the
   * subscription has not reported yet, and a caller that cannot tell the two
   * apart tells every arriving visitor the walk has not started.
   */
  loaded: boolean;
}

/**
 * All visits of the given challenge, live: a new visit recorded in the app
 * appears on the site without a reload. Keyed by onsen id (the visit doc id).
 */
export function useVisits(challengeId: string | null): State {
  const [state, setState] = useState<State>({ visits: new Map(), failed: false, loaded: false });

  useEffect(() => {
    if (!challengeId) {
      setState({ visits: new Map(), failed: false, loaded: false });
      return;
    }
    const ref = collection(
      db,
      COLLECTIONS.USERS,
      JOURNEY_UID,
      SUBCOLLECTIONS.CHALLENGES,
      challengeId,
      SUBCOLLECTIONS.VISITS
    );
    return onSnapshot(
      ref,
      (snap) => {
        const next = new Map<string, VisitWithOnsenId>();
        for (const docSnap of snap.docs) {
          next.set(docSnap.id, { onsenId: docSnap.id, ...(docSnap.data() as VisitDocument) });
        }
        setState({ visits: next, failed: false, loaded: true });
      },
      (err) => {
        console.error('visits subscription failed', err);
        // Firestore tears a listener down for good once this fires, so the map
        // is frozen at the last snapshot from here on and the hook cannot
        // recover by itself. Telling the visitor to reload is the only way
        // back, which is what `failed` is for.
        setState((prev) => ({ ...prev, failed: true }));
      }
    );
  }, [challengeId]);

  return state;
}
