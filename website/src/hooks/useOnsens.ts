import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { OnsenWithId } from '../types';

/**
 * The whole onsen catalog, fetched once per page load. It changes rarely
 * (catalog publishes), so there is no live subscription; a reload picks up a
 * new catalog version.
 */
export function useOnsens(): Map<string, OnsenWithId> | null {
  const [onsens, setOnsens] = useState<Map<string, OnsenWithId> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, COLLECTIONS.ONSENS))
      .then((snap) => {
        if (cancelled) return;
        const next = new Map<string, OnsenWithId>();
        for (const docSnap of snap.docs) {
          next.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as OnsenDocument) });
        }
        setOnsens(next);
      })
      .catch((err) => {
        console.error('catalog fetch failed', err);
        if (!cancelled) setOnsens(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return onsens;
}
