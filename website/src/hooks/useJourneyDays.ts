import type { JourneyDayDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

/**
 * Every walked day, oldest first. Fetched once per page load: the sync writes
 * once a morning, so there is nothing to watch live.
 */
export function useJourneyDays(): JourneyDayDocument[] | null {
  const [days, setDays] = useState<JourneyDayDocument[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, COLLECTIONS.JOURNEY_DAYS), orderBy('date')))
      .then((snap) => {
        if (cancelled) return;
        setDays(snap.docs.map((docSnap) => docSnap.data() as JourneyDayDocument));
      })
      .catch((err) => {
        console.error('journey days fetch failed', err);
        if (!cancelled) setDays([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return days;
}
