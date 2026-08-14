import type { VisitDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { JOURNEY_UID } from '../config';
import { db } from '../firebase';
import type { VisitWithOnsenId } from '../types';

/**
 * All visits of the given challenge, live: a new visit recorded in the app
 * appears on the site without a reload. Keyed by onsen id (the visit doc id).
 */
export function useVisits(challengeId: string | null): Map<string, VisitWithOnsenId> {
  const [visits, setVisits] = useState<Map<string, VisitWithOnsenId>>(new Map());

  useEffect(() => {
    if (!challengeId) {
      setVisits(new Map());
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
        setVisits(next);
      },
      (err) => {
        console.error('visits subscription failed', err);
        setVisits(new Map());
      }
    );
  }, [challengeId]);

  return visits;
}
