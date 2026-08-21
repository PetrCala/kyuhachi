import type { JourneyDayDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

interface State {
  days: JourneyDayDocument[] | null;
  failed: boolean;
}

/**
 * Every walked day, oldest first. Fetched once per page load: the sync writes
 * once a morning, so there is nothing to watch live.
 *
 * `failed` matters here more than anywhere: an empty day list reads as "he has
 * not walked yet", which is a lie the page tells convincingly.
 */
export function useJourneyDays(): State {
  const [state, setState] = useState<State>({ days: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, COLLECTIONS.JOURNEY_DAYS), orderBy('date')))
      .then((snap) => {
        if (cancelled) return;
        setState({
          days: snap.docs.map((docSnap) => docSnap.data() as JourneyDayDocument),
          failed: false,
        });
      })
      .catch((err) => {
        console.error('journey days fetch failed', err);
        // Keep the last good days instead of falling back to [], which would
        // erase the walked route and quietly hide the distance chip.
        if (!cancelled) setState((prev) => ({ days: prev.days, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
