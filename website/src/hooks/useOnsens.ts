import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { OnsenWithId } from '../types';

interface State {
  onsens: Map<string, OnsenWithId> | null;
  failed: boolean;
}

/**
 * The whole onsen catalog, fetched once per page load. It changes rarely
 * (catalog publishes), so there is no live subscription; a reload picks up a
 * new catalog version.
 *
 * `failed` exists because a missing catalog is invisible on the map: every
 * layer still draws, just with nothing on it. The caller has to say so.
 */
export function useOnsens(): State {
  const [state, setState] = useState<State>({ onsens: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, COLLECTIONS.ONSENS))
      .then((snap) => {
        if (cancelled) return;
        const next = new Map<string, OnsenWithId>();
        for (const docSnap of snap.docs) {
          next.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as OnsenDocument) });
        }
        setState({ onsens: next, failed: false });
      })
      .catch((err) => {
        console.error('catalog fetch failed', err);
        // Hold on to whatever was loaded before rather than swapping in an
        // empty catalog: a stale map beats a confidently empty one.
        if (!cancelled) setState((prev) => ({ onsens: prev.onsens, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
